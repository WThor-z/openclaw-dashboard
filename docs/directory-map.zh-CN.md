# 目录用途导航

这份文档用于快速判断：**新文件应该放哪里**。

## 仓库根目录

- `news/` - 面向公众的版本文章与发布博客
- `apps/` - 只放产品代码
- `packages/` - 跨应用共享契约/类型/纯工具
- `tests/` - 只放跨应用验证（`contracts/`、`e2e/`、`verification/`）
- `tools/` - 模拟器、可靠性辅助、工程脚本
- `docs/` - 方案与架构文档

## 应用归属

- `apps/web/` - 前端产品应用
- `apps/daemon/` - 后端 daemon 产品应用

## `apps/web/src/` 内部

- `app/` - 路由、provider、鉴权、主题、启动装配
- `domains/<domain>/` - 前端业务功能/页面
- `shared/` - 被多个 web domain 复用的 UI、hooks、styles
- `main.tsx` - 前端入口

经验法则：web 业务逻辑放 `domains/`；可复用能力放 `shared/`。

## `apps/daemon/src/` 内部

- `app/` - daemon 启动与服务组合
- `domains/<domain>/` - 后端业务逻辑与 API 领域处理
- `platform/` - 基础设施适配层（storage、gateway、monitoring、ingest、webhooks、openclaw）
- `shared/` - daemon 内共享中间件/辅助模块

经验法则：凡是直接对接文件系统/网络/数据库/运行时服务，优先放 `platform/`。

## 测试目录规则

- `apps/web/tests/` - web 单测/组件/集成测试
- `apps/daemon/tests/` - daemon 单测/集成测试
- 根 `tests/contracts/` - 跨应用契约测试
- 根 `tests/e2e/` - 端到端浏览器测试
- 根 `tests/verification/` - 环境/安全/运维校验入口

## 工具目录规则

- `tools/simulator/` - 各类模拟器（如 gateway simulator）
- `tools/ops/` - 本地运维脚本
- `tools/reliability/` - 可靠性与安全辅助
- `tools/workspace/` - 工作区工程辅助脚本

## 文档目录规则

- `docs/plans/` - 实施方案与迁移方案

## News 目录规则

- `news/` - 面向公众的版本技术博客、发布文章与版本里程碑总结

## 快速决策清单

1. 这是产品行为代码吗？
   - 是 -> `apps/web` 或 `apps/daemon`
   - 否 -> `tools` 或 `docs`
2. 需要跨应用共享吗？
   - 是 -> `packages/shared`
3. 是 daemon 的基础设施实现吗？
   - 是 -> `apps/daemon/src/platform/`
4. 是跨应用验证测试吗？
   - 是 -> 根 `tests/`
