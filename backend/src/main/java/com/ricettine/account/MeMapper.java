package com.ricettine.account;

import com.ricettine.account.AccountDtos.MeDto;
import com.ricettine.media.ImageVariant;
import com.ricettine.media.MediaService;
import org.springframework.stereotype.Component;

@Component
public class MeMapper {

	private final MediaService media;

	public MeMapper(MediaService media) {
		this.media = media;
	}

	public MeDto toDto(User u) {
		String avatar = u.getAvatarKey() == null ? null : media.url(u.getAvatarKey(), ImageVariant.AVATAR);
		return new MeDto(u.getId(), u.getEmail(), u.getUsername(), u.getDisplayName(), avatar, u.isAdmin());
	}
}
