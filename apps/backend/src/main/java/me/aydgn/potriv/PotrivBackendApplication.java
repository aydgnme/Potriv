package me.aydgn.potriv;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@ConfigurationPropertiesScan
// Invite delivery runs on a schedule rather than inside the request that
// creates an invitation. See InviteDeliveryWorker.
@EnableScheduling
public class PotrivBackendApplication {

	public static void main(String[] args) {
		SpringApplication.run(PotrivBackendApplication.class, args);
	}

}
