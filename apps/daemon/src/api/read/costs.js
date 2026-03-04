import { sendJson } from "../../middleware/error-handler.js";

export function handleDailyCostsRead(res, repositories) {
  const rows = repositories?.costEntries?.rollupDaily
    ? repositories.costEntries.rollupDaily()
    : [];

  const days = rows.map((row) => ({
    date: row.date,
    amountUsd: Number(row.amountUsd),
    entryCount: Number(row.entryCount)
  }));

  sendJson(res, 200, { days });
}
