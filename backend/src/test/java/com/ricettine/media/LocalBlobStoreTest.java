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

	@Test
	void deleteByPrefixRemovesOnlyThatSubtree() {
		LocalBlobStore s = new LocalBlobStore(dir);
		s.put("demo/img/a/thumb.jpg", new byte[] {1}, "image/jpeg");
		s.put("demo/img/b/thumb.jpg", new byte[] {2}, "image/jpeg");
		s.put("demo2/img/c/thumb.jpg", new byte[] {3}, "image/jpeg");
		s.put("img/d/thumb.jpg", new byte[] {4}, "image/jpeg");
		s.deleteByPrefix("demo/");
		assertThat(s.get("demo/img/a/thumb.jpg")).isEmpty();
		assertThat(s.get("demo/img/b/thumb.jpg")).isEmpty();
		assertThat(s.get("demo2/img/c/thumb.jpg")).isPresent();
		assertThat(s.get("img/d/thumb.jpg")).isPresent();
		s.deleteByPrefix("demo/");
	}

	@Test
	void deleteByPrefixRefusesBlankOrUnsafePrefixes() {
		LocalBlobStore s = new LocalBlobStore(dir);
		s.put("img/d/thumb.jpg", new byte[] {4}, "image/jpeg");
		for (String p : new String[] {"", "  ", "/", "demo", "../", "a/../../"}) {
			assertThatThrownBy(() -> s.deleteByPrefix(p)).as(p).isInstanceOf(IllegalArgumentException.class);
		}
		assertThat(s.get("img/d/thumb.jpg")).isPresent();
	}
}
