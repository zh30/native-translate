# 原生翻译 (Native Translate)

[![Release on Tag](https://github.com/zh30/native-translate/actions/workflows/release-on-tag.yml/badge.svg)](https://github.com/zh30/native-translate/actions/workflows/release-on-tag.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Chrome Extension](https://img.shields.io/badge/Chrome%20Extension-v2.1.1-brightgreen)](https://chrome.google.com/webstore/detail/native-translate/)

[English](./README.md) | 简体中文

**原生翻译**是一款专注于隐私保护的 Chrome 扩展程序，使用 Chrome 内置的 AI 翻译和语言检测 API。所有翻译都在您的设备本地完成 - 无需外部 API 调用，无遥测数据，完全保护隐私。

## 功能特性

### 🌐 翻译模式
- **整页翻译**：翻译整个网页，同时保持原始布局
- **悬停翻译**：按住修饰键（Alt/Control/Shift）悬停文本即可即时翻译
- **输入框翻译**：在任何输入框中输入三个空格即可翻译您的内容
- **侧边栏翻译器**：自由文本翻译，实时显示结果
- **EPUB 文件翻译**：上传并翻译 EPUB 电子书，支持进度跟踪

### 🚀 高级功能
- **本地处理**：使用 Chrome 内置的 AI 模型（Chrome 138+）
- **流式翻译**：长文本实时渐进式翻译
- **智能内容检测**：智能跳过代码块、表格和导航元素
- **预测预热**：切换目标语言时预先拉起模型，避免首次翻译卡顿
- **多框架支持**：在所有框架中工作，包括 about:blank 页面
- **输入法支持**：正确处理亚洲语言输入法
- **离线功能**：模型下载后可离线工作

### 🛡️ 隐私与安全
- **零数据收集**：无分析、无跟踪、无云端请求
- **本地处理**：所有翻译都在您的设备上完成
- **最小权限**：仅必要的 Chrome 扩展权限
- **开源**：MIT 许可，代码完全透明

## 系统要求

- **Chrome 138+**（内置 AI API 支持）
- **pnpm 9.15.1+**（包管理器）

## 安装

### 从 Chrome 应用商店安装
[从 Chrome 应用商店安装](https://chromewebstore.google.com/detail/native-translate-%E2%80%94-privat/npnbioleceelkeepkobjfagfchljkphb/)

### 从源码安装

```bash
# 克隆仓库
git clone https://github.com/zh30/native-translate.git
cd native-translate

# 安装依赖
pnpm install

# 开发构建（自动重载）
pnpm dev

# 在 Chrome 中加载扩展
# 1. 打开 chrome://extensions
# 2. 启用"开发者模式"
# 3. 点击"加载已解压的扩展程序"
# 4. 选择 `dist` 文件夹
```

## 使用说明

### 基本翻译
1. **从 Chrome 工具栏打开扩展弹出窗口**
2. **选择目标语言**
3. **选择悬停修饰键**（Alt/Control/Shift）
4. **点击"翻译当前网页"**进行整页翻译

### 翻译方式
- **悬停翻译**：按住修饰键悬停任何文本
- **输入翻译**：在任何文本框中输入三个空格
- **侧边栏**：打开进行自由文本翻译
- **EPUB 文件**：上传并翻译整本书籍

## 支持的语言

25+ 种语言，包括：
- 英语、中文（简体/繁体）、日语、韩语
- 法语、德语、西班牙语、意大利语、葡萄牙语
- 俄语、阿拉伯语、印地语、孟加拉语、印尼语
- 土耳其语、越南语、泰语、荷兰语、波兰语
- 波斯语、乌尔都语、乌克兰语、瑞典语、菲律宾语

## 开发

```bash
# 开发
pnpm dev          # 监听模式构建和自动重载
pnpm build        # 生产构建和 zip 打包
pnpm tsc          # 类型检查
pnpm lint         # 代码检查
pnpm lint:fix     # 修复代码问题
```

### 技术栈
- **前端**：React 19 + TypeScript + Tailwind CSS v4
- **构建**：Rspack + SWC
- **UI 组件**：Radix UI 基础组件
- **扩展 API**：Chrome Manifest V3

## 架构

```
src/
├── scripts/
│   ├── background.ts      # Service Worker
│   └── contentScript.ts  # 主翻译引擎
├── popup/                # 扩展弹出界面
├── sidePanel/            # 侧边栏界面
├── components/ui/        # 可重用 UI 组件
├── shared/               # 共享类型和工具
└── utils/                # 辅助函数
```

## 故障排除

### 常见问题
- **"Translator API 不可用"**：确保 Chrome 138+ 且设备支持 AI 模型
- **翻译不工作**：检查页面是否允许脚本注入（避免 chrome:// 页面）
- **悬停翻译未触发**：在弹出窗口中验证修饰键设置
- **首次翻译缓慢**：每个语言对首次使用时需要下载模型

### 性能
- 每个语言对的模型在首次使用后会被缓存
- 翻译结果会被缓存以加速后续访问
- 弹出层和侧边栏会主动预热下一个语言对，减少冷启动等待
- 使用 WeakSet 跟踪优化内存使用

## 贡献

欢迎贡献！请阅读我们的[贡献指南](CONTRIBUTING.md)了解详情。

1. Fork 仓库
2. 创建功能分支
3. 进行更改
4. 添加测试（如适用）
5. 提交拉取请求

### 开发标准
- **TypeScript**：严格模式，公共 API 需要显式类型注解
- **React 19**：使用 hooks 的函数组件
- **代码风格**：Biome 检查，2 空格缩进
- **测试**：提交前确保所有测试通过

## 许可证

MIT © [zhanghe.dev](https://zhanghe.dev)

---

**隐私声明**：此扩展在您的设备本地处理所有数据。不会将任何内容发送到外部服务器。
