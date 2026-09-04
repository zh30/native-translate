# Changelog

All notable changes to Native Translate are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

GitHub Releases are created from the matching `## [X.Y.Z]` section when a `vX.Y.Z` tag is pushed.
Do not tag a version until that section lists every user-facing change that ships in the tag.

## [Unreleased]

## [3.2.1] - 2026-09-04

Chrome Web Store and GitHub release covering every change since **3.1.1**. Intermediate package **3.2.0** was never tagged, so its work is included here. Requires Chrome 138+.

### Added

- **Full-page translation shortcut** `Alt+Shift+T` (`translate-page` command). The background service worker sends `MSG_TRANSLATE_PAGE` with the stored target language. This replaces the incomplete `Ctrl+Shift+T` patch from PR #4, which had no background handler and collided with Chrome's reopen-closed-tab shortcut.
- Canonical product links in the README: **Official website**, **Privacy policy**, and the Chrome Web Store listing.
- Keep a Changelog (`CHANGELOG.md`) plus a GitHub Actions gate: tag `vX.Y.Z` must match `package.json` and `src/manifest.json`, and the GitHub Release body is this version's changelog section (not a raw `git log`).

### Fixed

- **Content-script re-injection.** Chrome rejects `tabs.sendMessage` when a listener returns `false` without `sendResponse`. Callers treated that as a missing receiver and injected `contentScript.js` again, stacking hover, page-translate, and screenshot listeners. Fire-and-forget commands now acknowledge; inject retries only on a true missing receiver.
- **Learning mode persistence.** Learning mode stays enabled across reloads via `LEARNING_ENABLED_KEY`.
- **Popup fallback.** When `action.openPopup` has no user gesture, open a popup window instead of failing silently.
- **Side-panel chat garbled after streaming.** After `promptStreaming` finished, `executeChat` always ran an English → target Translator pass. Gemini Nano often already answered in Chinese, so that second pass treated CJK as English and replaced the good stream with scrambled text. Skip the language chain when the streamed script already matches the target; ChatTab keeps the streamed text when a finalized payload would clobber it. Stream chunks that are unknown objects are no longer stringified as `[object Object]`.

### Changed

- English and Chinese READMEs rewritten to match the shipped 3.1.1 on-device AI suite (Translator + Gemini Nano, side-panel AI tabs, shortcuts, and canonical Official website / Privacy policy labels).
- Toolchain: Vitest 5 (jest-dom matchers merged onto Vitest 5 `Assertion<R, T>`), Rspack 2.2.2, lucide-react 1.40, Biome 2.5.12.
- Release workflow runs on Node 22 (required by Vitest 5). Chrome Web Store upload runs only when the CWS secrets are present, so a missing store credential no longer fails the GitHub Release.

### Documentation

- `develop.md` keyboard-shortcut checklist includes `Alt+Shift+T`.
- Release process documents the changelog gate and the `vX.Y.Z` tag.

## [3.1.1] - 2026-08-15

### Changed

- Unified popup, shared components, and in-page chrome with the welcome-page visual language (paper, zinc, and cyan).
- First-run welcome tour shipped with the 3.1.1 UI pass.

## [3.1.0] - 2026-08-13

### Added

- On-device Gemini Nano suite: page summary, ask-this-page chat, selection assistant, writing assistant, screenshot / image translation, learning mode, vocab book, smart extract, EPUB chapter digest, and experimental voice transcription.
- Readable full-page translation stays text-only so icons are not cloned into the caption layer.

### Changed

- Toolchain: TypeScript 7, Rspack 2, Biome 2.

[Unreleased]: https://github.com/zh30/native-translate/compare/v3.2.1...HEAD
[3.2.1]: https://github.com/zh30/native-translate/compare/453c890...v3.2.1
[3.1.1]: https://github.com/zh30/native-translate/compare/94aabb0...453c890
[3.1.0]: https://github.com/zh30/native-translate/commit/94aabb0
