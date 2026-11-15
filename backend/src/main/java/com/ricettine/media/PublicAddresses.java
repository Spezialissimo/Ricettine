package com.ricettine.media;

import java.net.Inet4Address;
import java.net.Inet6Address;
import java.net.InetAddress;

/**
 * Whether an address is on the public internet. A photo fetched from a web address must never reach this
 * server's own network: loopback, private and link-local ranges (including cloud metadata at 169.254.169.254),
 * carrier-grade NAT, IPv6 unique-local, multicast, reserved and documentation ranges are all refused, and
 * IPv6 forms that embed an IPv4 address (mapped, NAT64, 6to4) are judged by that IPv4 address.
 */
final class PublicAddresses {

	private PublicAddresses() {
	}

	static boolean isPublic(InetAddress a) {
		if (a.isAnyLocalAddress() || a.isLoopbackAddress() || a.isLinkLocalAddress() || a.isSiteLocalAddress()
				|| a.isMulticastAddress()) {
			return false;
		}
		byte[] b = a.getAddress();
		if (a instanceof Inet4Address) {
			return isPublicV4(b);
		}
		if (a instanceof Inet6Address) {
			return isPublicV6(b);
		}
		return false;
	}

	private static boolean isPublicV4(byte[] b) {
		int o0 = b[0] & 0xff;
		int o1 = b[1] & 0xff;
		int o2 = b[2] & 0xff;
		return !(o0 == 0 // "this network"
				|| o0 == 10 || o0 == 127 // private, loopback
				|| (o0 == 100 && o1 >= 64 && o1 <= 127) // carrier-grade NAT 100.64/10
				|| (o0 == 169 && o1 == 254) // link-local, cloud metadata
				|| (o0 == 172 && o1 >= 16 && o1 <= 31) // private
				|| (o0 == 192 && o1 == 0 && (o2 == 0 || o2 == 2)) // IETF protocol assignments, TEST-NET-1
				|| (o0 == 192 && o1 == 168) // private
				|| (o0 == 198 && (o1 == 18 || o1 == 19)) // benchmarking
				|| (o0 == 198 && o1 == 51 && o2 == 100) // TEST-NET-2
				|| (o0 == 203 && o1 == 0 && o2 == 113) // TEST-NET-3
				|| o0 >= 224); // multicast, reserved, broadcast
	}

	private static boolean isPublicV6(byte[] b) {
		int w0 = ((b[0] & 0xff) << 8) | (b[1] & 0xff);
		if ((b[0] & 0xfe) == 0xfc) { // unique local fc00::/7
			return false;
		}
		if ((w0 & 0xffc0) == 0xfe80 || (w0 & 0xffc0) == 0xfec0) { // link-local, old site-local
			return false;
		}
		if (w0 == 0x2001 && (((b[2] & 0xff) << 8) | (b[3] & 0xff)) == 0x0db8) { // documentation
			return false;
		}
		if (w0 == 0x2002) { // 6to4: the IPv4 address is in bytes 2..5
			return isPublicV4(new byte[] { b[2], b[3], b[4], b[5] });
		}
		boolean zeroPrefix = true;
		for (int i = 0; i < 10; i++) {
			zeroPrefix &= b[i] == 0;
		}
		if (zeroPrefix && ((b[10] == 0 && b[11] == 0) || (b[10] == (byte) 0xff && b[11] == (byte) 0xff))) {
			// ::/96 (deprecated IPv4-compatible, includes :: and ::1) and ::ffff:0:0/96 (IPv4-mapped)
			return isPublicV4(new byte[] { b[12], b[13], b[14], b[15] });
		}
		if (w0 == 0x0064 && b[2] == (byte) 0xff && b[3] == (byte) 0x9b) { // NAT64 64:ff9b::/96
			return isPublicV4(new byte[] { b[12], b[13], b[14], b[15] });
		}
		return true;
	}
}
