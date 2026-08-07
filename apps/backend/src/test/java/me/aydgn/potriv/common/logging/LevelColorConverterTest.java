package me.aydgn.potriv.common.logging;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.ansi.AnsiOutput;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.classic.spi.LoggingEvent;

/**
 * The level→colour contract, and the guarantee that it disappears when ANSI is
 * off.
 *
 * <p>Asserted here rather than by scraping a rendered log line: this is the one
 * place the mapping is decided, so one focused test covers every level without
 * making the rest of the suite depend on escape sequences.
 */
class LevelColorConverterTest {

    private final LevelColorConverter converter = new LevelColorConverter();

    @AfterEach
    void restoreAnsiDefault() {
        AnsiOutput.setEnabled(AnsiOutput.Enabled.DETECT);
    }

    private String render(Level level) {
        ILoggingEvent event = new LoggingEvent() {
            @Override
            public Level getLevel() {
                return level;
            }
        };
        return converter.transform(event, level.toString());
    }

    @Test
    void eachLevelGetsItsOwnColour() {
        AnsiOutput.setEnabled(AnsiOutput.Enabled.ALWAYS);

        assertThat(render(Level.ERROR)).startsWith("\033[31m");   // red
        assertThat(render(Level.WARN)).startsWith("\033[33m");    // yellow
        assertThat(render(Level.INFO)).startsWith("\033[32m");    // green
        assertThat(render(Level.DEBUG)).startsWith("\033[36m");   // cyan
        assertThat(render(Level.TRACE)).startsWith("\033[2m");    // faint
    }

    @Test
    void theLevelTextSurvivesTheColouring() {
        AnsiOutput.setEnabled(AnsiOutput.Enabled.ALWAYS);

        // Colour is an enhancement, never meaning: the word is always there.
        for (Level level : new Level[] {Level.ERROR, Level.WARN, Level.INFO,
            Level.DEBUG, Level.TRACE}) {
            assertThat(render(level)).contains(level.toString());
        }
    }

    /**
     * The production guarantee. Production sets
     * {@code spring.output.ansi.enabled=never}; with it, this converter must emit
     * no escape sequence at all, so nothing pollutes a log collector.
     */
    @Test
    void nothingIsEmittedWhenAnsiIsDisabled() {
        AnsiOutput.setEnabled(AnsiOutput.Enabled.NEVER);

        for (Level level : new Level[] {Level.ERROR, Level.WARN, Level.INFO,
            Level.DEBUG, Level.TRACE}) {
            assertThat(render(level))
                .isEqualTo(level.toString())
                .doesNotContain("\033");
        }
    }
}
