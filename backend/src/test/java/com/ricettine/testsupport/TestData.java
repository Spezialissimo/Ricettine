package com.ricettine.testsupport;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ricettine.Sessions;
import com.ricettine.account.AccountDtos.NewAccountRequest;
import com.ricettine.account.AccountService;
import com.ricettine.account.User;
import com.ricettine.media.BlobStore;
import com.ricettine.media.TestImages;
import jakarta.servlet.http.Cookie;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Builders for the users, recipes, cookbooks and photos the integration tests start from. Every helper that creates
 * something asserts the expected status, so a failed setup step fails right there instead of as a later NPE.
 */
public final class TestData {

	private final MockMvc mvc;
	private final ObjectMapper json;
	private final JdbcTemplate jdbc;
	private final AccountService accounts;

	public TestData(MockMvc mvc, ObjectMapper json, JdbcTemplate jdbc, AccountService accounts) {
		this.mvc = mvc;
		this.json = json;
		this.jdbc = jdbc;
		this.accounts = accounts;
	}

	// users

	/** Creates the account and returns its SESSION cookie. */
	public Cookie user(String email, String username, String displayName, boolean admin) throws Exception {
		accounts.create(new NewAccountRequest(email, Sessions.PASSWORD, username, displayName), admin);
		return Sessions.login(mvc, email);
	}

	/** Creates the account and returns the entity, without logging in. */
	public User account(String email, String username, String displayName, boolean admin) {
		return accounts.create(new NewAccountRequest(email, Sessions.PASSWORD, username, displayName), admin);
	}

	// JSON

	public JsonNode read(MvcResult result) throws Exception {
		return json.readTree(result.getResponse().getContentAsString());
	}

	// recipes

	/** An empty draft owned by {@code who}; returns its id. */
	public String draft(Cookie who) throws Exception {
		return read(mvc.perform(post("/api/recipes").with(csrf()).cookie(who)).andExpect(status().isCreated())
			.andReturn()).get("id").asText();
	}

	public ResultActions putRecipe(Cookie who, Object id, String body) throws Exception {
		return mvc.perform(put("/api/recipes/" + id).with(csrf()).cookie(who).contentType(MediaType.APPLICATION_JSON)
			.content(body));
	}

	/** Saves the recipe and asserts 200. */
	public void save(Cookie who, String id, RecipeBody body) throws Exception {
		putRecipe(who, id, body.json()).andExpect(status().isOk());
	}

	public ResultActions publishRequest(Cookie who, Object id, long version) throws Exception {
		return mvc.perform(post("/api/recipes/" + id + "/publish").with(csrf()).cookie(who)
			.contentType(MediaType.APPLICATION_JSON).content("{\"version\":" + version + "}"));
	}

	/** Publishes the recipe and asserts 200. */
	public void publish(Cookie who, String id, long version) throws Exception {
		publishRequest(who, id, version).andExpect(status().isOk());
	}

	/** A published recipe (title "R", no photos) with the given visibility; returns its id. */
	public String publishedRecipe(Cookie who, String visibility) throws Exception {
		String id = draft(who);
		save(who, id, RecipeBody.of(0).title("R").visibility(visibility).stepPhoto(null));
		publish(who, id, 1);
		return id;
	}

	/** A published recipe (title "Pasta") with a cover and a step photo; returns its id. */
	public String publishedRecipeWithPhotos(Cookie who, String visibility) throws Exception {
		String id = draft(who);
		String cover = uploadPhoto(who, id);
		String step = uploadPhoto(who, id);
		save(who, id, RecipeBody.of(0).visibility(visibility).cover(cover).stepPhoto(step));
		publish(who, id, 1);
		return id;
	}

	// photos

	public ResultActions uploadPhoto(Cookie who, String recipeId, byte[] bytes) throws Exception {
		return mvc.perform(multipart("/api/recipes/" + recipeId + "/photos")
			.file(new MockMultipartFile("file", "p.jpg", "image/jpeg", bytes)).with(csrf()).cookie(who));
	}

