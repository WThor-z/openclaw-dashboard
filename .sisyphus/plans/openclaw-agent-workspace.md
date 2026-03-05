# OpenClaw Agent Workspace 重构计划

## TL;DR
> **Summary**: 将杂乱的 Dashboard 重构为专注的 Agent 监控工作台，支持查看 gateway 下所有 agent 状态、浏览工作区文件、轻量编辑文件内容。
> **Deliverables**: 
> - Agent 列表页面（卡片网格展示状态）
> - Agent 工作区侧边抽屉（文件浏览器 + Markdown 预览/编辑）
> - REST API 端点（读取/保存工作区文件）
> - 实时状态轮询机制
> - E2E + 单元测试覆盖
> **Effort**: Large (涉及前端重构 + 后端 API 扩展 + UI 组件开发)
> **Parallel**: YES - 4 waves
> **Critical Path**: Wave 1 (Foundation) → Wave 2 (Agent List) → Wave 3 (Workspace Drawer) → Wave 4 (Edit + Polish)

## Context

### Original Request
用户认为当前 Dashboard 功能太杂又没什么用，决定抛弃所有功能，专注开发 Agent 查看功能：
1. 看到 gateway 有几个 agent
2. 哪些 agent 在工作，哪些待命
3. 看到每个 agent 的工作区
4. 工作区文件美观呈现（参考图3）

### Interview Summary
- **数据架构**: 混合模式 - `state/session-registry.json` + 文件系统工作区 + API 实时状态
- **UI 设计**: Agent 卡片网格 → 点击打开侧边抽屉 → 文件树 + Markdown 预览
- **状态定义**: 4 元状态（idle/busy/offline/error）
- **文件支持**: Markdown/文本，支持轻量编辑
- **保存机制**: 手动为主 + 可选自动保存
- **导航**: 侧边抽屉（非新页面）

### Technical Decisions
  - **API 风格**: REST，读取端点 `/api/agents/:id/files/:path`（在 `api/read/`），写入端点 `/api/control/agents/:id/files/:path`（在 `api/control/`）
- **状态来源**: 混合（文件系统获取工作区，API 获取运行状态）
- **编辑能力**: 轻量编辑，直接保存到文件系统

### Metis Review (gaps addressed)
**识别的关键差距**:
1. **数据同步风险**: 文件系统编辑与 API 状态可能不同步，需要版本/时间戳校验
2. **并发编辑**: 多用户同时编辑同一文件的风险，MVP 暂不考虑，需文档说明
3. **大文件处理**: 未定义文件大小限制，需添加 1MB 限制和流式读取
4. **错误边界**: Agent 卡片和工作区抽屉需有错误边界防止崩溃
5. **空状态设计**: 无 agent、无文件、离线状态需要专门的 UI 处理
6. **权限检查**: 需确认当前用户对工作区文件的读写权限

**Guardrails Added**:
- 文件大小限制 ≤1MB
- 只支持 .md/.txt 文件编辑
- 自动保存默认关闭，需用户显式启用
- 编辑前备份原文件（.bak）

## Work Objectives

### Core Objective
构建一个简洁、专注的 Agent 监控工作台，取代现有功能繁杂的控制面板。

### Deliverables
1. **AgentList 页面**: 卡片网格展示所有 agent，显示状态、名称、角色
2. **AgentWorkspace 抽屉**: 点击 agent 打开，左侧文件树，右侧 Markdown 预览/编辑器
3. **REST API**: 
   - `GET /api/agents` - 获取 agent 列表（从 `state/session-registry.json`）
   - `GET /api/agents/:id/status` - 获取 agent 实时状态
   - `GET /api/agents/:id/files` - 获取工作区文件列表
   - `GET /api/agents/:id/files/:path` - 读取文件内容
   - `POST /api/control/agents/:id/files/:path` - 保存文件内容
4. **状态轮询**: 3 秒轮询更新 agent 状态
5. **测试套件**: E2E (Playwright) + 单元测试 (Vitest)

### Definition of Done
- [ ] 打开 `/dashboard` 显示 Agent 卡片网格，而非旧面板
- [ ] 每个卡片显示正确状态（空闲/忙碌/离线/错误）和视觉指示
- [ ] 点击卡片右侧滑出抽屉，显示该 agent 的工作区文件树
- [ ] 点击文件树中的 Markdown 文件，右侧显示渲染内容
- [ ] 编辑模式可修改内容，保存后文件系统更新
- [ ] 所有 API 端点返回正确数据格式
- [ ] E2E 测试覆盖：查看列表 → 打开抽屉 → 浏览文件 → 编辑保存
- [ ] 单元测试覆盖：AgentCard、FileTree、MarkdownEditor 组件

### Must Have
- Agent 卡片网格（状态、名称、角色）
- 侧边抽屉导航（非弹窗）
- 文件树浏览（目录结构）
- Markdown 文件预览
- 文件内容编辑和保存
- 实时状态更新（轮询）
- 空状态和错误状态 UI
- 深色主题（复用现有设计系统）

