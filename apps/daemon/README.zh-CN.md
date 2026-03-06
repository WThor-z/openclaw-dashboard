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

- `src/server/` - daemon 启动与 HTTP 服务
- `src/api/read/` - dashboard 读 API
- `src/api/control/` - 受保护的变更 API
- `src/openclaw/` - Agent 发现与 registry 加载
- `src/monitoring/` - 工作区、gateway、OpenClaw 监控采集
- `test/` - daemon 单元与集成测试

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
