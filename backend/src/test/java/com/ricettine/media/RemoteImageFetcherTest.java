package com.ricettine.media;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;

import com.ricettine.common.ApiException;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.time.Duration;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class RemoteImageFetcherTest {

	static final byte[] JPEG = TestImages.plainJpeg(40, 30);

	HttpServer server;
	final AtomicInteger requests = new AtomicInteger();
	RemoteImageFetcher guarded;
	RemoteImageFetcher open; // test-only switch: loopback and any port allowed
	RemoteImageFetcher hurried; // open, with a 1 s total time

	@BeforeEach
	void start() throws IOException {
		server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
		server.createContext("/", this::handle);
		server.setExecutor(Executors.newCachedThreadPool()); // stalling handlers must not hold up the others
		server.start();
		guarded = new RemoteImageFetcher(false);
		open = new RemoteImageFetcher(true);
		hurried = new RemoteImageFetcher(true, Duration.ofSeconds(1));
	}

	@AfterEach
	void stop() throws IOException {
		server.stop(0);
		guarded.destroy();
		open.destroy();
		hurried.destroy();
	}

	String url(String path) {
		return "http://127.0.0.1:" + server.getAddress().getPort() + path;
	}

	void handle(HttpExchange ex) throws IOException {
		requests.incrementAndGet();
		String path = ex.getRequestURI().getPath();
		switch (path) {
			case "/photo.jpg" -> send(ex, 200, "image/jpeg", JPEG, JPEG.length);
			case "/page.html" -> send(ex, 200, "text/html", "<html></html>".getBytes(), -1);
			case "/missing.jpg" -> send(ex, 404, "text/plain", new byte[0], -1);
			case "/huge-declared.jpg" -> {
				ex.getResponseHeaders().set("Content-Type", "image/jpeg");
				ex.getResponseHeaders().set("Content-Length", String.valueOf(RemoteImageFetcher.MAX_BYTES + 1));
				ex.sendResponseHeaders(200, RemoteImageFetcher.MAX_BYTES + 1L);
				try (OutputStream out = ex.getResponseBody()) {
					out.write(new byte[256 * 1024]); // past the server's buffer, so the headers go out
					out.flush();
				}
				catch (IOException ignored) {
					// the client hangs up early
				}
			}
			case "/huge-chunked.jpg" -> {
				ex.getResponseHeaders().set("Content-Type", "image/jpeg");
				ex.sendResponseHeaders(200, 0);
				try (OutputStream out = ex.getResponseBody()) {
					byte[] chunk = new byte[1024 * 1024];
					for (int i = 0; i < 16; i++) {
						out.write(chunk);
					}
				}
				catch (IOException ignored) {
					// the client stops reading at the cap
				}
			}
			case "/slow-headers.jpg" -> {
				pause(30_000); // the response would come long after the deadline
				send(ex, 200, "image/jpeg", JPEG, JPEG.length);
			}
			case "/trickle.jpg" -> { // a few bytes at a time, each well within the read timeout, forever
				ex.getResponseHeaders().set("Content-Type", "image/jpeg");
				ex.sendResponseHeaders(200, 0);
				trickle(ex.getResponseBody());
			}
			case "/huge-then-trickle.jpg" -> { // over the cap, then a body that never ends
				ex.getResponseHeaders().set("Content-Type", "image/jpeg");
				ex.sendResponseHeaders(200, 0);
				OutputStream out = ex.getResponseBody();
				try {
					out.write(new byte[RemoteImageFetcher.MAX_BYTES + 1]);
				}
				catch (IOException ignored) {
					return;
				}
				trickle(out);
			}
			case "/redirect-trickle" -> { // a redirect whose own body never ends
				ex.getResponseHeaders().set("Location", "/photo.jpg");
				ex.sendResponseHeaders(302, 0);
				trickle(ex.getResponseBody());
			}
			case "/bad-location" -> redirect(ex, "http://[bad");
			default -> {
				if (path.startsWith("/redirect/")) { // /redirect/N hops N more times, then to the photo
					int n = Integer.parseInt(path.substring("/redirect/".length()));
					redirect(ex, n == 0 ? "/photo.jpg" : "/redirect/" + (n - 1));
				}
				else if (path.equals("/to-ftp")) {
					redirect(ex, "ftp://127.0.0.1/photo.jpg");
				}
				else {
					send(ex, 404, "text/plain", new byte[0], -1);
				}
			}
		}
	}

	static void send(HttpExchange ex, int code, String type, byte[] body, long length) throws IOException {
		ex.getResponseHeaders().set("Content-Type", type);
		ex.sendResponseHeaders(code, body.length == 0 ? -1 : length < 0 ? 0 : length);
		try (OutputStream out = ex.getResponseBody()) {
			out.write(body);
		}
	}

	static void redirect(HttpExchange ex, String location) throws IOException {
		ex.getResponseHeaders().set("Location", location);
		ex.sendResponseHeaders(302, -1);
		ex.close();
	}

	static void trickle(OutputStream out) {
		try (out) {
			for (int i = 0; i < 300; i++) {
				out.write(1);
				out.flush();
				pause(100);
			}
		}
		catch (IOException ignored) {
			// the client hung up, as it should
		}
	}

	static void pause(long millis) {
		try {
			Thread.sleep(millis);
		}
		catch (InterruptedException e) {
			Thread.currentThread().interrupt();
		}
	}

	static String code(Runnable r) {
		try {
			r.run();
		}
		catch (ApiException e) {
			return e.getCode();
		}
		throw new AssertionError("no ApiException");
	}

	@Test
	void downloadsAnImage() {
		assertThat(open.fetch(url("/photo.jpg"))).isEqualTo(JPEG);
	}

	@Test
	void refusesThisServersOwnNetworkWithoutConnecting() {
		// the test server listens on loopback: refused on the port (not 80/443) or on the address, never reached
		assertThat(code(() -> guarded.fetch(url("/photo.jpg")))).isIn("image_url_invalid", "image_url_not_allowed");
		assertThat(code(() -> guarded.fetch("http://127.0.0.1/photo.jpg"))).isEqualTo("image_url_not_allowed");
		assertThat(requests).hasValue(0);
	}

	@ParameterizedTest
	@ValueSource(strings = { "http://localhost/x.jpg", "http://127.1/x.jpg", "http://2130706433/x.jpg",
			"http://0x7f000001/x.jpg", "http://[::1]/x.jpg", "http://[::ffff:127.0.0.1]/x.jpg",
			"http://169.254.169.254/latest/meta-data", "http://10.0.0.1/x.jpg", "https://192.168.1.1/x.jpg" })
	void refusesPrivateHostsInEveryForm(String url) {
		String code = code(() -> guarded.fetch(url));
		// a short or hex form that Java does not parse as an address is refused as invalid or unreachable;
		// it never connects either way
		assertThat(code).isIn("image_url_not_allowed", "image_url_unreachable", "image_url_invalid");
		if (!url.contains("0x") && !url.contains("127.1/")) {
			assertThat(code).as(url).isEqualTo("image_url_not_allowed");
		}
	}

	@ParameterizedTest
	@ValueSource(strings = { "ftp://example.com/x.jpg", "file:///etc/passwd", "javascript:alert(1)",
			"data:image/png;base64,AAAA", "http://user:pass@example.com/x.jpg", "http://example.com:8080/x.jpg",
			"https://example.com:22/x.jpg", "//example.com/x.jpg", "not a url", "http:///x.jpg" })
	void refusesAddressesThatAreNotPlainWebAddresses(String url) {
		assertThat(code(() -> guarded.fetch(url))).as(url).isEqualTo("image_url_invalid");
	}

	@Test
	void refusesWhatIsNotAnImage() {
		assertThat(code(() -> open.fetch(url("/page.html")))).isEqualTo("unsupported_image");
	}

	@Test
	void aMissingImageIsUnreachable() {
		assertThat(code(() -> open.fetch(url("/missing.jpg")))).isEqualTo("image_url_unreachable");
	}

	@Test
	void refusesMoreThan15MbWhetherDeclaredOrStreamed() {
		assertThat(code(() -> open.fetch(url("/huge-declared.jpg")))).isEqualTo("file_too_large");
		assertThat(code(() -> open.fetch(url("/huge-chunked.jpg")))).isEqualTo("file_too_large");
	}

	@Test
	void followsUpToThreeRedirectsAndChecksEachTarget() {
		assertThat(open.fetch(url("/redirect/2"))).isEqualTo(JPEG); // 3 redirects
		assertThat(code(() -> open.fetch(url("/redirect/3")))).isEqualTo("image_url_invalid"); // 4
		assertThat(code(() -> open.fetch(url("/to-ftp")))).isEqualTo("image_url_invalid");
	}

	@Test
	void aBadRedirectAddressIsInvalidNotAServerError() {
		assertThat(code(() -> open.fetch(url("/bad-location")))).isEqualTo("image_url_invalid");
	}

	@Test
	void theTotalTimeCoversWaitingForHeaders() {
		assertTimeoutPreemptively(Duration.ofSeconds(5),
				() -> assertThat(code(() -> hurried.fetch(url("/slow-headers.jpg")))).isEqualTo("image_url_unreachable"));
	}

	@Test
	void theTotalTimeCoversABodyThatNeverEnds() {
		assertTimeoutPreemptively(Duration.ofSeconds(5),
				() -> assertThat(code(() -> hurried.fetch(url("/trickle.jpg")))).isEqualTo("image_url_unreachable"));
	}

	@Test
	void aRefusedBodyIsDroppedNotDrained() {
		// the default 20 s total: the refusal itself must hang up, not the deadline
		assertTimeoutPreemptively(Duration.ofSeconds(10),
				() -> assertThat(code(() -> open.fetch(url("/huge-then-trickle.jpg")))).isEqualTo("file_too_large"));
	}

	@Test
	void aRedirectBodyIsDroppedNotDrained() {
		assertTimeoutPreemptively(Duration.ofSeconds(10),
				() -> assertThat(open.fetch(url("/redirect-trickle"))).isEqualTo(JPEG));
	}
}
