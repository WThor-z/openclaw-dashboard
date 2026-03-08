import React, { ReactNode, createContext, useCallback, useContext, useMemo, useState } from "react";

export type Locale = "en" | "zh-CN";

type TranslationValue = string;
type TranslationDictionary = Record<string, TranslationValue>;

const LOCALE_STORAGE_KEY = "dashboard.locale";

const translations: Record<Locale, TranslationDictionary> = {
  en: {
    "common.lang.en": "English",
    "common.lang.zh": "中文",
    "common.switchToEnglish": "Switch to English",
    "common.switchToChinese": "切换到中文",
    "common.cancel": "Cancel",
    "common.confirm": "Confirm",
    "common.delete": "Delete",
    "common.move": "Move",

    "login.subtitle": "Local-first control plane for AI agents",
    "login.tokenLabel": "Access Token",
    "login.tokenPlaceholder": "Enter your access token...",
    "login.tokenHint": "The token is usually provided by your administrator.",
    "login.error.tokenRequired": "Please enter an access token",
    "login.error.invalidToken": "Invalid token. Please verify and retry",
    "login.error.verifyFailed": "Token verification failed. Please try again",
    "login.error.daemonUnavailable": "Unable to verify token. Please make sure the daemon is running",
    "login.connecting": "Connecting...",
    "login.enterConsole": "Enter Console",
    "login.footer.tagline": "Local-first · Secure by design · Open source",

    "dashboard.group.core": "Core",
    "dashboard.group.operations": "Operations",
    "dashboard.group.health": "Health",
    "dashboard.module.overview": "Overview",
    "dashboard.module.events": "Events",
    "dashboard.module.tasks": "Tasks",
    "dashboard.module.approvals": "Approvals",
    "dashboard.module.config": "Config",
    "dashboard.module.sessions": "Sessions",
    "dashboard.module.webhooks": "Webhooks",
    "dashboard.module.costs": "Costs",
    "dashboard.module.monitoring": "Monitoring",
    "dashboard.user.admin": "Admin",
    "dashboard.action.exit": "Exit",
    "dashboard.menu.toggle": "Toggle menu",
    "dashboard.connection.connected": "connected",
    "dashboard.connection.disconnected": "disconnected",
    "dashboard.connection.loading": "loading",
    "dashboard.connection.degraded": "degraded",
    "dashboard.page.overview.title": "Control Plane",
    "dashboard.page.overview.subtitle": "Track key status, tasks, and approvals in one canvas.",
    "dashboard.page.events.title": "Event Center",
    "dashboard.page.events.subtitle": "Follow critical events and quickly locate source and severity.",
    "dashboard.page.tasks.title": "Task Queue",
    "dashboard.page.tasks.subtitle": "Monitor execution state and work through pending tasks.",
    "dashboard.page.approvals.title": "Approval Center",
    "dashboard.page.approvals.subtitle": "Handle manual approvals and failed retries in one place.",
    "dashboard.page.config.title": "Config Center",
    "dashboard.page.config.subtitle": "Preview config diffs and safely publish into runtime.",
    "dashboard.page.costs.title": "Cost Analytics",
    "dashboard.page.costs.subtitle": "Observe cost trends and identify optimization windows.",
    "dashboard.page.sessions.title": "Session Explorer",
    "dashboard.page.sessions.subtitle": "Search sessions and drill down into timeline details.",
    "dashboard.page.webhooks.title": "Webhook Management",
    "dashboard.page.webhooks.subtitle": "Manage webhook status and delivery entrypoints.",
    "dashboard.page.monitoring.title": "System Monitoring",
    "dashboard.page.monitoring.subtitle": "Track core health metrics and catch anomalies early.",
    "dashboard.section.recentEvents": "Recent Events",
    "dashboard.section.pendingApprovals": "Pending Approvals",
    "dashboard.section.eventTimeline": "Event Timeline",
    "dashboard.section.taskQueue": "Task Queue",
    "dashboard.section.approvalManagement": "Approval Management",
    "dashboard.section.configCenter": "Config Center",
    "dashboard.section.costAnalytics": "Cost Analytics",
    "dashboard.section.sessionExplorer": "Session Explorer",
    "dashboard.section.webhookManagement": "Webhook Management",
    "dashboard.section.systemMonitoring": "System Monitoring",
    "dashboard.meta.lastUpdate": "Last update: {value}",
    "dashboard.status.approvalResolved": "Approval resolved",
    "dashboard.status.approvalFailed": "Failed to resolve approval",
    "dashboard.status.modelRequired": "Model is required",
    "dashboard.status.temperatureNumber": "Temperature must be a number",
    "dashboard.status.armFailed": "Failed to arm write operations",
    "dashboard.status.diffFailed": "Failed to generate config diff",
    "dashboard.status.diffReady": "Config diff is ready",
    "dashboard.status.previewFailed": "Config preview failed",
    "dashboard.status.applyFailed": "Failed to apply config",
    "dashboard.status.applied": "Configuration applied",
    "dashboard.status.loadSessionFailed": "Failed to load session details",
    "dashboard.status.unknown": "unknown",

    "workspace.sidebar.section": "Workspace",
    "workspace.sidebar.title": "Agent Workspace",
    "workspace.sidebar.overview": "Overview",
    "workspace.sidebar.workspaces": "Workspaces",
    "workspace.sidebar.configuration": "Configuration",
    "workspace.sidebar.pinnedFiles": "Pinned Files",
    "workspace.sidebar.noWorkspaces": "No workspaces yet.",
    "workspace.sidebar.noAgentsForPinned": "No agents available for pinned-file configuration.",

    "workspace.overview.title": "Agent Workspace",
    "workspace.overview.card.overview": "Overview",
    "workspace.overview.card.online": "Online",
    "workspace.overview.trackedAgents": "Tracked agents in this workspace",
    "workspace.overview.openPreviewHint": "Click any agent card to open a markdown preview drawer.",
    "workspace.preview.label": "Preview",
    "workspace.preview.close": "Close",
    "workspace.preview.unavailable": "Preview unavailable",
    "workspace.preview.none": "No pinned markdown files",
    "workspace.preview.noneHint": "Choose files under Configuration -> Pinned Files to control what appears in this preview.",
    "workspace.preview.open": "Open",
    "workspace.preview.modifiedUnknown": "Modified: unknown",
    "workspace.preview.modifiedPrefix": "Modified: {value}",

    "workspace.pinned.title": "Pinned Files",
    "workspace.pinned.unavailable": "Pinned files unavailable",
    "workspace.pinned.configuration": "Configuration",
    "workspace.pinned.selectForAgent": "Choose which markdown files should be pinned for this agent's preview drawer.",
    "workspace.pinned.agent": "Agent",
    "workspace.pinned.selectedCount": "{count} selected",
    "workspace.pinned.noMarkdown": "No markdown files found",
    "workspace.pinned.noMarkdownHint": "This agent does not currently expose previewable markdown files.",
    "workspace.pinned.backToOverview": "Back to overview",

    "workspace.browser.title": "Full Workspace",
    "workspace.browser.hint": "Right click for actions · Drag files/folders to move",
    "workspace.browser.selectFile": "Select a file to view content.",
    "workspace.browser.selectedDirectory": "Selected path is a directory.",
    "workspace.browser.readOnly": "Read only",
    "workspace.browser.edit": "Edit",
    "workspace.browser.backToPreview": "Back to preview",
    "workspace.browser.newFile": "New File",
    "workspace.browser.newFolder": "New Folder",
    "workspace.browser.rename": "Rename",
    "workspace.browser.moveTo": "Move to...",
    "workspace.browser.createFile": "Create File (.md/.txt)",
    "workspace.browser.createFolder": "Create Folder",
    "workspace.browser.renameKind": "Rename {kind}",
    "workspace.browser.deleteKind": "Delete {kind}",
    "workspace.browser.deleteFolderPrompt": "Delete folder {path} and all nested files?",
    "workspace.browser.deleteFilePrompt": "Delete file {path}?",
    "workspace.browser.targetDirectory": "Target directory: {path}",
    "workspace.browser.currentPath": "Current path: {path}",
    "workspace.browser.moveKind": "Move {kind}",
    "workspace.browser.moveTargetDirectory": "Target Directory"
  },
  "zh-CN": {
    "common.lang.en": "English",
    "common.lang.zh": "中文",
    "common.switchToEnglish": "Switch to English",
    "common.switchToChinese": "切换到中文",
    "common.cancel": "取消",
    "common.confirm": "确认",
    "common.delete": "删除",
    "common.move": "移动",

    "login.subtitle": "本地优先的 AI 代理控制面板",
    "login.tokenLabel": "访问令牌",
    "login.tokenPlaceholder": "输入您的访问令牌...",
    "login.tokenHint": "令牌通常由管理员提供，用于验证您的身份",
    "login.error.tokenRequired": "请输入访问令牌",
    "login.error.invalidToken": "访问令牌无效，请检查后重试",
    "login.error.verifyFailed": "令牌验证失败，请稍后重试",
    "login.error.daemonUnavailable": "无法验证访问令牌，请确认 daemon 已启动",
    "login.connecting": "连接中...",
    "login.enterConsole": "进入控制台",
    "login.footer.tagline": "本地优先 · 安全可控 · 开源免费",

    "dashboard.group.core": "核心",
    "dashboard.group.operations": "运维",
    "dashboard.group.health": "健康",
    "dashboard.module.overview": "总览",
    "dashboard.module.events": "事件",
    "dashboard.module.tasks": "任务",
    "dashboard.module.approvals": "审批",
    "dashboard.module.config": "配置",
    "dashboard.module.sessions": "会话",
    "dashboard.module.webhooks": "Webhooks",
    "dashboard.module.costs": "成本",
    "dashboard.module.monitoring": "监控",
    "dashboard.user.admin": "管理员",
    "dashboard.action.exit": "退出登录",
    "dashboard.menu.toggle": "切换菜单",
    "dashboard.connection.connected": "已连接",
    "dashboard.connection.disconnected": "已断开",
    "dashboard.connection.loading": "加载中",
    "dashboard.connection.degraded": "降级",
    "dashboard.page.overview.title": "控制面板",
    "dashboard.page.overview.subtitle": "在一个画布中查看关键状态、任务和审批。",
    "dashboard.page.events.title": "事件管理",
    "dashboard.page.events.subtitle": "追踪关键事件并快速定位来源与级别。",
    "dashboard.page.tasks.title": "任务队列",
    "dashboard.page.tasks.subtitle": "关注执行状态并处理待运行任务。",
    "dashboard.page.approvals.title": "审批中心",
    "dashboard.page.approvals.subtitle": "集中处理人工审批与失败重试。",
    "dashboard.page.config.title": "配置中心",
    "dashboard.page.config.subtitle": "预览配置差异并安全发布到运行环境。",
    "dashboard.page.costs.title": "成本分析",
    "dashboard.page.costs.subtitle": "观察成本趋势并判断优化窗口。",
    "dashboard.page.sessions.title": "会话探索",
    "dashboard.page.sessions.subtitle": "检索会话并下钻到详细时间线。",
    "dashboard.page.webhooks.title": "Webhook 管理",
    "dashboard.page.webhooks.subtitle": "管理 webhook 状态与投递入口。",
    "dashboard.page.monitoring.title": "系统监控",
    "dashboard.page.monitoring.subtitle": "查看核心健康指标并发现异常信号。",
    "dashboard.section.recentEvents": "最近事件",
    "dashboard.section.pendingApprovals": "待审批",
    "dashboard.section.eventTimeline": "事件时间线",
    "dashboard.section.taskQueue": "任务队列",
    "dashboard.section.approvalManagement": "审批管理",
    "dashboard.section.configCenter": "配置中心",
    "dashboard.section.costAnalytics": "成本分析",
    "dashboard.section.sessionExplorer": "会话探索",
    "dashboard.section.webhookManagement": "Webhook 管理",
    "dashboard.section.systemMonitoring": "系统监控",
    "dashboard.meta.lastUpdate": "上次更新: {value}",
    "dashboard.status.approvalResolved": "审批已处理",
    "dashboard.status.approvalFailed": "审批处理失败",
    "dashboard.status.modelRequired": "模型不能为空",
    "dashboard.status.temperatureNumber": "温度值必须是数字",
    "dashboard.status.armFailed": "启用写入失败",
    "dashboard.status.diffFailed": "配置对比失败",
    "dashboard.status.diffReady": "配置对比已就绪",
    "dashboard.status.previewFailed": "配置预览失败",
    "dashboard.status.applyFailed": "应用配置失败",
    "dashboard.status.applied": "配置已应用",
    "dashboard.status.loadSessionFailed": "加载会话详情失败",
    "dashboard.status.unknown": "未知",

    "workspace.sidebar.section": "工作区",
    "workspace.sidebar.title": "Agent Workspace",
    "workspace.sidebar.overview": "总览",
    "workspace.sidebar.workspaces": "工作区",
    "workspace.sidebar.configuration": "配置",
    "workspace.sidebar.pinnedFiles": "置顶文件",
    "workspace.sidebar.noWorkspaces": "暂无工作区。",
    "workspace.sidebar.noAgentsForPinned": "暂无可配置置顶文件的 agent。",

    "workspace.overview.title": "Agent Workspace",
    "workspace.overview.card.overview": "总览",
    "workspace.overview.card.online": "在线",
    "workspace.overview.trackedAgents": "当前工作区中的 agent 数量",
    "workspace.overview.openPreviewHint": "点击任意 agent 卡片可打开 markdown 预览抽屉。",
    "workspace.preview.label": "预览",
    "workspace.preview.close": "关闭",
    "workspace.preview.unavailable": "预览不可用",
    "workspace.preview.none": "暂无置顶 markdown 文件",
    "workspace.preview.noneHint": "请在 Configuration -> Pinned Files 中选择需要展示在预览中的文件。",
    "workspace.preview.open": "打开",
    "workspace.preview.modifiedUnknown": "修改时间：未知",
    "workspace.preview.modifiedPrefix": "修改时间：{value}",

    "workspace.pinned.title": "Pinned Files",
    "workspace.pinned.unavailable": "置顶文件不可用",
    "workspace.pinned.configuration": "配置",
    "workspace.pinned.selectForAgent": "选择要在该 agent 预览抽屉中展示的 markdown 文件。",
    "workspace.pinned.agent": "Agent",
    "workspace.pinned.selectedCount": "已选择 {count} 项",
    "workspace.pinned.noMarkdown": "未找到 markdown 文件",
    "workspace.pinned.noMarkdownHint": "该 agent 当前没有可预览的 markdown 文件。",
    "workspace.pinned.backToOverview": "返回总览",

    "workspace.browser.title": "完整工作区",
    "workspace.browser.hint": "右键执行操作 · 拖拽文件/文件夹可移动",
    "workspace.browser.selectFile": "请选择文件以查看内容。",
    "workspace.browser.selectedDirectory": "当前选择的是目录。",
    "workspace.browser.readOnly": "只读",
    "workspace.browser.edit": "编辑",
    "workspace.browser.backToPreview": "返回预览",
    "workspace.browser.newFile": "新建文件",
    "workspace.browser.newFolder": "新建文件夹",
    "workspace.browser.rename": "重命名",
    "workspace.browser.moveTo": "移动到...",
    "workspace.browser.createFile": "创建文件 (.md/.txt)",
    "workspace.browser.createFolder": "创建文件夹",
    "workspace.browser.renameKind": "重命名{kind}",
    "workspace.browser.deleteKind": "删除{kind}",
    "workspace.browser.deleteFolderPrompt": "删除文件夹 {path} 及其所有子文件？",
    "workspace.browser.deleteFilePrompt": "删除文件 {path}？",
    "workspace.browser.targetDirectory": "目标目录：{path}",
    "workspace.browser.currentPath": "当前路径：{path}",
    "workspace.browser.moveKind": "移动{kind}",
    "workspace.browser.moveTargetDirectory": "目标目录"
  }
};

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function detectInitialLocale(): Locale {
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
  if (stored === "en" || stored === "zh-CN") {
    return stored;
  }

  return "en";
}

function interpolate(template: string, params?: Record<string, string | number>) {
  if (!params) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = params[key];
    return value === undefined ? `{${key}}` : String(value);
  });
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => detectInitialLocale());

  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale);
    localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
    document.documentElement.lang = nextLocale;
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, params) => {
        const table = translations[locale] ?? translations.en;
        const fallback = translations.en[key] ?? key;
        const template = table[key] ?? fallback;
        return interpolate(template, params);
      }
    }),
    [locale, setLocale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error("useI18n must be used within I18nProvider");
  }

  return value;
}

export function LanguageSwitch() {
  const { locale, setLocale, t } = useI18n();

  return (
    <div className="language-switch">
      <button
        type="button"
        className={`language-switch-button ${locale === "en" ? "active" : ""}`}
        onClick={() => setLocale("en")}
        aria-label={t("common.switchToEnglish")}
      >
        {t("common.lang.en")}
      </button>
      <button
        type="button"
        className={`language-switch-button ${locale === "zh-CN" ? "active" : ""}`}
        onClick={() => setLocale("zh-CN")}
        aria-label={t("common.switchToChinese")}
      >
        {t("common.lang.zh")}
      </button>
    </div>
  );
}
