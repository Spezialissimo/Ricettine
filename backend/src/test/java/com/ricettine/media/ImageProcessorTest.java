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
import java.util.Base64;
import java.util.Set;
import javax.imageio.ImageIO;
import org.assertj.core.data.Offset;
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
		byte[] webp = Base64.getDecoder().decode(TINY_WEBP);
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

	@Test
	void subsampleFactorFormula() {
		assertThat(ImageProcessor.subsampleFactor(8000, 6000, 1600)).isEqualTo(2);
		assertThat(ImageProcessor.subsampleFactor(4000, 3000, 1600)).isEqualTo(1);
		assertThat(ImageProcessor.subsampleFactor(16000, 12000, 480)).isEqualTo(16);
		assertThat(ImageProcessor.subsampleFactor(100, 50, 1600)).isEqualTo(1);
	}

	@Test
	void subsamplesLargeImages() throws Exception {
		byte[] big = TestImages.bigJpegWithExif(8000, 6000, 1);
		ProcessedImage p = processor.processDetailed(big, Set.of(ImageVariant.THUMB, ImageVariant.DISPLAY));
		BufferedImage d = decode(p.variants().get(ImageVariant.DISPLAY));
		assertThat(d.getWidth()).isEqualTo(1600);
		assertThat(d.getHeight()).isEqualTo(1200);
		assertThat(p.subsample()).isEqualTo(2);
		// Decoded intermediate is the source halved: at least 2x the largest variant, never the full 8000 px.
		assertThat(Math.max(p.decodedWidth(), p.decodedHeight())).isEqualTo(4000).isGreaterThanOrEqualTo(3200);
		assertThat(p.decodedWidth() * (long) p.decodedHeight()).isLessThan(8000L * 6000L / 3);
	}

	@Test
	void orientation6OnSubsampledInput() throws Exception {
		BufferedImage img = decode(processor.process(TestImages.bigJpegWithExif(8000, 6000, 6), Set.of(ImageVariant.DISPLAY))
				.get(ImageVariant.DISPLAY));
		assertThat(img.getWidth()).isEqualTo(1200);
		assertThat(img.getHeight()).isEqualTo(1600);
		assertThat(isReddish(rgb(img, 600, 100))).isTrue();
		assertThat(isBluish(rgb(img, 600, 1500))).isTrue();
	}

	@Test
	void orientation5Transposes() throws Exception {
		BufferedImage img = decode(processor.process(TestImages.jpegWithExif(400, 300, 5), Set.of(ImageVariant.DISPLAY))
				.get(ImageVariant.DISPLAY));
		assertThat(img.getWidth()).isEqualTo(300);
		assertThat(img.getHeight()).isEqualTo(400);
		// transpose: source left (red) becomes top
		assertThat(isReddish(rgb(img, 150, 50))).isTrue();
		assertThat(isBluish(rgb(img, 150, 350))).isTrue();
	}

	@Test
	void orientation7Transverses() throws Exception {
		BufferedImage img = decode(processor.process(TestImages.jpegWithExif(400, 300, 7), Set.of(ImageVariant.DISPLAY))
				.get(ImageVariant.DISPLAY));
		assertThat(img.getWidth()).isEqualTo(300);
		assertThat(img.getHeight()).isEqualTo(400);
		// transverse: source left (red) becomes bottom
		assertThat(isBluish(rgb(img, 150, 50))).isTrue();
		assertThat(isReddish(rgb(img, 150, 350))).isTrue();
	}

	@Test
	void flattensTransparentPngOntoWhite() throws Exception {
		BufferedImage img = decode(processor.process(TestImages.transparentPng(100, 80), Set.of(ImageVariant.THUMB))
				.get(ImageVariant.THUMB));
		assertThat(rgb(img, 0, 0)).isGreaterThan(0xF8F8F8 - 1);
		assertThat((rgb(img, 0, 0) >> 16) & 0xFF).isGreaterThanOrEqualTo(250);
		assertThat((rgb(img, 99, 79) >> 8) & 0xFF).isGreaterThanOrEqualTo(250);
	}

	private static double meanLuma(BufferedImage i) {
		double sum = 0;
		for (int y = 0; y < i.getHeight(); y++) {
			for (int x = 0; x < i.getWidth(); x++) {
				int c = i.getRGB(x, y);
				sum += 0.299 * ((c >> 16) & 0xFF) + 0.587 * ((c >> 8) & 0xFF) + 0.114 * (c & 0xFF);
			}
		}
		return sum / ((double) i.getWidth() * i.getHeight());
	}

	@Test
	void grayscaleDoesNotDarken() throws Exception {
		byte[] in = TestImages.grayJpeg(300, 200);
		BufferedImage out = decode(processor.process(in, Set.of(ImageVariant.DISPLAY)).get(ImageVariant.DISPLAY));
		// Reference mean from raw gray samples (ImageIO.getRGB on gray applies a linear-gray conversion).
		var raster = decode(in).getRaster();
		double inMean = 0;
		for (int y = 0; y < raster.getHeight(); y++) {
			for (int x = 0; x < raster.getWidth(); x++) {
				inMean += raster.getSample(x, y, 0);
			}
		}
		inMean /= (double) raster.getWidth() * raster.getHeight();
		assertThat(meanLuma(out)).isCloseTo(inMean, Offset.offset(3.0));
	}

	@Test
	void cmykJpegIsUnsupported() {
		assertThatThrownBy(() -> processor.process(TestImages.cmykJpeg(64, 64), Set.of(ImageVariant.THUMB)))
				.isInstanceOfSatisfying(ApiException.class, e -> {
					assertThat(e.getCode()).isEqualTo("unsupported_image");
					assertThat(e.getStatus().value()).isEqualTo(415);
				});
	}

	@Test
	void overPixelCapIs413ImageTooLarge() {
		assertThatThrownBy(() -> processor.process(TestImages.pngHeaderOnly(20_000, 20_000), Set.of(ImageVariant.THUMB)))
				.isInstanceOfSatisfying(ApiException.class, e -> {
					assertThat(e.getCode()).isEqualTo("image_too_large");
					assertThat(e.getStatus().value()).isEqualTo(413);
				});
	}

	@Test
	void subsamplesLargePng() throws Exception {
		ProcessedImage p = processor.processDetailed(TestImages.write(TestImages.halves(8000, 6000), "png"),
				Set.of(ImageVariant.THUMB, ImageVariant.DISPLAY));
		assertThat(p.subsample()).isEqualTo(2);
		assertThat(p.decodedWidth()).isEqualTo(4000);
		assertThat(p.decodedHeight()).isEqualTo(3000);
		BufferedImage d = decode(p.variants().get(ImageVariant.DISPLAY));
		assertThat(d.getWidth()).isEqualTo(1600);
		assertThat(d.getHeight()).isEqualTo(1200);
	}

	@Test
	void webpOverItsLowerCapIs413WithoutDecoding() {
		assertThatThrownBy(() -> processor.process(TestImages.webpHeaderOnly(8000, 7000), Set.of(ImageVariant.THUMB)))
				.isInstanceOfSatisfying(ApiException.class, e -> {
					assertThat(e.getCode()).isEqualTo("image_too_large");
					assertThat(e.getStatus().value()).isEqualTo(413);
				});
	}

	@Test
	void progressiveJpegOverItsLowerCapIs413WithoutDecoding() {
		// 56 MP: under the baseline cap, over the progressive one (libjpeg buffers every DCT coefficient natively).
		assertThatThrownBy(() -> processor.process(TestImages.jpegHeaderOnly(0xC2, 8000, 7000), Set.of(ImageVariant.THUMB)))
				.isInstanceOfSatisfying(ApiException.class, e -> {
					assertThat(e.getCode()).isEqualTo("image_too_large");
					assertThat(e.getStatus().value()).isEqualTo(413);
				});
	}

	private static boolean isProgressiveJpeg(byte[] b) {
		ImageProcessor.JpegFrame f = ImageProcessor.jpegFrame(b);
		return f != null && f.progressive();
	}

	@Test
	void progressiveSofVariantsAreDetected() {
		for (int sof : new int[] {0xC2, 0xC6, 0xCA, 0xCE}) {
			assertThat(isProgressiveJpeg(TestImages.jpegHeaderOnly(sof, 10, 10))).as("SOF %x", sof).isTrue();
		}
		for (int sof : new int[] {0xC0, 0xC1, 0xC3, 0xC9}) {
			assertThat(isProgressiveJpeg(TestImages.jpegHeaderOnly(sof, 10, 10))).as("SOF %x", sof).isFalse();
		}
		assertThat(isProgressiveJpeg(TestImages.progressiveJpeg(64, 48))).isTrue();
		assertThat(isProgressiveJpeg(TestImages.jpegWithExif(64, 48, 6))).isFalse();
	}

	@Test
	void baselineJpegHeaderOf56MegapixelsPassesTheCapCheck() {
		// Header-only, so decoding fails afterwards (415) - but it must not be rejected as too large.
		assertThatThrownBy(() -> processor.process(TestImages.jpegHeaderOnly(0xC0, 8000, 7000), Set.of(ImageVariant.THUMB)))
				.isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.getCode()).isNotEqualTo("image_too_large"));
	}

	@Test
	void smallProgressiveJpegStillDecodes() throws Exception {
		byte[] in = TestImages.progressiveJpeg(400, 300);
		BufferedImage img = decode(processor.process(in, Set.of(ImageVariant.DISPLAY)).get(ImageVariant.DISPLAY));
		assertThat(img.getWidth()).isEqualTo(400);
		assertThat(img.getHeight()).isEqualTo(300);
		assertThat(isReddish(rgb(img, 50, 150))).isTrue();
		assertThat(isBluish(rgb(img, 350, 150))).isTrue();
	}

	@Test
	void paddedProgressiveHeaderOverCapIs413() {
		// libjpeg skips stray bytes between segments: a padding byte must not downgrade the frame to the baseline cap.
		assertThatThrownBy(() -> processor.process(TestImages.jpegHeaderOnlyWithPaddingBeforeSof(0xC2, 8000, 7000),
				Set.of(ImageVariant.THUMB)))
				.isInstanceOfSatisfying(ApiException.class, e -> {
					assertThat(e.getCode()).isEqualTo("image_too_large");
					assertThat(e.getStatus().value()).isEqualTo(413);
				});
	}

	@Test
	void paddedBaselineHeaderOver50MegapixelsFailsClosed() {
		// Irregular stream: the baseline 250 MP cap only applies to a cleanly parsed baseline frame.
		assertThatThrownBy(() -> processor.process(TestImages.jpegHeaderOnlyWithPaddingBeforeSof(0xC0, 8000, 7000),
				Set.of(ImageVariant.THUMB)))
				.isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.getCode()).isEqualTo("image_too_large"));
	}

	@Test
	void smallProgressiveJpegWithPaddingStillDecodes() throws Exception {
		byte[] in = TestImages.withPaddingAfterFirstSegment(TestImages.progressiveJpeg(400, 300));
		BufferedImage img = decode(processor.process(in, Set.of(ImageVariant.DISPLAY)).get(ImageVariant.DISPLAY));
		assertThat(img.getWidth()).isEqualTo(400);
		assertThat(img.getHeight()).isEqualTo(300);
		assertThat(isReddish(rgb(img, 50, 150))).isTrue();
		assertThat(isBluish(rgb(img, 350, 150))).isTrue();
	}
}
