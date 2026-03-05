import React, { useCallback, useEffect, useMemo, useState } from "react";

type WorkspaceSnapshotItem = {
  workspace: string;
  fileCount: number;
  totalBytes: number;
  hotFileCount: number;
  hotFiles?: Array<{ path: string; sizeBytes: number; modifiedAt: string }>;
  failureMarkers?: string[];
};

type OpenclawSnapshot = {
  status: string;
  exists: boolean;
  missingCount?: number;
  expectedFiles?: Array<{ path: string; exists: boolean }>;
};

export function MonitoringPanel() {
  const [workspaceItems, setWorkspaceItems] = useState<WorkspaceSnapshotItem[]>([]);
  const [openclawSnapshot, setOpenclawSnapshot] = useState<OpenclawSnapshot | null>(null);
  const [selectedWorkspace, setSelectedWorkspace] = useState<WorkspaceSnapshotItem | null>(null);

  const loadMonitoring = useCallback(async () => {
    try {
      const [workspacesResponse, openclawResponse] = await Promise.all([
        fetch("/api/monitors/workspaces"),
        fetch("/api/monitors/openclaw")
      ]);

      if (workspacesResponse.ok) {
        const workspacesBody = (await workspacesResponse.json()) as {
          items?: WorkspaceSnapshotItem[];
        };
        setWorkspaceItems(workspacesBody.items ?? []);
      }

      if (openclawResponse.ok) {
        const openclawBody = (await openclawResponse.json()) as {
          snapshot?: OpenclawSnapshot;
        };
        setOpenclawSnapshot(openclawBody.snapshot ?? null);
      }
    } catch {
      setWorkspaceItems([]);
      setOpenclawSnapshot(null);
    }
  }, []);

  useEffect(() => {
    void loadMonitoring();

    const intervalId = window.setInterval(() => {
      void loadMonitoring();
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadMonitoring]);

  const selectedWorkspaceDetails = useMemo(() => selectedWorkspace, [selectedWorkspace]);

  return (
    <section aria-label="Monitoring panel">
      <h2>Workspace and .openclaw Monitoring</h2>
      <div data-testid="openclaw-status-indicator">
        .openclaw status: {openclawSnapshot?.status ?? "not_collected"}
      </div>
      <p>
        Sensitive values: <span data-testid="redaction-indicator">[REDACTED]</span>
      </p>

      <ul>
        {workspaceItems.map((item) => (
          <li data-testid="workspace-monitor-card" key={item.workspace}>
            <strong>{item.workspace}</strong>
            <div>Files: {item.fileCount}</div>
            <div>Total bytes: {item.totalBytes}</div>
            <div>Hot files: {item.hotFileCount}</div>
            <button onClick={() => setSelectedWorkspace(item)} type="button">
              View details
            </button>
          </li>
        ))}
      </ul>

      {selectedWorkspaceDetails ? (
        <div aria-modal="true" data-testid="monitor-detail-drawer" role="dialog">
          <p>Workspace: {selectedWorkspaceDetails.workspace}</p>
          <p>Failure markers: {(selectedWorkspaceDetails.failureMarkers ?? []).join(", ") || "none"}</p>
          <ul>
            {(selectedWorkspaceDetails.hotFiles ?? []).map((file) => (
              <li key={file.path}>
                {file.path} ({file.sizeBytes} bytes)
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <h3>.openclaw expected files</h3>
        <ul>
          {(openclawSnapshot?.expectedFiles ?? []).map((entry) => (
            <li key={entry.path}>
              {entry.path}: {entry.exists ? "ok" : "missing"}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
