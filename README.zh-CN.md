# 原生翻译 — 隐私优先的内置 AI 翻译扩展

[English](./README.md) | 简体中文

原生翻译使用 Chrome 的内置 AI 翻译与语言检测能力，默认不访问云端、不采集遥测。模型在本地下载、运行并缓存，可离线使用。

- 开源（MIT）
- 本地优先：翻译与语言检测均在本地设备进行
- 隐私内建：默认不发起外部翻译请求
- 体验可靠：下载/翻译有进度浮层提示，支持 RTL/LTR 排版
- 轻量权限，简单易用

## 功能特性

- 网页全文翻译：在不破坏布局的前提下，将译文以“同级新行”追加到原文下方
- 悬停翻译：按住修饰键（Alt/Control/Shift）并将鼠标悬停到段落，即可仅翻译该段
- 本地自动识别源语言，显示模型下载进度并缓存
- 语言对缓存：已下载的语言对会被复用，加速后续翻译
- 目标语言方向感知：根据目标语言自动设置 LTR/RTL 与对齐
- 内置多语言界面文案（Chrome i18n，见 `_locales/`）

## 环境要求

- Chrome 138+（MV3、Side Panel API、内置 AI 能力）
- pnpm 9+

提示：首次使用可能触发模型下载；是否可用取决于设备能力。

## 源码安装

1. 安装依赖：`pnpm install`
2. 构建扩展：`pnpm build`
3. 打开 `chrome://extensions`
4. 开启「开发者模式」
5. 点击「加载已解压的扩展程序」，选择 `dist` 目录

## 使用说明

- 点击工具栏图标打开弹窗：
  - 选择目标语言
  - 选择悬停翻译的修饰键（Alt/Control/Shift）
  - 点击「翻译当前网页全文」发送翻译指令
- 悬停翻译：按住所选修饰键并将鼠标悬停到段落，即可在原文下方追加译文
- 首次使用时，浮层会显示模型下载/准备/翻译进度
- 特殊页面（如 `chrome://`、部分商店页）不支持脚本注入
- 重新进行全文翻译会清理旧译文与标记，再按新目标语言插入译文

## 隐私与权限

- 无统计、无跟踪，默认不调用云端翻译
- 全部逻辑在浏览器内执行（Service Worker、内容脚本、侧边栏）
- 模型下载缓存后可离线使用

权限说明：

- `storage`：保存设置与模型就绪标记
- `activeTab`、`tabs`：与当前标签页交互
- `scripting`：在未注入时动态注入内容脚本
- `sidePanel`：可选的侧边栏入口

## 架构概览

- `src/scripts/contentScript.ts`：翻译核心与浮层；自动识别语言、显示下载进度、按块级元素追加译文、悬停翻译、逐行/语言对缓存
- `src/popup/popup.tsx`：设置界面（目标语言、修饰键）与“翻译当前网页全文”；必要时注入内容脚本
- `src/scripts/background.ts`：在特定域（演示用）开关侧边栏；配置点击行为
- `src/sidePanel/sidePanel.tsx`：最小化侧边栏示例
- `src/utils/i18n.ts`、`src/utils/rtl.ts`：i18n 与 RTL/LTR 工具
- `_locales/`：多语言界面文案（含中英等）

## 开发

脚本：

- `pnpm dev`：watch 构建
- `pnpm build`：生产构建
- `pnpm tsc`：TypeScript 类型检查

技术栈：

- React 19、TypeScript、Tailwind CSS v4、Radix UI 基础组件
- Rspack（SWC）多入口构建，面向 MV3

项目结构：
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

## 常见问题（FAQ）

- 「Translator API 不可用」：请确认 Chrome 版本 ≥ 138，且设备支持本地模型
- 页面无效果：部分页面禁止脚本注入（如 `chrome://`）；请在普通网页尝试
- 首次使用缓慢：首次可能下载模型；后续会复用缓存

## 路线图

- 右键菜单翻译与快捷键
- 更丰富的侧边栏（历史、收藏等）
- 在可行范围内支持更多浏览器

## 参与贡献

欢迎提交 Issue 与 PR，建议遵循 TypeScript/React/Tailwind 的最佳实践。

## 许可证

MIT © zhanghe.dev
