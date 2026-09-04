# Native Translate – Developer Notes

This document captures the day-to-day workflow for working on the extension. Use it alongside `AGENTS.md` for conventions and the README for product messaging.

## Prerequisites
- Chrome 138+ (required for the built-in Translator/Language Detector APIs).
- `pnpm` ≥ 9.15.1.
- Optional: enable the `chrome://flags/#enable-desktop-pwas-link-capturing` flag when testing side panel behaviour in PWAs.

## Local Setup
```bash
pnpm install            # install dependencies
pnpm dev                # rspack watch; outputs to dist/ with live rebuild
pnpm build              # production build + zip package
pnpm tsc --noEmit       # strict type checking
pnpm lint               # biome lint (see note below about existing formatting noise)
pnpm release:notes      # preview the GitHub Release body for package.json's version
```

> Biome currently reports formatting diffs in several config and locale files. Until that backlog is cleared, `pnpm tsc` acts as the primary gate for CI-quality validation.

## Manual QA Checklist
1. **Popup**
   - Switch target/input languages and confirm the spinner + disabled state display correctly.
   - Trigger “Translate current page”; verify warm-up has already happened (overlay should skip long downloads after the first run).
2. **Hover Translate**
   - Hold the configured modifier (Alt/Control/Shift) and hover paragraphs, headings, and inline text.
   - Confirm translated text is inserted as a sibling node without breaking layout.
3. **Side Panel**
   - Open via popup button and via the Chrome side panel icon.
   - Test free-form translation; observe placeholder skeleton while streaming.
   - Upload several EPUB files (valid + invalid) and ensure progress + error states render.
4. **Input Triple-Space**
   - Use both `<input>` and `contenteditable` targets. Confirm IME composition does not trigger translation mid-flow.
5. **Keyboard shortcuts**
   - `Alt+Shift+T` translates the current page (same as the popup primary button).
   - `Alt+Shift+Y` opens the summary tab; `Alt+Shift+S` starts region capture.
   - Confirm all four commands appear in `chrome://extensions/shortcuts` (learning mode has no default binding).
6. **Background Rules**
   - Navigate to `https://zhanghe.dev/` to ensure the side panel auto-enables and confetti flag fires once.

## Messaging & Warm-up
The extension communicates across contexts using messages defined in `src/shared/messages.ts`:

- `MSG_TRANSLATE_PAGE`: popup → content script full-page translation.
- `MSG_TRANSLATE_TEXT`: side panel → content script text translation.
- `MSG_UPDATE_HOTKEY`: popup → content script modifier updates.
- `MSG_WARM_TRANSLATOR`: popup/side panel → content script predictive warm-up. This is fired when a user changes target or input languages so the content script can pre-create the translator pair via `requestIdleCallback`.

Warm-up state is tracked in `contentScript.ts` (`warmingPairs` + `READY_PAIRS_KEY`). When adding new features, prefer sending `MSG_WARM_TRANSLATOR` instead of forcing an immediate translation to keep the UI responsive.

## Caching & Performance Notes
- `useChromeLocalStorage` (in `src/utils/`) hydrates once per key and debounces writes, keeping chrome.storage churn minimal.
- Translation caching is keyed by language pairs. Use `buildCacheKey` helpers when adding new translation paths.
- Overlays now set `aria-live="polite"` and avoid pointer events, so additional status banners should follow the same pattern.
- Any heavy DOM mutations should be batched; see `translateBlocksSequentially` for an example using document fragments and idle yields.

## Release Process
GitHub Releases are generated from `CHANGELOG.md`, not from a raw `git log`. The `release-on-tag` workflow only accepts tags matching `vX.Y.Z`.

1. Move items out of `## [Unreleased]` into a new `## [X.Y.Z] - YYYY-MM-DD` section. List **every** user-facing change that ships in that version (Added / Fixed / Changed / Documentation).
2. Bump `package.json` and `src/manifest.json` to the same `X.Y.Z`.
3. Preview the GitHub Release body locally: `pnpm release:notes`. This fails if the tag, both version files, and the changelog section disagree.
4. Merge to `main`, then create and push tag `vX.Y.Z`.
5. The action verifies versions, extracts that changelog section, runs `pnpm build` on Node 22, creates a GitHub Release named `Native Translate X.Y.Z` with `Native-translate.zip` attached, and uploads to the Chrome Web Store **only** when the CWS secrets are present.

Do not tag until the changelog section is complete. A missing or empty `## [X.Y.Z]` section fails the release job.

Double-check `_locales/` before tagging—Chrome requires every string to have translations for all supported locales.

## Observability & Debugging
- Enable “All levels” logging in DevTools for the extension background service worker to catch `console.info` messages from `background.ts`.
- For content-script tracing, use the DevTools “Sources” panel on the target page and search for `native-translate` in the DOM tree to inspect inserted nodes.
- To simulate cold start, clear `chrome.storage.local` and reload the extension; the warm-up hooks should restore ready pairs after the first interaction.

Happy translating!
