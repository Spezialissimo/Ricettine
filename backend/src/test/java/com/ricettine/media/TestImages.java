package com.ricettine.media;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import javax.imageio.ImageIO;
import org.apache.commons.imaging.formats.jpeg.exif.ExifRewriter;
import org.apache.commons.imaging.formats.tiff.constants.TiffTagConstants;
import org.apache.commons.imaging.formats.tiff.write.TiffOutputSet;

/** Reproducible in-code fixtures (no binaries committed). */
public final class TestImages {

	private TestImages() {
	}

	/** Left half red, right half blue, so orientation changes are detectable from pixels. */
	public static BufferedImage halves(int w, int h) {
		BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
		Graphics2D g = img.createGraphics();
		g.setColor(Color.RED);
		g.fillRect(0, 0, w / 2, h);
		g.setColor(Color.BLUE);
		g.fillRect(w / 2, 0, w - w / 2, h);
		g.dispose();
		return img;
	}

	public static byte[] write(BufferedImage img, String format) {
		try {
			ByteArrayOutputStream out = new ByteArrayOutputStream();
			ImageIO.write(img, format, out);
			return out.toByteArray();
		}
		catch (Exception e) {
			throw new IllegalStateException(e);
		}
	}

	public static byte[] plainJpeg(int w, int h) {
		return write(halves(w, h), "jpg");
	}

	public static byte[] png(int w, int h) {
		return write(halves(w, h), "png");
	}

	/** 400x300 JPEG with EXIF Orientation={@code orientation} and GPS coordinates. */
	public static byte[] jpegWithExif(int w, int h, int orientation) {
		try {
			TiffOutputSet set = new TiffOutputSet();
			set.getOrCreateRootDirectory().add(TiffTagConstants.TIFF_TAG_ORIENTATION, (short) orientation);
			set.setGpsInDegrees(12.4964, 41.9028);
			ByteArrayOutputStream out = new ByteArrayOutputStream();
			new ExifRewriter().updateExifMetadataLossless(plainJpeg(w, h), out, set);
			return out.toByteArray();
		}
		catch (Exception e) {
			throw new IllegalStateException(e);
		}
	}

	public static byte[] orientation6() {
		return jpegWithExif(400, 300, 6);
	}

	public static byte[] fakeJpgPdf() {
		return "%PDF-1.4\n1 0 obj<<>>endobj\n".getBytes(StandardCharsets.US_ASCII);
	}

	/** Minimal ISO-BMFF header: size, 'ftyp', brand 'heic'. */
	public static byte[] heic() {
		byte[] b = new byte[24];
		b[3] = 24;
		System.arraycopy("ftypheic".getBytes(StandardCharsets.US_ASCII), 0, b, 4, 8);
		System.arraycopy("mif1heic".getBytes(StandardCharsets.US_ASCII), 0, b, 16, 8);
		return b;
	}
}