### Must NOT Have
- 原有 Dashboard 的所有其他功能（事件、任务、审批、成本等）
- 图片/二进制文件预览
- 文件夹创建/删除操作（只读文件树）
- 代码语法高亮（仅 Markdown/纯文本）
- 文件版本历史
- 多用户协作编辑
- 移动端适配（桌面优先）
- 主题切换（仅深色）

## Verification Strategy

### Test Strategy
- **E2E (Playwright)**: 覆盖核心用户流程
  - 查看 Agent 列表
  - 点击 Agent 打开抽屉
  - 浏览文件树
  - 预览 Markdown
  - 编辑并保存文件
  - 错误场景（离线 agent、大文件、保存失败）
- **单元测试 (Vitest)**: 覆盖组件和工具函数
  - AgentCard 渲染和交互
  - FileTree 导航
  - MarkdownEditor 编辑逻辑
  - API 客户端错误处理
  - 状态转换逻辑

### Agent QA Scenarios
每个任务必须包含 QA 场景，验证标准：
- **Happy Path**: 操作成功，UI 正确更新
- **Error Path**: 错误处理，用户友好提示
- **Edge Case**: 边界条件（空数据、大文件、网络中断）

### Evidence Collection
- E2E 测试截图保存到 `.sisyphus/evidence/openclaw-agent-workspace/`
- 单元测试覆盖率报告
- API 响应示例

## Execution Strategy

### Parallel Execution Waves

**Wave 1: Foundation (2 tasks)**
- 任务 1: 创建基础类型和 API 契约
- 任务 2: 搭建 AgentWorkspace 路由和布局框架

**Wave 2: Agent List (2 tasks)**
- 任务 3: 实现 Agent API 端点
- 任务 4: 实现 AgentList 页面和卡片组件

**Wave 3: Workspace Drawer (3 tasks)**
- 任务 5: 实现文件系统 API 端点
- 任务 6: 实现 FileTree 组件
- 任务 7: 实现 Markdown 预览组件

**Wave 4: Edit & Polish (3 tasks)**
- 任务 8: 实现文件编辑和保存功能
- 任务 9: 实现实时状态轮询
- 任务 10: 实现空状态、错误边界、加载状态

**Wave 5: Testing (2 tasks)**
- 任务 11: E2E 测试套件
- 任务 12: 单元测试套件

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| 1 (Types/API) | - | 3, 4, 5 |
| 2 (Layout) | - | 4, 6, 7 |
| 3 (Agent API) | 1 | 4 |
| 4 (Agent List) | 1, 2, 3 | 9 |
| 5 (File API) | 1 | 6, 7, 8 |
| 6 (FileTree) | 2, 5 | 7, 8 |
| 7 (Markdown) | 2, 5, 6 | 8 |
| 8 (Edit/Save) | 5, 6, 7 | - |
| 9 (Polling) | 4 | 10 |
| 10 (Polish) | 4, 8, 9 | 11, 12 |
| 11 (E2E Tests) | 10 | - |
| 12 (Unit Tests) | 10 | - |

### Agent Dispatch Summary
| Wave | Tasks | Categories | Skills |
|------|-------|-----------|--------|
| 1 | 2 | deep, quick | typescript |
| 2 | 2 | unspecified-high, visual-engineering | typescript, react |
| 3 | 3 | unspecified-high, visual-engineering | typescript, react |
| 4 | 3 | unspecified-high | typescript, react |
| 5 | 2 | quick, unspecified-high | testing, playwright |

## TODOs

### Wave 1: Foundation

- [ ] 1. 创建类型定义和 API 契约

  **What to do**: 
  - 在 `packages/shared/src/types.ts` 创建 Agent、AgentStatus、WorkspaceFile 类型
  - 定义 API 请求/响应契约（AgentListResponse、FileContentResponse 等）
  - 创建 AgentStatus 枚举（idle='空闲', busy='忙碌', offline='离线', error='错误'）

  **Must NOT do**: 
  - 不要创建业务逻辑
  - 不要修改现有 Panel 组件

  **Recommended Agent Profile**:
  - Category: `deep` — 需要仔细设计类型边界
  - Skills: [`typescript`] — 类型定义核心任务
  - Omitted: [`react`, `playwright`] — 纯类型工作

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 3, 4, 5 | Blocked By: -

  **References**:
  - Pattern: `apps/web/src/features/monitoring/MonitoringPanel.tsx:20-35` — GatewayAgentItem 类型参考
  - Pattern: `apps/daemon/src/api/read/sessions.js` — API 响应格式参考
  - API Design: REST 风格，参考 OpenAPI 规范

  **Acceptance Criteria**:
  - [ ] `Agent` 类型包含：id, name, role, workspacePath, status, updatedAt
  - [ ] `AgentStatus` 枚举定义 4 种状态
  - [ ] `WorkspaceFile` 类型包含：path, name, size, modifiedAt, isDirectory
  - [ ] 所有类型通过 TypeScript 编译
  - [ ] 类型定义文件有 JSDoc 注释

  **QA Scenarios**:
  ```
  Scenario: 类型定义完整性
    Tool: Bash
    Steps: 
      1. cd packages/shared && npx tsc --noEmit
      2. 检查 types.ts 导出
    Expected: 无类型错误，所有类型正确导出
    Evidence: .sisyphus/evidence/openclaw-agent-workspace/task-1-types-check.log
  ```

  **Commit**: YES | Message: `feat(types): add Agent and WorkspaceFile types` | Files: `packages/shared/src/types.ts`

