package com.ricettine.site;

/** Which dataset a request works on: the real one or the public demo. */
public enum Site {
	MAIN(""), DEMO("demo/");

	private final String blobPrefix;

	Site(String blobPrefix) {
		this.blobPrefix = blobPrefix;
	}

	/** Prefix for this site's keys in blob storage. */
	public String blobPrefix() {
		return blobPrefix;
	}
}
