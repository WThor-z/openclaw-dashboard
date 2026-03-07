import React, { useMemo, useState } from "react";

export type ApprovalItem = {
  id: string;
  summary: string;
  status: "pending" | "resolved";
};

type ApprovalsPanelProps = {
  approvals: ApprovalItem[];
  failedApprovalIds: Set<string>;
  submittingId: string | null;
  onResolve: (approvalId: string, decision: "approve" | "reject") => Promise<void>;
};

export function ApprovalsPanel({
  approvals,
  failedApprovalIds,
  submittingId,
  onResolve
}: ApprovalsPanelProps) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  
  const target = useMemo(
    () => approvals.find((item) => item.id === confirmingId) ?? null,
    [approvals, confirmingId]
  );

  const pendingCount = approvals.filter(a => a.status === "pending").length;
  const resolvedCount = approvals.filter(a => a.status === "resolved").length;

  if (approvals.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">✅</div>
        <div className="empty-state-title">暂无审批</div>
        <div className="empty-state-description">当前没有需要处理的审批请求</div>
      </div>
    );
  }

  return (
    <div className="approvals-panel">
      <div className="approvals-stats">
        <div className="approval-stat pending">
          <span className="approval-stat-count">{pendingCount}</span>
          <span className="approval-stat-label">待处理</span>
        </div>
        <div className="approval-stat resolved">
          <span className="approval-stat-count">{resolvedCount}</span>
          <span className="approval-stat-label">已处理</span>
        </div>
      </div>

      <div className="approvals-list">
        {approvals.map((approval) => {
          const isPending = approval.status === "pending";
          const isSubmitting = submittingId === approval.id;
          const hasFailed = failedApprovalIds.has(approval.id);
          
          return (
            <div 
              key={approval.id}
              data-testid="approval-row"
              className={`approval-card ${approval.status} ${hasFailed ? 'failed' : ''}`}
            >
              <div className="approval-header">
                <span className={`badge badge-${isPending ? 'orange' : 'green'}`}>
                  {isPending ? "待审批" : "已处理"}
                </span>
                <span className="approval-id">{approval.id}</span>
              </div>
              
              <div className="approval-content">
                <div className="approval-summary">{approval.summary}</div>
              </div>
              
              {isPending && (
                <div className="approval-actions">
                  <button
                    data-testid={hasFailed ? "retry-approval-button" : "approve-button"}
                    className="btn btn-success btn-sm"
                    disabled={isSubmitting}
                    onClick={() => setConfirmingId(approval.id)}
                    type="button"
                  >
                    {isSubmitting ? (
                      <>⏳ 处理中...</>
                    ) : hasFailed ? (
                      <>🔄 重试</>
                    ) : (
                      <>✓ 批准</>
                    )}
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    disabled={isSubmitting}
                    onClick={() => setConfirmingId(approval.id)}
                    type="button"
                  >
                    ✕ 拒绝
                  </button>
                </div>
              )}
              
              {hasFailed && isPending && (
                <div className="approval-error">
                  ⚠️ 上次处理失败，请重试
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Confirmation Modal */}
      {target && (
        <div className="modal-overlay" onClick={() => setConfirmingId(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">确认审批</h3>
            </div>
            <div className="modal-body">
              <p>您确定要处理此审批请求吗？</p>
              <div className="approval-preview">
                <strong>{target.summary}</strong>
                <br />
                <span className="text-muted">ID: {target.id}</span>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setConfirmingId(null)}
                type="button"
              >
                取消
              </button>
              <button
                data-testid="confirm-approve-button"
                className="btn btn-success"
                disabled={submittingId === target.id}
                onClick={async () => {
                  await onResolve(target.id, "approve");
                  setConfirmingId(null);
                }}
                type="button"
              >
                {submittingId === target.id ? "处理中..." : "确认批准"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .approvals-panel {
          display: flex;
          flex-direction: column;
          gap: var(--space-6);
        }

        .approvals-stats {
          display: flex;
          gap: var(--space-4);
        }

        .approval-stat {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: var(--space-4) var(--space-6);
          background: linear-gradient(180deg, #ffffff, #f8fafc);
          border-radius: 1rem;
          min-width: 100px;
          box-shadow: var(--shadow-sm);
        }

        .approval-stat.pending {
          border: 2px solid var(--color-warning-500);
        }

        .approval-stat.resolved {
          border: 2px solid var(--color-success-500);
        }

        .approval-stat-count {
          font-size: var(--text-2xl);
          font-weight: var(--font-bold);
          color: var(--color-text-primary);
        }

        .approval-stat-label {
          font-size: var(--text-xs);
          color: var(--color-text-secondary);
          margin-top: var(--space-1);
        }

        .approvals-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }

        .approval-card {
          padding: var(--space-4);
          background: linear-gradient(180deg, #ffffff, #f7f9fc);
          border: 1px solid var(--color-border-light);
          border-radius: 1rem;
          border-left: 4px solid var(--color-border);
          box-shadow: var(--shadow-sm);
        }

        .approval-card.pending {
          border-left-color: var(--color-warning-500);
        }

        .approval-card.resolved {
          border-left-color: var(--color-success-500);
        }

        .approval-card.failed {
          border-left-color: var(--color-error-500);
        }

        .approval-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: var(--space-3);
        }

        .approval-id {
          font-size: var(--text-xs);
          color: var(--color-text-muted);
          font-family: var(--font-mono);
        }

        .approval-content {
          margin-bottom: var(--space-3);
        }

        .approval-summary {
          font-size: var(--text-sm);
          font-weight: var(--font-medium);
          color: var(--color-text-primary);
          line-height: 1.6;
        }

        .approval-actions {
          display: flex;
          gap: var(--space-3);
        }

        .approval-error {
          margin-top: var(--space-3);
          padding: var(--space-2) var(--space-3);
          background-color: var(--color-error-50);
          color: var(--color-error-600);
          border-radius: var(--radius-md);
          font-size: var(--text-sm);
        }

        .approval-preview {
          margin-top: var(--space-4);
          padding: var(--space-4);
          background-color: var(--color-bg-secondary);
          border-radius: var(--radius-md);
          text-align: center;
          border: 1px solid var(--color-border-light);
        }

        .text-muted {
          color: var(--color-text-muted);
        }
      `}</style>
    </div>
  );
}