---

- [ ] 2. 搭建 AgentWorkspace 路由和布局框架

  **What to do**: 
  - 创建 `AgentWorkspacePage.tsx` 替换现有的 DashboardPage
  - 简化路由结构：移除旧模块路由，保留 `/dashboard` 作为主入口
  - 创建基础布局：侧边栏（可选）+ 主内容区 + 右侧抽屉容器
  - 复用现有 CSS 设计系统（design-system.css、dashboard-layout.css）

  **Must NOT do**: 
  - 不要实现具体组件（AgentCard、FileTree 等）
  - 不要删除旧组件文件（留待后续清理）
  - 不要修改 auth.tsx

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — 布局框架搭建
  - Skills: [`react`, `typescript`] — 路由和布局
  - Omitted: [`playwright`] — 不需要测试

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 4, 6, 7 | Blocked By: -

  **References**:
  - Pattern: `apps/web/src/app/App.tsx:31-50` — 路由配置模式
  - Pattern: `apps/web/src/pages/DashboardPage.tsx:568-620` — 布局结构参考
  - CSS: `apps/web/src/styles/dashboard-layout.css` — 复用现有布局类

  **Acceptance Criteria**:
  - [ ] 访问 `/dashboard` 显示新 AgentWorkspacePage（空白占位符即可）
  - [ ] 页面布局正确：侧边栏宽度固定，主内容区自适应
  - [ ] 右侧抽屉容器定位正确（绝对定位，宽度 600px）
  - [ ] 路由切换正常工作
  - [ ] 登录状态检查正常

  **QA Scenarios**:
  ```
  Scenario: 页面加载和布局
    Tool: interactive_bash
    Steps:
      1. cd apps/web && npm run dev
      2. 登录后访问 http://localhost:3000/dashboard
    Expected: 显示新页面布局，无控制台错误
    Evidence: .sisyphus/evidence/openclaw-agent-workspace/task-2-layout.png

  Scenario: 抽屉容器定位
    Tool: Playwright
    Steps:
      1. 打开页面
      2. 检查抽屉容器 CSS 定位和尺寸
    Expected: position: fixed, right: 0, width: 600px, z-index 正确
    Evidence: .sisyphus/evidence/openclaw-agent-workspace/task-2-drawer-position.png
  ```

  **Commit**: YES | Message: `feat(layout): setup AgentWorkspace page structure` | Files: `apps/web/src/pages/AgentWorkspacePage.tsx`, `apps/web/src/app/App.tsx`

---

### Wave 2: Agent List

- [ ] 3. 实现 Agent API 端点

  **What to do**: 
  - 在 daemon 创建 `apps/daemon/src/api/read/agents.js`
  - `GET /api/agents`: 读取 `state/session-registry.json`（在 `DAEMON_MONITOR_OPENCLAW_ROOT` 下），返回 agent 列表
  - `GET /api/agents/:id/status`: 查询 gateway 获取实时状态
  - 实现 workspace 路径解析（相对于 .openclaw 目录）

  **Must NOT do**: 
  - 不要实现文件读写 API（留到 Wave 3）
  - 不要处理认证（复用现有中间件）

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — API 开发
  - Skills: [`typescript`] — Node.js API
  - Omitted: [`react`, `playwright`] — 纯后端任务

  **Parallelization**: Can Parallel: YES (after 1) | Wave 2 | Blocks: 4 | Blocked By: 1

  **References**:
  - Pattern: `apps/daemon/src/api/read/monitors.js` — API 端点模式
  - Pattern: `apps/daemon/src/monitoring/collectors.js` — gateway 数据获取
  - Config: `state/session-registry.json` — agent 配置格式（位于 `DAEMON_MONITOR_OPENCLAW_ROOT` 环境变量指定的目录）

  **Acceptance Criteria**:
  - [ ] `GET /api/agents` 返回 agent 列表（mock 数据也可）
  - [ ] `GET /api/agents/:id/status` 返回 status、updatedAt
  - [ ] API 返回正确 HTTP 状态码（200、404、500）
  - [ ] 错误响应包含 message 字段

  **QA Scenarios**:
  ```
  Scenario: Agent 列表 API
    Tool: Bash
    Steps:
      1. curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/agents
    Expected: 返回 JSON 数组，包含 id、name、role、workspacePath
    Evidence: .sisyphus/evidence/openclaw-agent-workspace/task-3-agents-api.json

  Scenario: Agent 状态 API
    Tool: Bash
    Steps:
      1. curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/agents/agent-1/status
    Expected: 返回 { status: 'idle'|'busy'|'offline'|'error', updatedAt: ISOString }
    Evidence: .sisyphus/evidence/openclaw-agent-workspace/task-3-status-api.json
  ```

  **Commit**: YES | Message: `feat(api): add agent list and status endpoints` | Files: `apps/daemon/src/api/read/agents.js`, `apps/daemon/src/api/read/index.js`

