package com.ricettine.cookbook;

import com.ricettine.cookbook.CookbookDtos.CookbookInput;
import com.ricettine.recipe.Visibility;
import java.util.LinkedHashMap;
import java.util.Map;

/** Cookbook limits. Lengths count Unicode code points, after trimming. */
public final class CookbookValidator {

	static final int MAX_NAME = 100;
	static final int MAX_DESCRIPTION = 1000;
	static final int MAX_ENTRIES = 500;
	static final int MAX_AUTHORS = 20;
	static final int MAX_INVITES = 20;

	static final String REQUIRED = "required";
	static final String TOO_LONG = "too_long";
	static final String INVALID = "invalid";

	private CookbookValidator() {
	}

	/** Trims; blank becomes null. */
	static String clean(String s) {
		if (s == null) {
			return null;
		}
		String t = s.strip();
		return t.isEmpty() ? null : t;
	}

	private static int length(String s) {
		return s.codePointCount(0, s.length());
	}

	/** Field to error code; empty when valid. On patch a null field is "unchanged", a blank name is still invalid. */
	public static Map<String, String> validate(CookbookInput in, boolean creating) {
		Map<String, String> e = new LinkedHashMap<>();
		String name = clean(in.name());
		if (name == null) {
			if (creating || in.name() != null) {
				e.put("name", REQUIRED);
			}
		}
		else if (length(name) > MAX_NAME) {
			e.put("name", TOO_LONG);
		}
		String description = clean(in.description());
		if (description != null && length(description) > MAX_DESCRIPTION) {
			e.put("description", TOO_LONG);
		}
		if (in.visibility() != null && !isVisibility(in.visibility())) {
			e.put("visibility", INVALID);
		}
		return e;
	}

	private static boolean isVisibility(String v) {
		for (Visibility x : Visibility.values()) {
			if (x.name().equals(v)) {
				return true;
			}
		}
		return false;
	}
}
