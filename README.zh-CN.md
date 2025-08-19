# 原生翻译 — 隐私优先的内置 AI 翻译扩展

[![Release on Tag](https://github.com/zh30/native-translate/actions/workflows/release-on-tag.yml/badge.svg)](https://github.com/zh30/native-translate/actions/workflows/release-on-tag.yml)
[English](./README.md) | 简体中文

原生翻译使用 Chrome 的内置 AI 翻译与语言检测能力，默认不访问云端、不采集遥测。模型在本地下载、运行并缓存，可离线使用。

- 开源（MIT）
- 本地优先：翻译与语言检测均在本地设备进行
- 隐私内建：默认不发起外部翻译请求
- 体验可靠：下载/翻译有进度浮层提示，支持 RTL/LTR 排版
- 轻量权限，简单易用

## 功能特性

- 网页全文翻译：在不破坏布局前提下，将译文以“同级新行”追加到原文下方
- 悬停翻译：按住修饰键（Alt/Control/Shift）并将鼠标悬停到段落，即可仅翻译该段
- 输入内联翻译：在输入框、文本域或可编辑区域，连续输入三个空格可将已有内容翻译为所选的「输入目标语言」
- 侧边栏自由文本翻译：支持自动识别来源语种；优先使用面板内的本地内置 API，不可用时自动回退到内容脚本
- 本地自动识别源语言，带下载进度浮层
- 逐行与语言对缓存：已下载/已翻译内容会被复用，加速后续翻译
- 目标语言方向感知：根据目标语言自动设置 LTR/RTL 与对齐
- 内置多语言界面文案（Chrome i18n，见 `_locales/`）

## 环境要求

- Chrome 138+（MV3、Side Panel API、内置 AI 能力）
- pnpm 9+

提示：首次使用可能触发模型下载；是否可用取决于设备能力。

## 源码安装

1. 安装依赖：`pnpm install`
2. 开发模式：`pnpm dev`（输出到 `dist/`，并在开发环境启用自动重载）
3. 打开 `chrome://extensions`
4. 开启「开发者模式」
5. 点击「加载已解压的扩展程序」，选择 `dist` 目录
6. 生产构建：`pnpm build`（构建完成会在项目根目录生成 `Native-translate.zip`）

## 使用说明

- 点击工具栏图标打开弹窗：
  - 选择目标语言
  - 选择悬停翻译的修饰键（Alt/Control/Shift）
  - 可设置「输入目标语言」用于输入场景翻译
  - 点击「翻译当前网页全文」发送翻译指令
- 悬停翻译：按住所选修饰键并将鼠标悬停到段落，即可在原文下方追加译文
- 输入内联翻译：在 input/textarea/contenteditable 中，光标处连续按三次空格，将把已输入文本翻译成「输入目标语言」
- 浮层会在需要时显示模型下载与翻译进度
- 特殊页面（如 `chrome://`、部分商店页）不支持脚本注入
- 重新进行全文翻译会清理旧译文与标记，再按新目标语言插入译文

- 侧边栏
  - 在弹窗中点击「打开侧边栏」
  - 左侧输入文本；来源语言可选「自动」或固定语种，右侧选择目标语言
  - 输入时自动翻译；面板会优先尝试本地内置 API，不可用时回退到内容脚本路径

## 隐私与权限

- 无统计、无跟踪，默认不调用云端翻译
- 全部逻辑在浏览器内执行（Service Worker、内容脚本、侧边栏）
- 模型下载缓存后可离线使用

权限说明：

- `storage`：保存设置与模型就绪标记
- `activeTab`、`tabs`：与当前标签页交互
- `scripting`：在未注入时动态注入内容脚本
- `sidePanel`：可选的侧边栏入口
- `offscreen`：仅用于开发阶段的自动重载辅助

## 架构概览

- `src/scripts/contentScript.ts`：翻译核心与浮层；自动识别语言、显示下载进度、按块级元素追加译文、悬停翻译、输入三连空格翻译、逐行与语言对缓存；必要时回退到「主世界桥」完成翻译
- `src/popup/popup.tsx`：设置界面（目标语言、修饰键、输入目标语言）与「翻译当前网页全文」；必要时注入内容脚本
- `src/scripts/background.ts`：按域启用/禁用侧边栏、action 点击行为、开发阶段自动重载辅助
- `src/sidePanel/sidePanel.tsx`：侧边栏自由文本翻译，自动检测语言；优先本地内置 API，失败时回退到内容脚本；包含轻量彩蛋
- `src/shared/*`：跨上下文的常量与类型（语言、消息、设置）
- `src/utils/i18n.ts`、`src/utils/rtl.ts`：i18n 与 RTL/LTR 工具
- `_locales/`：多语言界面文案（含中英等）

构建与产物：

- 使用 Rspack（SWC）多入口构建，面向 MV3
- 入口/输出文件名与 `manifest.json` 一一对应（`background.js`、`contentScript.js`、`popup.html`、`sidePanel.html`）

## 开发

脚本：

- `pnpm dev`：watch 构建，开发自动重载（SSE）与内容脚本注入
- `pnpm build`：生产构建（并打包 `Native-translate.zip`）
- `pnpm tsc`：TypeScript 类型检查
- `pnpm lint` / `pnpm lint:fix`：Biome 代码检查

技术栈：

- React 19、TypeScript、Tailwind CSS v4、Radix UI 基础组件
- Rspack（SWC）多入口构建，面向 MV3

项目结构：
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

## 常见问题（FAQ）

- 「Translator API 不可用」：请确认 Chrome 版本 ≥ 138，且设备支持本地模型
- 页面无效果：部分页面禁止脚本注入（如 `chrome://`）；请在普通网页尝试
- 首次使用缓慢：首次可能下载模型；后续会复用缓存
- 悬停翻译未触发：请在弹窗中设置修饰键（Alt/Control/Shift），并悬停到较长的文本块
- 输入三连空格未触发：仅对文本输入/文本域/contenteditable 生效，且在输入法组合（IME）期间不会触发；请在光标末尾连续输入三个空格
- 侧边栏提示「Translator API 不可用」：面板会自动回退到内容脚本路径；请确认当前活动标签页允许脚本注入后再试

## 路线图

- 右键菜单翻译与快捷键
- 更丰富的侧边栏（历史、收藏等）
- 在可行范围内支持更多浏览器

## 参与贡献

欢迎提交 Issue 与 PR，建议遵循 TypeScript/React/Tailwind 的最佳实践。

## 许可证

MIT © [zhanghe.dev](https://zhanghe.dev)