---

- [ ] 4. 实现 AgentList 页面和卡片组件

  **What to do**: 
  - 创建 `AgentCard.tsx` 组件：显示头像、名称、角色、状态徽章
  - 创建 `AgentList.tsx` 组件：网格布局，3 列响应式
  - 集成到 AgentWorkspacePage：fetch agent 列表，渲染卡片
  - 实现点击卡片打开抽屉（抽屉内容留空）
  - 状态可视化：空闲(灰点)、忙碌(绿点脉冲)、离线(灰)、错误(红点)

  **Must NOT do**: 
  - 不要实现抽屉内容（留到 Wave 3）
  - 不要实现状态轮询（留到 Wave 4）

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — UI 组件开发
  - Skills: [`react`, `typescript`] — 组件实现
  - Omitted: [`playwright`] — 稍后测试

  **Parallelization**: Can Parallel: YES (after 1, 2, 3) | Wave 2 | Blocks: 9 | Blocked By: 1, 2, 3

  **References**:
  - Pattern: `apps/web/src/features/monitoring/MonitoringPanel.tsx` — 现有 Agent 卡片参考
  - UI Pattern: Shadcn Card + Badge + Avatar（参考 Librarian 研究）
  - CSS: 复用现有设计系统的颜色和间距变量

  **Acceptance Criteria**:
  - [ ] Agent 卡片正确显示头像、名称、角色
  - [ ] 状态徽章颜色正确（空闲灰、忙碌绿脉冲、离线灰、错误红）
  - [ ] 网格布局响应式（大屏3列，小屏2列）
  - [ ] 点击卡片右侧滑出抽屉（当前为空）
  - [ ] 空状态显示友好提示（"暂无 Agent"）

  **QA Scenarios**:
  ```
  Scenario: Agent 卡片渲染
    Tool: Playwright
    Steps:
      1. Mock API 返回 3 个 agent（不同状态）
      2. 访问 /dashboard
      3. 截图验证卡片布局
    Expected: 3 个卡片正确渲染，状态徽章颜色正确
    Evidence: .sisyphus/evidence/openclaw-agent-workspace/task-4-agent-cards.png

  Scenario: 抽屉打开
    Tool: Playwright
    Steps:
      1. 点击第一个 agent 卡片
      2. 截图验证抽屉滑出动画和位置
    Expected: 抽屉从右侧滑入，宽度 600px，背景遮罩
    Evidence: .sisyphus/evidence/openclaw-agent-workspace/task-4-drawer-open.png
  ```

  **Commit**: YES | Message: `feat(ui): implement AgentCard and AgentList components` | Files: `apps/web/src/components/AgentCard.tsx`, `apps/web/src/components/AgentList.tsx`, `apps/web/src/pages/AgentWorkspacePage.tsx`

---

### Wave 3: Workspace Drawer

- [ ] 5. 实现文件系统 API 端点

  **What to do**: 
  - 在 `apps/daemon/src/api/read/agents.js` 添加读取端点：
    - `GET /api/agents/:id/files` - 递归列出工作区所有文件
    - `GET /api/agents/:id/files/:path` - 读取文件内容（文本）
  - 在 `apps/daemon/src/api/control/agents.js` 添加写入端点：
    - `POST /api/control/agents/:id/files/:path` - 保存文件内容
  - 文件大小限制：≤1MB
  - 文件类型白名单：.md, .txt, .json, .yaml, .yml
  - 保存前创建备份（.bak）
  - 在 `apps/daemon/src/api/control/index.js` 中注册 agents 路由

  **Must NOT do**: 
  - 不要支持二进制文件
  - 不要实现文件夹操作（创建/删除/重命名）
  - 不要实现文件搜索

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — API 开发
  - Skills: [`typescript`] — Node.js 文件操作
  - Omitted: [`react`, `playwright`] — 纯后端

  **Parallelization**: Can Parallel: YES (after 1) | Wave 3 | Blocks: 6, 7, 8 | Blocked By: 1

  **References**:
  - Pattern: `apps/daemon/src/api/read/sessions.js` — API 错误处理模式
  - Node.js: `fs/promises` API（readdir, readFile, writeFile）
  - Security: 路径遍历防护（path.join, path.normalize）

  **Acceptance Criteria**:
  - [ ] `GET /api/agents/:id/files` 返回文件树结构
  - [ ] `GET /api/agents/:id/files/:path` 返回文件内容（UTF-8）
  - [ ] `POST /api/control/agents/:id/files/:path` 保存内容并创建 .bak 备份
  - [ ] 大文件（>1MB）返回 413 错误
  - [ ] 非法路径返回 400 错误
  - [ ] 文件不存在返回 404 错误

  **QA Scenarios**:
  ```
  Scenario: 文件列表 API
    Tool: Bash
    Steps:
      1. 创建测试目录结构：agent-1/{SOUL.md,TASK.md,docs/readme.md}
      2. curl /api/agents/agent-1/files
    Expected: 返回嵌套文件树结构
    Evidence: .sisyphus/evidence/openclaw-agent-workspace/task-5-file-tree-api.json

  Scenario: 文件读写
    Tool: Bash
    Steps:
      1. curl /api/agents/agent-1/files/SOUL.md
      2. POST 修改内容
      3. 再次 GET 验证修改
      4. 检查 .bak 文件存在
    Expected: 读写成功，备份文件创建
    Evidence: .sisyphus/evidence/openclaw-agent-workspace/task-5-file-rw.log

  Scenario: 大文件拒绝
    Tool: Bash
    Steps:
      1. 创建 2MB 测试文件
      2. GET 请求
    Expected: 返回 413 Payload Too Large
    Evidence: .sisyphus/evidence/openclaw-agent-workspace/task-5-large-file.log
  ```

  **Commit**: YES | Message: `feat(api): add workspace file operations endpoints` | Files: `apps/daemon/src/api/read/agents.js`, `apps/daemon/src/api/control/agents.js`, `apps/daemon/src/api/control/index.js`

