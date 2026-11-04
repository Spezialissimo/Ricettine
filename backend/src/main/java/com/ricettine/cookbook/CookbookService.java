package com.ricettine.cookbook;

import com.ricettine.account.User;
import com.ricettine.account.UserRepository;
import com.ricettine.common.ApiException;
import com.ricettine.common.Tokens;
import com.ricettine.cookbook.CookbookDtos.CookbookDto;
import com.ricettine.cookbook.CookbookDtos.CookbookEntryDto;
import com.ricettine.cookbook.CookbookDtos.CookbookInput;
import com.ricettine.cookbook.CookbookDtos.CookbookSummary;
import com.ricettine.cookbook.CookbookDtos.PersonDto;
import com.ricettine.cookbook.CookbookDtos.RecipeRef;
import com.ricettine.media.ImageVariant;
import com.ricettine.media.MediaService;
import com.ricettine.recipe.RecipeService;
import com.ricettine.recipe.Visibility;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Cookbooks and their entries. {@link #requireMember} and {@link #requireOwner} are the single place where
 * cookbook permissions are decided: a non-member always gets 404, a member calling an owner-only action 403.
 */
@Service
@Transactional
public class CookbookService {

	public record AddResult(CookbookEntryDto entry, boolean created) {
	}

	private final CookbookRepository cookbooks;
	private final CookbookAuthorRepository authors;
	private final CookbookEntryRepository entries;
	private final UserRepository users;
	private final RecipeService recipes;
	private final MediaService media;

	public CookbookService(CookbookRepository cookbooks, CookbookAuthorRepository authors,
			CookbookEntryRepository entries, UserRepository users, RecipeService recipes, MediaService media) {
		this.cookbooks = cookbooks;
		this.authors = authors;
		this.entries = entries;
		this.users = users;
		this.recipes = recipes;
		this.media = media;
	}

	public CookbookDto create(UUID ownerId, CookbookInput in) {
		validate(in, true);
		Visibility visibility = in.visibility() == null ? Visibility.PRIVATE : Visibility.valueOf(in.visibility());
		Cookbook c = cookbooks.saveAndFlush(Cookbook.create(ownerId, CookbookValidator.clean(in.name()),
				CookbookValidator.clean(in.description()), visibility, Tokens.newToken()));
		return toDto(c, CookbookRole.OWNER, ownerId);
	}

	@Transactional(readOnly = true)
	public List<CookbookSummary> mine(UUID userId) {
		return cookbooks.summariesFor(userId).stream()
			.map(r -> new CookbookSummary(r.id(), r.name(), r.visibility(),
					(r.ownerId().equals(userId) ? CookbookRole.OWNER : CookbookRole.AUTHOR).name(),
					(int) r.recipeCount(), null, r.updatedAt()))
			.toList();
	}

	@Transactional(readOnly = true)
	public CookbookDto get(UUID userId, UUID id) {
		Cookbook c = find(id);
		return toDto(c, role(c, userId), userId);
	}

	public CookbookDto update(UUID userId, UUID id, CookbookInput in) {
		Cookbook c = find(id);
		requireOwnerOf(c, userId);
		validate(in, false);
		if (in.name() != null) {
			c.setName(CookbookValidator.clean(in.name()));
		}
		if (in.description() != null) {
			c.setDescription(CookbookValidator.clean(in.description()));
		}
		if (in.visibility() != null) {
			c.setVisibility(Visibility.valueOf(in.visibility()));
		}
		c.touch();
		return toDto(cookbooks.saveAndFlush(c), CookbookRole.OWNER, userId);
	}

	public void delete(UUID userId, UUID id) {
		Cookbook c = find(id);
		requireOwnerOf(c, userId);
		cookbooks.delete(c);
		cookbooks.flush();
	}

	/**
	 * Adds a recipe. The cookbook row is locked first so the entry cap holds under concurrency; adding what is
	 * already there is a no-op (created = false).
	 */
	public AddResult addRecipe(UUID userId, UUID id, RecipeRef ref) {
		Cookbook c = cookbooks.lockById(id).orElseThrow(CookbookService::notFound);
		role(c, userId);
		UUID recipeId = recipes.resolveAddable(ref, userId);
		if (entries.existsById(new CookbookEntry.Key(id, recipeId))) {
			return new AddResult(entryDto(id, recipeId, userId), false);
		}
		if (entries.countByCookbookId(id) >= CookbookValidator.MAX_ENTRIES) {
			throw new ApiException(HttpStatus.CONFLICT, "cookbook_full");
		}
		entries.saveAndFlush(new CookbookEntry(id, recipeId, userId));
		c.touch();
		cookbooks.saveAndFlush(c);
		return new AddResult(entryDto(id, recipeId, userId), true);
	}

	/** Idempotent: removing what is not there changes nothing. */
	public void removeRecipe(UUID userId, UUID id, UUID recipeId) {
		Cookbook c = find(id);
		role(c, userId);
		if (entries.deleteEntry(id, recipeId) > 0) {
			c.touch();
			cookbooks.saveAndFlush(c);
		}
	}

	/** The caller's role, or 404 for a non-member. */
	@Transactional(readOnly = true)
	public CookbookRole requireMember(UUID cookbookId, UUID userId) {
		return role(find(cookbookId), userId);
	}

	/** 404 for a non-member, 403 for a member who is not the owner. */
	@Transactional(readOnly = true)
	public void requireOwner(UUID cookbookId, UUID userId) {
		requireOwnerOf(find(cookbookId), userId);
	}

	private Cookbook find(UUID id) {
		return cookbooks.findById(id).orElseThrow(CookbookService::notFound);
	}

	private CookbookRole role(Cookbook c, UUID userId) {
		if (c.getOwnerId().equals(userId)) {
			return CookbookRole.OWNER;
		}
		if (authors.existsByCookbookIdAndUserId(c.getId(), userId)) {
			return CookbookRole.AUTHOR;
		}
		throw notFound();
	}

	private void requireOwnerOf(Cookbook c, UUID userId) {
		if (role(c, userId) != CookbookRole.OWNER) {
			throw new ApiException(HttpStatus.FORBIDDEN, "cookbook_owner_only");
		}
	}

	private static ApiException notFound() {
		return new ApiException(HttpStatus.NOT_FOUND, "cookbook_not_found");
	}

	private static void validate(CookbookInput in, boolean creating) {
		Map<String, String> errors = CookbookValidator.validate(in, creating);
		if (!errors.isEmpty()) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "validation_failed", errors);
		}
	}

	private PersonDto person(User u) {
		return u == null ? null : new PersonDto(u.getUsername(), u.getDisplayName(),
				u.getAvatarKey() == null ? null : media.url(u.getAvatarKey(), ImageVariant.AVATAR));
	}

	private CookbookEntryDto entryDto(UUID cookbookId, UUID recipeId, UUID viewerId) {
		CookbookEntryRepository.Row row = entries.row(cookbookId, recipeId)
			.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "recipe_not_found"));
		return entryDtos(List.of(row), viewerId).get(0);
	}

	private List<CookbookEntryDto> entryDtos(List<CookbookEntryRepository.Row> rows, UUID viewerId) {
		Set<UUID> ids = new HashSet<>();
		rows.forEach(r -> {
			ids.add(r.authorId());
			if (r.addedBy() != null) {
				ids.add(r.addedBy());
			}
		});
		Map<UUID, User> byId = users.findAllById(ids).stream().collect(Collectors.toMap(User::getId, Function.identity()));
		return rows.stream()
			.map(r -> new CookbookEntryDto(r.recipeId(), r.title(), person(byId.get(r.authorId())),
					r.addedBy() == null ? null : person(byId.get(r.addedBy())), r.addedAt(),
					r.authorId().equals(viewerId), null))
			.toList();
	}

	private CookbookDto toDto(Cookbook c, CookbookRole role, UUID viewerId) {
		List<UUID> authorIds = authors.findByCookbookIdOrderByJoinedAtAscUserIdAsc(c.getId()).stream()
			.map(CookbookAuthor::getUserId).toList();
		Set<UUID> ids = new HashSet<>(authorIds);
		ids.add(c.getOwnerId());
		Map<UUID, User> byId = users.findAllById(ids).stream().collect(Collectors.toMap(User::getId, Function.identity()));
		return new CookbookDto(c.getId(), c.getName(), c.getDescription(), c.getVisibility().name(), role.name(),
				person(byId.get(c.getOwnerId())), authorIds.stream().map(a -> person(byId.get(a))).toList(), null,
				null, entryDtos(entries.rows(c.getId()), viewerId), c.getUpdatedAt());
	}
}
