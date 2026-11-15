# Plan 8 — Italian Localization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Italian next to English. The UI follows the browser language until a person picks one in Settings > Language; that choice is kept per browser, like the theme. Units read correctly in both languages ("2 spicchi", "1 clove", "3 cloves"), and amounts show with the active language's decimal separator.

**Architecture:** Frontend only; no backend or schema change. One service (`core/language.ts`) resolves the language: the choice stored in this browser (localStorage `ricettine.lang`) → browser languages → `en`, applied in `main.ts` before Angular starts (as `core/theme.ts` does for the theme). Transloco gets `availableLangs: ['en', 'it']` with English as fallback for a missing key. Everything that formats with the language (dates, numbers, name lists, plurals) reads it from one signal so a switch re-renders without a reload.

**Tech Stack:** Existing (Spring Boot 4, Java 25, Postgres, Flyway, Angular 22 zoneless, Transloco 8.4, vitest, Playwright). No new dependencies: plurals use `Intl.PluralRules`.

**Spec:** `docs/superpowers/specs/2026-11-03-ricettine-design.md` §9.1 ("i18n-ready … English only shipped; Italian next. Units and server-generated messages also go through i18n"). Entry criteria: `2026-11-03-plan-1-followups.md` (nothing in it blocks this plan) and the plan-4 follow-up "amounts read the language via getActiveLang; revisit when a second language is added" (Task 4).

## Delivery: 1 PR (owner)
One branch, `feat/p8-italian`, Tasks 1–8. Done only when green in CI (backend, frontend, e2e on **mobile and desktop**, smoke) with Playwright specs for every part. No backend change, so no backend ITs (the CLAUDE.md rule applies to PRs with backend changes).

User-visible result: the whole UI in Italian for an Italian browser; Settings > Language (System / English / Italiano) kept per browser; singular/plural units in both languages; amounts with the language's decimal separator; `1,000` and `1.000` read as 1.

