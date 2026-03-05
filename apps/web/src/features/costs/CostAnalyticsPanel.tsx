import React, { useMemo, useState } from "react";

export type CostDay = {
  date: string;
  amountUsd: number;
  entryCount: number;
  model?: string;
};

type CostAnalyticsPanelProps = {
  days: CostDay[];
};

const ANOMALY_THRESHOLD_USD = 1;

export function CostAnalyticsPanel({ days }: CostAnalyticsPanelProps) {
  const [modelFilter, setModelFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const modelOptions = useMemo(() => {
    const values = new Set(days.map((day) => day.model ?? "all"));
    return ["all", ...[...values].filter((value) => value !== "all")];
  }, [days]);

  const filteredDays = useMemo(
    () =>
      days.filter((day) => {
        const matchesModel = modelFilter === "all" || (day.model ?? "all") === modelFilter;
        const matchesFrom = !fromDate || day.date >= fromDate;
        const matchesTo = !toDate || day.date <= toDate;
        return matchesModel && matchesFrom && matchesTo;
      }),
    [days, fromDate, modelFilter, toDate]
  );

  return (
    <section aria-label="Cost analytics panel">
      <h2>Cost Analytics</h2>

      <label htmlFor="cost-model-filter">Model</label>
      <select
        id="cost-model-filter"
        data-testid="cost-model-filter"
        value={modelFilter}
        onChange={(event) => setModelFilter(event.target.value)}
      >
        {modelOptions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>

      <label htmlFor="cost-from-date">From</label>
      <input
        id="cost-from-date"
        data-testid="cost-from-date"
        type="date"
        value={fromDate}
        onChange={(event) => setFromDate(event.target.value)}
      />

      <label htmlFor="cost-to-date">To</label>
      <input
        id="cost-to-date"
        data-testid="cost-to-date"
        type="date"
        value={toDate}
        onChange={(event) => setToDate(event.target.value)}
      />

      <ul>
        {filteredDays.map((day) => (
          <li data-testid="cost-row" key={`${day.date}-${day.model ?? "all"}`}>
            <span>{day.date}</span> - <strong>${day.amountUsd.toFixed(2)}</strong> ({day.entryCount} entries)
            {day.amountUsd >= ANOMALY_THRESHOLD_USD ? (
              <span data-testid="cost-anomaly-badge"> Anomaly</span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
