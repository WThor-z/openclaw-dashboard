import React, { useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar
} from "recharts";

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

function formatDate(dateStr: string) {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

function formatCurrency(value: number) {
  return `$${value.toFixed(2)}`;
}

export function CostAnalyticsPanel({ days }: CostAnalyticsPanelProps) {
  const [modelFilter, setModelFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [chartType, setChartType] = useState<"area" | "bar">("area");

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

  const stats = useMemo(() => {
    if (filteredDays.length === 0) return null;
    const total = filteredDays.reduce((sum, day) => sum + day.amountUsd, 0);
    const avg = total / filteredDays.length;
    const max = Math.max(...filteredDays.map((day) => day.amountUsd));
    const anomalies = filteredDays.filter((day) => day.amountUsd >= ANOMALY_THRESHOLD_USD).length;
    return { total, avg, max, anomalies };
  }, [filteredDays]);

  const chartData = useMemo(() => {
    return filteredDays.map((day) => ({
      date: formatDate(day.date),
      fullDate: day.date,
      amount: day.amountUsd,
      entries: day.entryCount,
      isAnomaly: day.amountUsd >= ANOMALY_THRESHOLD_USD
    }));
  }, [filteredDays]);

  return (
    <div className="cost-analytics">
      {/* Stats Overview */}
      {stats && (
        <div className="stats-row">
          <div className="stat-box">
            <div className="stat-box-label">总成本</div>
            <div className="stat-box-value">{formatCurrency(stats.total)}</div>
          </div>
          <div className="stat-box">
            <div className="stat-box-label">日均成本</div>
            <div className="stat-box-value">{formatCurrency(stats.avg)}</div>
          </div>
          <div className="stat-box">
            <div className="stat-box-label">峰值</div>
            <div className="stat-box-value">{formatCurrency(stats.max)}</div>
          </div>
          <div className="stat-box">
            <div className="stat-box-label">异常数</div>
            <div className={`stat-box-value ${stats.anomalies > 0 ? 'text-error' : ''}`}>
              {stats.anomalies}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="filters-row">
        <div className="filter-group">
          <label className="form-label">模型</label>
          <select
            id="cost-model-filter"
            data-testid="cost-model-filter"
            className="select"
            value={modelFilter}
            onChange={(e) => setModelFilter(e.target.value)}
          >
            {modelOptions.map((option) => (
              <option key={option} value={option}>
                {option === "all" ? "全部模型" : option}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label className="form-label">开始日期</label>
          <input
            id="cost-from-date"
            data-testid="cost-from-date"
            type="date"
            className="input"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </div>

        <div className="filter-group">
          <label className="form-label">结束日期</label>
          <input
            id="cost-to-date"
            data-testid="cost-to-date"
            type="date"
            className="input"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>

        <div className="filter-group">
          <label className="form-label">图表类型</label>
          <div className="button-group">
            <button
              className={`btn btn-sm ${chartType === "area" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setChartType("area")}
            >
              面积图
            </button>
            <button
              className={`btn btn-sm ${chartType === "bar" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setChartType("bar")}
            >
              柱状图
            </button>
          </div>
        </div>
      </div>

      {/* Chart */}
      {filteredDays.length > 0 ? (
        <div className="chart-container">
          <ResponsiveContainer width="100%" height={300}>
            {chartType === "area" ? (
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis 
                  dataKey="date" 
                  stroke="var(--color-text-muted)"
                  fontSize={12}
                />
                <YAxis 
                  stroke="var(--color-text-muted)"
                  fontSize={12}
                  tickFormatter={(value) => `$${value}`}
                />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: 'var(--color-bg-card)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px',
                    color: 'var(--color-text-primary)'
                  }}
                  formatter={(value) => [formatCurrency(Number(value)), '成本']}
                />
                
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorAmount)"
                />
              </AreaChart>
            ) : (
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis 
                  dataKey="date" 
                  stroke="var(--color-text-muted)"
                  fontSize={12}
                />
                <YAxis 
                  stroke="var(--color-text-muted)"
                  fontSize={12}
                  tickFormatter={(value) => `$${value}`}
                />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: 'var(--color-bg-card)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px',
                    color: 'var(--color-text-primary)'
                  }}
                  formatter={(value) => [formatCurrency(Number(value)), '成本']}
                />
                
                <Bar 
                  dataKey="amount" 
                  fill="#3b82f6"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon">📊</div>
          <div className="empty-state-title">暂无数据</div>
          <div className="empty-state-description">
            当前时间范围内没有成本数据
          </div>
        </div>
      )}

      {/* Data Table */}
      {filteredDays.length > 0 && (
        <div className="data-table">
          <table>
            <thead>
              <tr>
                <th>日期</th>
                <th>模型</th>
                <th>成本</th>
                <th>调用次数</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {filteredDays.slice().reverse().map((day) => (
                <tr 
                  key={`${day.date}-${day.model ?? "all"}`}
                  data-testid="cost-row"
                  className={day.amountUsd >= ANOMALY_THRESHOLD_USD ? 'anomaly' : ''}
                >
                  <td>{day.date}</td>
                  <td>{day.model || "默认"}</td>
                  <td className="numeric">{formatCurrency(day.amountUsd)}</td>
                  <td className="numeric">{day.entryCount}</td>
                  <td>
                    {day.amountUsd >= ANOMALY_THRESHOLD_USD ? (
                      <span className="badge badge-red" data-testid="cost-anomaly-badge">
                        异常
                      </span>
                    ) : (
                      <span className="badge badge-green">正常</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <style>{`
        .cost-analytics {
          display: flex;
          flex-direction: column;
          gap: var(--space-6);
        }

        .stats-row {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: var(--space-4);
        }

        @media (max-width: 768px) {
          .stats-row {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        .stat-box {
          padding: var(--space-4);
          background-color: var(--color-bg-secondary);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          text-align: center;
        }

        .stat-box-label {
          font-size: var(--text-xs);
          color: var(--color-text-muted);
          margin-bottom: var(--space-1);
        }

        .stat-box-value {
          font-size: var(--text-xl);
          font-weight: var(--font-bold);
          color: var(--color-text-primary);
        }

        .stat-box-value.text-error {
          color: var(--color-error-500);
        }

        .filters-row {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-4);
          align-items: flex-end;
        }

        .filter-group {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
          min-width: 150px;
        }

        .button-group {
          display: flex;
          gap: var(--space-1);
        }

        .chart-container {
          background-color: var(--color-bg-secondary);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          padding: var(--space-4);
        }

        .data-table {
          overflow-x: auto;
        }

        .data-table table {
          width: 100%;
          border-collapse: collapse;
        }

        .data-table th,
        .data-table td {
          padding: var(--space-3) var(--space-4);
          text-align: left;
          border-bottom: 1px solid var(--color-border);
        }

        .data-table th {
          font-size: var(--text-xs);
          font-weight: var(--font-semibold);
          text-transform: uppercase;
          color: var(--color-text-muted);
          background-color: var(--color-bg-tertiary);
        }

        .data-table td {
          font-size: var(--text-sm);
          color: var(--color-text-primary);
        }

        .data-table td.numeric {
          font-family: var(--font-mono);
          text-align: right;
        }

        .data-table tr:hover {
          background-color: var(--color-bg-hover);
        }

        .data-table tr.anomaly {
          background-color: var(--color-error-50);
        }

        [data-theme="dark"] .data-table tr.anomaly {
          background-color: rgba(239, 68, 68, 0.1);
        }
      `}</style>
    </div>
  );
}
