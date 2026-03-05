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
    <section aria-label="Config center panel">
      <h2>Config Center</h2>
      <p data-testid="config-version-badge">Version: {currentVersion}</p>
      <p data-testid="current-config-view">
        Current config view: model={modelValue || "(unset)"}, temperature={temperatureValue || "(unset)"}
      </p>

      <label htmlFor="config-model-input">Model</label>
      <input
        id="config-model-input"
        data-testid="config-model-input"
        type="text"
        value={modelValue}
        onChange={(event) => onModelChange(event.target.value)}
      />

      <label htmlFor="config-temperature-input">Temperature</label>
      <input
        id="config-temperature-input"
        data-testid="config-temperature-input"
        type="text"
        value={temperatureValue}
        onChange={(event) => onTemperatureChange(event.target.value)}
      />

      {validationError ? <p role="alert">{validationError}</p> : null}

      <div>
        <button
          data-testid="preview-diff-button"
          disabled={isPreviewing || Boolean(validationError)}
          onClick={onPreview}
          type="button"
        >
          {isPreviewing ? "Previewing..." : "Preview diff"}
        </button>
        <button
          data-testid="apply-config-button"
          disabled={!canApply || isApplying || Boolean(validationError)}
          onClick={onApply}
          type="button"
        >
          {isApplying ? "Applying..." : "Apply config"}
        </button>
      </div>

      {previewOpen && preview ? (
        <div aria-modal="true" data-testid="config-diff-modal" role="dialog">
          <p>Config diff preview (base version {preview.baseVersion})</p>
          <ul>
            {preview.diff.length > 0 ? (
              preview.diff.map((entry) => (
                <li key={entry.path}>
                  <strong>{entry.path}</strong>: {JSON.stringify(entry.before)} -&gt; {JSON.stringify(entry.after)}
                </li>
              ))
            ) : (
              <li>No changes detected</li>
            )}
          </ul>
          <button onClick={onClosePreview} type="button">
            Close preview
          </button>
        </div>
      ) : null}
    </section>
  );
}
