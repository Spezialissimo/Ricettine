package com.ricettine.media;

/** Output variants; the value is the longest edge in px. Images are never upscaled. */
public enum ImageVariant {
	AVATAR(256), THUMB(480), DISPLAY(1600);

	private final int maxEdge;

	ImageVariant(int maxEdge) {
		this.maxEdge = maxEdge;
	}

	public int maxEdge() {
		return maxEdge;
	}

	public String fileName() {
		return name().toLowerCase(java.util.Locale.ROOT) + ".jpg";
	}
}