---

- [ ] 6. 实现 FileTree 组件

  **What to do**: 
  - 创建 `FileTree.tsx`：递归渲染文件树
  - 支持展开/折叠目录
  - 文件图标：根据扩展名显示不同图标（Markdown、文本、JSON、YAML）
  - 点击文件触发 onSelect 回调
  - 当前选中文件高亮显示

  **Must NOT do**: 
  - 不要实现拖拽排序
  - 不要实现右键菜单
  - 不要实现文件搜索

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — UI 组件
  - Skills: [`react`, `typescript`] — 组件实现
  - Omitted: [`playwright`] — 稍后测试

  **Parallelization**: Can Parallel: YES (after 2, 5) | Wave 3 | Blocks: 7, 8 | Blocked By: 2, 5

  **References**:
  - Pattern: Ant Design Tree 组件模式（参考 Librarian 研究）
  - Icons: Lucide React（file-text, file-json, folder, folder-open）
  - UI: 复用现有设计系统颜色和间距

  **Acceptance Criteria**:
  - [ ] 文件树正确渲染目录结构
  - [ ] 目录可展开/折叠
  - [ ] 文件图标根据类型变化
  - [ ] 点击文件触发 onSelect
  - [ ] 选中文件高亮显示
  - [ ] 空目录显示提示

  **QA Scenarios**:
  ```
  Scenario: 文件树渲染
    Tool: Playwright
    Steps:
      1. Mock API 返回嵌套文件树
      2. 渲染 FileTree 组件
      3. 截图验证
    Expected: 正确显示层级，图标区分文件类型
    Evidence: .sisyphus/evidence/openclaw-agent-workspace/task-6-filetree.png

  Scenario: 展开折叠
    Tool: Playwright
    Steps:
      1. 点击目录展开
      2. 点击目录折叠
    Expected: 子项显示/隐藏，箭头图标旋转
    Evidence: .sisyphus/evidence/openclaw-agent-workspace/task-6-expand-collapse.png
  ```

  **Commit**: YES | Message: `feat(ui): implement FileTree component` | Files: `apps/web/src/components/FileTree.tsx`

---

- [ ] 7. 实现 Markdown 预览组件

  **What to do**: 
  - 创建 `MarkdownViewer.tsx`：渲染 Markdown 为 HTML
  - 使用轻量级库（如 marked 或 react-markdown）
  - 样式适配深色主题
  - 支持 frontmatter 显示（YAML 头部）
  - 代码块简单样式（无语法高亮）

  **Must NOT do**: 
  - 不要实现完整的 Markdown 编辑器（仅预览）
  - 不要支持 HTML 标签（安全考虑）
  - 不要实现图片渲染（路径问题）

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — UI 组件
  - Skills: [`react`, `typescript`] — 组件实现
  - Omitted: [`playwright`] — 稍后测试

  **Parallelization**: Can Parallel: YES (after 2, 5, 6) | Wave 3 | Blocks: 8 | Blocked By: 2, 5, 6

  **References**:
  - Library: `marked` 或 `react-markdown`（安装依赖）
  - Styling: GitHub-style Markdown CSS（适配深色主题）
  - Pattern: 参考图3的 Markdown 渲染样式

  **Acceptance Criteria**:
  - [ ] Markdown 正确渲染为 HTML
  - [ ] 深色主题样式正确
  - [ ] 标题、列表、代码块、链接正确显示
  - [ ] frontmatter 单独显示（如有）
  - [ ] 空内容显示占位符

  **QA Scenarios**:
  ```
  Scenario: Markdown 渲染
    Tool: Playwright
    Steps:
      1. 传入示例 Markdown（含标题、列表、代码）
      2. 渲染 MarkdownViewer
      3. 截图验证
    Expected: 正确渲染所有 Markdown 元素
    Evidence: .sisyphus/evidence/openclaw-agent-workspace/task-7-markdown.png

  Scenario: frontmatter 显示
    Tool: Playwright
    Steps:
      1. 传入带 YAML frontmatter 的 Markdown
    Expected: frontmatter 单独显示在顶部
    Evidence: .sisyphus/evidence/openclaw-agent-workspace/task-7-frontmatter.png
  ```

  **Commit**: YES | Message: `feat(ui): implement MarkdownViewer component` | Files: `apps/web/src/components/MarkdownViewer.tsx`, `apps/web/package.json`

