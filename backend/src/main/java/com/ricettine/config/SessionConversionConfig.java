package com.ricettine.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.convert.ConversionService;
import org.springframework.core.convert.support.GenericConversionService;
import org.springframework.core.convert.converter.Converter;
import org.springframework.core.serializer.support.DeserializingConverter;
import org.springframework.core.serializer.support.SerializingConverter;

/**
 * Spring Session JDBC conversion: sessions stay Java-serialized, but an unreadable payload (for example after a
 * Spring Security upgrade changed a serialized class) reads as a missing attribute, so the user is simply logged out
 * instead of every request failing with a 500.
 */
@Configuration
public class SessionConversionConfig {

	private static final Logger log = LoggerFactory.getLogger(SessionConversionConfig.class);

	private final UnreadableSessionLog reported = new UnreadableSessionLog(1000);

	@Bean
	ConversionService springSessionConversionService() {
		GenericConversionService service = new GenericConversionService();
		service.addConverter(Object.class, byte[].class, new SerializingConverter());
		DeserializingConverter deserializer = new DeserializingConverter();
		service.addConverter(byte[].class, Object.class, (Converter<byte[], Object>) bytes -> {
			try {
				return deserializer.convert(bytes);
			}
			catch (Exception e) {
				String message = "Unreadable session attribute ignored, treating the session as logged out: {}";
				if (reported.firstSighting(bytes)) {
					log.warn(message, e.toString());
				}
				else {
					log.debug(message, e.toString());
				}
				return null;
			}
		});
		return service;
	}
}
