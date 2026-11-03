package com.ricettine.media;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.drew.imaging.ImageMetadataReader;
import com.drew.metadata.Metadata;
import com.drew.metadata.exif.ExifIFD0Directory;
import com.drew.metadata.exif.ExifSubIFDDirectory;
import com.drew.metadata.exif.GpsDirectory;
import com.ricettine.common.ApiException;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.util.Set;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;

class ImageProcessorTest {

	private final ImageProcessor processor = new ImageProcessor();

	private static BufferedImage decode(byte[] b) throws Exception {
		return ImageIO.read(new ByteArrayInputStream(b));
	}

	private static int rgb(BufferedImage i, int x, int y) {
		return i.getRGB(x, y) & 0xFFFFFF;
	}

	private static boolean isReddish(int rgb) {
		return ((rgb >> 16) & 0xFF) > 180 && (rgb & 0xFF) < 90;
	}

	private static boolean isBluish(int rgb) {
		return (rgb & 0xFF) > 180 && ((rgb >> 16) & 0xFF) < 90;
	}

	@Test
	void fixtureIsReallyOrientation6WithGps() throws Exception {
		Metadata md = ImageMetadataReader.readMetadata(new ByteArrayInputStream(TestImages.orientation6()));
		ExifIFD0Directory ifd0 = md.getFirstDirectoryOfType(ExifIFD0Directory.class);
		assertThat(ifd0.getInt(ExifIFD0Directory.TAG_ORIENTATION)).isEqualTo(6);
		assertThat(md.getFirstDirectoryOfType(GpsDirectory.class).getGeoLocation()).isNotNull();
	}

	@Test
	void appliesExifOrientationThenStrips() throws Exception {
		byte[] out = processor.process(TestImages.orientation6(), Set.of(ImageVariant.DISPLAY))
				.get(ImageVariant.DISPLAY);
		BufferedImage img = decode(out);
		assertThat(img.getWidth()).isEqualTo(300);
		assertThat(img.getHeight()).isEqualTo(400);
		// Orientation 6 = rotate 90 CW: the original left (red) half ends up on top.
		assertThat(isReddish(rgb(img, 150, 50))).isTrue();
		assertThat(isBluish(rgb(img, 150, 350))).isTrue();
		Metadata md = ImageMetadataReader.readMetadata(new ByteArrayInputStream(out));
		assertThat(md.getFirstDirectoryOfType(ExifIFD0Directory.class)).isNull();
		assertThat(md.getFirstDirectoryOfType(ExifSubIFDDirectory.class)).isNull();
		assertThat(md.getFirstDirectoryOfType(GpsDirectory.class)).isNull();
	}

	@Test
	void orientation3RotatesHalfTurn() throws Exception {
		byte[] out = processor.process(TestImages.jpegWithExif(400, 300, 3), Set.of(ImageVariant.DISPLAY))
				.get(ImageVariant.DISPLAY);
		BufferedImage img = decode(out);
		assertThat(img.getWidth()).isEqualTo(400);
		assertThat(img.getHeight()).isEqualTo(300);
		assertThat(isBluish(rgb(img, 50, 150))).isTrue();
		assertThat(isReddish(rgb(img, 350, 150))).isTrue();
	}

	@Test
	void orientation8RotatesCounterClockwise() throws Exception {
		BufferedImage img = decode(processor.process(TestImages.jpegWithExif(400, 300, 8), Set.of(ImageVariant.DISPLAY))
				.get(ImageVariant.DISPLAY));
		assertThat(img.getWidth()).isEqualTo(300);
		assertThat(img.getHeight()).isEqualTo(400);
		assertThat(isBluish(rgb(img, 150, 50))).isTrue();
		assertThat(isReddish(rgb(img, 150, 350))).isTrue();
	}

	@Test
	void orientation2MirrorsHorizontally() throws Exception {
		BufferedImage img = decode(processor.process(TestImages.jpegWithExif(400, 300, 2), Set.of(ImageVariant.DISPLAY))
				.get(ImageVariant.DISPLAY));
		assertThat(img.getWidth()).isEqualTo(400);
		assertThat(isBluish(rgb(img, 50, 150))).isTrue();
		assertThat(isReddish(rgb(img, 350, 150))).isTrue();
	}

	@Test
	void neverUpscales() throws Exception {
		BufferedImage img = decode(processor.process(TestImages.plainJpeg(400, 300), Set.of(ImageVariant.THUMB))
				.get(ImageVariant.THUMB));
		assertThat(img.getWidth()).isEqualTo(400);
		assertThat(img.getHeight()).isEqualTo(300);
	}

	@Test
	void downscalesLongestEdge() throws Exception {
		var out = processor.process(TestImages.plainJpeg(3000, 2000), Set.of(ImageVariant.DISPLAY, ImageVariant.AVATAR));
		BufferedImage d = decode(out.get(ImageVariant.DISPLAY));
		assertThat(d.getWidth()).isEqualTo(1600);
		assertThat(d.getHeight()).isEqualTo(1067);
		BufferedImage a = decode(out.get(ImageVariant.AVATAR));
		assertThat(a.getWidth()).isEqualTo(256);
	}

	@Test
	void acceptsPng() throws Exception {
		BufferedImage img = decode(processor.process(TestImages.png(200, 100), Set.of(ImageVariant.THUMB))
				.get(ImageVariant.THUMB));
		assertThat(img.getWidth()).isEqualTo(200);
	}

	/** 1x1 lossless WebP (no WebP writer is available to generate larger ones). */
	private static final String TINY_WEBP = "UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==";

	@Test
	void decodesWebp() throws Exception {
		byte[] webp = java.util.Base64.getDecoder().decode(TINY_WEBP);
		BufferedImage img = decode(processor.process(webp, Set.of(ImageVariant.THUMB)).get(ImageVariant.THUMB));
		assertThat(img.getWidth()).isEqualTo(1);
		assertThat(img.getHeight()).isEqualTo(1);
	}

	@Test
	void rejectsPdfDisguisedAsJpeg() {
		assertThatThrownBy(() -> processor.process(TestImages.fakeJpgPdf(), Set.of(ImageVariant.THUMB)))
				.isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.getCode()).isEqualTo("unsupported_image"));
	}

	@Test
	void rejectsHeic() {
		assertThatThrownBy(() -> processor.process(TestImages.heic(), Set.of(ImageVariant.THUMB)))
				.isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.getCode()).isEqualTo("unsupported_image"));
	}

	@Test
	void rejectsCorruptJpegWithValidMagic() {
		byte[] b = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, 0, 1, 2, 3, 4};
		assertThatThrownBy(() -> processor.process(b, Set.of(ImageVariant.THUMB)))
				.isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.getCode()).isEqualTo("unsupported_image"));
	}
}
