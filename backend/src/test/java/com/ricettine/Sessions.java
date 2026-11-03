package com.ricettine;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import jakarta.servlet.http.Cookie;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

/** Test helper: password login returning the SESSION cookie. */
public final class Sessions {

	public static final String PASSWORD = "correct-horse-1";

	private Sessions() {
	}

	public static Cookie login(MockMvc mvc, String email, String password) throws Exception {
		return mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, password)))
			.andReturn().getResponse().getCookie("SESSION");
	}

	public static Cookie login(MockMvc mvc, String email) throws Exception {
		return login(mvc, email, PASSWORD);
	}
}
