# 原生翻译 — 隐私优先的内置 AI 翻译扩展

[![Release on Tag](https://github.com/zh30/native-translate/actions/workflows/release-on-tag.yml/badge.svg)](https://github.com/zh30/native-translate/actions/workflows/release-on-tag.yml)
[English](./README.md) | 简体中文

原生翻译使用 Chrome 的内置 AI 翻译与语言检测能力，默认不访问云端、不采集遥测。模型在本地下载、运行并缓存，可离线使用。

- 开源（MIT）
- 本地优先：翻译与语言检测均在本地设备进行
- 隐私内建：默认不发起外部翻译请求
- 体验可靠：下载/翻译有进度浮层提示，流式翻译支持，缓存机制，支持 RTL/LTR 排版
- 轻量权限，简单易用

## 功能特性

### 核心翻译功能
- **网页全文翻译**：在不破坏布局前提下，将译文以"同级新行"追加到原文下方
- **悬停翻译**：按住修饰键（Alt/Control/Shift）并将鼠标悬停到段落，即可仅翻译该段
- **输入内联翻译**：在输入框、文本域或可编辑区域，连续输入三个空格可将已有内容翻译为所选的「输入目标语言」
- **侧边栏自由文本翻译**：支持自动识别来源语种；优先使用面板内的本地内置 API，不可用时自动回退到内容脚本
- **EPUB 文件翻译**：上传并翻译 EPUB 文件，支持进度跟踪和自动下载

### 高级翻译能力
- **流式翻译**：长文本实时渐进式翻译，提供可视化反馈
- **智能元素选择**：智能避开代码块、表格和导航元素
- **多框架支持**：在所有框架中工作，包括 about:blank 页面
- **输入法感知**：正确处理亚洲语言组合事件
- **本地自动识别源语言**：带下载进度浮层

### 技术特性
- **高级缓存**：逐行与语言对缓存，模型就绪状态跟踪
- **RTL/LTR 支持**：根据目标语言自动设置文本方向与对齐
- **桥接架构**：当内容脚本 API 不可用时回退到页面世界桥
- **开发自动重载**：基于 SSE 的开发自动重载系统
- **国际化界面**：通过 Chrome i18n 支持 25+ 种语言

### 支持的语言
- **源语言**：英语、简体中文、繁体中文、日语、韩语、法语、德语、西班牙语、意大利语、葡萄牙语、俄语、阿拉伯语、印地语、孟加拉语、印尼语、土耳其语、越南语、泰语、荷兰语、波兰语、波斯语、乌尔都语、乌克兰语、瑞典语、菲律宾语
- **目标语言**：所有支持的源语言加上自动检测
- **语言对**：25+ 种语言，支持按语言对智能缓存模型

## 环境要求

- Chrome 138+（MV3、Side Panel API、内置 AI 能力）
- pnpm 9.15.1+（在 packageManager 字段中指定）

提示：首次使用可能触发模型下载；是否可用取决于设备能力和 Chrome AI 功能推出情况。

## 源码安装

1. 安装依赖：`pnpm install`
2. 开发模式：`pnpm dev`（输出到 `dist/`，并在开发环境启用自动重载）
3. 打开 `chrome://extensions`
4. 开启「开发者模式」
5. 点击「加载已解压的扩展程序」，选择 `dist` 目录
6. 生产构建：`pnpm build`（构建完成会在项目根目录生成 `Native-translate.zip`）

## 使用说明

### 网页翻译
- **打开弹窗**（工具栏图标）：
  - 选择目标语言
  - 选择悬停翻译的修饰键（Alt/Control/Shift）
  - 可设置「输入目标语言」用于输入场景翻译
  - 点击「翻译当前网页全文」发送翻译指令
- **悬停翻译**：按住所选修饰键并将鼠标悬停到段落，即可在原文下方追加译文
- **输入内联翻译**：在 input/textarea/contenteditable 中，光标处连续按三次空格，将把已输入文本翻译成「输入目标语言」
- **进度浮层**：会在需要时显示模型下载与翻译进度
- **特殊页面**：如 `chrome://`、部分商店页不支持脚本注入
- **重新翻译**：会清理旧译文与标记，再按新目标语言插入译文

### 侧边栏翻译
- **访问方式**：在弹窗中点击「打开侧边栏」
- **自由文本翻译**：左侧输入文本；来源语言可选「自动」或固定语种，右侧选择目标语言
- **实时翻译**：输入时自动翻译；面板会优先尝试本地内置 API，不可用时回退到内容脚本路径
- **EPUB 文件翻译**：
  - 点击「上传 EPUB」标签页
  - 从设备中选择 EPUB 文件
  - 选择源语言和目标语言
  - 翻译按章节进行，带有进度跟踪
  - 翻译完成后自动下载翻译后的 EPUB 文件

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

### 核心组件
- **内容脚本** (`src/scripts/contentScript.ts`) — 主翻译引擎，具有智能块收集、流式翻译支持、悬停翻译、三连空格输入翻译、内存缓存、进度覆盖层和页面世界桥接回退功能
- **弹窗界面** (`src/popup/popup.tsx`) — 目标语言、悬停修饰键、输入目标语言设置 UI 和全页翻译触发器，具有自动内容脚本注入功能
- **侧边栏** (`src/sidePanel/sidePanel.tsx`) — 实时翻译界面，支持流式翻译、自动检测、本地 API 优先、EPUB 文件翻译和彩蛋
- **后台服务** (`src/scripts/background.ts`) — 标签页管理、侧边栏行为和 zhanghe.dev 集成
- **共享模块** (`src/shared/*`) — 跨上下文类型、常量和流式工具
- **UI 组件** (`src/components/ui/*`) — 基于 Radix 的可重用组件，使用 Tailwind 样式
- **工具函数** (`src/utils/*`) — i18n 助手、RTL/LTR 检测、EPUB 解析和类名工具

### 关键功能实现
- **翻译引擎**：支持旧版（`window.Translator`）和现代（`window.translation.createTranslator`）Chrome API
- **流式翻译**：对超过 800 字符的文本提供渐进式翻译和可视化反馈
- **智能块检测**：收集可翻译内容，同时避开导航、代码和表格元素
- **桥接架构**：当内容脚本 API 访问失败时注入页面世界桥接脚本
- **内存管理**：WeakSet 跟踪、翻译缓存和模型就绪持久化
- **IME 支持**：组合事件处理，防止亚洲语言输入期间的误触发
- **EPUB 处理**：完整的 EPUB 解析，包括章节提取、文本分段和翻译文件生成
- **文件翻译**：EPUB 内容的批量处理，支持进度跟踪和并发翻译

### 构建系统
- **Rspack + SWC**：使用 TypeScript、React 19 和 Tailwind CSS v4 的多入口构建
- **入口点**：与 manifest.json 匹配的固定名称（background.js、contentScript.js、popup.html、sidePanel.html）
- **开发**：带有 SSE 服务器和离屏文档的自动重载系统
- **生产**：自动 zip 打包与资源优化

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
      card.tsx
      tabs.tsx
      switch.tsx
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
    streaming.ts
  utils/
    cn.ts
    i18n.ts
    rtl.ts
    epubParser.ts
  offscreen/
    devReloader.html
    devReloader.ts
  styles/
    tailwind.css
```

## 常见问题（FAQ）

### API 问题
- **「Translator API 不可用」**：确保 Chrome 版本 ≥ 138 且设备支持本地 AI 模型
- **侧边栏 API 不可用**：面板会自动回退到内容脚本桥接；确保活动标签页允许脚本注入

### 翻译问题
- **页面无效果**：某些页面阻止脚本注入（`chrome://`、扩展商店）；请在常规网站尝试
- **首次翻译缓慢**：每个语言对需要初次下载模型；后续使用会复用缓存
- **翻译不完整**：扩展会智能跳过代码块、表格和导航元素，这是设计如此

### 交互问题
- **悬停翻译不工作**：
  - 在弹窗中设置正确的修饰键（Alt/Control/Shift）
  - 悬停到较长的文本块（标题、段落、列表项）
  - 避免在文本编辑/输入焦点时悬停
- **三连空格未触发**：
  - 仅在文本输入、文本域和 contenteditable 元素中工作
  - 需要恰好两个现有空格后跟第三个空格
  - 在亚洲语言 IME 组合期间被禁用
  - 必须在光标位置，不能在文本中间

### 性能问题
- **内存使用**：扩展使用 WeakSet 跟踪，导航时清理缓存的读取器
- **流式中断**：新的翻译请求会取消之前的流式操作
- **模型重新下载**：缓存的模型就绪状态在 chrome.storage 中跨会话持久化

## 路线图

### 计划功能
- **右键菜单集成**：右键翻译和键盘快捷键
- **增强侧边栏**：翻译历史记录、收藏和批量操作
- **高级流式翻译**：逐句流式翻译以获得更好的用户体验
- **跨浏览器支持**：在可行的情况下适配其他基于 Chromium 的浏览器
- **性能优化**：进一步减少内存使用和更快的模型加载

### 文件翻译增强
- **多种文件格式**：支持 PDF、DOCX 和 TXT 文件
- **批量处理**：队列多个文件进行翻译
- **翻译记忆库**：为相似内容重用之前的翻译
- **自定义词典**：用户定义的术语和风格偏好

### 高级功能
- **离线翻译**：使用预下载模型的完整离线能力
- **自定义模型训练**：针对特定领域或风格的微调
- **协作功能**：共享翻译项目和审核工作流
- **API 集成**：REST API 用于与其他应用程序集成

## 参与贡献

欢迎提交 Issue 与 PR，请遵循项目既定规范：

- **TypeScript**：启用严格模式，公共 API 需要显式类型注解
- **React 19**：函数组件使用 hooks，自动 JSX 运行时
- **Tailwind CSS v4**：工具类配合 `cn()` 助手进行类名合并
- **代码质量**：Biome 检查，2 空格缩进，100 字符行宽
- **架构**：遵循内容脚本、桥接架构和流式支持的现有模式

## 许可证

MIT © [zhanghe.dev](https://zhanghe.dev)
