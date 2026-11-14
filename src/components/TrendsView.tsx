import { useEffect, useState } from 'react';
import { vigilApi } from '../api/client.ts';
import type { HistoryResponse, IndicatorHistory } from '../shared/types.ts';
import { StatusLabel } from './StatusLabel.tsx';

interface TrendsViewProps {
  crewId: string;
  refreshKey: number;
}

export function TrendsView({ crewId, refreshKey }: TrendsViewProps) {
  const [days, setDays] = useState<number>(30);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [selectedIndId, setSelectedIndId] = useState<string>('blood_pressure');
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    vigilApi
      .getHistory(crewId, days)
      .then((res) => {
        if (!active) return;
        setHistory(res);
        setHoverIdx(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [crewId, days, refreshKey]);

  if (loading && !history) {
    return (
      <div className="rounded-lg border border-slate-800 bg-[#0E1522] p-8 text-center text-sm text-slate-400">
        Loading telemetry history...
      </div>
    );
  }

  if (!history) return null;

  const currentInd: IndicatorHistory =
    history.indicators.find((i) => i.indicator_id === selectedIndId) ??
    history.indicators[0];

  const points = currentInd?.points ?? [];
  const chartW = 780;
  const chartH = 272;
  const padL = 48;
  const padR = 20;
  const padT = 20;
  const padB = 38;

  const allVals = points.flatMap((p) =>
    p.value2 !== null ? [p.value, p.value2] : [p.value]
  );
  const minVal = allVals.length > 0 ? Math.min(...allVals) : 0;
  const maxVal = allVals.length > 0 ? Math.max(...allVals) : 100;
  const padSpan = Math.max((maxVal - minVal) * 0.15, 2);
  const yMin = minVal - padSpan;
  const yMax = maxVal + padSpan;
  const ySpan = yMax - yMin || 1;

  const xPos = (idx: number) =>
    points.length <= 1
      ? padL + (chartW - padL - padR) / 2
      : padL + (idx / (points.length - 1)) * (chartW - padL - padR);
  const yPos = (val: number) =>
    chartH - padB - ((val - yMin) / ySpan) * (chartH - padT - padB);

  const primaryCoords = points.map((p, i) => `${xPos(i).toFixed(1)},${yPos(p.value).toFixed(1)}`);
  const secondaryCoords = points
    .filter((p) => p.value2 !== null)
    .map((p, i) => `${xPos(i).toFixed(1)},${yPos(p.value2!).toFixed(1)}`);

  const hoveredPoint = hoverIdx !== null ? points[hoverIdx] : points[points.length - 1];

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-800 bg-[#0E1522] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="trend-ind-select" className="text-xs font-medium text-slate-400">
            Indicator
          </label>
          <select
            id="trend-ind-select"
            value={currentInd?.indicator_id ?? ''}
            onChange={(e) => {
              setSelectedIndId(e.target.value);
              setHoverIdx(null);
            }}
            className="rounded-md border border-slate-700 bg-[#070B12] px-3 py-1.5 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
          >
            {history.indicators.map((ind) => (
              <option key={ind.indicator_id} value={ind.indicator_id}>
                {ind.name} ({ind.unit})
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1 rounded-md border border-slate-800 bg-[#070B12] p-1">
          {[7, 14, 30, 45].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={`rounded px-3 py-1 font-mono text-xs font-medium transition-colors whitespace-nowrap ${
                days === d
                  ? 'bg-cyan-500/20 text-cyan-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Interactive Time-Series Chart */}
      <div className="rounded-lg border border-slate-800 bg-[#0E1522] p-5 space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              {currentInd.name} — {days}-Day Telemetry
            </h2>
            <p className="text-xs text-slate-400">
              Evaluation mode: {currentInd.eval_mode} · {points.length} data points
              {secondaryCoords.length > 0 ? ' · Solid: Systolic / Dashed: Diastolic' : ''}
            </p>
          </div>
          {hoveredPoint && (
            <div className="flex items-center gap-3 font-mono text-xs text-slate-300">
              <span>{hoveredPoint.measured_at.slice(0, 10)}</span>
              <span className="text-slate-500">·</span>
              <span className="text-sm font-semibold text-cyan-300">
                {hoveredPoint.display_value} {currentInd.unit}
              </span>
              <StatusLabel status={hoveredPoint.status} />
            </div>
          )}
        </div>

        {points.length === 0 ? (
          <div className="flex h-56 items-center justify-center rounded border border-dashed border-slate-800 text-sm text-slate-400">
            No telemetry logged for {currentInd.name} in the last {days} days.
          </div>
        ) : (
          <div className="w-full overflow-x-auto">
            <svg
              viewBox={`0 0 ${chartW} ${chartH}`}
              className="w-full min-w-[540px] h-auto"
              role="img"
              aria-label={`${currentInd.name} time series chart`}
            >
              {/* Grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                const val = yMin + t * ySpan;
                const y = yPos(val);
                return (
                  <g key={t}>
                    <line
                      x1={padL}
                      y1={y}
                      x2={chartW - padR}
                      y2={y}
                      stroke="#1E293B"
                      strokeWidth={1}
                    />
                    <text
                      x={padL - 8}
                      y={y + 4}
                      textAnchor="end"
                      fill="#64748B"
                      fontSize="10"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {val.toFixed(currentInd.unit === 'mSv/wk' ? 1 : 0)}
                    </text>
                  </g>
                );
              })}

              {/* Primary line */}
              {primaryCoords.length > 1 && (
                <polyline
                  fill="none"
                  stroke="#06B6D4"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  points={primaryCoords.join(' ')}
                />
              )}

              {/* Secondary line (e.g. Diastolic BP) */}
              {secondaryCoords.length > 1 && (
                <polyline
                  fill="none"
                  stroke="#94A3B8"
                  strokeWidth={1.75}
                  strokeDasharray="4 3"
                  strokeLinejoin="round"
                  points={secondaryCoords.join(' ')}
                />
              )}

              {/* Interactive data points */}
              {points.map((p, idx) => {
                const cx = xPos(idx);
                const cy = yPos(p.value);
                const dotColor =
                  p.status === 'alert'
                    ? '#FB7185'
                    : p.status === 'watch'
                      ? '#FBBF24'
                      : '#34D399';
                const isActive = hoverIdx === idx;
                return (
                  <g
                    key={p.id}
                    onMouseEnter={() => setHoverIdx(idx)}
                    onFocus={() => setHoverIdx(idx)}
                    className="cursor-crosshair"
                  >
                    {isActive && (
                      <line
                        x1={cx}
                        y1={padT}
                        x2={cx}
                        y2={chartH - padB}
                        stroke="#334155"
                        strokeDasharray="2 2"
                      />
                    )}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={isActive ? 5 : 3.25}
                      fill={dotColor}
                      stroke="#070B12"
                      strokeWidth={1.5}
                    />
                  </g>
                );
              })}

              {/* X-axis start / mid / end dates */}
              {points.length > 0 && (
                <>
                  <text
                    x={padL}
                    y={chartH - 8}
                    fill="#64748B"
                    fontSize="10"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {points[0].measured_at.slice(0, 10)}
                  </text>
                  <text
                    x={chartW - padR}
                    y={chartH - 8}
                    textAnchor="end"
                    fill="#64748B"
                    fontSize="10"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {points[points.length - 1].measured_at.slice(0, 10)}
                  </text>
                </>
              )}
            </svg>
          </div>
        )}
      </div>

      {/* Recent Check-Ins Table */}
      <div className="rounded-lg border border-slate-800 bg-[#0E1522] overflow-hidden">
        <div className="border-b border-slate-800 px-5 py-3.5">
          <h3 className="text-sm font-semibold text-slate-100">
            Recent Check-In Log
          </h3>
        </div>
        {history.recent_checkins.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-400">
            No check-ins recorded in this window.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-800 bg-[#0A0F1A] text-xs text-slate-400">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Check-In ID</th>
                  <th className="px-4 py-2.5 font-medium">Timestamp (UTC)</th>
                  <th className="px-4 py-2.5 font-medium">Measurements</th>
                  <th className="px-4 py-2.5 font-medium">Symptoms</th>
                  <th className="px-4 py-2.5 font-medium">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {history.recent_checkins.slice(0, 15).map((ck) => (
                  <tr key={ck.id} className="hover:bg-slate-900/40">
                    <td className="px-4 py-2.5 font-mono text-xs text-cyan-300">{ck.id}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-300">
                      {ck.created_at}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-200">
                      {ck.entry_count}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-200">
                      {ck.symptom_count}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-400">
                      {ck.note ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
