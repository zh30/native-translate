# 原生翻译 (Native Translate)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Chrome Extension](https://img.shields.io/badge/Chrome%20Extension-v3.2.1-brightgreen)](https://chromewebstore.google.com/detail/native-translate-%E2%80%94-privat/npnbioleceelkeepkobjfagfchljkphb/)
[![GitHub release](https://img.shields.io/github/v/release/zh30/native-translate)](https://github.com/zh30/native-translate/releases)
[![Peerlist](https://github-readme-badge.peerlist.io/api/zhanghe)](https://peerlist.io/zhanghe)

[English](./README.md) | 简体中文

**原生翻译**是一款注重隐私的 Chrome 扩展。网页翻译使用 Chrome 内置的 Translator 和 Language Detector；摘要、问答、截图 OCR 等走本机 Gemini Nano。不会调用任何云端翻译或大模型 API。

## 官方链接

- 官方网站: https://zhanghe.dev/products/native-translate
- 隐私政策: https://zhanghe.dev/products/native-translate/privacy
- Chrome 网上应用店: https://chromewebstore.google.com/detail/npnbioleceelkeepkobjfagfchljkphb
- 发行说明: [CHANGELOG.md](./CHANGELOG.md) · [GitHub Releases](https://github.com/zh30/native-translate/releases)

## 功能特性

### 翻译
- **整页翻译**：在原文下方插入译文，保留页面布局
- **悬停翻译**：按住 Alt / Control / Shift，悬停段落即可翻译
- **输入框翻译**：在输入框或可编辑区域连敲三个空格，翻译刚输入的内容
- **侧边栏翻译**：自由文本，支持流式输出
- **EPUB 翻译**：上传电子书，查看进度，下载译本
- **语言检测**：自动识别源语言，并区分简体 / 繁体中文
- **预测预热**：切换目标语言时预先准备语言对
- **智能内容检测**：跳过代码块、表格和导航
- **多框架与输入法**：支持 iframe / `about:blank`；组字过程中不会误触发
- **下载后可离线**：语言对模型留在本机

### 本机 AI（Gemini Nano）
需要 Chrome 138+，且设备能运行本机模型。Nano 不可用时，翻译仍可用，AI 入口会隐藏或降级。

- **页面摘要**：要点 / TL;DR / 导语 / 标题；短中长；可选双语
- **问这一页**：基于当前页问答，并给出建议问题
- **划词助手**：翻译、解释、摘要或提取选区
- **写作助手**：在输入框中翻译并润色、润色或校对（专业 / 友好 / 简洁）
- **截图 / 图片翻译**：框选区域（`Alt+Shift+S`）或对图片右键
- **学习模式**：按 CEFR A2–C1 标出词汇；点击查看释义、音标、朗读，并加入生词本
- **生词本**：按网站分组、搜索，导出 CSV 或 Anki TSV（约 2000 条）
- **智能提取**：事件（`.ics`）、联系人（vCard）、商品（表格行）
- **EPUB 章节导读**：导出时可嵌入摘要页
- **语音**（实验，需 GPU）：录音或上传 mp3 / wav / m4a / ogg，转写并翻译

### 其它
- 安装后欢迎教程（试译 → 悬停 → 三空格 → 整页）
- 右键菜单：摘要页面、翻译图片、提取选区
- 键盘快捷键（见下表）
- 11 种界面语言（含 RTL）、25 种翻译目标语言、深色模式

## 键盘快捷键

可在 `chrome://extensions/shortcuts` 自行改绑。

| 操作 | 默认 |
| --- | --- |
| 翻译当前网页 | `Alt+Shift+T` |
| 摘要当前页 | `Alt+Shift+Y` |
| 截图翻译 | `Alt+Shift+S` |
| 开关学习模式 | 无默认，需自行绑定 |

## 系统要求

- **Chrome 138+**（桌面）。移动版 Chrome 没有内置 AI。
- Gemini Nano 通常需要约 22GB 磁盘空闲，以及 GPU > 4GB 显存，或内存 ≥ 16GB 且 4 核以上。语音转写需要 GPU。
- 从源码构建需要 **pnpm 10.18.3+**。

## 安装

### 从 Chrome 网上应用店
[从 Chrome 网上应用店安装](https://chromewebstore.google.com/detail/native-translate-%E2%80%94-privat/npnbioleceelkeepkobjfagfchljkphb/)

### 从源码安装

```bash
git clone https://github.com/zh30/native-translate.git
cd native-translate
pnpm install
pnpm dev
```

然后在 Chrome 打开 `chrome://extensions` → 启用「开发者模式」→「加载已解压的扩展程序」→ 选择 `dist` 文件夹。

## 使用说明

1. 打开工具栏弹窗，选择**目标语言**（网页翻译）和**输入目标语言**（你正在输入的内容）。
2. 点击「翻译当前网页」，或按 `Alt+Shift+T`。
3. 按住悬停修饰键，移到段落上翻译单块。
4. 在文本框里连敲三个空格，翻译正在写的内容。
5. 打开**侧边栏**使用文本、EPUB、摘要、问答、生词本和语音。
6. 在页面上划词使用工具条；输入框旁的 ✎ 是写作助手。

## 支持的语言

**翻译目标（25 种）：**英语、中文（简体/繁体）、日语、韩语、法语、德语、西班牙语、意大利语、葡萄牙语、俄语、阿拉伯语、印地语、孟加拉语、印尼语、土耳其语、越南语、泰语、荷兰语、波兰语、波斯语、乌尔都语、乌克兰语、瑞典语、菲律宾语。

**界面语言（11 种）：**英语、简体中文、阿拉伯语、西班牙语、印地语、印尼语、荷兰语、葡萄牙语、泰语、土耳其语、越南语。

Nano 质量有保证的输出语言是英语、日语、西班牙语、德语、法语。其它目标（包括中文）会先出英文，再由本机 Translator 转译。

## 开发

```bash
pnpm dev          # 监听构建到 dist/
pnpm build        # 文案检查 + 测试 + 生产 zip
pnpm test         # Vitest
pnpm tsc          # 类型检查
pnpm lint         # Biome
pnpm lint:fix     # 安全自动修复
pnpm check:locales
pnpm release:notes  # 预览当前版本的 GitHub Release 说明
```

### 技术栈
- React 19、TypeScript、Tailwind CSS v4
- Rspack + SWC
- Radix UI
- Chrome Manifest V3（最低 Chrome 138）

## 架构

```
src/
├── scripts/
│   ├── background.ts      # Service Worker：路由、菜单、快捷键
│   ├── contentScript.ts   # 页面翻译引擎
│   └── pageBridge.ts      # 页面主世界 Translator
├── popup/                 # 工具栏弹窗
├── sidePanel/             # 文本 / 文件 / 摘要 / 问答 / 生词 / 语音
├── content/               # 划词、写作、学习、截图、提取
├── offscreen/             # 本机 Gemini Nano 宿主
├── welcome/               # 首次使用教程
├── shared/                # 消息、设置、语言
│   └── ai/                # 任务客户端、提示词、语言链
├── components/ui/         # Radix UI 封装
└── utils/                 # i18n、EPUB、storage hooks
```

## 故障排除

- **「Translator API 不可用」**：使用 Chrome 138+，并确认设备能下载语言对模型。
- **没有 AI 按钮 / 「本机 AI 不可用」**：Gemini Nano 未就绪（硬件、磁盘或尚未下载）。翻译功能仍可用。详见 `chrome://on-device-internals`。
- **这个页面没反应**：`chrome://`、`edge://` 等系统页无法注入内容脚本。
- **悬停无效果**：在弹窗里检查修饰键。
- **第一次很慢**：每个语言对首次会下载模型，之后走缓存。
- **快捷键没反应**：到 `chrome://extensions/shortcuts` 确认绑定。`Alt+Shift+T` 可能被其它扩展占用。

### 性能
- 翻译模型和结果按语言对缓存。
- 弹窗和侧边栏会预热下一对语言，减少冷启动。
- 长文本流式输出，DOM 写入批量进行。

## 贡献

仓库约定见 [AGENTS.md](./AGENTS.md)。

1. Fork 仓库
2. 创建功能分支
3. 进行更改
4. 运行 `pnpm lint`、`pnpm tsc` 和 `pnpm test`
5. 提交拉取请求

## 许可证

MIT © [zhanghe.dev](https://zhanghe.dev)

---

**隐私声明**：此扩展在您的设备本地处理所有数据。不会将任何内容发送到外部服务器。
