package me.aydgn.potriv.common.ratelimit;

import java.net.InetAddress;
import java.net.UnknownHostException;
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
            if (!trustedByConfiguration(hops.get(i))) {
                return hops.get(i);
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
    private record CidrBlock(InetAddress network, int prefixLength, String exact) {

        static CidrBlock parse(String value) {
            String trimmed = value.trim();
            int slash = trimmed.indexOf('/');
            if (slash < 0) {
                return new CidrBlock(null, -1, trimmed);
            }
            try {
                InetAddress network = InetAddress.getByName(trimmed.substring(0, slash));
                int prefixLength = Integer.parseInt(trimmed.substring(slash + 1));
                return new CidrBlock(network, prefixLength, null);
            } catch (UnknownHostException | NumberFormatException exception) {
                throw new IllegalArgumentException(
                    "Invalid entry in app.rate-limit.trusted-proxies: " + value, exception);
            }
        }

        boolean contains(String candidate) {
            if (exact != null) {
                return exact.equalsIgnoreCase(candidate.trim());
            }
            try {
                byte[] networkBytes = network.getAddress();
                byte[] candidateBytes = InetAddress.getByName(candidate.trim()).getAddress();
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
            } catch (UnknownHostException exception) {
                return false;
            }
        }
    }
}
