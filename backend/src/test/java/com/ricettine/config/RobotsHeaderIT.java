package com.ricettine.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ricettine.IntegrationTest;
import com.ricettine.account.User;
import com.ricettine.media.ImageVariant;
import com.ricettine.media.MediaKind;
import com.ricettine.media.MediaService;
import com.ricettine.media.TestImages;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/** Every response, whatever its status or who wrote it, tells crawlers not to index or follow. */
class RobotsHeaderIT extends IntegrationTest {

	static final String NOINDEX = "noindex, nofollow";

	@Autowired MediaService media;

	@Test
	void spaPathsCarryIt() throws Exception {
		for (String path : new String[] {"/", "/r/x", "/c/x", "/u/x"}) {
			mvc.perform(get(path)).andExpect(status().isOk()).andExpect(header().string("X-Robots-Tag", NOINDEX));
		}
	}

	@Test
	void errorsAndSecurityResponsesCarryIt() throws Exception {
		mvc.perform(get("/api/r/doesnotexist")).andExpect(status().isNotFound())
				.andExpect(header().string("X-Robots-Tag", NOINDEX));
		mvc.perform(get("/api/feed")).andExpect(status().isUnauthorized())
				.andExpect(header().string("X-Robots-Tag", NOINDEX));
	}

	@Test
	void mediaAndActuatorCarryIt() throws Exception {
		User u = data.account("o@x.com", "owner", "Owner", true);
		String id = media.register(media.process(TestImages.orientation6(), Set.of(ImageVariant.AVATAR)), u.getId(),
				MediaKind.AVATAR, null);
		mvc.perform(get(media.url(id, ImageVariant.AVATAR))).andExpect(status().isOk())
				.andExpect(header().string("X-Robots-Tag", NOINDEX));
		mvc.perform(get("/actuator/health")).andExpect(status().isOk()).andExpect(header().string("X-Robots-Tag", NOINDEX));
	}

	@Test
	void thereIsNoRobotsTxt() throws Exception {
		var res = mvc.perform(get("/robots.txt")).andExpect(status().isNotFound()).andReturn().getResponse();
		assertThat(res.getContentAsString()).doesNotContain("Disallow");
	}
}
