package com.ricettine.media;

import com.drew.imaging.ImageMetadataReader;
import com.drew.metadata.exif.ExifIFD0Directory;
import com.ricettine.common.ApiException;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.color.ColorSpace;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.EnumMap;
import java.util.Map;
import java.util.Set;
import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageReadParam;
import javax.imageio.ImageReader;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.MemoryCacheImageOutputStream;
import net.coobird.thumbnailator.Thumbnails;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/** Sniffs, orients (EXIF), resizes and re-encodes images as metadata-free JPEG. */
@Component
public class ImageProcessor {

	private static final long MAX_PIXELS = 250_000_000L;
	/** The WebP reader decodes the full frame before subsampling, so it gets a much lower cap. */
	private static final long MAX_WEBP_PIXELS = 50_000_000L;
	private static final float QUALITY = 0.85f;

	static {
		ImageIO.scanForPlugins(); // registers TwelveMonkeys WebP reader (and friends)
	}

	public Map<ImageVariant, byte[]> process(byte[] input, Set<ImageVariant> variants) {
		return processDetailed(input, variants).variants();
	}

	ProcessedImage processDetailed(byte[] input, Set<ImageVariant> variants) {
		boolean jpeg = sniff(input);
		int target = variants.stream().mapToInt(ImageVariant::maxEdge).max().orElse(1);
		Decoded dec = decode(input, target, isWebp(input));
		BufferedImage src = dec.image();
		int orientation = jpeg ? orientation(input) : 1;
		Map<ImageVariant, byte[]> out = new EnumMap<>(ImageVariant.class);
		for (ImageVariant v : variants) {
			try {
				out.put(v, encodeJpeg(orient(resize(src, v.maxEdge()), orientation)));
			}
			catch (IOException e) {
				throw new java.io.UncheckedIOException(e);
			}
		}
		return new ProcessedImage(out, src.getWidth(), src.getHeight(), dec.factor());
	}

	/** Subsampling factor keeping the decoded long edge at least twice the largest requested variant. */
	static int subsampleFactor(int width, int height, int targetLongEdge) {
		return Math.max(1, Math.max(width, height) / (2 * targetLongEdge));
	}

	private record Decoded(BufferedImage image, int factor) {
	}

	private static boolean isWebp(byte[] b) {
		return b.length >= 12 && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F' && b[8] == 'W'
				&& b[9] == 'E' && b[10] == 'B' && b[11] == 'P';
	}

	/** @return true when JPEG (the only format we read EXIF from) */
	private static boolean sniff(byte[] b) {
		if (b.length >= 3 && (b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xD8 && (b[2] & 0xFF) == 0xFF) {
			return true;
		}
		boolean png = b.length >= 8 && (b[0] & 0xFF) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G';
		boolean webp = b.length >= 12 && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F' && b[8] == 'W'
				&& b[9] == 'E' && b[10] == 'B' && b[11] == 'P';
		if (png || webp) {
			return false;
		}
		throw unsupported();
	}

	private static ApiException unsupported() {
		return new ApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "unsupported_image");
	}

	private static Decoded decode(byte[] input, int target, boolean webp) {
		try (ImageInputStream in = ImageIO.createImageInputStream(new ByteArrayInputStream(input))) {
			var readers = ImageIO.getImageReaders(in);
			if (!readers.hasNext()) {
				throw unsupported();
			}
			ImageReader reader = readers.next();
			try {
				reader.setInput(in, true, true);
				int w = reader.getWidth(0);
				int h = reader.getHeight(0);
				if ((long) w * h > (webp ? MAX_WEBP_PIXELS : MAX_PIXELS)) {
					throw new ApiException(HttpStatus.CONTENT_TOO_LARGE, "image_too_large");
				}
				int f = subsampleFactor(w, h, target);
				ImageReadParam param = reader.getDefaultReadParam();
				param.setSourceSubsampling(f, f, 0, 0);
				BufferedImage decoded = reader.read(0, param);
				if (decoded.getColorModel().getColorSpace().getType() == ColorSpace.TYPE_CMYK) {
					throw unsupported(); // CMYK colors cannot be reproduced faithfully: documented as unsupported
				}
				return new Decoded(flatten(decoded), f);
			}
			finally {
				reader.dispose();
			}
		}
		catch (IOException | RuntimeException e) {
			if (e instanceof ApiException api) {
				throw api;
			}
			throw unsupported();
		}
	}

