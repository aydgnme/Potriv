package me.aydgn.potriv.common.logging;

import java.io.IOException;
import java.util.UUID;
import java.util.regex.Pattern;

import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Gives every request an id that appears in each of its log lines.
 *
 * <p>Registered at the highest precedence so it wraps <em>both</em> security
 * chains: a request rejected by authentication still carries a correlation id,
 * which is exactly when one is most useful.
 *
 * <p>A caller may supply {@code X-Request-ID} to correlate across services, but
 * the value is never trusted as-is — it is a header that lands in log files, so
 * an over-long or exotic value would be a log-injection vector. Anything that
 * fails validation is silently replaced with a generated id rather than
 * rejected, because a malformed correlation header must not fail a request.
 *
 * <p>This is deliberately not distributed tracing. It is one id, in the MDC,
 * echoed back to the caller.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestCorrelationFilter extends OncePerRequestFilter {

    public static final String HEADER = "X-Request-ID";
    /** MDC key referenced by the logging patterns as {@code %X{requestId}}. */
    public static final String MDC_KEY = "requestId";

    static final int MAX_LENGTH = 64;
    /** Printable, unambiguous, and impossible to break a log line with. */
    private static final Pattern SAFE = Pattern.compile("[A-Za-z0-9._-]{1,64}");

    @Override
    protected void doFilterInternal(
        HttpServletRequest request, HttpServletResponse response, FilterChain chain)
        throws ServletException, IOException {

        String requestId = resolve(request.getHeader(HEADER));
        MDC.put(MDC_KEY, requestId);
        response.setHeader(HEADER, requestId);
        try {
            chain.doFilter(request, response);
        } finally {
            // Always, on every path: the thread goes back to a pool and must not
            // carry this request's id into the next one.
            MDC.remove(MDC_KEY);
        }
    }

    /** A usable caller-supplied id, or a fresh one. */
    private static String resolve(String supplied) {
        if (supplied != null && SAFE.matcher(supplied).matches()) {
            return supplied;
        }
        return generate();
    }

    /**
     * Short by design. A full UUID on every line costs more width than it earns
     * when the id only has to be unique among the requests in front of you.
     */
    private static String generate() {
        return UUID.randomUUID().toString().substring(0, 8);
    }
}
