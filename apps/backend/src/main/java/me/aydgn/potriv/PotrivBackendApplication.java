package me.aydgn.potriv;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class PotrivBackendApplication {

	public static void main(String[] args) {
		SpringApplication.run(PotrivBackendApplication.class, args);
	}

}
