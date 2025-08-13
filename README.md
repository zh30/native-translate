# Native Translate — Private, Local AI Translation for Chrome

English | [简体中文](./README.zh-CN.md)

An open-source, privacy-first Chrome extension for instant, on-device translation. No cloud calls. No telemetry. Your data never leaves your browser.

- Open-source (MIT)
- Data-safe by design: zero external requests for translation by default
- Local AI: designed to run models entirely on your device (WebGPU when available)
- Fast: near-instant responses with GPU acceleration and smart caching
- Lightweight: minimal permissions, small footprint

## Why Native Translate

- Open by default: transparent code, reproducible builds
- Private by design: your content stays local, no server component
- Local-first AI: supports on-device model execution; offline-friendly
- Built for speed: leverages WebGPU/CPU paths and avoids network latency

## Current Status

This repository provides a Chrome Extension MV3 foundation with:
- React 19 + TypeScript + Tailwind CSS v4 + Rspack
- Entries: background service worker, content script, side panel, optional popup
- i18n: English and Simplified Chinese (`_locales/`)
- Demo content script that renders a reading-time badge (placeholder for future translation flow)

Planned: integrate local on-device translation models and UI for model selection/management.

## Installation

Requirements:
- Chrome 138+ (MV3 Side Panel APIs)
- pnpm 9+

Steps:
1. Install dependencies: `pnpm install`
2. Build the extension: `pnpm build`
3. Open `chrome://extensions`
4. Enable Developer mode
5. Click “Load unpacked” and select the `dist` folder

## Usage

- Click the extension icon to open the side panel
- The side panel is auto-enabled on `zhanghe.dev` for demo purposes
- Translation UI and local model runtime are in progress; the current content script showcases the integration surface

## Privacy & Security

- No analytics, no tracking, no cloud translation by default
- All logic runs inside the browser (service worker, content script, side panel)
- Permissions requested: `storage`, `activeTab`, `scripting`, `tabs`, `sidePanel`
- Offline-friendly once local models are provisioned

## Development

Scripts:
- `pnpm dev` – development build with watch
- `pnpm build` – production build
- `pnpm tsc` – TypeScript type check

Tech stack:
- React 19, TypeScript, Tailwind CSS v4
- Rspack (SWC) multi-entry build targeting MV3

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

## Roadmap

- On-device translation via WebGPU-capable runtimes (local models)
- Model management UI (download/import, caching, offline packs)
- Context menu translate, keyboard shortcuts, quick actions
- Edge/Firefox support where feasible

## Contributing

Contributions are welcome! Issues and PRs are appreciated. Please follow conventional TypeScript, React, and Tailwind best practices.

## License

MIT © zhanghe.dev