	/** Uploads a plain JPEG to the recipe, asserts 201 and returns the media id. */
	public String uploadPhoto(Cookie who, String recipeId) throws Exception {
		return read(uploadPhoto(who, recipeId, TestImages.plainJpeg(800, 600)).andExpect(status().isCreated())
			.andReturn()).get("mediaId").asText();
	}

	public static boolean blobExists(BlobStore blobs, String mediaId) {
		return blobs.get("img/" + mediaId + "/thumb.jpg").isPresent()
				|| blobs.get("img/" + mediaId + "/display.jpg").isPresent();
	}

	// share tokens

	public String recipeShareToken(String recipeId) {
		return jdbc.queryForObject("select share_token from recipe where id = ?::uuid", String.class, recipeId);
	}

	public String cookbookShareToken(String cookbookId) {
		return jdbc.queryForObject("select share_token from cookbook where id = ?::uuid", String.class, cookbookId);
	}

	// cookbooks

	/** A cookbook with the given JSON body (asserts 201); returns the response. */
	public JsonNode createCookbookJson(Cookie who, String body) throws Exception {
		return read(mvc.perform(post("/api/cookbooks").with(csrf()).cookie(who).contentType(MediaType.APPLICATION_JSON)
			.content(body)).andExpect(status().isCreated()).andReturn());
	}

	/** A PRIVATE cookbook with the given name; returns its id. */
	public String createCookbook(Cookie who, String name) throws Exception {
		return createCookbookJson(who, "{\"name\":\"" + name + "\"}").get("id").asText();
	}

	/** A cookbook with the given visibility and a cover photo; returns its id. */
	public String createCookbookWithCover(Cookie who, String name, String visibility) throws Exception {
		String id = createCookbookJson(who, "{\"name\":\"" + name + "\",\"visibility\":\"" + visibility + "\"}")
			.get("id").asText();
		mvc.perform(multipart(HttpMethod.PUT, "/api/cookbooks/" + id + "/cover")
			.file(new MockMultipartFile("file", "p.jpg", "image/jpeg", TestImages.plainJpeg(800, 600)))
			.with(csrf()).cookie(who)).andExpect(status().isOk());
		return id;
	}

	/** Fluent JSON body of a complete recipe save: one group with one ingredient and one step. */
	public static final class RecipeBody {

		private final long version;
		private String title = "Pasta";
		private String visibility = "PRIVATE";
		private String cover;
		private String stepPhoto;
		private Integer prepMinutes;
		private String amount;

		private RecipeBody(long version) {
			this.version = version;
		}

		public static RecipeBody of(long version) {
			return new RecipeBody(version);
		}

		public RecipeBody title(String title) {
			this.title = title;
			return this;
		}

		public RecipeBody visibility(String visibility) {
			this.visibility = visibility;
			return this;
		}

		public RecipeBody cover(String cover) {
			this.cover = cover;
			return this;
		}

		public RecipeBody stepPhoto(String stepPhoto) {
			this.stepPhoto = stepPhoto;
			return this;
		}

		public RecipeBody prepMinutes(int prepMinutes) {
			this.prepMinutes = prepMinutes;
			return this;
		}

		/** Gives the ingredient this amount (a JSON number) and the unit "g". */
		public RecipeBody amount(String amount) {
			this.amount = amount;
			return this;
		}

		public String json() {
			String ingredient = amount == null ? "{\"name\":\"flour\"}"
					: "{\"name\":\"flour\",\"amount\":%s,\"unit\":\"g\"}".formatted(amount);
			return """
				{"version":%d,"title":"%s","portions":2,"prepMinutes":%s,"visibility":"%s","coverMediaId":%s,
				 "groups":[{"name":"","ingredients":[%s]}],
				 "steps":[{"text":"mix","photoMediaId":%s}]}""".formatted(version, title,
					prepMinutes == null ? "null" : prepMinutes, visibility, quote(cover), ingredient, quote(stepPhoto));
		}

		private static String quote(String s) {
			return s == null ? "null" : "\"" + s + "\"";
		}
	}
}
