package me.aydgn.potriv.common.ratelimit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.util.List;

import org.junit.jupiter.api.Test;

import jakarta.servlet.http.HttpServletRequest;

class ClientIpResolverTest {

    private static final RateLimitProperties.Window UNUSED = new RateLimitProperties.Window(
        Duration.ZERO, 0, Duration.ZERO, 0, Duration.ZERO, 0, Duration.ZERO, 0, Duration.ZERO, 0,
        Duration.ZERO);

    private static ClientIpResolver resolverTrusting(List<String> trustedProxies) {
        RateLimitProperties properties = new RateLimitProperties(
            true, false, "unit-test-only-secret", trustedProxies, UNUSED, UNUSED, UNUSED, UNUSED);
        return new ClientIpResolver(properties);
    }

    private static HttpServletRequest requestFrom(String remoteAddr, String forwardedFor) {
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getRemoteAddr()).thenReturn(remoteAddr);
        when(request.getHeader("X-Forwarded-For")).thenReturn(forwardedFor);
        return request;
    }

    @Test
    void withNoTrustedProxiesConfiguredTheForwardedHeaderIsAlwaysIgnored() {
        // The safe default: a client on a direct connection could set this
        // header to anything, so unless a proxy is explicitly trusted, only
        // what the servlet container itself observed is used.
        ClientIpResolver resolver = resolverTrusting(List.of());

        HttpServletRequest request = requestFrom("198.51.100.7", "1.2.3.4");

        assertThat(resolver.resolve(request)).isEqualTo("198.51.100.7");
    }

    @Test
    void aRequestNotFromATrustedProxyIsResolvedByRemoteAddrAlone() {
        ClientIpResolver resolver = resolverTrusting(List.of("10.0.0.0/8"));

        // The peer (203.0.113.5) is not inside the trusted range, so the
        // header it sent — however plausible-looking — is not honoured.
        HttpServletRequest request = requestFrom("203.0.113.5", "9.9.9.9");

        assertThat(resolver.resolve(request)).isEqualTo("203.0.113.5");
    }

    @Test
    void aRequestFromATrustedProxyUsesTheRightmostUntrustedHop() {
        ClientIpResolver resolver = resolverTrusting(List.of("10.0.0.0/8"));

        // Client, then two internal hops the deployment trusts.
        HttpServletRequest request = requestFrom("10.1.2.3", "203.0.113.9, 10.4.5.6");

        assertThat(resolver.resolve(request)).isEqualTo("203.0.113.9");
    }

    @Test
    void everyHopBeingTrustedFallsBackToThePeerAddress() {
        ClientIpResolver resolver = resolverTrusting(List.of("10.0.0.0/8"));

        HttpServletRequest request = requestFrom("10.1.2.3", "10.9.9.9, 10.4.5.6");

        assertThat(resolver.resolve(request)).isEqualTo("10.1.2.3");
    }

    @Test
    void aBareTrustedAddressIsAnExactMatchOnly() {
        ClientIpResolver resolver = resolverTrusting(List.of("127.0.0.1"));

        HttpServletRequest request = requestFrom("127.0.0.1", "203.0.113.9");
        assertThat(resolver.resolve(request)).isEqualTo("203.0.113.9");

        HttpServletRequest untrustedPeer = requestFrom("127.0.0.2", "203.0.113.9");
        assertThat(resolver.resolve(untrustedPeer)).isEqualTo("127.0.0.2");
    }

    @Test
    void aMissingForwardedHeaderFallsBackToThePeerAddressEvenWhenTrusted() {
        ClientIpResolver resolver = resolverTrusting(List.of("10.0.0.0/8"));

        HttpServletRequest request = requestFrom("10.1.2.3", null);

        assertThat(resolver.resolve(request)).isEqualTo("10.1.2.3");
    }

    // -------------------------------------------- Literal-only hop handling
    //
    // A forwarded hop is exactly the value an attacker controls once the
    // immediate peer is trusted. None of these may reach InetAddress.getByName
    // as anything other than an already-proven literal — see IpLiteralTest for
    // the classification itself; these prove ClientIpResolver actually gates
    // on it instead of returning or resolving whatever it is handed.

    @Test
    void aHostnameHopIsRejectedInFavourOfThePeerAddress() {
        ClientIpResolver resolver = resolverTrusting(List.of("10.0.0.0/8"));

        HttpServletRequest request = requestFrom("10.1.2.3", "attacker-controlled.invalid");

        assertThat(resolver.resolve(request)).isEqualTo("10.1.2.3");
    }

    @Test
    void aMalformedHopIsRejectedInFavourOfThePeerAddress() {
        ClientIpResolver resolver = resolverTrusting(List.of("10.0.0.0/8"));

        HttpServletRequest request = requestFrom("10.1.2.3", "256.0.0.1");

        assertThat(resolver.resolve(request)).isEqualTo("10.1.2.3");
    }

    @Test
    void aZoneIdHopIsRejectedInFavourOfThePeerAddress() {
        ClientIpResolver resolver = resolverTrusting(List.of("fe80::/10"));

        HttpServletRequest request = requestFrom("fe80::1", "fe80::9%eth0");

        assertThat(resolver.resolve(request)).isEqualTo("fe80::1");
    }

    @Test
    void anAttackerControlledFirstHopStillFallsBackToThePeerWhenMalformed() {
        // The rightmost hop is what a trusted proxy is supposed to have
        // appended; here it is garbage instead, which must not be handed
        // further down the chain or treated as identifying anyone.
        ClientIpResolver resolver = resolverTrusting(List.of("10.0.0.0/8"));

        HttpServletRequest request = requestFrom("10.1.2.3", "203.0.113.9, not-an-ip, 10.4.5.6");

        assertThat(resolver.resolve(request)).isEqualTo("10.1.2.3");
    }

    @Test
    void wellFormedHopsAmongMultipleValuesStillResolveTheRightmostUntrustedOne() {
        ClientIpResolver resolver = resolverTrusting(List.of("10.0.0.0/8"));

        HttpServletRequest request = requestFrom(
            "10.1.2.3", "198.51.100.1, 203.0.113.9, 10.4.5.6, 10.9.9.9");

        assertThat(resolver.resolve(request)).isEqualTo("203.0.113.9");
    }

    @Test
    void aCompressedIpv6TrustedProxyMatchesAFullFormHop() {
        ClientIpResolver resolver = resolverTrusting(List.of("2001:db8::/32"));

        HttpServletRequest request = requestFrom(
            "2001:db8:0:0:0:0:0:1", "2001:4860:4860::8888, 2001:db8::9");

        assertThat(resolver.resolve(request)).isEqualTo("2001:4860:4860::8888");
    }

    @Test
    void anIpv4MappedIpv6PeerMatchesAPlainIpv4TrustedRange() {
        // The JDK folds ::ffff:x.x.x.x down to the same 4-byte form as a
        // plain IPv4 literal, so a peer that arrives in mapped notation still
        // matches a trusted range configured in ordinary IPv4 CIDR.
        ClientIpResolver resolver = resolverTrusting(List.of("10.0.0.0/8"));

        HttpServletRequest request = requestFrom("::ffff:10.1.2.3", "203.0.113.9");

        assertThat(resolver.resolve(request)).isEqualTo("203.0.113.9");
    }

    @Test
    void aTrustedProxyPrefixLongerThanTheFoldedAddressIsRejectedAtParseTime() {
        // ::ffff:10.0.0.0 folds to a 4-byte (32-bit) address; a /104 prefix
        // has no bits left to mean anything and must fail fast at
        // configuration load rather than miscompare or run off the array at
        // request time.
        org.assertj.core.api.Assertions.assertThatThrownBy(
                () -> resolverTrusting(List.of("::ffff:10.0.0.0/104")))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("prefix length");
    }
}
