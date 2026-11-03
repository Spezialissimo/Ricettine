package com.ricettine.auth;

import com.ricettine.account.User;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.UUID;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.context.SecurityContextHolderStrategy;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.session.FindByIndexNameSessionRepository;
import org.springframework.session.Session;
import org.springframework.stereotype.Component;

@Component
public class AuthSessions {

	private final SecurityContextRepository repository = new HttpSessionSecurityContextRepository();
	private final SecurityContextHolderStrategy holder = SecurityContextHolder.getContextHolderStrategy();
	private final FindByIndexNameSessionRepository<? extends Session> sessions;

	public AuthSessions(FindByIndexNameSessionRepository<? extends Session> sessions) {
		this.sessions = sessions;
	}

	/** Authenticates the request as {@code user}: rotates the session id and persists the security context. */
	public void login(User user, HttpServletRequest req, HttpServletResponse res) {
		UserDetails details = AppUserDetailsService.sessionPrincipal(user);
		SecurityContext context = holder.createEmptyContext();
		context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(details, null,
				details.getAuthorities()));
		if (req.getSession(false) != null) {
			req.changeSessionId();
		}
		else {
			req.getSession(true);
		}
		holder.setContext(context);
		repository.saveContext(context, req, res);
	}

	/** Ends every session of the user (principal name is the user id as a string). */
	public void invalidateAllSessions(UUID userId) {
		sessions.findByPrincipalName(userId.toString()).keySet().forEach(sessions::deleteById);
	}

	/** Ends every session of the user except {@code keepSessionId}. */
	public void invalidateOtherSessions(UUID userId, String keepSessionId) {
		sessions.findByPrincipalName(userId.toString()).keySet().stream()
			.filter(id -> !id.equals(keepSessionId)).forEach(sessions::deleteById);
	}
}
