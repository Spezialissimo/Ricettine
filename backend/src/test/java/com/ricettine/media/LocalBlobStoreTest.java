package com.ricettine.media;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class LocalBlobStoreTest {

	@TempDir
	Path dir;

	@Test
	void roundTrip() {
		LocalBlobStore s = new LocalBlobStore(dir);
		s.put("img/abc/thumb.jpg", new byte[] {1, 2, 3}, "image/jpeg");
		assertThat(s.get("img/abc/thumb.jpg")).hasValue(new byte[] {1, 2, 3});
		s.delete("img/abc/thumb.jpg");
		assertThat(s.get("img/abc/thumb.jpg")).isEmpty();
		s.delete("img/abc/thumb.jpg");
	}

	@Test
	void missingKeyIsEmpty() {
		assertThat(new LocalBlobStore(dir).get("img/nope/x.jpg")).isEmpty();
	}

	@Test
	void rejectsEscapingKeys() {
		LocalBlobStore s = new LocalBlobStore(dir);
		for (String k : new String[] {"../evil.jpg", "img/../../evil.jpg", "/etc/passwd", "a/../../b"}) {
			assertThatThrownBy(() -> s.put(k, new byte[] {1}, "image/jpeg")).isInstanceOf(IllegalArgumentException.class);
			assertThatThrownBy(() -> s.get(k)).isInstanceOf(IllegalArgumentException.class);
			assertThatThrownBy(() -> s.delete(k)).isInstanceOf(IllegalArgumentException.class);
		}
	}
}
