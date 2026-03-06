# openclaw-dashboard

语言: [English](README.md) | 简体中文

OpenClaw Dashboard 是一个面向本地 OpenClaw 风格 Agent 环境的控制平面与 Agent Workspace 界面。
它由 Node daemon 与 React 前端组成，用于登录、查看 Agent、浏览工作区文件、预览 markdown/文本内容，并通过受保护的本地 API 回写编辑结果。

## 功能亮点

- Agent Workspace 主入口为 `/dashboard`
- 本地 token 鉴权登录流程
- Agent 卡片与状态轮询
- 600px 宽侧边抽屉查看工作区
- 递归文件树浏览 Agent 工作区
- markdown 预览与 `.md` / `.txt` 文件编辑
- daemon 提供监控、事件、会话、任务、成本与 webhook 相关 API
- Agent 发现支持 registry、现代配置和 legacy 配置回退

## 架构说明

该仓库是一个 pnpm monorepo，核心分为三层：

- `apps/web` - Vite + React 仪表盘前端
- `apps/daemon` - 本地 API 服务与控制平面
- `packages/shared` - 跨包共享类型与契约

配套目录：

- `tests/e2e` - Playwright 浏览器回归测试
- `tests/contracts` 与 `tests/gateway-sim` - 契约与模拟器测试
- `infra` - 环境、安全与运维校验脚本
- `reliability` - 同仓库维护的 Python 可靠性辅助模块

## 仓库结构

```text
apps/
  daemon/    本地 daemon API 与控制流程
  web/       Dashboard 前端
packages/
  shared/    共享契约与类型
tests/
  contracts/
  e2e/
  gateway-sim/
reliability/ Python 辅助包
infra/       校验与本地运维脚本
scripts/     工作区辅助脚本
```

## 环境要求

- Node.js 22+
- pnpm 10+

## 快速开始

安装依赖：

```bash
pnpm install
```

启动 daemon：

```bash
pnpm --filter @apps/daemon dev
```

在另一个终端启动前端：

```bash
pnpm --filter @apps/web dev
```

随后打开 Vite 提示的本地地址，使用 daemon token 登录，并进入 `/dashboard`。

## 常用命令

在仓库根目录执行：

```bash
pnpm test
pnpm test:e2e
pnpm build
pnpm lint
pnpm verify:env
pnpm verify:security
pnpm verify:ops
```

按应用执行：

```bash
pnpm --filter @apps/daemon test
pnpm --filter @apps/web test
pnpm --filter @apps/web build
```

## Agent 发现逻辑

daemon 可从以下来源发现 Agent：

- `~/.openclaw/state/session-registry.json`
- 现代配置文件，如 `~/.openclaw/openclaw.json`
- legacy 状态/配置目录，如 `.clawdbot`、`.moltbot`、`.moldbot`

当运行时 session registry 缺失时，daemon 会回退到配置中的 Agent 列表，确保 dashboard 仍可展示已知工作区。

## 前端与 API 说明

- 前端使用 React、React Router、Vite，并通过 PostCSS 接入 Tailwind
- daemon 提供读 API 与受保护的控制 API（适用于本地可信环境）
- 当前可编辑文件主要覆盖 markdown 与纯文本工作流
- Playwright 覆盖登录、浏览、编辑、保存等主路径

## 验证

当前仓库包含：

- daemon 单元与集成测试
- web 组件与页面测试
- Playwright E2E 测试
- monorepo 级 TypeScript 构建校验

典型验证流程：

```bash
pnpm --filter @apps/daemon test
pnpm --filter @apps/web test
pnpm --filter @apps/web build
pnpm test:e2e
pnpm build
```

## 项目状态

项目在持续演进中。根目录文档以当前可运行功能为准。
