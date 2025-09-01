# Native Translate — Private, Built-in AI Translation

[![Release on Tag](https://github.com/zh30/native-translate/actions/workflows/release-on-tag.yml/badge.svg)](https://github.com/zh30/native-translate/actions/workflows/release-on-tag.yml)
English | [简体中文](./README.zh-CN.md) 

Native Translate is a privacy‑first Chrome extension that uses Chrome’s built‑in AI Translator and Language Detector. No cloud calls, no telemetry — your content never leaves the browser. Models download and run locally (with progress feedback) and are cached for offline use.

- Open‑source (MIT)
- Local‑first: translation and detection run on device
- Privacy by design: zero external translation requests by default
- Fast and robust: progress overlay, streaming translation, caching, RTL/LTR aware
- Minimal permissions, lightweight UI

## Features

- **Full‑page translation**: Preserves original layout by appending translated text under original blocks
- **Hover‑to‑translate**: Hold a modifier key (Alt/Control/Shift) and hover over paragraphs for instant translation
- **Triple‑space input translation**: In text fields and contenteditable areas, type three spaces to translate typed content
- **Side Panel translation**: Free‑text translation with auto‑detect; prefers local APIs, falls back gracefully
- **Streaming translation**: Real‑time progressive translation for longer texts with visual feedback
- **Smart element selection**: Intelligently avoids code blocks, tables, and navigation elements
- **Multi‑frame support**: Works in all frames including about:blank pages
- **IME awareness**: Handles Asian language composition events correctly
- **Automatic language detection**: On‑device detection with download progress overlay
- **Advanced caching**: Per‑line and per‑language‑pair caching with model readiness tracking
- **RTL/LTR support**: Automatic text direction and alignment for target languages
- **Bridge architecture**: Falls back to page‑world bridge when content script APIs are unavailable
- **Development auto‑reload**: SSE‑based auto‑reload system for development
- **Internationalized UI**: Support for 13+ languages via Chrome i18n

<img width="668" height="1172" alt="wechat_2025-08-19_094654_652" src="https://github.com/user-attachments/assets/10fd7d00-c38d-43ed-b8e8-3b97ebf1e93e" />

## Requirements

- Chrome 138+ (Manifest V3, Side Panel APIs, Built‑in AI)
- pnpm 9.15.1+ (specified in packageManager)

Note: On first use, Chrome may download on‑device models. Availability depends on device capability and Chrome's AI feature rollout.

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

### Core Components
- **Content Script** (`src/scripts/contentScript.ts`) — Main translation engine with intelligent block collection, streaming translation support, hover‑to‑translate, triple‑space input translation, memory caching, progress overlays, and page‑world bridge fallback
- **Popup Interface** (`src/popup/popup.tsx`) — Settings UI for target language, hover modifiers, input target language, and full‑page translation trigger with automatic content script injection
- **Side Panel** (`src/sidePanel/sidePanel.tsx`) — Real‑time translation interface with streaming support, auto‑detection, local API preference, and confetti easter eggs
- **Background Service** (`src/scripts/background.ts`) — Tab management, side panel behavior, and zhanghe.dev integration
- **Shared Modules** (`src/shared/*`) — Cross‑context types, constants, and streaming utilities
- **UI Components** (`src/components/ui/*`) — Radix‑based reusable components with Tailwind styling
- **Utilities** (`src/utils/*`) — i18n helpers, RTL/LTR detection, and class name utilities

### Key Features Implementation
- **Translation Engine**: Supports both legacy (`window.Translator`) and modern (`window.translation.createTranslator`) Chrome APIs
- **Streaming Translation**: Progressive translation with visual feedback for texts over 800 characters
- **Smart Block Detection**: Collects translatable content while avoiding navigation, code, and table elements
- **Bridge Architecture**: Injects page‑world bridge script when content script API access fails
- **Memory Management**: WeakSet tracking, translation caching, and model readiness persistence
- **IME Support**: Composition event handling to prevent false triggers during Asian language input

### Build System
- **Rspack + SWC**: Multi‑entry build with TypeScript, React 19, and Tailwind CSS v4
- **Entry Points**: Fixed names matching manifest.json (background.js, contentScript.js, popup.html, sidePanel.html)
- **Development**: Auto‑reload system with SSE server and offscreen document
- **Production**: Automatic zip packaging with asset optimization

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

### API Issues
- **"Translator API unavailable"**: Ensure Chrome 138+ and device supports on‑device AI models
- **Side panel API unavailable**: Panel automatically falls back to content script bridge; ensure active tab allows script injection

### Translation Issues
- **No effect on pages**: Some pages block script injection (`chrome://`, extension stores); try regular websites
- **Slow first translation**: Initial model download occurs once per language pair; subsequent uses are cached
- **Incomplete translations**: Extension intelligently skips code blocks, tables, and navigation elements by design

### Interaction Issues
- **Hover translation not working**: 
  - Set correct modifier key in popup (Alt/Control/Shift)
  - Hover over substantial text blocks (headings, paragraphs, list items)
  - Avoid hovering during text editing/input focus
- **Triple‑space not triggering**:
  - Only works in text inputs, textareas, and contenteditable elements
  - Requires exactly two existing spaces followed by third space
  - Disabled during IME composition for Asian languages
  - Must be at cursor position, not middle of text

### Performance Issues
- **Memory usage**: Extension uses WeakSet tracking and clears cached readers on navigation
- **Streaming interruption**: New translation requests cancel previous streaming operations
- **Model re‑download**: Cached model readiness persists across sessions in chrome.storage

## Roadmap

- **Context menu integration**: Right‑click translation with keyboard shortcuts
- **Enhanced side panel**: Translation history, favorites, and batch operations
- **Advanced streaming**: Sentence‑by‑sentence streaming for better UX
- **Cross‑browser support**: Adaptation for other Chromium‑based browsers where feasible
- **Performance optimization**: Further memory usage reduction and faster model loading

## Contributing

Issues and PRs are welcome. Please follow the project's established patterns:

- **TypeScript**: Strict mode enabled, explicit type annotations for public APIs
- **React 19**: Functional components with hooks, automatic JSX runtime
- **Tailwind CSS v4**: Utility classes with `cn()` helper for class merging
- **Code Quality**: Biome linting with 2‑space indentation, 100‑character line width
- **Architecture**: Follow existing patterns for content scripts, bridge architecture, and streaming support

## License

MIT © [zhanghe.dev](https://zhanghe.dev)
