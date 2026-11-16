package com.ricettine.site;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ricettine.DemoIntegrationTest;
import com.ricettine.Sessions;
import com.ricettine.account.AccountDtos.NewAccountRequest;
import com.ricettine.media.BlobStore;
import com.ricettine.media.TestImages;
import com.ricettine.recipe.OrphanMediaCleanup;
import com.ricettine.testsupport.TestData.RecipeBody;
import jakarta.servlet.http.Cookie;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MvcResult;

class SiteMediaIT extends DemoIntegrationTest {

	@Autowired
	BlobStore blobs;

	@Autowired
	OrphanMediaCleanup orphans;

	Cookie demoCookie;

	@BeforeEach
	void demoUser() throws Exception {
		SiteContext.runAs(Site.DEMO,
				() -> accounts.create(new NewAccountRequest("d@x.com", Sessions.PASSWORD, "dave", "Dave"), false));
		demoCookie = mvc
			.perform(demo(post("/api/auth/login")).with(csrf()).contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"d@x.com\",\"password\":\"%s\"}".formatted(Sessions.PASSWORD)))
			.andExpect(status().isOk()).andReturn().getResponse().getCookie("SESSION");
	}

	private String demoDraft() throws Exception {
		return data.read(mvc.perform(demo(post("/api/recipes")).with(csrf()).cookie(demoCookie))
			.andExpect(status().isCreated()).andReturn()).get("id").asText();
	}

	private String demoUpload(String recipeId) throws Exception {
		MvcResult r = mvc
			.perform(multipart("/api/recipes/" + recipeId + "/photos").header(SiteFilter.HEADER, "demo")
				.file(new MockMultipartFile("file", "p.jpg", "image/jpeg", TestImages.plainJpeg(800, 600)))
				.with(csrf()).cookie(demoCookie))
			.andExpect(status().isCreated()).andReturn();
		return data.read(r).get("mediaId").asText();
	}

	@Test
	void demoUploadStoredUnderDemoPrefix() throws Exception {
		String recipe = demoDraft();
		String media = demoUpload(recipe);

		assertThat(Files.isDirectory(Path.of("target/test-media/demo/img/" + media))).isTrue();
		assertThat(Files.exists(Path.of("target/test-media/img/" + media))).isFalse();
		mvc.perform(demo(get("/media/" + media + "/thumb.jpg")).cookie(demoCookie)).andExpect(status().isOk());
		mvc.perform(get("/media/" + media + "/thumb.jpg").cookie(demoCookie)).andExpect(status().isNotFound());
	}

	@Test
	void cleanupRunsForBothSites() throws Exception {
		String demoMedia = demoUpload(demoDraft());
		Cookie mainCookie = data.user("mia", false);
		String mainMedia = data.uploadPhoto(mainCookie, data.draft(mainCookie));
		jdbc.update("update media set created_at = now() - interval '25 hours'");
		SiteContext.runAs(Site.DEMO, () -> jdbc.update("update media set created_at = now() - interval '25 hours'"));

		orphans.run();

		assertThat(jdbc.queryForObject("select count(*) from media", Long.class)).isZero();
		assertThat(SiteContext.callAs(Site.DEMO, () -> jdbc.queryForObject("select count(*) from media", Long.class)))
			.isZero();
		assertThat(blobs.get("img/" + mainMedia + "/thumb.jpg")).isEmpty();
		assertThat(blobs.get("demo/img/" + demoMedia + "/thumb.jpg")).isEmpty();
	}

	@Test
	void publicUrlsUseDemoUrlOnDemoSite() throws Exception {
		String id = demoDraft();
		mvc.perform(demo(put("/api/recipes/" + id)).with(csrf()).cookie(demoCookie)
			.contentType(MediaType.APPLICATION_JSON).content(RecipeBody.of(0).title("R").stepPhoto(null).json()))
			.andExpect(status().isOk());
		MvcResult r = mvc
			.perform(demo(post("/api/recipes/" + id + "/publish")).with(csrf()).cookie(demoCookie)
				.contentType(MediaType.APPLICATION_JSON).content("{\"version\":1}"))
			.andExpect(status().isOk()).andReturn();
		assertThat(data.read(r).get("shareUrl").asText()).startsWith("http://demo.test/r/");
	}
}
