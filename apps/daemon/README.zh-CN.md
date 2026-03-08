# @apps/daemon

语言: [English](README.md) | 简体中文

`@apps/daemon` 是 OpenClaw Dashboard 的本地后端。
它提供读 API、受保护的控制 API、监控端点，以及前端所需的 Agent 工作区文件访问能力。

## 主要能力

- 启动 dashboard 使用的本地 HTTP daemon
- 使用 bearer token 保护 dashboard 请求
- 提供状态、事件、会话、任务、成本、监控、Agent 等读 API
- 提供受保护的写入控制 API
- 从 session registry 与配置回退中加载 Agent 数据
- 兼容 legacy OpenClaw 风格的配置与状态目录
- 解析 Agent 工作区根路径用于文件浏览和保存

## 常用命令

在仓库根目录执行：

```bash
pnpm --filter @apps/daemon dev
pnpm --filter @apps/daemon test
```

## 关键路径

- `src/app/` - daemon 启动、绑定配置与 HTTP 服务组合层
- `src/domains/operations/read/` - operations 读处理器（status、events、sessions、tasks、costs、monitors）
- `src/shared/middleware/` - 跨 app/domain 复用的鉴权、request id 与错误处理辅助模块
- `src/shared/redaction.js` - 读/控 API 共用的 payload 脱敏辅助模块
- `src/platform/storage/` - 数据库迁移与仓储适配层
- `src/platform/monitoring/` - 工作区、gateway、OpenClaw 监控采集层
- `src/platform/openclaw/` - OpenClaw 状态/配置发现与 session registry 加载层
- `src/platform/webhooks/` - webhook 端点策略与 outbox 投递 worker
- `src/platform/gateway/` - daemon 测试与模拟集成使用的 gateway websocket 协议客户端
- `src/platform/ingest/` - 统一事件信封规范化与摄入流水线
- `src/domains/operations/api/read/` - dashboard 只读 API 路由与读侧 agent/webhook 处理器
- `src/domains/operations/api/control/` - 受保护变更 API 路由与控制侧 agent 处理器
- `tests/` - daemon 单元与集成测试

## Agent 发现逻辑

daemon 可从以下来源发现 Agent：

- 运行时 session registry 文件
- 现代配置文件（如 `openclaw.json`）
- legacy 配置文件（如 `clawdbot.json`）
- legacy 状态目录（如 `.clawdbot`、`.moltbot`、`.moldbot`）

当运行时 registry 缺失时，会回退到配置中的 Agent，保证 dashboard 仍可展示已知工作区。

## 说明

- 该服务面向本地可信环境
- 浏览器端到端验证由仓库级 Playwright 测试覆盖
