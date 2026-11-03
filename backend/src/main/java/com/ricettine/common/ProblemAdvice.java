package com.ricettine.common;

import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.lang.Nullable;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/** Single place that renders errors as RFC 9457 ProblemDetail carrying a snake_case {@code code}. */
@RestControllerAdvice
public class ProblemAdvice extends ResponseEntityExceptionHandler {

	@ExceptionHandler(ApiException.class)
	ResponseEntity<Object> handleApi(ApiException ex) {
		ProblemDetail pd = ProblemDetail.forStatus(ex.getStatus());
		pd.setProperty("code", ex.getCode());
		return ResponseEntity.status(ex.getStatus()).body(pd);
	}

	@Override
	protected ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException ex,
			HttpHeaders headers, HttpStatusCode status, WebRequest request) {
		Map<String, String> fields = new LinkedHashMap<>();
		for (FieldError fe : ex.getBindingResult().getFieldErrors()) {
			fields.putIfAbsent(fe.getField(), fe.getCode());
		}
		ProblemDetail pd = ProblemDetail.forStatus(HttpStatus.BAD_REQUEST);
		pd.setProperty("code", "validation_failed");
		pd.setProperty("fields", fields);
		return ResponseEntity.badRequest().body(pd);
	}

	@Override
	protected ResponseEntity<Object> handleExceptionInternal(Exception ex, @Nullable Object body,
			HttpHeaders headers, HttpStatusCode statusCode, WebRequest request) {
		if (body instanceof ProblemDetail pd && (pd.getProperties() == null || !pd.getProperties().containsKey("code"))) {
			pd.setProperty("code", genericCode(statusCode));
		}
		return super.handleExceptionInternal(ex, body, headers, statusCode, request);
	}

	private static String genericCode(HttpStatusCode status) {
		return switch (status.value()) {
			case 400 -> "bad_request";
			case 404 -> "not_found";
			case 405 -> "method_not_allowed";
			case 415 -> "unsupported_media_type";
			default -> status.is5xxServerError() ? "internal_error" : "bad_request";
		};
	}
}
