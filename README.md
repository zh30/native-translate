# Native Translate

[![Release on Tag](https://github.com/zh30/native-translate/actions/workflows/release-on-tag.yml/badge.svg)](https://github.com/zh30/native-translate/actions/workflows/release-on-tag.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Chrome Extension](https://img.shields.io/badge/Chrome%20Extension-v2.1.1-brightgreen)](https://chrome.google.com/webstore/detail/native-translate/)

English | [简体中文](./README.zh-CN.md)

**Native Translate** is a privacy-focused Chrome extension that uses Chrome's built-in AI Translator and Language Detector APIs. All translation happens locally on your device - no external API calls, no telemetry, complete privacy.

## Features

### 🌐 Translation Modes
- **Full-page translation**: Translates entire web pages while preserving original layout
- **Hover-to-translate**: Hold modifier key (Alt/Control/Shift) and hover over text for instant translation
- **Input field translation**: Type three spaces in any input field to translate your content
- **Side panel translator**: Free-form text translation with real-time results
- **EPUB file translation**: Upload and translate EPUB books with progress tracking

### 🚀 Advanced Capabilities
- **On-device processing**: Uses Chrome's built-in AI models (Chrome 138+)
- **Streaming translation**: Real-time progressive translation for longer texts
- **Smart content detection**: Intelligently skips code blocks, tables, and navigation
- **Multi-frame support**: Works across all frames including about:blank pages
- **IME support**: Proper handling of Asian language input methods
- **Offline capability**: Works offline after models are downloaded

### 🛡️ Privacy & Security
- **Zero data collection**: No analytics, no tracking, no cloud requests
- **Local processing**: All translation happens on your device
- **Minimal permissions**: Only essential Chrome extension permissions
- **Open source**: MIT licensed, fully transparent codebase

## Requirements

- **Chrome 138+** (for built-in AI APIs)
- **pnpm 9.15.1+** (package manager)

## Installation

### From Chrome Web Store
[Install from Chrome Web Store](https://chromewebstore.google.com/detail/native-translate-%E2%80%94-privat/npnbioleceelkeepkobjfagfchljkphb/)

### From Source

```bash
# Clone repository
git clone https://github.com/zh30/native-translate.git
cd native-translate

# Install dependencies
pnpm install

# Development build with auto-reload
pnpm dev

# Load extension in Chrome
# 1. Open chrome://extensions
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select the `dist` folder
```

## Usage

### Basic Translation
1. **Open the extension popup** from the Chrome toolbar
2. **Select your target language**
3. **Choose a hover modifier key** (Alt/Control/Shift)
4. **Click "Translate current page"** for full-page translation

### Translation Methods
- **Hover translation**: Hold modifier key and hover over any text
- **Input translation**: Type three spaces in any text field
- **Side panel**: Open for free-form text translation
- **EPUB files**: Upload and translate entire books

## Supported Languages

25+ languages including:
- English, Chinese (Simplified/Traditional), Japanese, Korean
- French, German, Spanish, Italian, Portuguese
- Russian, Arabic, Hindi, Bengali, Indonesian
- Turkish, Vietnamese, Thai, Dutch, Polish
- Persian, Urdu, Ukrainian, Swedish, Filipino

## Development

```bash
# Development
pnpm dev          # Build with watch mode and auto-reload
pnpm build        # Production build with zip packaging
pnpm tsc          # Type checking
pnpm lint         # Code linting
pnpm lint:fix     # Fix linting issues
```

### Tech Stack
- **Frontend**: React 19 + TypeScript + Tailwind CSS v4
- **Build**: Rspack + SWC
- **UI Components**: Radix UI primitives
- **Extension APIs**: Chrome Manifest V3

## Architecture

```
src/
├── scripts/
│   ├── background.ts      # Service worker
│   └── contentScript.ts  # Main translation engine
├── popup/                # Extension popup UI
├── sidePanel/            # Side panel interface
├── components/ui/        # Reusable UI components
├── shared/               # Shared types and utilities
└── utils/                # Helper functions
```

## Troubleshooting

### Common Issues
- **"Translator API unavailable"**: Ensure Chrome 138+ and device supports AI models
- **Translation not working**: Check if page allows script injection (avoid chrome:// pages)
- **Hover translation not triggering**: Verify modifier key settings in popup
- **Slow first translation**: Initial model download occurs once per language pair

### Performance
- Models are cached after first use per language pair
- Translation results are cached for faster subsequent access
- Memory usage is optimized with WeakSet tracking

## Contributing

Contributions are welcome! Please read our [Contributing Guidelines](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

### Development Standards
- **TypeScript**: Strict mode with explicit type annotations
- **React 19**: Functional components with hooks
- **Code Style**: Biome linting with 2-space indentation
- **Testing**: Ensure all tests pass before submitting

## License

MIT © [zhanghe.dev](https://zhanghe.dev)

---

**Privacy Notice**: This extension processes all data locally on your device. No content is sent to external servers.
