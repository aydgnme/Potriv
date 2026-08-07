package me.aydgn.potriv.common.logging;

import org.springframework.boot.ansi.AnsiColor;
import org.springframework.boot.ansi.AnsiElement;
import org.springframework.boot.ansi.AnsiOutput;
import org.springframework.boot.ansi.AnsiStyle;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.pattern.CompositeConverter;

/**
 * Colours a log level by its severity.
 *
 * <p>Logback's own {@code %highlight} and Spring Boot's {@code %clr} both have
 * fixed level mappings that leave {@code DEBUG} and {@code TRACE} uncoloured.
 * This converter supplies the full mapping the project wants while going through
 * {@link AnsiOutput}, so it honours {@code spring.output.ansi.enabled}: with
 * {@code never} — which production sets — it emits plain text and no escape
 * sequence ever reaches a log collector.
 *
 * <p>Colour is an enhancement, never meaning: the textual level is printed
 * regardless, so a terminal without colour support loses nothing.
 */
public class LevelColorConverter extends CompositeConverter<ILoggingEvent> {

    @Override
    protected String transform(ILoggingEvent event, String in) {
        return AnsiOutput.toString(colorFor(event.getLevel()), in, AnsiStyle.NORMAL);
    }

    private static AnsiElement colorFor(Level level) {
        return switch (level.toInt()) {
            case Level.ERROR_INT -> AnsiColor.RED;
            case Level.WARN_INT -> AnsiColor.YELLOW;
            case Level.INFO_INT -> AnsiColor.GREEN;
            case Level.DEBUG_INT -> AnsiColor.CYAN;
            // TRACE and anything below: present but visually recessive.
            default -> AnsiStyle.FAINT;
        };
    }
}