---

### Wave 4: Edit & Polish

- [ ] 8. 实现文件编辑和保存功能

  **What to do**: 
  - 创建 `MarkdownEditor.tsx`：基于 textarea 的简单编辑器
  - 实现编辑/预览模式切换（Tab 切换）
  - 手动保存按钮（Ctrl+S 快捷键）
  - 自动保存开关（默认关闭，防抖 2 秒）
  - 保存状态指示（保存中、已保存、保存失败）
  - 未保存离开提示

  **Must NOT do**: 
  - 不要实现富文本编辑器（保持简单）
  - 不要实现协作编辑
  - 不要实现版本历史

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — 功能实现
  - Skills: [`react`, `typescript`] — 组件 + 状态管理
  - Omitted: [`playwright`] — 稍后测试

  **Parallelization**: Can Parallel: YES (after 5, 6, 7) | Wave 4 | Blocks: - | Blocked By: 5, 6, 7

  **References**:
  - Pattern: VS Code 编辑区设计（简洁、功能明确）
  - UX: 自动保存设置存储在 localStorage
  - API: 使用 Task 5 实现的 POST 端点

  **Acceptance Criteria**:
  - [ ] 编辑模式下显示 textarea
  - [ ] 预览模式下实时渲染 Markdown
  - [ ] 手动保存按钮触发 API 调用
  - [ ] Ctrl+S 快捷键保存
  - [ ] 自动保存开关在设置中，默认关闭
  - [ ] 未保存修改时离开提示确认
  - [ ] 保存状态正确显示

  **QA Scenarios**:
  ```
  Scenario: 编辑和保存
    Tool: Playwright
    Steps:
      1. 打开文件预览
      2. 切换到编辑模式
      3. 修改内容
      4. 点击保存
      5. 验证 API 调用和内容更新
    Expected: 保存成功，状态显示"已保存"
    Evidence: .sisyphus/evidence/openclaw-agent-workspace/task-8-edit-save.png

  Scenario: 未保存提示
    Tool: Playwright
    Steps:
      1. 修改文件内容（不保存）
      2. 点击关闭抽屉
    Expected: 弹出确认对话框
    Evidence: .sisyphus/evidence/openclaw-agent-workspace/task-8-unsaved-prompt.png
  ```

  **Commit**: YES | Message: `feat(ui): implement MarkdownEditor with save functionality` | Files: `apps/web/src/components/MarkdownEditor.tsx`

---

- [ ] 9. 实现实时状态轮询

  **What to do**: 
  - 在 AgentWorkspacePage 实现状态轮询 hook
  - 3 秒间隔轮询 `/api/agents/:id/status`
  - 只轮询当前打开 drawer 的 agent
  - 网络错误时显示离线状态，不中断轮询
  - 离开页面时清理定时器

  **Must NOT do**: 
  - 不要轮询所有 agent（性能考虑）
  - 不要使用 WebSocket（超出范围）
  - 不要缓存状态到 localStorage

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — 功能实现
  - Skills: [`react`, `typescript`] — hooks
  - Omitted: [`playwright`] — 稍后测试

  **Parallelization**: Can Parallel: YES (after 4) | Wave 4 | Blocks: 10 | Blocked By: 4

  **References**:
  - Pattern: `apps/web/src/pages/DashboardPage.tsx:182-197` — 现有轮询实现
  - Hook: useEffect + setInterval + cleanup
  - State: useState 存储每个 agent 的状态

  **Acceptance Criteria**:
  - [ ] 打开 drawer 后开始轮询该 agent 状态
  - [ ] 3 秒间隔更新状态
  - [ ] 状态变化时 UI 更新（徽章颜色变化）
  - [ ] 网络错误时显示离线状态
  - [ ] 关闭 drawer 后停止轮询
  - [ ] 组件卸载时清理定时器

  **QA Scenarios**:
  ```
  Scenario: 状态轮询
    Tool: Playwright
    Steps:
      1. Mock API 返回初始状态 'idle'
      2. 打开 agent drawer
      3. 修改 Mock 返回 'busy'
      4. 等待 3 秒
      5. 验证 UI 更新
    Expected: 状态徽章从灰点变为绿点脉冲
    Evidence: .sisyphus/evidence/openclaw-agent-workspace/task-9-status-polling.gif
  ```

  **Commit**: YES | Message: `feat(ui): implement agent status polling` | Files: `apps/web/src/hooks/useAgentStatus.ts`, `apps/web/src/pages/AgentWorkspacePage.tsx`

---

