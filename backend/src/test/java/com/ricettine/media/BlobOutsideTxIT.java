package com.ricettine.media;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doCallRealMethod;
import static org.mockito.Mockito.doThrow;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import com.ricettine.IntegrationTest;
import com.ricettine.Sessions;
import com.ricettine.account.AccountDtos.NewAccountRequest;
import com.ricettine.account.AccountService;
import jakarta.servlet.http.Cookie;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.ObjectMapper;

/**
 * Photo and cover blobs are written with no transaction, row lock or pooled connection held; a short transaction
 * then locks the row, re-checks and inserts the media row. Failures and lost races must leave neither a row nor a blob.
 */
class BlobOutsideTxIT extends IntegrationTest {

	@Autowired JdbcTemplate jdbc;
	@Autowired AccountService accounts;
	@Autowired ObjectMapper json;
	@MockitoSpyBean BlobStore blobs;

	Cookie me;
	ExecutorService pool = Executors.newFixedThreadPool(4);

	@BeforeEach
	void setUp() throws Exception {
		jdbc.execute("truncate table app_user, one_time_token, instance_setup cascade");
		jdbc.execute("delete from spring_session");
		accounts.create(new NewAccountRequest("me@x.com", Sessions.PASSWORD, "mario", "Me"), true);
		me = Sessions.login(mvc, "me@x.com");
	}

	@AfterEach
	void tearDown() {
		pool.shutdownNow();
	}

	String create(String path, String body) throws Exception {
		var req = post(path).with(csrf()).cookie(me);
		if (body != null) {
			req = req.contentType(MediaType.APPLICATION_JSON).content(body);
		}
		return json.readTree(mvc.perform(req).andReturn().getResponse().getContentAsString()).get("id").asText();
	}

	MockMultipartFile file() {
		return new MockMultipartFile("file", "p.jpg", "image/jpeg", TestImages.plainJpeg(100, 100));
	}

	ResultActions uploadPhoto(String recipe) throws Exception {
		return mvc.perform(multipart("/api/recipes/" + recipe + "/photos").file(file()).with(csrf()).cookie(me));
	}

	ResultActions uploadCover(String cookbook) throws Exception {
		return mvc.perform(multipart(HttpMethod.PUT, "/api/cookbooks/" + cookbook + "/cover").file(file())
			.with(csrf()).cookie(me));
	}

	<T> Future<T> async(Callable<T> c) {
		return pool.submit(c);
	}

	int mediaRows() {
		return jdbc.queryForObject("select count(*) from media", Integer.class);
	}

	/** Keys the spy was asked to store, whether or not the put succeeded. */
	List<String> attemptedKeys() {
		return Mockito.mockingDetails(blobs).getInvocations().stream()
			.filter(i -> i.getMethod().getName().equals("put")).map(i -> (String) i.getArgument(0)).toList();
	}

	long storedAmongAttempted() {
		return attemptedKeys().stream().filter(k -> blobs.get(k).isPresent()).count();
	}

	/** Blocks every put until released; counts down {@code entered} on the first. */
	void blockPuts(CountDownLatch entered, CountDownLatch release) {
		doAnswer(inv -> {
			entered.countDown();
			assertThat(release.await(30, TimeUnit.SECONDS)).isTrue();
			return inv.callRealMethod();
		}).when(blobs).put(any(), any(), any());
	}

	/** The second put of an upload fails after the first has really been written. */
	void failSecondPut() {
		doCallRealMethod().doThrow(new IllegalStateException("s3 down")).when(blobs).put(any(), any(), any());
	}

