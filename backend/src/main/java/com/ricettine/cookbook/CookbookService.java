package com.ricettine.cookbook;

import com.ricettine.account.User;
import com.ricettine.account.UserRepository;
import com.ricettine.common.ApiException;
import com.ricettine.common.PublicUrls;
import com.ricettine.common.Tokens;
import com.ricettine.cookbook.CookbookDtos.CookbookDto;
import com.ricettine.cookbook.CookbookDtos.CookbookEntryDto;
import com.ricettine.cookbook.CookbookDtos.CookbookInput;
import com.ricettine.cookbook.CookbookDtos.CookbookSummary;
import com.ricettine.cookbook.CookbookDtos.PersonDto;
import com.ricettine.cookbook.CookbookDtos.PublicCookbook;
import com.ricettine.cookbook.CookbookDtos.PublicCookbookEntry;
import com.ricettine.cookbook.CookbookDtos.RecipeRef;
import com.ricettine.media.ImageVariant;
import com.ricettine.media.MediaKind;
import com.ricettine.media.MediaService;
import com.ricettine.media.ProcessedUpload;
import com.ricettine.recipe.RecipeDtos.PhotoDto;
import com.ricettine.recipe.RecipeDtos.PublicRecipe;
import com.ricettine.recipe.RecipeService;
import com.ricettine.recipe.Visibility;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
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
	private final PublicUrls urls;

	public CookbookService(CookbookRepository cookbooks, CookbookAuthorRepository authors,
			CookbookEntryRepository entries, UserRepository users, RecipeService recipes, MediaService media,
			PublicUrls urls) {
		this.cookbooks = cookbooks;
		this.authors = authors;
		this.entries = entries;
		this.users = users;
		this.recipes = recipes;
		this.media = media;
		this.urls = urls;
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
					(int) r.recipeCount(), r.coverMediaId() == null ? null
							: media.url(r.coverMediaId(), ImageVariant.THUMB), r.updatedAt()))
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
		String cover = c.getCoverMediaId();
		cookbooks.delete(c);
		cookbooks.flush();
		if (cover != null) {
			media.delete(cover);
		}
	}

	/**
	 * Owner only: registers the (already processed) upload as the cover, swaps the reference and deletes the old
	 * cover media; the old blobs go after commit, the new ones are removed if this rolls back.
	 */
	public CookbookDto setCover(UUID userId, UUID id, ProcessedUpload upload) {
		Cookbook c = find(id);
		requireOwnerOf(c, userId);
		String old = c.getCoverMediaId();
		c.setCoverMediaId(media.register(upload, userId, MediaKind.COOKBOOK, null, id));
		c.touch();
		cookbooks.saveAndFlush(c);
		if (old != null) {
			media.delete(old);
		}
		return toDto(c, CookbookRole.OWNER, userId);
	}

	/** Owner only; idempotent. */
	public CookbookDto removeCover(UUID userId, UUID id) {
		Cookbook c = find(id);
		requireOwnerOf(c, userId);
		String old = c.getCoverMediaId();
		if (old != null) {
			c.setCoverMediaId(null);
			c.touch();
			cookbooks.saveAndFlush(c);
			media.delete(old);
		}
		return toDto(c, CookbookRole.OWNER, userId);
	}

	private PhotoDto coverDto(Cookbook c, String queryOrEmpty) {
		String id = c.getCoverMediaId();
		return id == null ? null : new PhotoDto(id, media.url(id, ImageVariant.THUMB) + queryOrEmpty,
				media.url(id, ImageVariant.DISPLAY) + queryOrEmpty);
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

	/** Owner only: the old token stops opening the cookbook, its recipes and their photos at once. */
	public CookbookDto resetShareLink(UUID userId, UUID id) {
		Cookbook c = find(id);
		requireOwnerOf(c, userId);
		c.resetShareToken(Tokens.newToken());
		c.touch();
		return toDto(cookbooks.saveAndFlush(c), CookbookRole.OWNER, userId);
	}

	/** Anonymous read by cookbook token: the cookbook and its PUBLISHED entries. Unknown token is 404. */
	@Transactional(readOnly = true)
	public PublicCookbook publicByToken(String token, UUID viewerId) {
		Cookbook c = byToken(token);
		List<UUID> authorIds = authors.findByCookbookIdOrderByJoinedAtAscUserIdAsc(c.getId()).stream()
			.map(CookbookAuthor::getUserId).toList();
		List<CookbookEntryRepository.Row> rows = entries.publishedRows(c.getId());
		Set<UUID> ids = new HashSet<>(authorIds);
		ids.add(c.getOwnerId());
		rows.forEach(r -> ids.add(r.authorId()));
		Map<UUID, User> byId = users.findAllById(ids).stream().collect(Collectors.toMap(User::getId, Function.identity()));
		CookbookRole role = viewerId == null ? null
				: c.getOwnerId().equals(viewerId) ? CookbookRole.OWNER
				: authorIds.contains(viewerId) ? CookbookRole.AUTHOR : null;
		List<PublicCookbookEntry> recipeList = rows.stream()
			.map(r -> new PublicCookbookEntry(r.recipeId(), r.title(), person(byId.get(r.authorId())),
					coverThumb(r, c.getShareToken())))
			.toList();
		return new PublicCookbook(c.getName(), c.getDescription(), person(byId.get(c.getOwnerId())),
				authorIds.stream().map(a -> person(byId.get(a))).toList(), coverDto(c, query(c.getShareToken())),
				recipeList,
				role == null ? null : role.name(), role == null ? null : c.getId());
	}

	/** A recipe through a cookbook link: it must be a PUBLISHED entry of that cookbook, else 404. */
	@Transactional(readOnly = true)
	public PublicRecipe publicRecipe(String token, String recipeId, UUID viewerId) {
		Cookbook c = byToken(token);
		UUID rid;
		try {
			rid = UUID.fromString(recipeId);
		}
		catch (IllegalArgumentException e) {
			throw new ApiException(HttpStatus.NOT_FOUND, "recipe_not_found");
		}
		if (!entries.existsById(new CookbookEntry.Key(c.getId(), rid))) {
			throw new ApiException(HttpStatus.NOT_FOUND, "recipe_not_found");
		}
		return recipes.publishedPublicView(rid, query(c.getShareToken()), viewerId);
	}

	private Cookbook byToken(String token) {
		return cookbooks.findByShareToken(token)
			.filter(c -> MessageDigest.isEqual(c.getShareToken().getBytes(StandardCharsets.UTF_8),
					token.getBytes(StandardCharsets.UTF_8)))
			.orElseThrow(CookbookService::notFound);
	}

	private static String query(String token) {
		return "?c=" + URLEncoder.encode(token, StandardCharsets.UTF_8);
	}

	private String coverThumb(CookbookEntryRepository.Row r, String token) {
		return r.coverMediaId() == null ? null : media.url(r.coverMediaId(), ImageVariant.THUMB) + query(token);
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
		return entryDtos(List.of(row), viewerId, find(cookbookId).getShareToken()).get(0);
	}

	private List<CookbookEntryDto> entryDtos(List<CookbookEntryRepository.Row> rows, UUID viewerId,
			String token) {
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
					r.authorId().equals(viewerId), coverThumb(r, token)))
			.toList();
	}

	private CookbookDto toDto(Cookbook c, CookbookRole role, UUID viewerId) {
		List<UUID> authorIds = authors.findByCookbookIdOrderByJoinedAtAscUserIdAsc(c.getId()).stream()
			.map(CookbookAuthor::getUserId).toList();
		Set<UUID> ids = new HashSet<>(authorIds);
		ids.add(c.getOwnerId());
		Map<UUID, User> byId = users.findAllById(ids).stream().collect(Collectors.toMap(User::getId, Function.identity()));
		return new CookbookDto(c.getId(), c.getName(), c.getDescription(), c.getVisibility().name(), role.name(),
				person(byId.get(c.getOwnerId())), authorIds.stream().map(a -> person(byId.get(a))).toList(),
				urls.base() + "/c/" + c.getShareToken(), coverDto(c, ""),
				entryDtos(entries.rows(c.getId()), viewerId, c.getShareToken()), c.getUpdatedAt());
	}
}
