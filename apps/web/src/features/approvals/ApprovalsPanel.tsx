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

  return (
    <section aria-label="Approvals panel">
      <h2>Approvals</h2>
      <ul>
        {approvals.map((approval) => {
          const isPending = approval.status === "pending";
          const isSubmitting = submittingId === approval.id;
          const showRetry = isPending && failedApprovalIds.has(approval.id);
          return (
            <li data-testid="approval-row" key={approval.id}>
              <span>{approval.summary}</span> - <strong>{approval.status}</strong>{" "}
              {isPending ? (
                <button
                  data-testid="approve-button"
                  disabled={isSubmitting}
                  onClick={() => setConfirmingId(approval.id)}
                  type="button"
                >
                  {isSubmitting ? "Approving..." : "Approve"}
                </button>
              ) : null}
              {showRetry ? (
                <button
                  data-testid="retry-approval-button"
                  disabled={isSubmitting}
                  onClick={() => setConfirmingId(approval.id)}
                  type="button"
                >
                  Retry
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>

      {target ? (
        <div aria-modal="true" role="dialog">
          <p>Resolve approval {target.id}?</p>
          <button
            data-testid="confirm-approve-button"
            disabled={submittingId === target.id}
            onClick={async () => {
              await onResolve(target.id, "approve");
              setConfirmingId(null);
            }}
            type="button"
          >
            Confirm approve
          </button>
          <button
            disabled={submittingId === target.id}
            onClick={() => setConfirmingId(null)}
            type="button"
          >
            Cancel
          </button>
        </div>
      ) : null}
    </section>
  );
}
