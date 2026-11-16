package com.ricettine.media;

import com.ricettine.common.ApiException;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.net.InetAddress;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.UnknownHostException;
import java.time.Duration;
import java.util.Locale;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.apache.hc.client5.http.DnsResolver;
import org.apache.hc.client5.http.SystemDefaultDnsResolver;
import org.apache.hc.client5.http.classic.methods.HttpGet;
import org.apache.hc.client5.http.config.ConnectionConfig;
import org.apache.hc.client5.http.config.RequestConfig;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.client5.http.impl.io.PoolingHttpClientConnectionManagerBuilder;
import org.apache.hc.core5.http.ClassicHttpResponse;
import org.apache.hc.core5.http.Header;
import org.apache.hc.core5.http.HttpEntity;
import org.apache.hc.core5.util.Timeout;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * Downloads one image from a web address, for photos dragged out of a web page (the browser hands over the
 * address, not the file, and cannot download it itself). Guarded against server-side request forgery:
 * <ul>
 * <li>only {@code http}/{@code https} on the default ports, no user info;</li>
 * <li>every address a host name resolves to must be public ({@link PublicAddresses}); the check sits in the
 * client's DNS resolver, so the connection goes to exactly the addresses that were checked (no DNS-rebinding
 * window), and it applies again on every redirect (at most 3, followed by hand);</li>
 * <li>no proxy, no cookies, no credentials; 5 s to look up a name, 5 s to connect, 10 s per read, and 20 s in
 * total across every hop (a watchdog cancels the request at the deadline);</li>
 * <li>only a 200 with an {@code image/*} type, and at most 15 MB, read with a hard cap.</li>
 * </ul>
 * {@code ricettine.remote-images.allow-private-addresses} lifts the address and port checks; it exists for tests
 * that serve images from a random port on the loopback interface and must stay off in production.
 */
@Component
public class RemoteImageFetcher implements DisposableBean {

	static final int MAX_BYTES = 15 * 1024 * 1024;
	static final int MAX_REDIRECTS = 3;
	static final Duration TOTAL_TIME = Duration.ofSeconds(20);
	static final Duration PER_READ = Duration.ofSeconds(10);
	static final Duration LOOKUP_TIME = Duration.ofSeconds(5);
	private static final RequestConfig REQUEST = RequestConfig.custom()
		.setConnectionRequestTimeout(Timeout.ofSeconds(5))
		.setResponseTimeout(Timeout.of(PER_READ))
		.build();

	private final CloseableHttpClient http;
	private final DnsResolver resolver;
	private final boolean anyPort;
	private final Duration totalTime;
	private final ScheduledExecutorService watchdog = Executors
		.newSingleThreadScheduledExecutor(Thread.ofPlatform().daemon().name("remote-image-watchdog").factory());
	private final ExecutorService lookups = Executors.newVirtualThreadPerTaskExecutor();

	@Autowired
	public RemoteImageFetcher(
			@Value("${ricettine.remote-images.allow-private-addresses:false}") boolean allowPrivateAddresses) {
		this(allowPrivateAddresses, TOTAL_TIME);
	}

	/** With a shorter total time, for tests of the deadline. */
	RemoteImageFetcher(boolean allowPrivateAddresses, Duration totalTime) {
		this.totalTime = totalTime;
		this.resolver = new CheckingResolver(allowPrivateAddresses, lookups);
		this.anyPort = allowPrivateAddresses;
		this.http = HttpClients.custom()
			.setConnectionManager(PoolingHttpClientConnectionManagerBuilder.create()
				.setDnsResolver(resolver)
				.setMaxConnTotal(4)
				.setMaxConnPerRoute(2)
				.setDefaultConnectionConfig(ConnectionConfig.custom()
					.setConnectTimeout(Timeout.ofSeconds(5))
					.setSocketTimeout(Timeout.of(PER_READ))
					.build())
				.build())
			.setDefaultRequestConfig(REQUEST)
			.disableRedirectHandling()
			.disableCookieManagement()
			.disableAuthCaching()
			.disableAutomaticRetries()
			.setUserAgent("Ricettine")
			.build();
	}

	/** The image bytes at {@code url}. Throws {@link ApiException} with a client-facing code on any refusal. */
	public byte[] fetch(String url) {
		long deadline = System.nanoTime() + totalTime.toNanos();
		URI uri = checked(url, anyPort);
		for (int redirects = 0;; redirects++) {
			Hop hop = hop(uri, deadline);
			if (hop.body() != null) {
				return hop.body();
			}
			if (redirects >= MAX_REDIRECTS) {
				throw new ApiException(HttpStatus.BAD_REQUEST, "image_url_invalid");
			}
			URI next;
			try {
				next = uri.resolve(new URI(hop.location().strip()));
			}
			catch (URISyntaxException | IllegalArgumentException e) {
				throw new ApiException(HttpStatus.BAD_REQUEST, "image_url_invalid");
			}
			uri = checked(next.toString(), anyPort);
		}
	}

	/**
	 * One request. A watchdog cancels it at the deadline, so connecting, waiting for headers and reading the body
	 * all count against the total time. Unless the body was read to its end, the request is cancelled before the
	 * response is closed: closing drains the rest of the body, which a hostile server could make endless, while
	 * cancelling drops the connection.
	 */
	private Hop hop(URI uri, long deadline) {
		long left = deadline - System.nanoTime();
		if (left <= 0) {
			throw unreachable();
		}
		requirePublicHost(uri);
		HttpGet get = new HttpGet(uri);
		get.setHeader("Accept", "image/*");
		get.setConfig(RequestConfig.copy(REQUEST)
			.setResponseTimeout(Timeout.ofNanoseconds(Math.min(left, PER_READ.toNanos())))
			.build());
		ScheduledFuture<?> timer = watchdog.schedule(get::cancel, left, TimeUnit.NANOSECONDS);
		ClassicHttpResponse response = null;
		boolean consumed = false;
		try {
			response = http.executeOpen(null, get, null);
			Hop hop = read(response, deadline);
			consumed = hop.body() != null;
			return hop;
		}
		catch (BlockedAddressException e) {
			throw notAllowed();
		}
		catch (IOException | UncheckedIOException e) {
			throw unreachable();
		}
		finally {
			timer.cancel(false);
			if (!consumed) {
				get.cancel();
			}
			if (response != null) {
				try {
					response.close();
				}
				catch (IOException ignored) {
					// the connection is gone either way
				}
			}
		}
	}

	/** A response: the image, or where a redirect points. */
	private record Hop(byte[] body, String location) {
	}

	/** Reads the response; the content stream is left open (see {@link #hop}), and is at its end on success. */
	private static Hop read(ClassicHttpResponse response, long deadline) throws IOException {
		int code = response.getCode();
		if (code == 301 || code == 302 || code == 303 || code == 307 || code == 308) {
			Header location = response.getFirstHeader("Location");
			if (location == null || location.getValue().isBlank()) {
				throw unreachable();
			}
			return new Hop(null, location.getValue());
		}
		if (code != 200) {
			throw unreachable();
		}
		HttpEntity entity = response.getEntity();
		String type = entity == null || entity.getContentType() == null ? ""
				: entity.getContentType().toLowerCase(Locale.ROOT);
		if (!type.startsWith("image/")) {
			throw new ApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "unsupported_image");
		}
		if (entity.getContentLength() > MAX_BYTES) {
			throw tooLarge();
		}
		InputStream in = entity.getContent();
		byte[] buf = new byte[64 * 1024];
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		for (int n; (n = in.read(buf)) != -1;) {
			if (out.size() + n > MAX_BYTES) {
				throw tooLarge();
			}
			if (System.nanoTime() > deadline) {
				throw unreachable();
			}
			out.write(buf, 0, n);
		}
		return new Hop(out.toByteArray(), null);
	}

	/** Parses and checks the shape of a web address: http(s), a host, default port, no user info. */
	static URI checked(String url, boolean anyPort) {
		URI uri;
		try {
			uri = new URI(url.strip());
		}
		catch (URISyntaxException | NullPointerException e) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "image_url_invalid");
		}
		String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
		boolean web = scheme.equals("http") || scheme.equals("https");
		int port = uri.getPort();
		boolean defaultPort = anyPort || port == -1 || (scheme.equals("http") && port == 80)
				|| (scheme.equals("https") && port == 443);
		if (!web || uri.getHost() == null || uri.getHost().isBlank() || uri.getRawUserInfo() != null
				|| !defaultPort) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "image_url_invalid");
		}
		return uri;
	}

	/**
	 * Checks the host before any request, so an IP literal (including forms like {@code 2130706433} or
	 * {@code [::1]}) is refused no matter how the HTTP client treats literals; the connection's own lookup
	 * checks again.
	 */
	private void requirePublicHost(URI uri) {
		String host = uri.getHost();
		if (host.startsWith("[") && host.endsWith("]")) {
			host = host.substring(1, host.length() - 1);
		}
		try {
			resolver.resolve(host);
		}
		catch (BlockedAddressException e) {
			throw notAllowed();
		}
		catch (UnknownHostException e) {
			throw unreachable();
		}
	}

	private static ApiException notAllowed() {
		return new ApiException(HttpStatus.BAD_REQUEST, "image_url_not_allowed");
	}

	private static ApiException unreachable() {
		return new ApiException(HttpStatus.BAD_GATEWAY, "image_url_unreachable");
	}

	private static ApiException tooLarge() {
		return new ApiException(HttpStatus.CONTENT_TOO_LARGE, "file_too_large");
	}

	@Override
	public void destroy() throws IOException {
		watchdog.shutdownNow();
		lookups.shutdownNow();
		http.close();
	}

	/** Thrown by the resolver for a non-public address; an IOException so it aborts the connection attempt. */
	static final class BlockedAddressException extends UnknownHostException {
		BlockedAddressException(String host) {
			super(host);
		}
	}

	/** Resolves like the system, then refuses the host unless every address is public. */
	private static final class CheckingResolver implements DnsResolver {

		private final boolean allowPrivate;
		private final ExecutorService lookups;

		CheckingResolver(boolean allowPrivate, ExecutorService lookups) {
			this.allowPrivate = allowPrivate;
			this.lookups = lookups;
		}

		@Override
		public InetAddress[] resolve(String host) throws UnknownHostException {
			InetAddress[] all = lookUp(host);
			if (!allowPrivate) {
				for (InetAddress a : all) {
					if (!PublicAddresses.isPublic(a)) {
						throw new BlockedAddressException(host);
					}
				}
			}
			return all;
		}

		/** The system lookup has no timeout of its own, so it runs on its own thread and is given up on. */
		private InetAddress[] lookUp(String host) throws UnknownHostException {
			Future<InetAddress[]> lookup;
			try {
				lookup = lookups.submit(() -> SystemDefaultDnsResolver.INSTANCE.resolve(host));
			}
			catch (RejectedExecutionException e) {
				throw new UnknownHostException(host);
			}
			try {
				return lookup.get(LOOKUP_TIME.toNanos(), TimeUnit.NANOSECONDS);
			}
			catch (ExecutionException e) {
				if (e.getCause() instanceof UnknownHostException unknown) {
					throw unknown;
				}
				throw new UnknownHostException(host);
			}
			catch (TimeoutException e) {
				lookup.cancel(true);
				throw new UnknownHostException(host);
			}
			catch (InterruptedException e) {
				lookup.cancel(true);
				Thread.currentThread().interrupt();
				throw new UnknownHostException(host);
			}
		}

		@Override
		public String resolveCanonicalHostname(String host) throws UnknownHostException {
			return SystemDefaultDnsResolver.INSTANCE.resolveCanonicalHostname(host);
		}
	}
}
