package me.aydgn.potriv.common.ratelimit;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Strict, allocation-only IPv4/IPv6 literal parsing — never a hostname
 * lookup.
 *
 * {@link InetAddress#getByName(String)} only skips DNS resolution when its
 * argument is <em>already</em> a literal address; handed anything else, it
 * resolves it, which means a value this application never chose to look
 * up — including the {@code X-Forwarded-For} hops a caller controls once the
 * immediate peer is a trusted proxy — could trigger a real outbound query
 * against an application-facing header. This class decides literal-ness
 * itself, by grammar alone, before {@code getByName} is ever called, so
 * nothing reaches it that was not already proven to need no lookup.
 *
 * IPv4 is a regular dotted quad. IPv6 accepts the full eight-group form, one
 * {@code ::} compression, and an IPv4-mapped tail ({@code ::ffff:192.0.2.1});
 * a zone id ({@code fe80::1%eth0}) is rejected outright — it names a local
 * interface, not a value comparable against a configured CIDR range.
 */
final class IpLiteral {

    private static final Pattern IPV4 = Pattern.compile(
        "^((25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)\\.){3}(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)$");

    private IpLiteral() {
    }

    static boolean isLiteral(String value) {
        return isIpv4(value) || isIpv6(value);
    }

    /**
     * The literal's bytes, exactly as {@link InetAddress#getByName} would
     * report them. Only ever called after {@link #isLiteral} has already
     * proven {@code value} is a literal, so this cannot perform a lookup —
     * {@link UnknownHostException} here would be this method's own bug, not
     * an absent host, so it is not a checked condition callers need to plan
     * around.
     */
    static byte[] toBytes(String value) {
        try {
            return InetAddress.getByName(value).getAddress();
        } catch (UnknownHostException exception) {
            throw new IllegalStateException(
                "IpLiteral.isLiteral accepted a value getByName then rejected: " + value,
                exception);
        }
    }

    private static boolean isIpv4(String value) {
        return IPV4.matcher(value).matches();
    }

    /**
     * Structural validation, not a regex: RFC 4291's grammar (one optional
     * {@code ::} compression, 1-4 hex digits per group, an optional
     * IPv4-mapped tail occupying the last two groups) is easier to get right
     * as a small state machine than as an expression dense enough to invite
     * exactly the kind of off-by-one this function exists to avoid.
     */
    private static boolean isIpv6(String rawValue) {
        if (rawValue.isEmpty() || rawValue.indexOf('%') >= 0) {
            return false;
        }

        String value = rawValue;
        int mappedIpv4Weight = 0;
        int lastColon = value.lastIndexOf(':');
        if (lastColon >= 0 && value.indexOf('.', lastColon) >= 0) {
            String ipv4Tail = value.substring(lastColon + 1);
            if (!isIpv4(ipv4Tail)) {
                return false;
            }
            value = value.substring(0, lastColon);
            mappedIpv4Weight = 2;
        }

        int doubleColonAt = value.indexOf("::");
        if (doubleColonAt >= 0 && value.indexOf("::", doubleColonAt + 1) >= 0) {
            return false;
        }

        String head = doubleColonAt >= 0 ? value.substring(0, doubleColonAt) : value;
        String tail = doubleColonAt >= 0 ? value.substring(doubleColonAt + 2) : "";

        List<String> headGroups = splitGroups(head);
        List<String> tailGroups = splitGroups(tail);
        if (headGroups == null || tailGroups == null
            || !headGroups.stream().allMatch(IpLiteral::isHexGroup)
            || !tailGroups.stream().allMatch(IpLiteral::isHexGroup)) {
            return false;
        }

        int weight = headGroups.size() + tailGroups.size() + mappedIpv4Weight;
        return doubleColonAt >= 0 ? weight < 8 : weight == 8;
    }

    /** {@code null} signals a malformed split (a stray empty group). */
    private static List<String> splitGroups(String part) {
        if (part.isEmpty()) {
            return List.of();
        }
        String[] pieces = part.split(":", -1);
        List<String> groups = new ArrayList<>(pieces.length);
        for (String piece : pieces) {
            if (piece.isEmpty()) {
                return null;
            }
            groups.add(piece);
        }
        return groups;
    }

    private static boolean isHexGroup(String group) {
        if (group.isEmpty() || group.length() > 4) {
            return false;
        }
        for (int i = 0; i < group.length(); i++) {
            if (Character.digit(group.charAt(i), 16) < 0) {
                return false;
            }
        }
        return true;
    }
}
