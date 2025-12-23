# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Utility Tools 是一个纯前端实用工具集合，基于 Next.js 16 + React 19 构建。所有处理均在浏览器本地完成，不上传用户数据。

## 常用命令

```bash
pnpm dev      # 启动开发服务器
pnpm build    # 生产构建
pnpm lint     # ESLint 检查
```

## 技术栈

- **框架**: Next.js 16 (App Router) + React 19
- **样式**: Tailwind CSS 4 + Liquid Glass 设计系统
- **UI 组件**: HeroUI + Framer Motion
- **图标库**: Lucide React（避免使用表情符号）
- **语言**: TypeScript

## 目录结构

```
src/
├── app/
│   ├── globals.css     # Liquid Glass 设计系统
│   └── tools/          # 各工具页面
│       └── [tool-name]/page.tsx
└── lib/                # 核心算法和工具函数
```

## 设计系统 (Liquid Glass)

定义在 `globals.css`，视觉特点：毛玻璃卡片、流动渐变背景、涟漪动效。

**配色**:
- 背景: `#0f0c29` → `#302b63` → `#24243e`
- 强调: 薄荷青 `#64ffda`、珊瑚粉 `#ff6b9d`、紫罗兰 `#a78bfa`

**字体**: Outfit (标题) + DM Sans (正文)

**CSS 类**: `.glass-card`, `.btn-liquid`, `.tag`, `.heading-display`, `.heading-glow`

## 添加新工具

1. 在 `src/app/tools/[tool-name]/page.tsx` 创建页面
2. 在 `src/app/page.tsx` 的 `tools` 数组中添加入口
3. 核心算法放入 `src/lib/` 目录
