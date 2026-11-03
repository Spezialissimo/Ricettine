package com.ricettine.media;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Optional;

/** Decides, per {@link MediaKind}, whether a request may read a media item. Exactly one bean per kind. */
public interface MediaAccessPolicy {

	MediaKind kind();

	/** The Cache-Control value when access is granted; empty means denied (the controller answers 404). */
	Optional<String> cacheControl(Media m, HttpServletRequest req);
}
