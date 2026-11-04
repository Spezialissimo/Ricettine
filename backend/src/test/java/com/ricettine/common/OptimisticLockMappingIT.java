package com.ricettine.common;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ricettine.IntegrationTest;
import com.ricettine.recipe.Recipe;
import jakarta.persistence.OptimisticLockException;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.Import;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Only the Recipe aggregate maps to recipe_conflict; any other optimistic-lock failure is a generic conflict. */
@Import(OptimisticLockMappingIT.ThrowingController.class)
class OptimisticLockMappingIT extends IntegrationTest {

	@RestController
	static class ThrowingController {

		@GetMapping("/api/test-only/lock/recipe")
		void recipe() {
			throw new ObjectOptimisticLockingFailureException(Recipe.class, UUID.randomUUID());
		}

		@GetMapping("/api/test-only/lock/other")
		void other() {
			throw new ObjectOptimisticLockingFailureException(Object.class, UUID.randomUUID());
		}

		@GetMapping("/api/test-only/lock/jpa")
		void jpa() {
			throw new OptimisticLockException("stale");
		}
	}

	@Test
	void recipeLockFailureIsRecipeConflict() throws Exception {
		mvc.perform(get("/api/test-only/lock/recipe").with(user("u")))
			.andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("recipe_conflict"));
	}

	@Test
	void otherEntityLockFailureIsGenericConflict() throws Exception {
		mvc.perform(get("/api/test-only/lock/other").with(user("u")))
			.andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("conflict"));
	}

	@Test
	void plainJpaOptimisticLockIsGenericConflict() throws Exception {
		mvc.perform(get("/api/test-only/lock/jpa").with(user("u")))
			.andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("conflict"));
	}
}
