package com.ricettine.recipe;

import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

/** The fixed set of ingredient unit codes; the UI shows them through {@code units.{code}} i18n keys. */
public enum Unit {
	G("g"), KG("kg"), ML("ml"), L("l"), TSP("tsp"), TBSP("tbsp"), CUP("cup"), PIECE("piece"), PINCH("pinch"),
	CLOVE("clove"), SLICE("slice"), CAN("can"), BUNCH("bunch");

	private static final Set<String> CODES = Arrays.stream(values()).map(Unit::code).collect(Collectors.toSet());

	private final String code;

	Unit(String code) {
		this.code = code;
	}

	public String code() {
		return code;
	}

	public static boolean isValid(String code) {
		return code != null && CODES.contains(code);
	}
}
