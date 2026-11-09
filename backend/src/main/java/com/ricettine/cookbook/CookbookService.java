package com.ricettine.cookbook;

import com.ricettine.account.User;
import com.ricettine.account.UserRepository;
import com.ricettine.common.ApiException;
import com.ricettine.common.Ids;
import com.ricettine.common.OneTimeToken;
import com.ricettine.common.OneTimeTokenRepository;
import com.ricettine.common.OneTimeTokens;
import com.ricettine.common.PublicUrls;
import com.ricettine.common.TokenPurpose;
import com.ricettine.common.Tokens;
import com.ricettine.cookbook.CookbookDtos.CookbookDto;
import com.ricettine.cookbook.CookbookDtos.CookbookEntryDto;
import com.ricettine.cookbook.CookbookDtos.CookbookInput;
import com.ricettine.cookbook.CookbookDtos.CookbookInviteCreated;
import com.ricettine.cookbook.CookbookDtos.CookbookInviteDto;
import com.ricettine.cookbook.CookbookDtos.CookbookInvitePreview;
import com.ricettine.cookbook.CookbookDtos.CookbookSummary;
import com.ricettine.cookbook.CookbookDtos.PersonDto;
import com.ricettine.cookbook.CookbookDtos.ProfileCookbook;
import com.ricettine.cookbook.CookbookDtos.PublicCookbook;
import com.ricettine.cookbook.CookbookDtos.PublicCookbookEntry;
import com.ricettine.media.ImageVariant;
import com.ricettine.media.MediaKind;
import com.ricettine.media.MediaService;
import com.ricettine.media.ProcessedUpload;
import com.ricettine.recipe.RecipeDtos.PhotoDto;
import com.ricettine.recipe.RecipeDtos.PublicRecipe;
import com.ricettine.recipe.RecipeDtos.RecipeRef;
import com.ricettine.recipe.RecipeService;
import com.ricettine.recipe.Visibility;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Cookbooks and their entries. {@link #requireMember} and {@link #requireOwner} are the single place where
 * cookbook permissions are decided: a non-member always gets 404, a member calling an owner-only action 403.
 */
@Service
@Transactional
public class CookbookService {

	static final Duration INVITE_TTL = Duration.ofDays(7);
	private static final String INVITE_PURPOSE = TokenPurpose.COOKBOOK_INVITE.name();

	public record AddResult(CookbookEntryDto entry, boolean created) {
	}

	private final CookbookRepository cookbooks;
	private final CookbookAuthorRepository authors;
	private final CookbookEntryRepository entries;
	private final UserRepository users;
	private final RecipeService recipes;
	private final MediaService media;
	private final PublicUrls urls;
	private final OneTimeTokenRepository tokens;
	private final OneTimeTokens oneTimeTokens;
	private final TransactionTemplate tx;

	public CookbookService(CookbookRepository cookbooks, CookbookAuthorRepository authors,
			CookbookEntryRepository entries, UserRepository users, RecipeService recipes, MediaService media,
			PublicUrls urls, OneTimeTokenRepository tokens, OneTimeTokens oneTimeTokens,
			PlatformTransactionManager txManager) {
		this.tx = new TransactionTemplate(txManager);
		this.cookbooks = cookbooks;
		this.authors = authors;
		this.entries = entries;
		this.users = users;
		this.recipes = recipes;
		this.media = media;
		this.urls = urls;
		this.tokens = tokens;
		this.oneTimeTokens = oneTimeTokens;
	}

	public CookbookDto create(UUID ownerId, CookbookInput in) {
		validate(in, true);
		Visibility visibility = in.visibility() == null ? Visibility.PRIVATE : Visibility.valueOf(in.visibility());
		Cookbook c = cookbooks.saveAndFlush(Cookbook.create(ownerId, CookbookValidator.clean(in.name()),
				CookbookValidator.clean(in.description()), visibility, Tokens.newToken()));
		return toDto(c, CookbookRole.OWNER, ownerId);
	}

	/** A person's owned cookbooks for their profile: PUBLIC only unless {@code includeUnlisted}. */
	@Transactional(readOnly = true)
	public List<ProfileCookbook> listedByOwner(UUID ownerId, boolean includeUnlisted) {
		List<CookbookRepository.SummaryRow> rows = cookbooks.ownedSummaries(ownerId, includeUnlisted);
		return rows.stream().map(r -> new ProfileCookbook(r.id(), r.name(), r.visibility(), (int) r.recipeCount(),
				r.shareToken(), r.coverMediaId() == null ? null
						: media.url(r.coverMediaId(), ImageVariant.THUMB) + query(r.shareToken()))).toList();
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
		Cookbook c = lock(id);
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
		Cookbook c = lock(id);
		requireOwnerOf(c, userId);
		String cover = c.getCoverMediaId();
		cookbooks.delete(c);
		cookbooks.flush();
		if (cover != null) {
			media.delete(cover);
		}
	}

	/**
	 * Owner only: stores the (already processed) upload's blobs with no transaction held, then one short transaction
	 * locks the cookbook, re-checks the owner, registers the media, swaps the cover reference and deletes the old
	 * cover media (its blobs go after commit). If anything fails the new blobs are removed.
	 */
	@Transactional(propagation = Propagation.NOT_SUPPORTED)
	public CookbookDto setCover(UUID userId, UUID id, ProcessedUpload upload) {
		return media.storeThen(upload, mediaId -> tx.execute(status -> {
			Cookbook c = lock(id);
			requireOwnerOf(c, userId);
			String old = c.getCoverMediaId();
			media.registerStored(mediaId, userId, MediaKind.COOKBOOK, null, id);
			c.setCoverMediaId(mediaId);
			c.touch();
			cookbooks.saveAndFlush(c);
			if (old != null) {
				media.delete(old);
			}
			return toDto(c, CookbookRole.OWNER, userId);
		}));
	}

	/** Owner only; idempotent. */
	public CookbookDto removeCover(UUID userId, UUID id) {
		Cookbook c = lock(id);
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
		Cookbook c = lock(id);
		role(c, userId);
		UUID recipeId = recipes.resolveAddable(ref, userId);
		if (entries.existsById(new CookbookEntry.Key(id, recipeId))) {
			return new AddResult(entryDto(c, recipeId, userId), false);
		}
		if (entries.countByCookbookId(id) >= CookbookValidator.MAX_ENTRIES) {
			throw new ApiException(HttpStatus.CONFLICT, "cookbook_full");
		}
		entries.saveAndFlush(new CookbookEntry(id, recipeId, userId));
		c.touch();
		cookbooks.saveAndFlush(c);
		return new AddResult(entryDto(c, recipeId, userId), true);
	}

	/** Idempotent: removing what is not there changes nothing. */
	public void removeRecipe(UUID userId, UUID id, UUID recipeId) {
		Cookbook c = lock(id);
		role(c, userId);
		if (entries.deleteEntry(id, recipeId) > 0) {
			c.touch();
			cookbooks.saveAndFlush(c);
		}
	}

	/** Owner only: the old token stops opening the cookbook, its recipes and their photos at once. */
	public CookbookDto resetShareLink(UUID userId, UUID id) {
		Cookbook c = lock(id);
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
			.map(r -> new PublicCookbookEntry(r.recipeId(), r.title(), person(byId.get(r.authorId()), role != null),
					coverThumb(r, c.getShareToken())))
			.toList();
		return new PublicCookbook(c.getName(), c.getDescription(), person(byId.get(c.getOwnerId()), role != null),
				authorIds.stream().map(a -> person(byId.get(a), role != null)).toList(), coverDto(c, query(c.getShareToken())),
				recipeList,
				role == null ? null : role.name(), role == null ? null : c.getId());
	}

	/** A recipe through a cookbook link: it must be a PUBLISHED entry of that cookbook, else 404. */
	@Transactional(readOnly = true)
	public PublicRecipe publicRecipe(String token, String recipeId, UUID viewerId) {
		Cookbook c = byToken(token);
		UUID rid = Ids.parse(recipeId, "recipe_not_found");
		if (!entries.existsById(new CookbookEntry.Key(c.getId(), rid))) {
			throw new ApiException(HttpStatus.NOT_FOUND, "recipe_not_found");
		}
		return recipes.publishedPublicView(rid, query(c.getShareToken()), viewerId, c.getName());
	}

	private Cookbook byToken(String token) {
		return cookbooks.findByShareToken(token)
			.orElseThrow(CookbookService::notFound);
	}

	private static String query(String token) {
		return "?c=" + URLEncoder.encode(token, StandardCharsets.UTF_8);
	}

	private String coverThumb(CookbookEntryRepository.Row r, String token) {
		return r.coverMediaId() == null ? null : media.url(r.coverMediaId(), ImageVariant.THUMB) + query(token);
	}

	/** What an invitee sees before accepting; does not consume the invite. */
	@Transactional(readOnly = true)
	public CookbookInvitePreview previewInvite(String token) {
		OneTimeToken t = tokens.findActive(Tokens.hash(token), INVITE_PURPOSE).orElseThrow(CookbookService::invalidInvite);
		Cookbook c = cookbooks.findById(t.getCookbookId()).orElseThrow(CookbookService::invalidInvite);
		return new CookbookInvitePreview(c.getName(),
				users.findById(c.getOwnerId()).map(u -> person(u, false)).orElse(null), t.getExpiresAt());
	}

	/** Owner only. The cookbook row is locked so the outstanding-invite cap holds under concurrency. */
	public CookbookInviteCreated createInvite(UUID userId, UUID id) {
		Cookbook c = lock(id);
		requireOwnerOf(c, userId);
		if (tokens.countActiveForCookbook(id, INVITE_PURPOSE) >= CookbookValidator.MAX_INVITES) {
			throw new ApiException(HttpStatus.CONFLICT, "cookbook_invites_full");
		}
		String token = Tokens.newToken();
		OneTimeToken t = tokens.save(new OneTimeToken(INVITE_PURPOSE, Tokens.hash(token), userId,
				Instant.now().plus(INVITE_TTL), id));
		return new CookbookInviteCreated(t.getId(), urls.base() + "/cookbook-invite/" + token, t.getExpiresAt());
	}

	@Transactional(readOnly = true)
	public List<CookbookInviteDto> listInvites(UUID userId, UUID id) {
		requireOwnerOf(find(id), userId);
		return tokens.listActiveForCookbook(id, INVITE_PURPOSE).stream()
			.map(t -> new CookbookInviteDto(t.getId(), t.getCreatedAt(), t.getExpiresAt())).toList();
	}

	/** Owner only; an unknown, used, expired or already revoked invite is 404. */
	public void revokeInvite(UUID userId, UUID id, UUID inviteId) {
		Cookbook c = lock(id);
		requireOwnerOf(c, userId);
		if (tokens.revokeForCookbook(inviteId, id, INVITE_PURPOSE) == 0) {
			throw invalidInvite();
		}
	}

	/**
	 * Claims the invite and adds the caller as co-author in one transaction. The cookbook is locked before the
	 * token is claimed (same order as delete, so no deadlock) and any failure after the claim (already a
	 * member, cookbook full) rolls the claim back: the invite stays usable.
	 */
	public CookbookSummary acceptInvite(UUID userId, String token) {
		UUID cookbookId = tokens.findActive(Tokens.hash(token), INVITE_PURPOSE).map(OneTimeToken::getCookbookId)
			.orElseThrow(CookbookService::invalidInvite);
		Cookbook c = cookbooks.lockById(cookbookId).orElseThrow(CookbookService::invalidInvite);
		oneTimeTokens.claim(token, TokenPurpose.COOKBOOK_INVITE).orElseThrow(CookbookService::invalidInvite);
		if (c.getOwnerId().equals(userId) || authors.existsByCookbookIdAndUserId(cookbookId, userId)) {
			throw new ApiException(HttpStatus.CONFLICT, "already_member");
		}
		if (authors.countByCookbookId(cookbookId) >= CookbookValidator.MAX_AUTHORS) {
			throw new ApiException(HttpStatus.CONFLICT, "cookbook_authors_full");
		}
		authors.saveAndFlush(new CookbookAuthor(cookbookId, userId));
		c.touch();
		cookbooks.saveAndFlush(c);
		return mine(userId).stream().filter(s -> s.id().equals(cookbookId)).findFirst().orElseThrow();
	}

	/**
	 * The owner removes any author; an author removes themselves (leave). The owner cannot be removed. With
	 * removeRecipes the person's entries leave the cookbook, the recipes themselves are never deleted.
	 */
	public void removeAuthor(UUID callerId, UUID id, UUID targetId, boolean removeRecipes) {
		Cookbook c = lock(id);
		CookbookRole callerRole = role(c, callerId);
		if (c.getOwnerId().equals(targetId)) {
			throw new ApiException(HttpStatus.CONFLICT, "owner_cannot_leave");
		}
		if (callerRole != CookbookRole.OWNER && !callerId.equals(targetId)) {
			throw new ApiException(HttpStatus.FORBIDDEN, "cookbook_owner_only");
		}
		CookbookAuthor.Key key = new CookbookAuthor.Key(id, targetId);
		if (!authors.existsById(key)) {
			throw notFound();
		}
		authors.deleteById(key);
		authors.flush();
		if (removeRecipes) {
			entries.deleteAddedBy(id, targetId);
		}
		c.touch();
		cookbooks.saveAndFlush(c);
	}

	private static ApiException invalidInvite() {
		return new ApiException(HttpStatus.NOT_FOUND, "cookbook_invite_invalid");
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

	/** Loads the cookbook with a row lock: every write goes through here so writers queue up and none overwrites another's state. */
	private Cookbook lock(UUID id) {
		return cookbooks.lockById(id).orElseThrow(CookbookService::notFound);
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

	/** Members see ids (needed to remove an author); non-members and anonymous viewers never do. */
	private PersonDto person(User u) {
		return person(u, true);
	}

	private PersonDto person(User u, boolean withId) {
		return u == null ? null : new PersonDto(withId ? u.getId() : null, u.getUsername(), u.getDisplayName(),
				u.getAvatarKey() == null ? null : media.url(u.getAvatarKey(), ImageVariant.AVATAR));
	}

	private CookbookEntryDto entryDto(Cookbook cookbook, UUID recipeId, UUID viewerId) {
		CookbookEntryRepository.Row row = entries.row(cookbook.getId(), recipeId)
			.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "recipe_not_found"));
		return entryDtos(List.of(row), viewerId, cookbook.getShareToken()).get(0);
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
