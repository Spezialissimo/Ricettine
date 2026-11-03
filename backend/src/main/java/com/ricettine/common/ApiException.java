package com.ricettine.common;

import java.util.Map;
import org.springframework.http.HttpStatus;

public class ApiException extends RuntimeException {

	private final HttpStatus status;
	private final String code;
	private final Map<String, String> fields;
	private Map<String, Object> properties = Map.of();

	public ApiException(HttpStatus status, String code) {
		this(status, code, null);
	}

	/** {@code fields} (field path to error code) is rendered like Bean Validation's, or omitted when null. */
	public ApiException(HttpStatus status, String code, Map<String, String> fields) {
		super(code);
		this.status = status;
		this.code = code;
		this.fields = fields;
	}

	/** Extra top-level ProblemDetail properties (e.g. {@code mediaIds}). */
	public ApiException with(String name, Object value) {
		properties = new java.util.LinkedHashMap<>(properties);
		properties.put(name, value);
		return this;
	}

	public Map<String, Object> getProperties() {
		return properties;
	}

	public Map<String, String> getFields() {
		return fields;
	}

	public HttpStatus getStatus() {
		return status;
	}

	public String getCode() {
		return code;
	}
}
