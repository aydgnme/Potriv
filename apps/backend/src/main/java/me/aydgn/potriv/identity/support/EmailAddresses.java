package me.aydgn.potriv.identity.support;

import java.util.Locale;

/**
 * The one place an email address is normalised, and the one place its length is
 * decided.
 *
 * Both mattered, and both were spread out.
 *
 * <p><strong>Normalisation.</strong> Five call sites lower-cased addresses, and
 * three of them called {@code toLowerCase()} with no locale — which uses the
 * JVM's default. Under a Turkish locale that maps {@code I} to {@code ı}, so a
 * backend started with {@code -Duser.language=tr} would normalise an address one
 * way when an invitation was issued (this helper, {@code Locale.ROOT}) and
 * another way when it was redeemed (the default locale). The invitation would
 * simply never match, for one letter, on one deployment.
 *
 * <p><strong>Length.</strong> The invite endpoint accepted 320 characters — the
 * RFC's maximum — while {@code users.email}, the registration request and the
 * audit record all stop at 180. An address between the two was accepted,
 * assigned a token, and mailed, and then failed at redemption when it could not
 * be stored. The narrower bound wins here because widening the columns is a
 * schema change across three tables and belongs in its own migration, not
 * smuggled in behind an invitation feature.
 */
public final class EmailAddresses {

    /**
     * Matches {@code users.email}, {@code security_audit_events.normalized_email}
     * and every registration DTO. Not the RFC maximum, deliberately: a contract
     * that accepts what it cannot store is worse than a narrow one.
     */
    public static final int MAX_LENGTH = 180;

    private EmailAddresses() {
    }

    /**
     * Trimmed and lower-cased under {@code Locale.ROOT}.
     *
     * {@code Locale.ROOT} rather than the default: the result is compared
     * against stored values, so it has to be the same on every machine that
     * runs this application.
     */
    public static String normalize(String email) {
        return email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
    }
}
