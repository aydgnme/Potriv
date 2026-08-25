package me.aydgn.potriv.common.ratelimit;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * Pure classification tests — no {@code InetAddress}, no I/O, so a wrong
 * answer here would be this class's own bug, not a JVM environment quirk.
 *
 * These are also the proof that {@link ClientIpResolver} never hands a
 * non-literal value to {@code InetAddress.getByName}: every value it compares
 * is first gated by {@link IpLiteral#isLiteral}, so a value this test proves
 * is rejected here can never reach that call at all.
 */
class IpLiteralTest {

    @Test
    void acceptsIpv4Literals() {
        assertThat(IpLiteral.isLiteral("0.0.0.0")).isTrue();
        assertThat(IpLiteral.isLiteral("127.0.0.1")).isTrue();
        assertThat(IpLiteral.isLiteral("203.0.113.9")).isTrue();
        assertThat(IpLiteral.isLiteral("255.255.255.255")).isTrue();
    }

    @Test
    void rejectsMalformedIpv4Octets() {
        assertThat(IpLiteral.isLiteral("256.0.0.1")).isFalse();
        assertThat(IpLiteral.isLiteral("1.2.3.4.5")).isFalse();
        assertThat(IpLiteral.isLiteral("1.2.3")).isFalse();
        // Leading zeros are a known parser-confusion vector (some resolvers
        // read "010" as octal); this grammar refuses them rather than
        // guessing what an ambiguous octet means.
        assertThat(IpLiteral.isLiteral("010.0.0.1")).isFalse();
        assertThat(IpLiteral.isLiteral("1.2.3.-1")).isFalse();
        assertThat(IpLiteral.isLiteral("1.2.3.a")).isFalse();
    }

    @Test
    void acceptsFullAndCompressedIpv6Literals() {
        assertThat(IpLiteral.isLiteral("1:2:3:4:5:6:7:8")).isTrue();
        assertThat(IpLiteral.isLiteral("2001:db8::8a2e:370:7334")).isTrue();
        assertThat(IpLiteral.isLiteral("::1")).isTrue();
        assertThat(IpLiteral.isLiteral("::")).isTrue();
        assertThat(IpLiteral.isLiteral("fe80::1")).isTrue();
        assertThat(IpLiteral.isLiteral("2001:DB8::1")).isTrue();
    }

    @Test
    void acceptsIpv4MappedIpv6Literals() {
        assertThat(IpLiteral.isLiteral("::ffff:192.0.2.1")).isTrue();
        assertThat(IpLiteral.isLiteral("::ffff:0.0.0.0")).isTrue();
    }

    @Test
    void rejectsIpv6WithMoreThanOneCompression() {
        assertThat(IpLiteral.isLiteral("1::2::3")).isFalse();
        assertThat(IpLiteral.isLiteral(":::")).isFalse();
    }

    @Test
    void rejectsIpv6WithWrongGroupCount() {
        // Eight groups already, so "::" cannot compress anything further.
        assertThat(IpLiteral.isLiteral("1:2:3:4:5:6:7::8")).isFalse();
        // Nine groups, no compression to explain the extra one.
        assertThat(IpLiteral.isLiteral("1:2:3:4:5:6:7:8:9")).isFalse();
        // Seven groups, no compression — one short of the required eight.
        assertThat(IpLiteral.isLiteral("1:2:3:4:5:6:7")).isFalse();
    }

    @Test
    void rejectsIpv6WithOutOfRangeHexGroups() {
        assertThat(IpLiteral.isLiteral("gggg::1")).isFalse();
        assertThat(IpLiteral.isLiteral("12345::1")).isFalse();
        assertThat(IpLiteral.isLiteral("1:2:3:4:5:6:7:")).isFalse();
        assertThat(IpLiteral.isLiteral(":1:2:3:4:5:6:7")).isFalse();
    }

    @Test
    void rejectsZoneIdSuffixes() {
        assertThat(IpLiteral.isLiteral("fe80::1%eth0")).isFalse();
        assertThat(IpLiteral.isLiteral("fe80::1%25")).isFalse();
    }

    @Test
    void rejectsHostnames() {
        assertThat(IpLiteral.isLiteral("example.com")).isFalse();
        assertThat(IpLiteral.isLiteral("attacker-controlled.invalid")).isFalse();
        assertThat(IpLiteral.isLiteral("localhost")).isFalse();
        // All-hex-looking labels are exactly the case a naive character-class
        // filter (rather than real grammar) would misclassify as a literal.
        assertThat(IpLiteral.isLiteral("dead.beef.cafe.face")).isFalse();
    }

    @Test
    void rejectsMixedAndEmptyValues() {
        assertThat(IpLiteral.isLiteral("")).isFalse();
        assertThat(IpLiteral.isLiteral("not-an-ip")).isFalse();
        assertThat(IpLiteral.isLiteral("1.2.3.4:5")).isFalse();
        assertThat(IpLiteral.isLiteral("::1.2")).isFalse();
    }

    @Test
    void toBytesMatchesInetAddressForAcceptedLiterals() throws Exception {
        assertThat(IpLiteral.toBytes("203.0.113.9"))
            .isEqualTo(java.net.InetAddress.getByName("203.0.113.9").getAddress());
        assertThat(IpLiteral.toBytes("::1"))
            .isEqualTo(java.net.InetAddress.getByName("::1").getAddress());
        assertThat(IpLiteral.toBytes("::ffff:192.0.2.1"))
            .isEqualTo(java.net.InetAddress.getByName("::ffff:192.0.2.1").getAddress());
    }
}
