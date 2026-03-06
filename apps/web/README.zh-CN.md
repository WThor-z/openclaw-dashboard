# @apps/web

语言: [English](README.md) | 简体中文

`@apps/web` 是 OpenClaw Dashboard 的前端应用。
它基于 Vite + React，提供登录后的 dashboard 壳层以及 `/dashboard` 下的 Agent Workspace 体验。

## 主要能力

- 本地 daemon token 登录
- 登录后自动进入 dashboard
- 渲染 Agent 卡片并轮询状态
- 打开 600px 侧边抽屉查看工作区
- 递归文件树浏览 Agent 工作区
- 预览 markdown 并编辑支持的文本文件
- 通过 daemon 控制 API 发送保存请求

## 技术栈

- React 18
- React Router 6
- Vite 5
- Tailwind CSS（通过 PostCSS）
- Vitest + Testing Library

## 常用命令

在仓库根目录执行：

```bash
pnpm --filter @apps/web dev
pnpm --filter @apps/web test
pnpm --filter @apps/web build
```

## 关键路径

- `src/app/App.tsx` - 路由与鉴权入口
- `src/pages/AgentWorkspacePage.tsx` - Agent Workspace 主页面
- `src/components/` - Agent 卡片、文件树、编辑器等组件
- `src/styles/` - dashboard 样式与 Tailwind 入口
- `test/` - 组件和页面测试

## 说明

- 主入口页面为 `/dashboard`
- 该应用依赖可访问的本地 daemon API
- 浏览器级回归测试位于仓库级 `tests/e2e`