	@Test
	void slowBlobWriteDoesNotBlockRecipeSave() throws Exception {
		String recipe = create("/api/recipes", null);
		CountDownLatch entered = new CountDownLatch(1);
		CountDownLatch release = new CountDownLatch(1);
		blockPuts(entered, release);
		Future<MvcResult> upload = async(() -> uploadPhoto(recipe).andReturn());
		try {
			assertThat(entered.await(10, TimeUnit.SECONDS)).isTrue();
			Future<MvcResult> save = async(() -> mvc.perform(put("/api/recipes/" + recipe).with(csrf()).cookie(me)
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"version\":0,\"title\":\"Soup\",\"portions\":2,\"visibility\":\"PRIVATE\","
						+ "\"groups\":[],\"steps\":[]}"))
				.andReturn());
			assertThat(save.get(2, TimeUnit.SECONDS).getResponse().getStatus()).isEqualTo(200);
		}
		finally {
			release.countDown();
		}
		assertThat(upload.get(10, TimeUnit.SECONDS).getResponse().getStatus()).isEqualTo(201);
		assertThat(mediaRows()).isEqualTo(1);
	}

	@Test
	void slowBlobWriteDoesNotBlockCookbookWrites() throws Exception {
		String cookbook = create("/api/cookbooks", "{\"name\":\"Dinners\"}");
		CountDownLatch entered = new CountDownLatch(1);
		CountDownLatch release = new CountDownLatch(1);
		blockPuts(entered, release);
		Future<MvcResult> upload = async(() -> uploadCover(cookbook).andReturn());
		try {
			assertThat(entered.await(10, TimeUnit.SECONDS)).isTrue();
			Future<MvcResult> edit = async(() -> mvc.perform(patch("/api/cookbooks/" + cookbook).with(csrf())
				.cookie(me).contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Suppers\"}")).andReturn());
			assertThat(edit.get(2, TimeUnit.SECONDS).getResponse().getStatus()).isEqualTo(200);
		}
		finally {
			release.countDown();
		}
		assertThat(upload.get(10, TimeUnit.SECONDS).getResponse().getStatus()).isEqualTo(200);
	}

	@Test
	void failedBlobWriteLeavesNoRowAndNoBlob() throws Exception {
		String recipe = create("/api/recipes", null);
		failSecondPut();
		assertThat(uploadPhoto(recipe).andReturn().getResponse().getStatus()).isEqualTo(500);
		assertThat(attemptedKeys()).hasSize(2);
		assertThat(mediaRows()).isZero();
		assertThat(storedAmongAttempted()).isZero();
		// the recipe stays editable and takes a photo once storage is back
		Mockito.reset(blobs);
		assertThat(mvc.perform(put("/api/recipes/" + recipe).with(csrf()).cookie(me)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"version\":0,\"title\":\"Soup\",\"portions\":2,\"visibility\":\"PRIVATE\","
					+ "\"groups\":[],\"steps\":[]}"))
			.andReturn().getResponse().getStatus()).isEqualTo(200);
		assertThat(uploadPhoto(recipe).andReturn().getResponse().getStatus()).isEqualTo(201);
		assertThat(mediaRows()).isEqualTo(1);
	}

	@Test
	void failedCoverBlobWriteLeavesNoRowAndNoBlob() throws Exception {
		String cookbook = create("/api/cookbooks", "{\"name\":\"Dinners\"}");
		failSecondPut();
		assertThat(uploadCover(cookbook).andReturn().getResponse().getStatus()).isEqualTo(500);
		assertThat(attemptedKeys()).hasSize(2);
		assertThat(mediaRows()).isZero();
		assertThat(storedAmongAttempted()).isZero();
		assertThat(jdbc.queryForObject("select cover_media_id from cookbook where id = ?::uuid", String.class,
				cookbook)).isNull();
		Mockito.reset(blobs);
		assertThat(uploadCover(cookbook).andReturn().getResponse().getStatus()).isEqualTo(200);
		assertThat(mediaRows()).isEqualTo(1);
	}

	@Test
	void recipeDeletedBetweenBlobWriteAndTransactionLeavesNothing() throws Exception {
		String recipe = create("/api/recipes", null);
		CountDownLatch entered = new CountDownLatch(1);
		CountDownLatch release = new CountDownLatch(1);
		blockPuts(entered, release);
		Future<MvcResult> upload = async(() -> uploadPhoto(recipe).andReturn());
		try {
			assertThat(entered.await(10, TimeUnit.SECONDS)).isTrue();
			assertThat(async(() -> mvc.perform(delete("/api/recipes/" + recipe).with(csrf()).cookie(me))
				.andReturn()).get(2, TimeUnit.SECONDS).getResponse().getStatus()).isEqualTo(204);
		}
		finally {
			release.countDown();
		}
		assertThat(upload.get(10, TimeUnit.SECONDS).getResponse().getStatus()).isEqualTo(404);
		assertThat(mediaRows()).isZero();
		assertThat(attemptedKeys()).isNotEmpty();
		assertThat(storedAmongAttempted()).isZero();
	}

	@Test
	void cookbookDeletedBetweenBlobWriteAndTransactionLeavesNothing() throws Exception {
		String cookbook = create("/api/cookbooks", "{\"name\":\"Dinners\"}");
		CountDownLatch entered = new CountDownLatch(1);
		CountDownLatch release = new CountDownLatch(1);
		blockPuts(entered, release);
		Future<MvcResult> upload = async(() -> uploadCover(cookbook).andReturn());
		try {
			assertThat(entered.await(10, TimeUnit.SECONDS)).isTrue();
			assertThat(async(() -> mvc.perform(delete("/api/cookbooks/" + cookbook).with(csrf()).cookie(me))
				.andReturn()).get(2, TimeUnit.SECONDS).getResponse().getStatus()).isEqualTo(204);
		}
		finally {
			release.countDown();
		}
		assertThat(upload.get(10, TimeUnit.SECONDS).getResponse().getStatus()).isEqualTo(404);
		assertThat(mediaRows()).isZero();
		assertThat(storedAmongAttempted()).isZero();
	}

	@Test
	void concurrentUploadsNearThePhotoCapCannotOvershootIt() throws Exception {
		String recipe = create("/api/recipes", null);
		jdbc.update("insert into media (id, owner_id, kind, recipe_id, created_at) "
				+ "select 'seed' || g, (select id from app_user limit 1), 'RECIPE', ?::uuid, now() "
				+ "from generate_series(1, 149) g", recipe);
		// both uploads pass the cheap pre-check (149 < 150) and meet at the first blob write
		CyclicBarrier together = new CyclicBarrier(2);
		doAnswer(inv -> {
			together.await(10, TimeUnit.SECONDS);
			return inv.callRealMethod();
		}).when(blobs).put(any(), any(), any());
		CompletableFuture<Integer> a = CompletableFuture.supplyAsync(() -> status(() -> uploadPhoto(recipe)), pool);
		CompletableFuture<Integer> b = CompletableFuture.supplyAsync(() -> status(() -> uploadPhoto(recipe)), pool);
		assertThat(List.of(a.get(20, TimeUnit.SECONDS), b.get(20, TimeUnit.SECONDS))).containsExactlyInAnyOrder(201,
				409);
		assertThat(jdbc.queryForObject("select count(*) from media where recipe_id = ?::uuid", Integer.class,
				recipe)).isEqualTo(150);
		// only the winner's two variants remain
		assertThat(storedAmongAttempted()).isEqualTo(2);
	}

	interface Call {
		ResultActions run() throws Exception;
	}

	static int status(Call c) {
		try {
			return c.run().andReturn().getResponse().getStatus();
		}
		catch (Exception e) {
			throw new IllegalStateException(e);
		}
	}
}
