package com.ricettine.site;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ricettine.DemoIntegrationTest;
import com.ricettine.Sessions;
import com.ricettine.account.AccountDtos.NewAccountRequest;
import com.ricettine.testsupport.Concurrently;
import jakarta.servlet.http.Cookie;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.test.context.TestPropertySource;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

@TestPropertySource(properties = "ricettine.demo.read-only=true")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class DemoModeIT extends DemoIntegrationTest {

	private static final Set<String> EXCEPTIONS = Set.of("/api/demo/session", "/api/auth/logout");

	@Autowired
	@org.springframework.beans.factory.annotation.Qualifier("requestMappingHandlerMapping")
	private RequestMappingHandlerMapping handlerMapping;

	@BeforeEach
	void seedGuest() {
		SiteContext.runAs(Site.DEMO, () -> accounts
			.create(new NewAccountRequest("ospite@demo.test", Sessions.PASSWORD, "ospite", "Ospite"), false));
	}

	/** Every (method, concrete path) of a mutating endpoint, found from the live handler mappings. */
	Stream<Arguments> mutatingEndpoints() {
		List<Arguments> out = new ArrayList<>();
		for (RequestMappingInfo info : handlerMapping.getHandlerMethods().keySet()) {
			if (info.getPathPatternsCondition() == null) {
				continue;
			}
			for (RequestMethod m : info.getMethodsCondition().getMethods()) {
				if (m == RequestMethod.GET || m == RequestMethod.HEAD || m == RequestMethod.OPTIONS) {
					continue;
				}
				for (var pattern : info.getPathPatternsCondition().getPatterns()) {
					String p = pattern.getPatternString();
					if (EXCEPTIONS.contains(p)) {
						continue;
					}
					out.add(Arguments.of(m.name(), p.replaceAll("\\{[^}]+}", UUID.randomUUID().toString())));
				}
			}
		}
		return out.stream();
	}

	@Test
	void discoversEnoughMutatingEndpoints() {
		assertThat(mutatingEndpoints().count()).isGreaterThanOrEqualTo(32);
	}

	@ParameterizedTest(name = "{0} {1}")
	@MethodSource("mutatingEndpoints")
	void everyMutatingEndpointIsReadOnlyOnDemo(String method, String path) throws Exception {
		Cookie session = demoSession();
		mvc.perform(demo(request(HttpMethod.valueOf(method), path)).cookie(session)
				.contentType(MediaType.APPLICATION_JSON).content("{}"))
			.andExpect(status().isForbidden())
			.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
			.andExpect(jsonPath("$.code").value("demo_read_only"));
	}

	@Test
	void sameEndpointsWorkOnMain() throws Exception {
		Cookie cookie = data.user("mia", false);
		mvc.perform(post("/api/recipes").with(csrf()).cookie(cookie)).andExpect(status().isCreated());
	}

	@Test
	void demoSessionSignsInAsOspiteForOneDay() throws Exception {
		Cookie session = demoSession();
		mvc.perform(demo(get("/api/me")).cookie(session)).andExpect(status().isOk())
			.andExpect(jsonPath("$.username").value("ospite"));
		Integer ttl = SiteContext.callAs(Site.DEMO,
				() -> jdbc.queryForObject("select max(max_inactive_interval) from spring_session", Integer.class));
		assertThat(ttl).isEqualTo(86400);
	}

	@Test
	void demoSessionIs404OnMain() throws Exception {
		mvc.perform(post("/api/demo/session").with(csrf())).andExpect(status().isNotFound());
	}

	@Test
	void demoSessionIs503WhenGuestMissing() throws Exception {
		SiteContext.runAs(Site.DEMO, this::truncateAll);
		mvc.perform(demo(post("/api/demo/session")).with(csrf())).andExpect(status().isServiceUnavailable())
			.andExpect(jsonPath("$.code").value("demo_unavailable"));
	}

	@Test
	void demoSessionRateLimited() throws Exception {
		for (int i = 0; i < 30; i++) {
			mvc.perform(demo(post("/api/demo/session")).with(csrf()).with(ip("10.2.0.1")))
				.andExpect(status().isNoContent());
		}
		mvc.perform(demo(post("/api/demo/session")).with(csrf()).with(ip("10.2.0.1")))
			.andExpect(status().isTooManyRequests()).andExpect(header().exists("Retry-After"));
	}

	@Test
	void twoConcurrentDemoSessionsBothSucceed() throws Exception {
		List<Integer> codes = Concurrently.run(2, i -> () -> mvc
			.perform(demo(post("/api/demo/session")).with(csrf()).with(ip("10.3.0." + i)))
			.andReturn().getResponse().getStatus());
		assertThat(codes).containsExactly(204, 204);
	}

	@Test
	void loginAndSetupRefusedOnDemo() throws Exception {
		mvc.perform(demo(post("/api/auth/login")).with(csrf()).contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"ospite@demo.test\",\"password\":\"%s\"}".formatted(Sessions.PASSWORD)))
			.andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("demo_read_only"));
		mvc.perform(demo(post("/api/setup/admin")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{}"))
			.andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("demo_read_only"));
	}

	@Test
	void exceptionMatchingHasNoBypass() throws Exception {
		for (String path : List.of("/api/demo/session/", "/api/demo/session;jsessionid=x", "/api/auth/logout/",
				"/API/demo/session")) {
			var result = mvc.perform(demo(post(path)).with(csrf())).andReturn().getResponse();
			assertThat(result.getStatus()).as(path).isEqualTo(403);
			assertThat(result.getContentAsString()).as(path).contains("demo_read_only");
		}
	}

	@Test
	void logoutAllowedOnDemo() throws Exception {
		Cookie session = demoSession();
		mvc.perform(demo(post("/api/auth/logout")).with(csrf()).cookie(session)).andExpect(status().isNoContent());
	}

	private final java.util.concurrent.atomic.AtomicInteger nextIp = new java.util.concurrent.atomic.AtomicInteger();

	/** A fresh client address per call, so the demo-session limit is never hit by the parameterized cases. */
	private Cookie demoSession() throws Exception {
		int n = nextIp.incrementAndGet();
		return mvc.perform(demo(post("/api/demo/session")).with(csrf()).with(ip("10.9." + (n / 250) + "." + (n % 250))))
			.andExpect(status().isNoContent()).andReturn().getResponse().getCookie("SESSION");
	}

	private static org.springframework.test.web.servlet.request.RequestPostProcessor ip(String ip) {
		return r -> {
			r.setRemoteAddr(ip);
			return r;
		};
	}
}
