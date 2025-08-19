# Native Translate — Private, Built-in AI Translation

English | [简体中文](./README.zh-CN.md)

Native Translate is a privacy‑first Chrome extension that uses Chrome’s built‑in AI Translator and Language Detector. No cloud calls, no telemetry — your content never leaves the browser. Models download and run locally (with progress feedback) and are cached for offline use.

- Open‑source (MIT)
- Local‑first: translation and detection run on device
- Privacy by design: zero external translation requests by default
- Fast and robust: progress overlay, caching, RTL/LTR aware
- Minimal permissions, lightweight UI

## Features

- Full‑page in‑page translation: append translated text under original blocks to preserve layout
- Hover‑to‑translate: hold a modifier (Alt/Control/Shift) and hover a paragraph to translate just that block
- Inline input translation: in text fields and contenteditable, type three spaces in a row to translate what you’ve typed into the selected “Input target language”
- Side Panel text translation: free‑text translation with auto‑detect; prefers built‑in local APIs in the panel, falls back to the content script when unavailable
- Automatic source language detection (on device) with download progress overlay
- Model caching per language pair and per line; auto‑reuse when available
- RTL/LTR aware rendering for the target language; UI locale/dir auto‑set
- Localized UI via Chrome i18n (`_locales/`)

<img width="668" height="1172" alt="wechat_2025-08-19_094654_652" src="https://github.com/user-attachments/assets/10fd7d00-c38d-43ed-b8e8-3b97ebf1e93e" />

## Requirements

- Chrome 138+ (Manifest V3, Side Panel APIs, Built‑in AI)
- pnpm 9+

Note: On first use, Chrome may download on‑device models. Availability depends on device capability.

## Install from source

1. Install dependencies: `pnpm install`
2. Development: `pnpm dev` (builds to `dist/` and enables auto‑reload in development)
3. Open `chrome://extensions`
4. Enable “Developer mode”
5. Click “Load unpacked” and select the `dist` folder
6. Production build: `pnpm build` (also produces `Native-translate.zip` in the project root)

## Usage

- Open the popup (toolbar icon)
  - Pick a target language
  - Choose the hover modifier (Alt/Control/Shift)
  - Optionally set “Input target language” for typing translation
  - Click “Translate current page” for full‑page translation
- Hover‑translate: hold the selected modifier and hover a paragraph; a translation is appended under the original
- Inline input translation: in an input/textarea/contenteditable, press space three times to translate your typed text to the chosen “Input target language”
- The overlay shows model download and translation progress when needed
- Special pages (e.g., `chrome://`, some store pages) do not allow script injection
- Re‑running full‑page translation clears old inserted translations and re‑inserts with the new target

- Side Panel
  - From the popup, click “Open Side Panel”
  - Type text on the left; choose Source = Auto (default) or a fixed language, and choose target on the right
  - Translation runs as you type; the panel first tries local built‑in APIs, then falls back to the content script if not available

## Privacy & Security

- No analytics, no tracking, no cloud translation by default
- All logic runs inside the browser (service worker, content script, side panel)
- Works offline after models are downloaded and cached

Permissions used:

- `storage` — persist settings and readiness metadata
- `activeTab`, `tabs` — interact with the current tab
- `scripting` — inject content script if not yet loaded
- `sidePanel` — optional side panel entry
- `offscreen` — used only in development for the auto‑reload helper

## Architecture

- `src/scripts/contentScript.ts` — translation engine and overlay; auto‑detects language, shows download progress, appends translations under blocks, supports hover‑to‑translate and triple‑space input translation, caches per line and per language pair, and falls back to a page‑world bridge when needed
- `src/popup/popup.tsx` — settings (target language, hover modifier, input target language) and “Translate current page”; injects content script when needed
- `src/scripts/background.ts` — side panel enable/disable per origin, action click behavior, and dev auto‑reload helper
- `src/sidePanel/sidePanel.tsx` — free‑text translator with auto‑detect; prefers local built‑in APIs and falls back to content script; includes lightweight confetti easter egg
- `src/shared/*` — cross‑context types and constants (languages, messages, settings)
- `src/utils/i18n.ts`, `src/utils/rtl.ts` — i18n helper and RTL/LTR utilities
- `_locales/` — localized strings (English, Simplified Chinese, and more)

Bundling:

- Rspack (SWC) multi‑entry build targeting MV3
- Fixed entry/output names matching `manifest.json` (`background.js`, `contentScript.js`, `popup.html`, `sidePanel.html`)

## Development

Scripts:

- `pnpm dev` — watch build with dev auto‑reload (SSE server) and content‑script reinjection
- `pnpm build` — production build (also zips output to `Native-translate.zip`)
- `pnpm tsc` — TypeScript type check
- `pnpm lint` / `pnpm lint:fix` — Biome linting

Tech stack:

- React 19, TypeScript, Tailwind CSS v4, Radix UI primitives
- Rspack (SWC) multi‑entry build for MV3

Project layout:
```
src/
  manifest.json
  components/
    ui/
      button.tsx
      select.tsx
      label.tsx
      textarea.tsx
      progress.tsx
      badge.tsx
  popup/
    popup.html
    popup.tsx
  sidePanel/
    sidePanel.html
    sidePanel.tsx
  scripts/
    background.ts
    contentScript.ts
  shared/
    languages.ts
    messages.ts
    settings.ts
  utils/
    cn.ts
    i18n.ts
    rtl.ts
  offscreen/
    devReloader.html
    devReloader.ts
  styles/
    tailwind.css
```

## Troubleshooting

- “Translator API unavailable”: ensure Chrome 138+ and that your device supports on‑device models
- No effect on a page: some pages block script injection (e.g., `chrome://`); try another site
- Slow first run: model download happens once per capability; subsequent usage reuses cached models
- Hover translate not firing: set the desired modifier in the popup (Alt/Control/Shift) and ensure you’re hovering a sizable text block
- Triple‑space input translation not firing: only triggers in text inputs/textarea/contenteditable when not composing with an IME; press space three times at the caret end
- Side panel shows “Translator API unavailable”: the panel will automatically fall back to the content script path when possible; ensure the active tab allows script injection and try again

## Roadmap

- Context‑menu translate and keyboard shortcuts
- Richer side panel (history, pin favorites)
- Cross‑browser support where feasible

## Contributing

Issues and PRs are welcome. Please follow TypeScript/React/Tailwind best practices.

## License

MIT © [zhanghe.dev](https://zhanghe.dev)
