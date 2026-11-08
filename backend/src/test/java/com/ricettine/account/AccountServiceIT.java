package com.ricettine.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.ricettine.IntegrationTest;
import com.ricettine.QuietSqlErrors;
import com.ricettine.account.AccountDtos.NewAccountRequest;
import com.ricettine.common.ApiException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class AccountServiceIT extends IntegrationTest {

	@BeforeEach
	void clean() {
	}

	private static NewAccountRequest req(String email, String username) {
		return new NewAccountRequest(email, "correct-horse-1", username, "Davide");
	}

	@Test
	@QuietSqlErrors
	void duplicateEmailIgnoringCaseAndWhitespaceIsEmailTaken() {
		accounts.create(req(" Davide@X.com ", "davide"), false);
		assertThatThrownBy(() -> accounts.create(req("davide@x.com", "other"), false))
			.isInstanceOfSatisfying(ApiException.class, e -> {
				assertThat(e.getStatus()).isEqualTo(HttpStatus.CONFLICT);
				assertThat(e.getCode()).isEqualTo("email_taken");
			});
	}

	@Test
	@QuietSqlErrors
	void duplicateUsernameIsUsernameTaken() {
		accounts.create(req("a@x.com", "davide"), false);
		assertThatThrownBy(() -> accounts.create(req("b@x.com", "davide"), false))
			.isInstanceOfSatisfying(ApiException.class, e -> {
				assertThat(e.getStatus()).isEqualTo(HttpStatus.CONFLICT);
				assertThat(e.getCode()).isEqualTo("username_taken");
			});
	}
}
