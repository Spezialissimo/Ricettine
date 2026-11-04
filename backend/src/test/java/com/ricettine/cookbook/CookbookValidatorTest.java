package com.ricettine.cookbook;

import static org.assertj.core.api.Assertions.assertThat;

import com.ricettine.cookbook.CookbookDtos.CookbookInput;
import java.util.Map;
import org.junit.jupiter.api.Test;

class CookbookValidatorTest {

	static CookbookInput in(String name, String description, String visibility) {
		return new CookbookInput(name, description, visibility);
	}

	@Test
	void validCreateHasNoErrors() {
		assertThat(CookbookValidator.validate(in("Dinners", "desc", "PUBLIC"), true)).isEmpty();
		assertThat(CookbookValidator.validate(in("Dinners", null, null), true)).isEmpty();
	}

	@Test
	void nameLengthCountsCodePoints() {
		assertThat(CookbookValidator.validate(in("🍝".repeat(100), null, null), true)).isEmpty();
		assertThat(CookbookValidator.validate(in("🍝".repeat(101), null, null), true))
			.isEqualTo(Map.of("name", "too_long"));
	}

	@Test
	void nameIsTrimmedBeforeCounting() {
		assertThat(CookbookValidator.validate(in("  " + "a".repeat(100) + "  ", null, null), true)).isEmpty();
	}

	@Test
	void blankNameRejectedOnCreateNullAllowedOnPatch() {
		assertThat(CookbookValidator.validate(in("   ", null, null), true)).isEqualTo(Map.of("name", "required"));
		assertThat(CookbookValidator.validate(in(null, null, null), true)).isEqualTo(Map.of("name", "required"));
		assertThat(CookbookValidator.validate(in(null, null, null), false)).isEmpty();
		assertThat(CookbookValidator.validate(in("  ", null, null), false)).isEqualTo(Map.of("name", "required"));
	}

	@Test
	void descriptionLimit() {
		assertThat(CookbookValidator.validate(in("a", "d".repeat(1000), null), true)).isEmpty();
		assertThat(CookbookValidator.validate(in("a", "🍝".repeat(1000), null), true)).isEmpty();
		assertThat(CookbookValidator.validate(in("a", "d".repeat(1001), null), true))
			.isEqualTo(Map.of("description", "too_long"));
	}

	@Test
	void visibilityMustBeKnown() {
		assertThat(CookbookValidator.validate(in("a", null, "SECRET"), true))
			.isEqualTo(Map.of("visibility", "invalid"));
		assertThat(CookbookValidator.validate(in("a", null, "PRIVATE"), false)).isEmpty();
	}
}
