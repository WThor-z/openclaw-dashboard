# @apps/web

语言: [English](README.md) | 简体中文

`@apps/web` 是 OpenClaw Dashboard 的前端应用。
它基于 Vite + React，提供登录后的应用壳层以及 `/dashboard` 下的 Agent Workspace 体验。

## 主要能力

- 本地 daemon token 登录
- 登录后自动进入 dashboard
- 渲染 Agent 卡片并轮询状态
- 打开 600px 侧边抽屉查看工作区
- 递归文件树浏览 Agent 工作区
- 预览 markdown 并编辑支持的文本文件
- 通过 daemon 控制 API 发送保存请求
- 提供 V2 Agent Runtime UI，包含 conversations、schedules、heartbeat 与 memory 标签页

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
- `src/app/` - 仅保留路由、provider、鉴权、主题和启动装配
- `src/domains/auth/pages/LoginPage.tsx` - 由 auth 业务域拥有的登录页面
- `src/domains/agent-workspace/pages/AgentWorkspacePage.tsx` - Agent Workspace 主页面
- `src/domains/agent-workspace/` - workspace 业务域目录，包含页面、侧栏与 markdown/storage 工具
- `src/domains/agent-runtime/` - V2 runtime 业务域，包含 conversations、schedules、heartbeat、memory UI
- `src/domains/agent-runtime/pages/AgentRuntimePage.tsx` - runtime 主页，位于 `/agents/:agentId/runtime`
- `src/domains/agent-runtime/pages/AgentRuntimeConversationPage.tsx` - 对话线程页面
- `src/domains/agent-runtime/components/AgentRuntimeShell.tsx` - 带标签导航的 runtime shell
- `src/shared/components/` - Agent 卡片、文件树、编辑器等前端应用内复用的共享组件
- `src/shared/hooks/` - 支撑各前端业务域的应用内共享 hooks
- `src/shared/styles/` - web 应用内共享的 dashboard 样式与 Tailwind 入口
- `tests/` - web 应用自己的页面/组件/集成测试

## 说明

- 主入口页面为 `/dashboard`
- V2 runtime 入口为 `/agents/:agentId/runtime`
- 受保护路由通过 `ProtectedRoute` 组件要求鉴权
- 该应用依赖可访问的本地 daemon API
- 浏览器级回归测试位于仓库级 `tests/e2e`
