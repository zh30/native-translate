# Native Translate

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Chrome Extension](https://img.shields.io/badge/Chrome%20Extension-v3.2.1-brightgreen)](https://chromewebstore.google.com/detail/native-translate-%E2%80%94-privat/npnbioleceelkeepkobjfagfchljkphb/)
[![Peerlist](https://github-readme-badge.peerlist.io/api/zhanghe)](https://peerlist.io/zhanghe)

English | [简体中文](./README.zh-CN.md)

**Native Translate** is a privacy-focused Chrome extension. Page translation uses Chrome's built-in Translator and Language Detector APIs. Summaries, chat, screenshot OCR, and the other AI tools run on-device with Gemini Nano. Nothing is sent to a cloud translation or LLM API.

## Official links

- Official website: https://zhanghe.dev/products/native-translate
- Privacy policy: https://zhanghe.dev/products/native-translate/privacy
- Chrome Web Store: https://chromewebstore.google.com/detail/npnbioleceelkeepkobjfagfchljkphb

## Features

### Translation
- **Full-page translation**: Inserts translations under the original text and keeps the page layout
- **Hover-to-translate**: Hold Alt, Control, or Shift and hover a paragraph
- **Input field translation**: Type three spaces in an input or contenteditable field to translate what you typed
- **Side panel translator**: Free-form text with streaming output
- **EPUB translation**: Upload a book, track progress, download the translated file
- **Language detection**: Auto-detects the source language, including Simplified vs Traditional Chinese
- **Predictive warm-up**: Prepares the next language pair when you change targets
- **Smart content detection**: Skips code blocks, tables, and navigation
- **Multi-frame and IME support**: Works in iframes and `about:blank`; ignores IME composition so CJK input is not triggered early
- **Offline after download**: Language-pair models stay on the device

### On-device AI (Gemini Nano)
These tools need Chrome 138+ and a device that can run the on-device model. If Nano is unavailable, translation still works and the AI entries hide or fall back.

- **Page summary**: Key points, TL;DR, teaser, or headline; short/medium/long; optional bilingual output
- **Ask this page**: Chat grounded in the current page, with suggested questions
- **Selection assistant**: Translate, explain, summarize, or extract the selected text
- **Writing assistant**: Translate & polish, polish, or proofread in an input field (professional / friendly / concise)
- **Screenshot / image translation**: Draw a region (`Alt+Shift+S`) or right-click an image
- **Learning mode**: Highlight words at CEFR A2–C1; tap for meaning, phonetic, speech, and vocab
- **Vocab book**: Search, group by site, export CSV or Anki TSV (about 2000 entries)
- **Smart extract**: Events (`.ics`), contacts (vCard), products (table row)
- **EPUB chapter digest**: Optional digest page embedded on export
- **Voice** (experimental, GPU): Record or upload mp3 / wav / m4a / ogg, then transcribe and translate

### More
- First-run welcome tour (sample translate → hover → triple-space → full page)
- Right-click: summarize page, translate image, extract selection
- Keyboard shortcuts (see below)
- 11 UI locales with RTL where needed, 25 translation target languages, dark mode

## Keyboard shortcuts

Customize every command at `chrome://extensions/shortcuts`.

| Action | Default |
| --- | --- |
| Translate current page | `Alt+Shift+T` |
| Summarize this page | `Alt+Shift+Y` |
| Translate a screenshot | `Alt+Shift+S` |
| Toggle learning mode | none — bind it yourself |

## Requirements

- **Chrome 138+** (desktop). Built-in AI is not available in mobile Chrome.
- On-device Gemini Nano typically needs ~22GB free disk, and either GPU > 4GB VRAM or ≥16GB RAM with 4+ cores. Audio transcription requires a GPU.
- **pnpm 10.18.3+** to build from source.

## Installation

### From Chrome Web Store
[Install from Chrome Web Store](https://chromewebstore.google.com/detail/native-translate-%E2%80%94-privat/npnbioleceelkeepkobjfagfchljkphb/)

### From source

```bash
git clone https://github.com/zh30/native-translate.git
cd native-translate
pnpm install
pnpm dev
```

Then in Chrome: `chrome://extensions` → enable Developer mode → Load unpacked → select the `dist` folder.

## Usage

1. Open the toolbar popup and pick a **target language** (page translation) and an **input target language** (fields you type into).
2. Click **Translate current page**, or press `Alt+Shift+T`.
3. Hold the hover modifier and move over a paragraph for one-block translation.
4. Type three spaces in a text field to translate your draft.
5. Open the **side panel** for text, EPUB, summary, chat, vocab, and voice.
6. Select text on a page for the selection toolbar; look for the ✎ button in text fields for writing help.

## Supported languages

**Translation targets (25):** English, Chinese (Simplified/Traditional), Japanese, Korean, French, German, Spanish, Italian, Portuguese, Russian, Arabic, Hindi, Bengali, Indonesian, Turkish, Vietnamese, Thai, Dutch, Polish, Persian, Urdu, Ukrainian, Swedish, Filipino.

**UI locales (11):** English, Simplified Chinese, Arabic, Spanish, Hindi, Indonesian, Dutch, Portuguese, Thai, Turkish, Vietnamese.

Nano's strongest output languages are English, Japanese, Spanish, German, and French. Other targets (including Chinese) are produced in English first, then translated locally.

## Development

```bash
pnpm dev          # watch build into dist/
pnpm build        # locale check + tests + production zip
pnpm test         # Vitest
pnpm tsc          # type checking
pnpm lint         # Biome
pnpm lint:fix     # safe auto-fixes
pnpm check:locales
```

### Tech stack
- React 19, TypeScript, Tailwind CSS v4
- Rspack + SWC
- Radix UI primitives
- Chrome Manifest V3 (minimum Chrome 138)

## Architecture

```
src/
├── scripts/
│   ├── background.ts      # Service worker: routing, menus, shortcuts
│   ├── contentScript.ts   # Page translation engine
│   └── pageBridge.ts      # Main-world Translator access
├── popup/                 # Toolbar popup
├── sidePanel/             # Text / file / summary / chat / vocab / voice
├── content/               # Selection, writing, learning, screenshot, extract
├── offscreen/             # On-device Gemini Nano host
├── welcome/               # First-run tour
├── shared/                # Messages, settings, languages
│   └── ai/                # Task client, prompts, language chain
├── components/ui/         # Radix-based UI
└── utils/                 # i18n, EPUB, storage hooks
```

## Troubleshooting

- **"Translator API unavailable"**: Use Chrome 138+ on a device that can download language-pair models.
- **AI buttons missing / "on-device AI unavailable"**: Gemini Nano is not ready (hardware, disk, or download). Translation still works. See `chrome://on-device-internals`.
- **Nothing happens on this page**: `chrome://`, `edge://`, and similar pages cannot run content scripts.
- **Hover does nothing**: Check the modifier key in the popup.
- **First translation is slow**: Chrome downloads the language-pair model once; later runs are cached.
- **Shortcut does nothing**: Confirm the binding at `chrome://extensions/shortcuts`. Another extension may have taken `Alt+Shift+T`.

### Performance
- Translator models and results are cached per language pair.
- Popup and side panel warm the next pair to avoid a cold start.
- Long text streams in; DOM writes are batched.

## Contributing

See [AGENTS.md](./AGENTS.md) for repository conventions.

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `pnpm lint`, `pnpm tsc`, and `pnpm test`
5. Open a pull request

## License

MIT © [zhanghe.dev](https://zhanghe.dev)

---

**Privacy Notice**: This extension processes all data locally on your device. No content is sent to external servers.
