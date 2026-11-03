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

	/** Large JPEG with EXIF orientation (low-entropy content so it stays small compressed). */
	public static byte[] bigJpegWithExif(int w, int h, int orientation) {
		return jpegWithExif(w, h, orientation);
	}

	/** PNG signature + IHDR only: enough for header-dimension checks, no pixel data. */
	public static byte[] pngHeaderOnly(int w, int h) {
		try {
			ByteArrayOutputStream out = new ByteArrayOutputStream();
			java.io.DataOutputStream d = new java.io.DataOutputStream(out);
			d.write(new byte[] {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A});
			ByteArrayOutputStream ihdr = new ByteArrayOutputStream();
			java.io.DataOutputStream i = new java.io.DataOutputStream(ihdr);
			i.writeBytes("IHDR");
			i.writeInt(w);
			i.writeInt(h);
			i.write(new byte[] {8, 2, 0, 0, 0});
			byte[] body = ihdr.toByteArray();
			d.writeInt(13);
			d.write(body);
			java.util.zip.CRC32 crc = new java.util.zip.CRC32();
			crc.update(body);
			d.writeInt((int) crc.getValue());
			return out.toByteArray();
		}
		catch (Exception e) {
			throw new IllegalStateException(e);
		}
	}

	/** PNG with a fully transparent pixel area. */
	public static byte[] transparentPng(int w, int h) {
		return write(new BufferedImage(w, h, BufferedImage.TYPE_INT_ARGB), "png");
	}

	/** Grayscale JPEG with a horizontal gradient (value 40..215). */
	public static byte[] grayJpeg(int w, int h) {
		BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_BYTE_GRAY);
		for (int y = 0; y < h; y++) {
			for (int x = 0; x < w; x++) {
				int v = 40 + 175 * x / (w - 1);
				img.getRaster().setSample(x, y, 0, v);
			}
		}
		return write(img, "jpg");
	}

	/** Four-band (CMYK) JPEG written from a raster. */
	public static byte[] cmykJpeg(int w, int h) {
		try {
			java.awt.image.WritableRaster r = java.awt.image.Raster.createInterleavedRaster(
					java.awt.image.DataBuffer.TYPE_BYTE, w, h, 4, null);
			javax.imageio.ImageWriter writer = ImageIO.getImageWritersByFormatName("jpeg").next();
			ByteArrayOutputStream out = new ByteArrayOutputStream();
			try (javax.imageio.stream.ImageOutputStream ios = ImageIO.createImageOutputStream(out)) {
				writer.setOutput(ios);
				writer.write(null, new javax.imageio.IIOImage(r, null, null), null);
			}
			writer.dispose();
			return out.toByteArray();
		}
		catch (Exception e) {
			throw new IllegalStateException(e);
		}
	}

	/** RIFF/WEBP with only a VP8X header declaring w x h: enough for header-dimension checks, no pixel data. */
	public static byte[] webpHeaderOnly(int w, int h) {
		java.nio.ByteBuffer b = java.nio.ByteBuffer.allocate(30).order(java.nio.ByteOrder.LITTLE_ENDIAN);
		b.put("RIFF".getBytes(StandardCharsets.US_ASCII)).putInt(22);
		b.put("WEBP".getBytes(StandardCharsets.US_ASCII));
		b.put("VP8X".getBytes(StandardCharsets.US_ASCII)).putInt(10);
		b.putInt(0); // flags + reserved
		b.put((byte) ((w - 1) & 0xFF)).put((byte) (((w - 1) >> 8) & 0xFF)).put((byte) (((w - 1) >> 16) & 0xFF));
		b.put((byte) ((h - 1) & 0xFF)).put((byte) (((h - 1) >> 8) & 0xFF)).put((byte) (((h - 1) >> 16) & 0xFF));
		return b.array();
	}
}
