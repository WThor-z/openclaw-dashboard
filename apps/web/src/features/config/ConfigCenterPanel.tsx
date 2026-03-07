import React from "react";

export type ConfigDiffEntry = {
  path: string;
  before: unknown;
  after: unknown;
};

export type ConfigPreview = {
  baseVersion: number;
  diff: ConfigDiffEntry[];
};

type ConfigCenterPanelProps = {
  modelValue: string;
  temperatureValue: string;
  currentVersion: number;
  validationError: string | null;
  preview: ConfigPreview | null;
  previewOpen: boolean;
  canApply: boolean;
  isPreviewing: boolean;
  isApplying: boolean;
  onModelChange: (nextValue: string) => void;
  onTemperatureChange: (nextValue: string) => void;
  onPreview: () => void;
  onApply: () => void;
  onClosePreview: () => void;
};

export function ConfigCenterPanel({
  modelValue,
  temperatureValue,
  currentVersion,
  validationError,
  preview,
  previewOpen,
  canApply,
  isPreviewing,
  isApplying,
  onModelChange,
  onTemperatureChange,
  onPreview,
  onApply,
  onClosePreview
}: ConfigCenterPanelProps) {
  return (
    <section aria-label="Config center panel" className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-[#1f5ba6]">Config Center</p>
        <h2 className="mt-3 text-2xl font-semibold text-slate-900" style={{ fontFamily: "var(--font-serif)" }}>Model Controls</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600" data-testid="current-config-view">
          Current config view: model={modelValue || "(unset)"}, temperature={temperatureValue || "(unset)"}
        </p>
        <p className="mt-3 inline-flex rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm" data-testid="config-version-badge">
          Version: {currentVersion}
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="form-group !mb-0">
          <label htmlFor="config-model-input" className="form-label">Model</label>
          <input
            id="config-model-input"
            data-testid="config-model-input"
            type="text"
            className="input input-lg"
            value={modelValue}
            onChange={(event) => onModelChange(event.target.value)}
          />
        </div>

        <div className="form-group !mb-0">
          <label htmlFor="config-temperature-input" className="form-label">Temperature</label>
          <input
            id="config-temperature-input"
            data-testid="config-temperature-input"
            type="text"
            className="input input-lg"
            value={temperatureValue}
            onChange={(event) => onTemperatureChange(event.target.value)}
          />
        </div>
      </div>

      {validationError ? <p role="alert" className="rounded-xl border border-[#f8d9d4] bg-[#fcf0ee] px-4 py-3 text-sm text-[#8c4338]">{validationError}</p> : null}

      <div className="flex flex-wrap gap-3">
        <button
          data-testid="preview-diff-button"
          className="btn btn-secondary"
          disabled={isPreviewing || Boolean(validationError)}
          onClick={onPreview}
          type="button"
        >
          {isPreviewing ? "Previewing..." : "Preview diff"}
        </button>
        <button
          data-testid="apply-config-button"
          className="btn btn-primary"
          disabled={!canApply || isApplying || Boolean(validationError)}
          onClick={onApply}
          type="button"
        >
          {isApplying ? "Applying..." : "Apply config"}
        </button>
      </div>

      {previewOpen && preview ? (
        <div aria-modal="true" data-testid="config-diff-modal" role="dialog" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-900">Config diff preview (base version {preview.baseVersion})</p>
          <ul className="mt-4 space-y-2 text-sm text-slate-700">
            {preview.diff.length > 0 ? (
              preview.diff.map((entry) => (
                <li key={entry.path} className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-3">
                  <strong>{entry.path}</strong>: {JSON.stringify(entry.before)} -&gt; {JSON.stringify(entry.after)}
                </li>
              ))
            ) : (
              <li className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-3">No changes detected</li>
            )}
          </ul>
          <button onClick={onClosePreview} type="button" className="btn btn-ghost mt-4">
            Close preview
          </button>
        </div>
      ) : null}
    </section>
  );
}
