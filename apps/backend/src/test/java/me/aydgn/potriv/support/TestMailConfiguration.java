package me.aydgn.potriv.support;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.context.annotation.Profile;

/**
 * Provides an in-memory recording mail sender for the test profile so no
 * external SMTP process is needed during {@code ./mvnw test}. Declared as a
 * profile-gated configuration so it is component-scanned into every test
 * context that boots the application.
 */
@Configuration
@Profile("test")
public class TestMailConfiguration {

    @Bean
    @Primary
    public RecordingMailSender recordingMailSender() {
        return new RecordingMailSender();
    }
}
