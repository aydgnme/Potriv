package me.aydgn.potriv.identity.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

/**
 * Sends the confirmation link to the address that asked to register it.
 * Shaped like {@link EmployeeInviteMailService}: sender and subject are
 * fixed, nothing user-supplied reaches a header, and the exception is
 * deliberately not caught here — the delivery worker is the caller, and a
 * thrown exception is how it learns to schedule another attempt.
 */
@Service
public class RegistrationVerificationMailService {

    private final JavaMailSender mailSender;
    private final String fromAddress;

    public RegistrationVerificationMailService(
        JavaMailSender mailSender,
        @Value("${app.mail.from}") String fromAddress
    ) {
        this.mailSender = mailSender;
        this.fromAddress = fromAddress;
    }

    public void sendVerificationMail(String toEmail, String adminName, String verificationUrl) {
        SimpleMailMessage message = new SimpleMailMessage();

        message.setFrom(fromAddress);
        message.setTo(toEmail);
        message.setSubject("Confirm your Potriv workspace");
        message.setText(
            "Hello " + adminName + ",\n\n"
                + "Confirm this email address to finish creating your Potriv workspace:\n\n"
                + verificationUrl + "\n\n"
                + "The link works once, only for this address, and expires.\n\n"
                + "If you did not request this, you can ignore this email.\n\n"
                + "The Potriv Team"
        );

        mailSender.send(message);
    }
}
