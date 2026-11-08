package com.ricettine.media;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ricettine.IntegrationTest;
import com.ricettine.Sessions;
import com.ricettine.account.AccountDtos.NewAccountRequest;
import com.ricettine.account.User;
import jakarta.servlet.http.Cookie;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/** Public, immutable media must never carry Set-Cookie: an edge cache could hand one token to every viewer. */
class MediaNoCookieIT extends IntegrationTest {

	@Autowired MediaService media;

	String url;

	@BeforeEach
	void setUp() {
		User u = accounts.create(new NewAccountRequest("o@x.com", Sessions.PASSWORD, "owner", "Owner"), true);
		String id = media.register(media.process(TestImages.orientation6(), Set.of(ImageVariant.AVATAR)), u.getId(),
				MediaKind.AVATAR, null);
		url = media.url(id, ImageVariant.AVATAR);
	}

	@Test
	void avatarCarriesNoSetCookie() throws Exception {
		var res = mvc.perform(get(url)).andExpect(status().isOk()).andReturn().getResponse();
		assertThat(res.getHeaders("Set-Cookie")).isEmpty();
	}

	@Test
	void withStaleSessionCookie() throws Exception {
		var res = mvc.perform(get(url).cookie(new Cookie("SESSION", "stale"))).andExpect(status().isOk()).andReturn()
				.getResponse();
		assertThat(res.getHeaders("Set-Cookie")).isEmpty();
	}

	@Test
	void nonGetRequestsKeepCsrfProtection() throws Exception {
		Cookie session = Sessions.login(mvc, "o@x.com");
		mvc.perform(post("/media/x").cookie(session)).andExpect(status().isForbidden());
	}
}
