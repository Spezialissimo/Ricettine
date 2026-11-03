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
	/** Progressive JPEG: libjpeg buffers all DCT coefficients of the frame natively, whatever the subsampling. */
	private static final long MAX_PROGRESSIVE_JPEG_PIXELS = 50_000_000L;
	private static final float QUALITY = 0.85f;

	static {
		ImageIO.scanForPlugins(); // registers TwelveMonkeys WebP reader (and friends)
	}

	public Map<ImageVariant, byte[]> process(byte[] input, Set<ImageVariant> variants) {
		return processDetailed(input, variants).variants();
	}

	ProcessedImage processDetailed(byte[] input, Set<ImageVariant> variants) {
		Format format = sniff(input);
		int target = variants.stream().mapToInt(ImageVariant::maxEdge).max().orElse(1);
		Decoded dec = decode(input, target, maxPixels(input, format));
		BufferedImage src = dec.image();
		int orientation = format == Format.JPEG ? orientation(input) : 1;
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

	private enum Format { JPEG, PNG, WEBP }

	/**
	 * Header-dimension cap. WebP and progressive JPEG decoders hold the whole frame (WebP pixels, libjpeg every DCT
	 * coefficient, natively) regardless of subsampling, so they get the lower cap. JPEG fails closed: only a cleanly
	 * parsed baseline frame header gets the full cap; a progressive, unparseable or irregular (stray bytes) stream
	 * gets the lower one, and when its frame header can be read it is checked here, before any decoder sees it.
	 */
	private static long maxPixels(byte[] input, Format format) {
		return switch (format) {
			case WEBP -> MAX_WEBP_PIXELS;
			case PNG -> MAX_PIXELS;
			case JPEG -> {
				JpegFrame frame = jpegFrame(input);
				if (frame != null && frame.clean() && !frame.progressive()) {
					yield MAX_PIXELS;
				}
				if (frame != null && (long) frame.width() * frame.height() > MAX_PROGRESSIVE_JPEG_PIXELS) {
					throw tooLarge();
				}
				yield MAX_PROGRESSIVE_JPEG_PIXELS;
			}
		};
	}

	/**
	 * Frame header (SOFn) of a JPEG: whether it is progressive, the declared size, and whether every byte before it
	 * belonged to a well-formed marker segment ({@code clean}).
	 */
	record JpegFrame(boolean progressive, int width, int height, boolean clean) {
	}

	static boolean isProgressiveJpeg(byte[] b) {
		JpegFrame f = jpegFrame(b);
		return f != null && f.progressive();
	}

	/**
	 * Scans the JPEG marker segments up to the first frame header. Progressive = SOF2/SOF6/SOF10/SOF14 (Huffman or
	 * arithmetic, plain or differential). Like libjpeg, stray bytes between segments are skipped (the frame is then
	 * not {@code clean}). Returns null when no complete frame header is found before the first scan.
	 */
	static JpegFrame jpegFrame(byte[] b) {
		if (b.length < 4 || (b[0] & 0xFF) != 0xFF || (b[1] & 0xFF) != 0xD8) {
			return null;
		}
		boolean clean = true;
		int i = 2;
		while (i + 1 < b.length) {
			if ((b[i] & 0xFF) != 0xFF) { // stray byte: libjpeg skips to the next 0xFF
				clean = false;
				i++;
				continue;
			}
			int marker = b[i + 1] & 0xFF;
			if (marker == 0xFF) { // fill byte
				i++;
				continue;
			}
			if (marker == 0x00 || marker == 0x01 || (marker >= 0xD0 && marker <= 0xD7)) { // no length
				clean &= marker != 0x00;
				i += 2;
				continue;
			}
			if (marker >= 0xC0 && marker <= 0xCF && marker != 0xC4 && marker != 0xC8 && marker != 0xCC) {
				if (i + 8 >= b.length) {
					return null;
				}
				int h = ((b[i + 5] & 0xFF) << 8) | (b[i + 6] & 0xFF);
				int w = ((b[i + 7] & 0xFF) << 8) | (b[i + 8] & 0xFF);
				return new JpegFrame(marker == 0xC2 || marker == 0xC6 || marker == 0xCA || marker == 0xCE, w, h, clean);
			}
			if (marker == 0xDA || marker == 0xD9 || i + 3 >= b.length) { // scan / end before any frame header
				return null;
			}
			int len = ((b[i + 2] & 0xFF) << 8) | (b[i + 3] & 0xFF);
			if (len < 2) { // a segment length includes its own two bytes
				clean = false;
			}
			i += 2 + Math.max(len, 2);
		}
		return null;
	}

	private static Format sniff(byte[] b) {
		if (b.length >= 3 && (b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xD8 && (b[2] & 0xFF) == 0xFF) {
			return Format.JPEG;
		}
		if (b.length >= 8 && (b[0] & 0xFF) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G') {
			return Format.PNG;
		}
		if (b.length >= 12 && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F' && b[8] == 'W'
				&& b[9] == 'E' && b[10] == 'B' && b[11] == 'P') {
			return Format.WEBP;
		}
		throw unsupported();
	}

	private static ApiException tooLarge() {
		return new ApiException(HttpStatus.CONTENT_TOO_LARGE, "image_too_large");
	}

	private static ApiException unsupported() {
		return new ApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "unsupported_image");
	}

	private static Decoded decode(byte[] input, int target, long maxPixels) {
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
				if ((long) w * h > maxPixels) {
					throw tooLarge();
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