- [ ] 10. 实现空状态、错误边界、加载状态

  **What to do**: 
  - 空状态：
    - 无 agent 时显示"暂无 Agent" + 配置指引
    - 无文件时显示"工作区为空"
    - 选中离线 agent 时显示离线提示
  - 错误边界：
    - AgentCard 错误边界（单卡片崩溃不影响列表）
    - WorkspaceDrawer 错误边界
  - 加载状态：
    - Agent 列表骨架屏（Shadcn Skeleton 风格）
    - 文件树骨架屏
    - 文件内容加载 spinner

  **Must NOT do**: 
  - 不要实现全局错误页面
  - 不要实现重试逻辑（后续优化）

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — UI 完善
  - Skills: [`react`, `typescript`] — 组件 + 错误边界
  - Omitted: [`playwright`] — 稍后测试

  **Parallelization**: Can Parallel: YES (after 4, 8, 9) | Wave 4 | Blocks: 11, 12 | Blocked By: 4, 8, 9

  **References**:
  - Pattern: Shadcn Skeleton 组件（参考 Librarian 研究）
  - Pattern: Ant Design Empty 组件
  - React: Error Boundary 类组件模式

  **Acceptance Criteria**:
  - [ ] 空状态 UI 正确显示
  - [ ] 加载骨架屏正确显示
  - [ ] 错误边界捕获渲染错误
  - [ ] 错误边界显示友好错误信息

  **QA Scenarios**:
  ```
  Scenario: 空状态
    Tool: Playwright
    Steps:
      1. Mock API 返回空数组
      2. 访问页面
    Expected: 显示空状态插图和提示
    Evidence: .sisyphus/evidence/openclaw-agent-workspace/task-10-empty-state.png

  Scenario: 错误边界
    Tool: Playwright
    Steps:
      1. 故意让 AgentCard 抛出错误
      2. 验证错误边界捕获
    Expected: 显示错误提示，其他卡片正常
    Evidence: .sisyphus/evidence/openclaw-agent-workspace/task-10-error-boundary.png
  ```

  **Commit**: YES | Message: `feat(ui): add empty states, error boundaries, and loading skeletons` | Files: `apps/web/src/components/EmptyState.tsx`, `apps/web/src/components/ErrorBoundary.tsx`, `apps/web/src/components/Skeleton.tsx`

---

### Wave 5: Testing

- [ ] 11. E2E 测试套件

  **What to do**: 
  - 使用 Playwright 编写 E2E 测试
  - 测试场景：
    1. 查看 Agent 列表
    2. 点击 Agent 打开抽屉
    3. 浏览文件树
    4. 预览 Markdown
    5. 编辑并保存文件
    6. 错误场景（离线 agent、大文件、保存失败）
  - 配置测试数据（mock session-registry.json、mock 工作区文件）

  **Must NOT do**: 
  - 不要测试所有边界情况（留到单元测试）
  - 不要测试性能（超出范围）

  **Recommended Agent Profile**:
  - Category: `quick` — 测试编写
  - Skills: [`playwright`, `typescript`] — E2E 测试
  - Omitted: [`react`] — 纯测试任务

  **Parallelization**: Can Parallel: YES (after 10) | Wave 5 | Blocks: - | Blocked By: 10

  **References**:
  - Config: `playwright.config.ts` — 现有配置
  - Pattern: `tests/e2e/web-shell.spec.ts` — 现有测试模式
  - Best Practice: Page Object Model 模式

  **Acceptance Criteria**:
  - [ ] 5 个核心场景测试通过
  - [ ] 测试数据独立（不依赖真实文件系统）
  - [ ] 测试截图保存到 evidence
  - [ ] CI 中运行通过

  **QA Scenarios**:
  ```
  Scenario: 完整用户流程
    Tool: Playwright (内部运行)
    Steps:
      1. 运行 E2E 测试套件
    Expected: 所有测试通过
    Evidence: .sisyphus/evidence/openclaw-agent-workspace/task-11-e2e-report.html
  ```

  **Commit**: YES | Message: `test(e2e): add agent workspace E2E tests` | Files: `tests/e2e/agent-workspace.spec.ts`

---

- [ ] 12. 单元测试套件

  **What to do**: 
  - 使用 Vitest 编写单元测试
  - 测试组件：AgentCard、FileTree、MarkdownViewer、MarkdownEditor
  - 测试工具函数：文件路径处理、状态转换
  - 测试覆盖率 >80%

  **Must NOT do**: 
  - 不要测试 API 端点（留到集成测试）
  - 不要测试 UI 细节（留到 E2E）

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — 测试编写
  - Skills: [`vitest`, `typescript`] — 单元测试
  - Omitted: [`playwright`, `react`] — 纯测试任务

  **Parallelization**: Can Parallel: YES (after 10) | Wave 5 | Blocks: - | Blocked By: 10

  **References**:
  - Config: `apps/web/vitest.config.ts` — 现有配置
  - Pattern: `apps/web/test/dashboard-controls.test.tsx` — 现有测试模式
  - Library: `@testing-library/react` — 组件测试

  **Acceptance Criteria**:
  - [ ] 所有组件有单元测试
  - [ ] 覆盖率 >80%
  - [ ] 测试通过
  - [ ] 覆盖率报告生成

  **QA Scenarios**:
  ```
  Scenario: 单元测试
    Tool: Vitest (内部运行)
    Steps:
      1. cd apps/web && npm test
    Expected: 所有测试通过，覆盖率 >80%
    Evidence: .sisyphus/evidence/openclaw-agent-workspace/task-12-coverage-report.html
  ```

  **Commit**: YES | Message: `test(unit): add component unit tests` | Files: `apps/web/src/components/__tests__/AgentCard.test.tsx`, `apps/web/src/components/__tests__/FileTree.test.tsx`, `apps/web/src/components/__tests__/MarkdownViewer.test.tsx`, `apps/web/src/components/__tests__/MarkdownEditor.test.tsx`

