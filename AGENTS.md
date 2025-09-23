# Repository Guidelines

## Project Structure & Module Organization
Native Translate is a Chrome MV3 extension. Source lives in `src/`, with `components/` for shared UI primitives (Radix wrappers under `src/components/ui`), feature entry points in `popup/`, `sidePanel/`, `offscreen/`, and `scripts/`. Shared utilities sit in `src/utils`, cross-cutting logic in `src/shared`, and styles in `src/styles`. Packaged assets stay in `public/`, localized strings in `_locales/*`, and release artifacts in `dist/`; do not edit generated files.

## Build, Test, and Development Commands
Use `pnpm dev` for watch builds during extension work. Run `pnpm build` to produce the distributable in `dist/` and the release zip. `pnpm tsc` performs strict type checking, while `pnpm lint` enforces Biome formatting and quality rules; `pnpm lint:fix` applies safe auto-fixes.

## Coding Style & Naming Conventions
Follow the Biome config: 2-space indentation, 100-character line width, single quotes in TS/JS, double quotes in JSX, and semicolons as needed. Keep TypeScript strict by avoiding `any` and preferring explicit generics or `unknown`. Order imports React → third-party → local, and reference project modules with `@/*` aliases. Components must be function components with explicit prop interfaces, Radix UI wrappers from `src/components/ui`, and Tailwind powered via `cn()`; use `dark:` variants for themes and `z-[2147483647]` for overlays. Persist extension state with `chrome.storage.local`.

- Prefer the shared `useChromeLocalStorage` hook for popup/side panel state so reads happen once and writes are debounced.
- Keep overlays pointer-safe and accessible (`aria-live="polite"`, `role="status"`).
- When touching content-script translations, use `buildCacheKey` helpers and batch DOM writes (see `translateBlocksSequentially`).

## Testing Guidelines
Until automated tests exist, always run `pnpm lint` and `pnpm tsc` before opening a PR. Manually verify translation flows in Chrome: popup text translation, side panel session handling, file translation, and locale switching (confirm `dir` matches the active language). Name future specs `*.test.ts(x)` beside implementation files and document execution steps in the PR.

## Commit & Pull Request Guidelines
Adopt Conventional Commits as in recent history (e.g. `feat(sidePanel): add PDF upload`). Keep commits focused, written in English, and scoped to a feature or module. PR descriptions must summarize behavior changes, list manual checks, link issues, and attach UI screenshots or recordings. Call out localization edits and manifest updates explicitly.

## Localization & Security Notes
Pull user-facing strings from `_locales` via Chrome i18n APIs and update translated copies together. Sanitize external translation responses before rendering, and never commit API keys—store secrets through Chrome-managed configuration or `chrome.storage.local` at runtime.

## Messaging & Warm-up
- Runtime message constants live in `src/shared/messages.ts`. Extend that file first when adding new cross-context communication.
- Use `MSG_WARM_TRANSLATOR` to pre-warm language pairs instead of forcing dummy translations; the content script schedules work via `requestIdleCallback` and tracks warmed pairs.
- Background → side panel automation (confetti, auto-enable) should stay idempotent; prefer `chrome.storage.local` flags over long-lived globals.
