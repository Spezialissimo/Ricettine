package com.ricettine.setup;

import com.ricettine.account.AccountDtos.NewAccountRequest;
import com.ricettine.account.AccountService;
import com.ricettine.account.User;
import com.ricettine.account.UserRepository;
import com.ricettine.common.ApiException;
import java.time.OffsetDateTime;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SetupService {

	private final JdbcTemplate jdbc;
	private final UserRepository users;
	private final AccountService accounts;

	public SetupService(JdbcTemplate jdbc, UserRepository users, AccountService accounts) {
		this.jdbc = jdbc;
		this.users = users;
		this.accounts = accounts;
	}

	public boolean setupRequired() {
		Integer done = jdbc.queryForObject("select count(*) from instance_setup", Integer.class);
		return (done == null || done == 0) && users.count() == 0;
	}

	/** The PK on instance_setup is the race guard: only one concurrent transaction can insert row 1. */
	@Transactional
	public User createAdmin(NewAccountRequest req) {
		try {
			jdbc.update("insert into instance_setup (id, completed_at) values (1, ?)", OffsetDateTime.now());
		}
		catch (DuplicateKeyException e) {
			throw new ApiException(HttpStatus.CONFLICT, "setup_already_done");
		}
		return accounts.create(req, true);
	}
}
