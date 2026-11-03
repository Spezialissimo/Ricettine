package com.ricettine.auth;

import com.ricettine.account.User;
import com.ricettine.account.UserRepository;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

/** Loads users by id. The principal name (UserDetails username) is the user's UUID string, never the email. */
@Service
public class AppUserDetailsService implements UserDetailsService {

	private final UserRepository users;

	public AppUserDetailsService(UserRepository users) {
		this.users = users;
	}

	@Override
	public UserDetails loadUserByUsername(String id) throws UsernameNotFoundException {
		try {
			return users.findById(UUID.fromString(id)).map(AppUserDetailsService::toDetails)
				.orElseThrow(() -> new UsernameNotFoundException("unknown user"));
		}
		catch (IllegalArgumentException e) {
			throw new UsernameNotFoundException("unknown user");
		}
	}

	/**
	 * The principal stored in the session: same name and authorities, but no password, so the hash is never
	 * serialized into spring_session_attributes.
	 */
	static UserDetails sessionPrincipal(User u) {
		return org.springframework.security.core.userdetails.User.withUserDetails(toDetails(u)).password("").build();
	}

	static UserDetails toDetails(User u) {
		List<GrantedAuthority> authorities = new ArrayList<>();
		authorities.add(new SimpleGrantedAuthority("ROLE_USER"));
		if (u.isAdmin()) {
			authorities.add(new SimpleGrantedAuthority("ROLE_ADMIN"));
		}
		return org.springframework.security.core.userdetails.User.withUsername(u.getId().toString())
			.password(u.getPasswordHash()).authorities(authorities).build();
	}
}
