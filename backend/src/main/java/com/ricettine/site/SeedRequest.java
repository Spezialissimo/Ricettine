package com.ricettine.site;

import jakarta.servlet.http.HttpServletRequest;
import java.lang.reflect.Proxy;

/** A stand-in {@link HttpServletRequest} for code that runs at startup but builds links from the current request. */
final class SeedRequest {

	private SeedRequest() {
	}

	static HttpServletRequest create() {
		return (HttpServletRequest) Proxy.newProxyInstance(SeedRequest.class.getClassLoader(),
				new Class<?>[] { HttpServletRequest.class }, (proxy, method, args) -> switch (method.getName()) {
					case "getScheme" -> "http";
					case "getServerName" -> "localhost";
					case "getServerPort" -> 80;
					case "getContextPath", "getRequestURI", "getQueryString" -> method.getName().equals("getQueryString")
							? null : "";
					case "getHeader", "getAttribute" -> null;
					case "getHeaders", "getHeaderNames" -> java.util.Collections.emptyEnumeration();
					case "isSecure" -> false;
					default -> method.getReturnType() == boolean.class ? Boolean.FALSE
							: method.getReturnType() == int.class ? Integer.valueOf(0) : null;
				});
	}
}