	/** Draw onto opaque RGB (transparent PNGs get a white background; JPEG has no alpha). */
	private static BufferedImage flatten(BufferedImage img) {
		if (img.getType() == BufferedImage.TYPE_INT_RGB) {
			return img;
		}
		BufferedImage rgb = new BufferedImage(img.getWidth(), img.getHeight(), BufferedImage.TYPE_INT_RGB);
		if (img.getColorModel().getNumColorComponents() == 1 && !img.getColorModel().hasAlpha()
				&& img.getRaster().getNumBands() == 1) {
			// Java2D treats gray as linear and would darken it on conversion: copy the sample values as sRGB.
			var r = img.getRaster();
			int max = (1 << img.getColorModel().getComponentSize(0)) - 1;
			for (int y = 0; y < rgb.getHeight(); y++) {
				for (int x = 0; x < rgb.getWidth(); x++) {
					int v = r.getSample(x, y, 0) * 255 / max;
					rgb.setRGB(x, y, (v << 16) | (v << 8) | v);
				}
			}
			return rgb;
		}
		Graphics2D g = rgb.createGraphics();
		g.setColor(Color.WHITE);
		g.fillRect(0, 0, rgb.getWidth(), rgb.getHeight());
		g.drawImage(img, 0, 0, null);
		g.dispose();
		return rgb;
	}

	private static int orientation(byte[] jpeg) {
		try {
			var dir = ImageMetadataReader.readMetadata(new ByteArrayInputStream(jpeg))
					.getFirstDirectoryOfType(ExifIFD0Directory.class);
			if (dir != null && dir.containsTag(ExifIFD0Directory.TAG_ORIENTATION)) {
				int o = dir.getInt(ExifIFD0Directory.TAG_ORIENTATION);
				return o >= 1 && o <= 8 ? o : 1;
			}
		}
		catch (Exception e) {
			// unreadable metadata: treat as upright
		}
		return 1;
	}

	private static BufferedImage resize(BufferedImage img, int maxEdge) throws IOException {
		int longest = Math.max(img.getWidth(), img.getHeight());
		if (longest <= maxEdge) {
			return img;
		}
		double scale = (double) maxEdge / longest;
		int w = Math.max(1, (int) Math.round(img.getWidth() * scale));
		int h = Math.max(1, (int) Math.round(img.getHeight() * scale));
		return Thumbnails.of(img).forceSize(w, h).asBufferedImage();
	}

	/** Applies EXIF orientation 1..8 to the pixels. */
	static BufferedImage orient(BufferedImage s, int o) {
		if (o == 1) {
			return s;
		}
		int w = s.getWidth();
		int h = s.getHeight();
		boolean swap = o >= 5;
		int dw = swap ? h : w;
		int dh = swap ? w : h;
		BufferedImage d = new BufferedImage(dw, dh, BufferedImage.TYPE_INT_RGB);
		for (int y = 0; y < dh; y++) {
			for (int x = 0; x < dw; x++) {
				int sx;
				int sy;
				switch (o) {
					case 2 -> { sx = w - 1 - x; sy = y; }
					case 3 -> { sx = w - 1 - x; sy = h - 1 - y; }
					case 4 -> { sx = x; sy = h - 1 - y; }
					case 5 -> { sx = y; sy = x; }
					case 6 -> { sx = y; sy = h - 1 - x; }
					case 7 -> { sx = w - 1 - y; sy = h - 1 - x; }
					default -> { sx = w - 1 - y; sy = x; } // 8
				}
				d.setRGB(x, y, s.getRGB(sx, sy));
			}
		}
		return d;
	}

	private static byte[] encodeJpeg(BufferedImage img) throws IOException {
		ImageWriter writer = ImageIO.getImageWritersByFormatName("jpeg").next();
		try {
			ImageWriteParam p = writer.getDefaultWriteParam();
			p.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
			p.setCompressionQuality(QUALITY);
			ByteArrayOutputStream bos = new ByteArrayOutputStream();
			try (MemoryCacheImageOutputStream ios = new MemoryCacheImageOutputStream(bos)) {
				writer.setOutput(ios);
				writer.write(null, new IIOImage(img, null, null), p); // null metadata: nothing carried over
			}
			return bos.toByteArray();
		}
		finally {
			writer.dispose();
		}
	}
}
