package me.aydgn.potriv.identity.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

@Service
public class PasswordResetMailService {

    private final JavaMailSender mailSender;
    private final String fromAddress;

    public PasswordResetMailService(
        JavaMailSender mailSender,
        @Value("${app.mail.from}") String fromAddress
    ) {
        this.mailSender = mailSender;
        this.fromAddress = fromAddress;
    }

    public void sendPasswordResetMail(String toEmail, String recipientName, String resetUrl) {
        SimpleMailMessage message = new SimpleMailMessage();

        message.setFrom(fromAddress);
        message.setTo(toEmail);
        message.setSubject("Potriv password reset");
        message.setText(
            "Hello " + recipientName + ",\n\n"
                + "We received a request to reset the password of your Potriv account.\n\n"
                + "You can choose a new password by opening the link below:\n"
                + resetUrl + "\n\n"
                + "If you did not request a password reset, you can safely ignore this email.\n\n"
                + "The Potriv Team"
        );

        mailSender.send(message);
    }
}
