# Native Translate — 隐私优先的本地 AI 翻译扩展

[English](./README.md) | 简体中文

一个开源、隐私优先的 Chrome 浏览器翻译扩展：默认不访问云端，也不收集遥测数据。你的内容仅在本地浏览器中处理。

- 开源（MIT）
- 数据安全：默认零外部请求，内容不出浏览器
- 本地 AI：设计为完全在本地设备上运行（可用时利用 WebGPU）
- 速度快：避免网络延迟，结合 GPU 加速与智能缓存
- 轻量：权限最小化、体积小

## 为什么选择 Native Translate

- 天然开源：代码透明、构建可复现
- 隐私内建：无服务器后端，你的内容留在本地
- 本地优先：支持离线与本地模型运行
- 高性能：充分利用 WebGPU/CPU 路径，响应迅速

## 当前状态

本仓库提供一个 Chrome MV3 扩展基础：
- 使用 React 19 + TypeScript + Tailwind CSS v4 + Rspack
- 入口包括：后台 Service Worker、内容脚本、侧边栏、可选弹窗
- 内置多语言：英文与简体中文（`_locales/`）
- 内容脚本演示了阅读时长徽章（后续将替换为实际翻译流程）

计划中：集成本地模型与翻译 UI、模型管理/选择能力。

## 安装

前置要求：
- Chrome 138+（支持 MV3 Side Panel API）
- pnpm 9+

步骤：
1. 安装依赖：`pnpm install`
2. 构建扩展：`pnpm build`
3. 打开 `chrome://extensions`
4. 开启「开发者模式」
5. 点击「加载已解压的扩展程序」，选择 `dist` 目录

## 使用

- 点击扩展图标打开侧边栏
- 演示环境会在 `zhanghe.dev` 自动启用侧边栏
- 翻译 UI 与本地模型运行时仍在进行中，当前内容脚本仅展示集成位置

## 隐私与安全

- 无统计、无跟踪，默认不走云端翻译
- 所有逻辑均在浏览器端执行（Service Worker、内容脚本、侧边栏）
- 仅请求必要权限：`storage`、`activeTab`、`scripting`、`tabs`、`sidePanel`
- 当本地模型就绪后，可离线使用

## 开发

脚本：
- `pnpm dev`：开发构建（watch）
- `pnpm build`：生产构建
- `pnpm tsc`：类型检查

技术栈：React 19、TypeScript、Tailwind CSS v4、Rspack（SWC）

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

## 路线图

- 基于 WebGPU 的本地翻译模型运行
- 模型管理 UI（下载/导入、缓存、离线包）
- 右键菜单翻译、快捷键、快速操作
- 尝试支持 Edge/Firefox（能力允许时）

## 参与贡献

欢迎提交 Issue 与 PR。请遵循 TypeScript、React、Tailwind 的最佳实践。

## 许可证

MIT © zhanghe.dev
