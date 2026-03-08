import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../app/auth.js";
import { MarkdownViewer } from "./MarkdownViewer.js";

const AUTOSAVE_KEY = "openclaw-markdown-editor-autosave";

type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface MarkdownEditorProps {
  agentId: string;
  filePath: string;
  initialContent: string;
  onSaved?: (meta: { modifiedAt: string }) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onRequestClose?: (guard: () => boolean) => void;
}

function createIdempotencyKey(seed: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${seed}-${crypto.randomUUID()}`;
  }
  return `${seed}-${Date.now()}`;
}

function loadAutosavePreference() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(AUTOSAVE_KEY) === "1";
}

export function MarkdownEditor({
  agentId,
  filePath,
  initialContent,
  onSaved,
  onDirtyChange,
  onRequestClose
}: MarkdownEditorProps) {
  const { token } = useAuth();
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [content, setContent] = useState(initialContent);
  const [autosaveEnabled, setAutosaveEnabled] = useState(loadAutosavePreference);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const lastSavedContentRef = useRef(initialContent);
  const lastErroredContentRef = useRef<string | null>(null);
  const previousFilePathRef = useRef(filePath);
  const saveInFlightRef = useRef(false);

  const isDirty = content !== lastSavedContentRef.current;

  useEffect(() => {
    previousFilePathRef.current = filePath;
    setContent(initialContent);
    lastSavedContentRef.current = initialContent;
    lastErroredContentRef.current = null;
    setSaveStatus("idle");
    setErrorMessage(null);
  }, [initialContent, filePath]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const armWrites = useCallback(async () => {
    const response = await fetch("/api/control/arm", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token ?? ""}`
      }
    });
    if (!response.ok) {
      throw new Error("Failed to arm writes");
    }
  }, [token]);

  const saveContent = useCallback(
    async (source: "manual" | "autosave") => {
      if (saveInFlightRef.current) return;

      saveInFlightRef.current = true;
      setSaveStatus("saving");
      setErrorMessage(null);

      try {
        await armWrites();

        const response = await fetch(
          `/api/control/agents/${encodeURIComponent(agentId)}/files/${encodeURIComponent(filePath)}`,
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${token ?? ""}`,
              "content-type": "application/json",
              "idempotency-key": createIdempotencyKey(`save-${source}`)
            },
            body: JSON.stringify({ content })
          }
        );

        if (!response.ok) {
          throw new Error("Failed to save file");
        }

        const body = (await response.json()) as { modifiedAt?: string };
        const modifiedAt =
          typeof body.modifiedAt === "string" && body.modifiedAt.length > 0
            ? body.modifiedAt
            : new Date().toISOString();

        lastSavedContentRef.current = content;
        lastErroredContentRef.current = null;
        setSaveStatus("saved");
        onSaved?.({ modifiedAt });
      } catch {
        lastErroredContentRef.current = content;
        setSaveStatus("error");
        setErrorMessage("Save failed. Please retry.");
      } finally {
        saveInFlightRef.current = false;
      }
    },
    [agentId, armWrites, content, filePath, onSaved, token]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(AUTOSAVE_KEY, autosaveEnabled ? "1" : "0");
  }, [autosaveEnabled]);

  useEffect(() => {
    if (!autosaveEnabled || !isDirty) return;
    if (lastErroredContentRef.current === content) return;

    const timeoutId = window.setTimeout(() => {
      void saveContent("autosave");
    }, 2000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [autosaveEnabled, content, isDirty, saveContent]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveContent("manual");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [saveContent]);

  const confirmLeave = useCallback(() => {
    if (!isDirty) return true;
    return window.confirm("You have unsaved changes. Discard them?");
  }, [isDirty]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isDirty]);

  useEffect(() => {
    if (!onRequestClose) return;
    onRequestClose(confirmLeave);
  }, [confirmLeave, onRequestClose]);

  const statusLabel = useMemo(() => {
    switch (saveStatus) {
      case "saving":
        return "Saving...";
      case "saved":
        return "Saved";
      case "error":
        return "Save error";
      default:
        return isDirty ? "Unsaved changes" : "Ready";
    }
  }, [isDirty, saveStatus]);

  return (
    <section className="card" aria-label="Markdown editor">
      <div className="card-header" style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)" }}>
        <div className="tabs" style={{ marginBottom: 0 }}>
          <button
            type="button"
            className={`tab ${mode === "edit" ? "active" : ""}`}
            onClick={() => setMode("edit")}
          >
            Edit
          </button>
          <button
            type="button"
            className={`tab ${mode === "preview" ? "active" : ""}`}
            onClick={() => setMode("preview")}
          >
            Preview
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)" }}>
            <input
              type="checkbox"
              checked={autosaveEnabled}
              onChange={(event) => setAutosaveEnabled(event.target.checked)}
            />
            Autosave
          </label>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void saveContent("manual")}
            disabled={saveInFlightRef.current}
          >
            Save
          </button>
        </div>
      </div>

      <div className="card-body" style={{ display: "grid", gap: "var(--space-3)" }}>
        {mode === "edit" ? (
          <textarea
            className="input"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            spellCheck={false}
            style={{
              minHeight: "280px",
              resize: "vertical",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
            }}
          />
        ) : (
          <MarkdownViewer content={content} />
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-2)" }}>
          <output className={`badge ${saveStatus === "error" ? "badge-red" : saveStatus === "saving" ? "badge-orange" : "badge-green"}`}>
            {statusLabel}
          </output>
          <span className="text-sm text-muted">Shortcut: Ctrl+S / Cmd+S</span>
        </div>

        {errorMessage ? <p className="form-error">{errorMessage}</p> : null}
      </div>
    </section>
  );
}