---

## Final Verification Wave (4 parallel agents, ALL must APPROVE)

- [ ] F1. Plan Compliance Audit — oracle
  - 验证所有任务是否符合计划规范
  - 验证文件路径正确性
  - 验证 API 契约一致性

- [ ] F2. Code Quality Review — unspecified-high
  - TypeScript 类型完整性
  - React 最佳实践（hooks 规则、性能优化）
  - CSS 命名规范

- [ ] F3. Real Manual QA — unspecified-high (+ playwright if UI)
  - 手动测试完整用户流程
  - 验证 UI 视觉效果（参考图2、图3）
  - 验证响应式布局

- [ ] F4. Scope Fidelity Check — deep
  - 验证是否实现了所有 Must Have
  - 验证是否排除了所有 Must NOT Have
  - 验证是否引入了未计划的依赖

---

## Commit Strategy

**Wave 1**: `feat(types,layout): foundation for agent workspace`
**Wave 2**: `feat(api,ui): agent list and card components`
**Wave 3**: `feat(api,ui): workspace file browser and markdown preview`
**Wave 4**: `feat(ui): editing, polling, and polish`
**Wave 5**: `test(e2e,unit): comprehensive test coverage`
**Final**: `refactor(dashboard): replace legacy dashboard with agent workspace`

---

## Success Criteria

### Functional
- [ ] 用户可以在 Agent 卡片网格中查看所有 gateway agent
- [ ] 每个卡片正确显示状态（空闲/忙碌/离线/错误）
- [ ] 点击卡片右侧滑出抽屉，显示工作区文件树
- [ ] 用户可以浏览文件树，点击文件预览 Markdown
- [ ] 用户可以编辑文件并保存到文件系统
- [ ] 状态实时更新（3 秒轮询）

### Technical
- [ ] 代码覆盖率 >80%
- [ ] E2E 测试全部通过
- [ ] TypeScript 严格模式无错误
- [ ] Lighthouse 性能评分 >90

### UX
- [ ] 深色主题视觉一致
- [ ] 加载状态和空状态友好
- [ ] 错误边界防止崩溃
- [ ] 响应式布局（桌面 3 列，平板 2 列）

---

## Appendix

### Data Models

```typescript
// Agent 类型
interface Agent {
  id: string;
  name: string;
  role: string;
  workspacePath: string;
  status: AgentStatus;
  updatedAt: string;
}

// Agent 状态
enum AgentStatus {
  IDLE = 'idle',      // 空闲
  BUSY = 'busy',      // 忙碌
  OFFLINE = 'offline', // 离线
  ERROR = 'error'     // 错误
}

// 工作区文件
interface WorkspaceFile {
  path: string;
  name: string;
  size: number;
  modifiedAt: string;
  isDirectory: boolean;
  children?: WorkspaceFile[];
}

// API 响应
interface AgentListResponse {
  agents: Agent[];
}

interface FileContentResponse {
  content: string;
  path: string;
  modifiedAt: string;
}
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/agents | 获取所有 agent 列表 |
| GET | /api/agents/:id/status | 获取 agent 实时状态 |
| GET | /api/agents/:id/files | 获取工作区文件树 |
| GET | /api/agents/:id/files/:path | 读取文件内容 |
| POST | /api/control/agents/:id/files/:path | 保存文件内容 |

### File Type Support

| Extension | Icon | Preview | Edit |
|-----------|------|---------|------|
| .md | Markdown | ✅ | ✅ |
| .txt | Text | ✅ | ✅ |
| .json | JSON | ✅ | ✅ |
| .yaml/.yml | YAML | ✅ | ✅ |
| Others | File | ❌ | ❌ |

### Color Tokens (Dark Theme)

```css
--status-idle: #6b7280;      /* 灰色 */
--status-busy: #10b981;      /* 绿色 */
--status-offline: #4b5563;   /* 深灰 */
--status-error: #ef4444;     /* 红色 */
--bg-primary: #09090b;       /* 背景 */
--bg-secondary: #18181b;     /* 卡片背景 */
--text-primary: #fafafa;     /* 主文字 */
--text-secondary: #a1a1aa;   /* 次要文字 */
```