## Rulings (made while planning; cost if wrong)
- **The language is kept per browser (owner)**, in localStorage like the theme: System (no key stored) / English / Italiano. It is not on the account, so it does not follow a person to another device, and it survives logout (a browser setting, not a person's). Unreadable storage → the browser rule. *Cost if wrong:* a nullable `app_user.language` column, a `PUT /api/me/language` endpoint and an `/api/me` override in the same service.
- **The browser-language rule:** the first entry of `navigator.languages` whose primary subtag is `it` or `en` wins (`it-CH` → Italian, `de, it` → Italian, `fr` → English). *Cost if wrong:* one function.
- **Applied before first paint:** `main.ts` resolves the language before bootstrap and passes it to Transloco as the starting language, so a reload never flashes English. *Cost if wrong:* none (a flash only).
- **Signed-out pages (login, register, setup, invite, `/r/`, `/c/`) have no language switch**; they follow the browser's stored choice or its language. Settings > Language is reachable only signed in. *Cost if wrong:* a small switch component on the auth pages.
- **Comma and dot are both always a decimal point (owner), in every language:** `1,000` = `1.000` = 1, `1,5` = `1.5` = 1.5. The current rejection of `1,000`-shaped text (COR-1) is removed. Thousands separators are never accepted on input. *Cost if wrong:* restore one regex.
- **Units get one/other forms** chosen by `Intl.PluralRules(lang)` on the shown amount; no amount → the one form ("a pinch of salt" shows as "pizzico" / "pinch"). The editor's unit dropdown shows the one form. *Cost if wrong:* key reshuffle in both JSON files.
- **Italian register: informal "tu"** (a small invite-only app between friends). *Cost if wrong:* a rewrite pass over `it.json`.
- **Recipe content is never translated.** Only the UI is.

## Glossary for owner review (it.json uses these consistently)
| English | Italiano |
|---|---|
| Discover | Scopri |
| My kitchen | La mia cucina |
| Recipe / Recipes | Ricetta / Ricette |
| Cookbook / Cookbooks | Ricettario / Ricettari |
| New recipe | Nuova ricetta |
| Draft · Published · Public · Private | Bozza · Pubblicata · Pubblica · Privata |
| Publish | Pubblica |
| Co-author | Coautore |
| Ingredients · Steps · Notes | Ingredienti · Passaggi · Note |
| Serves N (editor chip) / N servings | Porzioni: N / N porzioni ("Per N persone" reads wrong for 1) |
| Prep · Cook | Preparazione · Cottura |
| Source | Fonte |
| Keep screen on | Schermo sempre acceso |
| Share · Reset link | Condividi · Reimposta link |
| Settings · Appearance · Language | Impostazioni · Aspetto · Lingua |
| Invite · Users · Administration | Inviti · Utenti · Amministrazione |
| Log in · Log out | Accedi · Esci |

Units (one / other): g, kg, ml, l unchanged · tsp cucchiaino / cucchiaini · tbsp cucchiaio / cucchiai · cup tazza / tazze · piece pezzo / pezzi · pinch pizzico / pizzichi · clove spicchio / spicchi · slice fetta / fette · can lattina / lattine · bunch mazzo / mazzi. English other forms: tsp, tbsp, cups, pieces, pinches, cloves, slices, cans, bunches.

## Global Constraints
- All earlier Global Constraints hold: server-assigned ids, ProblemDetail + `code`, every UI string through Transloco, 44 px targets, Flyway-only schema, breakpoint 768 px.
- `en.json` and `it.json` always have the same keys and the same `{{placeholders}}` per key (enforced by a test, Task 3).
- No `getActiveLang()` reads inside `computed`/templates outside `core/language.ts`: use the `lang` signal so a switch re-renders.

## Part 1 — Language

### Task 1: Remove the `en`-only assumptions
**Files:** `frontend/src/index.html`, `frontend/src/app/testing/transloco.ts`, `e2e/playwright.config.ts`.
- [ ] Existing e2e projects set `locale: 'en-US'` explicitly so they stay English on any machine; `newContext` copies the project locale and takes an override (Italian runs opt in per test).
- [ ] The test Transloco helper accepts a language (default `en`), loads both files and re-renders on a switch, like the app.

### Task 2: Frontend language service
**Files:** new `frontend/src/app/core/language.ts` (+ spec), `core/i18n.config.ts`, `main.ts`.
- [ ] Pure `browserLanguage(navigatorLanguages)` (Ruling rule); `readStoredLanguage()` / `storeLanguage(choice)` with try/catch, mirroring `core/theme.ts` (`'system'` removes the key).
- [ ] `LanguageService`: `choice` signal (`'system' | 'en' | 'it'`), `lang` signal (resolved, from `langChanges$`), `choose(choice)` stores it and applies it: Transloco active lang plus `document.documentElement.lang`. A `languagechange` event on `window` re-resolves while the choice is System.
- [ ] `main.ts`: resolve the starting language (stored → browser → `en`) before bootstrap and set `<html lang>`; `i18n.config.ts` takes it as `defaultLang`, with `availableLangs: ['en','it']`, `fallbackLang: 'en'`, `missingHandler: { useFallbackTranslation: true }`.
- [ ] Spec: browser rule table, stored choice beats the browser, System follows the browser, unreadable storage, `<html lang>` follows.

### Task 3: it.json and parity
**Files:** new `frontend/public/i18n/it.json`, new `frontend/src/app/core/i18n-parity.spec.ts`.
- [ ] Translate every key using the glossary; same nesting as `en.json`.
- [ ] Parity spec: same key set both ways, same placeholder names per key, no empty values. (A scan of `t('…')` keys in the sources was dropped: the unit-test build has no Node `fs`; Transloco logs a missing key in dev.)

### Task 4: Everything that formats follows the signal
**Files:** `shared/app-date.pipe.ts`, `recipes/view/recipe-view.page.ts`, `cookbooks/cookbook.page.ts`, `cookbooks/view/cookbook-view.page.ts`, `core/page-title.ts`, `profile/profile.page.ts`, `cookbooks/cookbook-cards.component.ts`, `cookbooks/cookbook-hero.component.ts`, `recipes/view/portions-stepper.component.ts`.
- [ ] Replace `getActiveLang()` reads with `LanguageService.lang()`; the page title re-translates on switch.
- [ ] Count plurals (`recipeCountOne/Other`, `servingsOne/Other`) choose via `Intl.PluralRules(lang)` through one helper `pluralKey(base, n, lang)`.
- [ ] Specs: switching language re-renders a date, a name list ("Ann e Bob") and the title without reload.

### Task 5: Settings > Language + e2e
**Files:** new `settings/language.page.ts` (+ spec), `app.routes.ts` (`settings/language`, title `titles.language`), `settings/settings-layout.component.ts` (Account group, after Appearance), new `e2e/tests/language.spec.ts`.
- [ ] Radio group like Appearance: System (its hint names the browser's resolved language), English, Italiano (language names in their own language). Applies at once, no reload; a note says the choice is kept in this browser.
- [ ] e2e (mobile + desktop): an `it-IT` context sees the login page in Italian and `<html lang="it">`; signs in, sees Italian nav; picks English → UI switches without reload and survives a reload and a logout (the login page is English); picks System → back to Italian. An `en-US` context sees English, picks Italiano, and a new `en-US` context (fresh storage) is English again.

## Part 2 — Units and amounts

### Task 6: Unit plural forms
**Files:** `en.json`/`it.json` (`units.one.<u>`, `units.other.<u>`), `recipes/view/recipe-view.page.ts`, `recipes/editor/ingredients-editor.component.ts`, new helper in `recipes/units.ts` (+ spec).
- [ ] `unitLabel(unit, shownAmount | null, lang)` → key via `Intl.PluralRules`. The recipe page uses the scaled amount actually shown.
- [ ] Spec: `1 clove`, `2 cloves`, `½ cup`/`1½ cups` per PluralRules, `1 spicchio`, `2 spicchi`, no amount → one form.

### Task 7: Amount input in both separators
**Files:** `recipes/amount.ts`, `recipes/amount.spec.ts`, ingredients editor.
- [ ] Remove the `1,000` rejection; `1,000` and `1.000` → 1. Thousands-grouped text with two separators (`1,500.5`, `1.000,5`) stays invalid.
- [ ] `formatAmount(n, lang)` writes the language's decimal separator without grouping (`0,5` in Italian, `0.5` in English); the editor input uses it.
- [ ] Update the COR-1 cases in `amount.spec.ts`.

### Task 8: e2e
**Files:** `e2e/tests/language.spec.ts` (extend) or new `units-amounts.spec.ts`.
- [ ] Italian browser: an ingredient typed `1.000` with `kg` shows `1 kg`; `0,5` shows `0,5` in the editor after reload; `2` + clove reads `2 spicchi`, scaled to 1 portion reads `1 spicchio`.
- [ ] English: `2` + clove reads `2 cloves`; the existing `scaling.spec.ts` `1,000 g` check still passes.

## Review Focus
- The stored choice is read and written only through `core/language.ts`; storage failures never break startup.
- No English text left in Italian screens: walkthrough by the owner on both layouts once the PR is green (translation review), before merge.

## Out of scope (later plans)
- Locale-aware number input with thousands separators.
- Translating recipe content, per-recipe language tags, Italian SEO metadata.
- More languages (the parity test and the service already generalise to N).
