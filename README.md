# Native Translate — Private, Built-in AI Translation

English | [简体中文](./README.zh-CN.md)

Native Translate is a privacy‑first Chrome extension that uses Chrome’s built‑in AI Translator and Language Detector. No cloud calls, no telemetry — your content never leaves the browser. Models download and run locally (with progress feedback) and are cached for offline use.

- Open‑source (MIT)
- Local‑first: translation and detection run on device
- Privacy by design: zero external translation requests by default
- Fast and robust: progress overlay, caching, RTL/LTR aware
- Minimal permissions, lightweight UI

## Features

- Full‑page in‑page translation: append translated text under the original blocks to preserve layout
- Hover‑to‑translate: hold a modifier (Alt/Control/Shift) and hover a paragraph to translate just that block
- Automatic source language detection (on device) with download progress overlay
- Model caching per language pair; auto reuse when available
- RTL/LTR aware rendering for the target language; UI locale/dir auto‑set
- Localized UI via Chrome i18n (`_locales/`)

## Requirements

- Chrome 138+ (Manifest V3, Side Panel APIs, Built-in AI)
- pnpm 9+

Note: On first use, Chrome may download on‑device models. Availability depends on device capability.

## Install from source

1. Install dependencies: `pnpm install`
2. Build the extension: `pnpm build`
3. Open `chrome://extensions`
4. Enable “Developer mode”
5. Click “Load unpacked” and select the `dist` folder

## Usage

- Open the popup (toolbar icon)
  - Pick a target language
  - Choose the hover modifier (Alt/Control/Shift)
  - Click “Translate current page” for full‑page translation
- Hover‑translate: hold the selected modifier and hover a paragraph; a translation is appended under the original
- A small overlay shows model download and translation progress when needed
- Special pages (e.g., `chrome://`, some store pages) do not allow script injection
- Re‑running full‑page translation clears old inserted translations and re‑inserts with the new target

## Privacy & Security

- No analytics, no tracking, no cloud translation by default
- All logic runs inside the browser (service worker, content script, side panel)
- Works offline after models are downloaded and cached

Permissions used:

- `storage` — persist settings and readiness metadata
- `activeTab`, `tabs` — interact with the current tab
- `scripting` — inject content script if not yet loaded
- `sidePanel` — optional side panel entry

## Architecture

- `src/scripts/contentScript.ts` — translation engine and UI overlay; auto‑detects language, downloads models with progress, appends translations under blocks, supports hover‑to‑translate, caches per line and per pair
- `src/popup/popup.tsx` — user settings (target language, hover modifier) and “Translate current page” action; injects content script if needed
- `src/scripts/background.ts` — toggles the Side Panel on specific origin for demo; configures action click behavior
- `src/sidePanel/sidePanel.tsx` — minimal side panel scaffold
- `src/utils/i18n.ts`, `src/utils/rtl.ts` — i18n helper and RTL/LTR utilities
- `_locales/` — localized strings (English, Simplified Chinese, and more)

## Development

Scripts:

- `pnpm dev` — watch build
- `pnpm build` — production build
- `pnpm tsc` — TypeScript type check

Tech stack:

- React 19, TypeScript, Tailwind CSS v4, Radix UI primitives
- Rspack (SWC) multi‑entry build for MV3

Project layout:
```
src/
  manifest.json
  popup/
    popup.html
    popup.tsx
  sidePanel/
    sidePanel.html
    sidePanel.tsx
  scripts/
    background.ts
    contentScript.ts
  styles/
    tailwind.css
```

## Troubleshooting

- “Translator API unavailable”: ensure Chrome 138+ and that your device supports on‑device models
- No effect on a page: some pages block script injection (e.g., `chrome://`); try another site
- Slow first run: model download happens once per capability; subsequent usage reuses cached models

## Roadmap

- Context‑menu translate and keyboard shortcuts
- Richer side panel (history, pin favorites)
- Cross‑browser support where feasible

## Contributing

Issues and PRs are welcome. Please follow TypeScript/React/Tailwind best practices.

## License

MIT © zhanghe.dev
