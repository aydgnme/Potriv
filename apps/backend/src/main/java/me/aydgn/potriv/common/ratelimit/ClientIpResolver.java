package me.aydgn.potriv.common.ratelimit;

import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Component;

import jakarta.servlet.http.HttpServletRequest;

/**
 * The client address an IP-scoped rate limit is entitled to trust.
 *
 * {@code X-Forwarded-For} is not evidence of anything on its own — it is a
 * header the client sends, and a direct connection can set it to whatever the
 * client likes. It only means something once the request has actually passed
 * through a reverse proxy this application has been told to trust, and even
 * then only the hop that proxy itself appended is trustworthy; every value to
 * its left came from further out and is exactly as unverified as if there
 * were no header at all.
 *
 * So: nothing is honoured unless the immediate peer — {@code
 * HttpServletRequest#getRemoteAddr()}, which the servlet container itself
 * observed at the TCP layer and cannot be spoofed by a header — is in {@link
 * RateLimitProperties#trustedProxies()}. With no trusted proxies configured,
 * which is the default, this always returns the peer address, and every
 * {@code X-Forwarded-For} on every request is ignored.
 *
 * Every hop value this class compares against a trusted range — the
 * configured ranges themselves and each forwarded hop — is parsed by
 * {@link IpLiteral}, never by handing an unproven string to {@link
 * java.net.InetAddress#getByName}. A forwarded hop is exactly the kind of
 * value a caller controls once the immediate peer is trusted, so treating it
 * as a hostname worth resolving would let that caller make this application
 * perform an arbitrary outbound DNS lookup on request. A hop that is not a
 * valid IPv4 or IPv6 literal breaks the chain of custody the right-to-left
 * walk depends on and is never returned as the client's address; the walk
 * falls back to the peer instead.
 */
@Component
public class ClientIpResolver {

    private static final String FORWARDED_FOR = "X-Forwarded-For";

    private final List<CidrBlock> trustedProxies;

    public ClientIpResolver(RateLimitProperties properties) {
        this.trustedProxies = properties.trustedProxies() == null
            ? List.of()
            : properties.trustedProxies().stream().map(CidrBlock::parse).toList();
    }

    public String resolve(HttpServletRequest request) {
        String peer = request.getRemoteAddr();
        if (peer == null || trustedProxies.isEmpty() || !trustedByConfiguration(peer)) {
            return peer;
        }

        String header = request.getHeader(FORWARDED_FOR);
        if (header == null || header.isBlank()) {
            return peer;
        }

        /*
         * The header is a left-to-right chain: client, then each proxy that
         * forwarded the request, appended in the order it passed through
         * them. Walking from the right and stopping at the first hop that is
         * *not* one of our own trusted proxies gives the address the last
         * trusted hop actually observed — the most specific claim this
         * application has any basis to believe.
         */
        List<String> hops = new ArrayList<>();
        for (String hop : header.split(",")) {
            String trimmed = hop.trim();
            if (!trimmed.isEmpty()) {
                hops.add(trimmed);
            }
        }
        for (int i = hops.size() - 1; i >= 0; i--) {
            String hop = hops.get(i);
            if (!IpLiteral.isLiteral(hop)) {
                // Not a value this application can compare against a CIDR
                // range at all — a hostname, a malformed address, a zone id,
                // or otherwise garbled input. Whether or not it happens to
                // match a trusted range as a string is not a question worth
                // asking: nothing to its left can be trusted once the chain
                // itself does not parse, so this stops here rather than
                // walking past it.
                return peer;
            }
            if (!trustedByConfiguration(hop)) {
                return hop;
            }
        }
        // Every hop, including the client's own claimed address, matched a
        // trusted proxy range. Nothing here identifies the client; fall back
        // to the nearest thing we actually observed.
        return peer;
    }

    private boolean trustedByConfiguration(String address) {
        return trustedProxies.stream().anyMatch(block -> block.contains(address));
    }

    /** IPv4 CIDR, or a bare address of either family compared by exact string. */
    private record CidrBlock(byte[] networkBytes, int prefixLength, String exact) {

        static CidrBlock parse(String value) {
            String trimmed = value.trim();
            int slash = trimmed.indexOf('/');
            if (slash < 0) {
                return new CidrBlock(null, -1, trimmed);
            }
            String networkPart = trimmed.substring(0, slash);
            if (!IpLiteral.isLiteral(networkPart)) {
                throw new IllegalArgumentException(
                    "Invalid entry in app.rate-limit.trusted-proxies: " + value);
            }
            int prefixLength;
            try {
                prefixLength = Integer.parseInt(trimmed.substring(slash + 1));
            } catch (NumberFormatException exception) {
                throw new IllegalArgumentException(
                    "Invalid entry in app.rate-limit.trusted-proxies: " + value, exception);
            }
            byte[] networkBytes = IpLiteral.toBytes(networkPart);
            // An IPv4-mapped IPv6 literal (::ffff:x.x.x.x) is folded by the
            // JDK into a 4-byte Inet4Address, exactly like a plain IPv4
            // literal — InetAddress does not keep the 16-byte form around. A
            // prefix written as if against that 16-byte form (anything over
            // 32) is therefore not a stricter range, it is nonsense: there is
            // no such bit to compare, and comparing past a 4-byte array
            // without this guard runs off the end of it entirely. Caught
            // here, at configuration load, rather than against a real
            // request.
            if (prefixLength < 0 || prefixLength > networkBytes.length * 8) {
                throw new IllegalArgumentException(
                    "Invalid entry in app.rate-limit.trusted-proxies: " + value
                        + " (prefix length must be between 0 and " + (networkBytes.length * 8)
                        + " for this address)");
            }
            return new CidrBlock(networkBytes, prefixLength, null);
        }

        boolean contains(String candidate) {
            String trimmed = candidate.trim();
            if (exact != null) {
                return exact.equalsIgnoreCase(trimmed);
            }
            if (!IpLiteral.isLiteral(trimmed)) {
                return false;
            }
            byte[] candidateBytes = IpLiteral.toBytes(trimmed);
            if (networkBytes.length != candidateBytes.length) {
                return false;
            }
            int fullBytes = prefixLength / 8;
            for (int i = 0; i < fullBytes; i++) {
                if (networkBytes[i] != candidateBytes[i]) {
                    return false;
                }
            }
            int remainingBits = prefixLength % 8;
            if (remainingBits == 0) {
                return true;
            }
            int mask = 0xFF00 >> remainingBits & 0xFF;
            return (networkBytes[fullBytes] & mask) == (candidateBytes[fullBytes] & mask);
        }
    }
}
