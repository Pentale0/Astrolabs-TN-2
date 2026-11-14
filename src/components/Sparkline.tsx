import type { OverallStatus } from '../shared/types.ts';

interface SparklineProps {
  values: number[];
  status: OverallStatus;
  width?: number;
  height?: number;
}

const STROKE_BY_STATUS: Record<OverallStatus, string> = {
  normal: '#34D399',
  watch: '#FBBF24',
  alert: '#FB7185',
  no_data: '#475569',
};

export function Sparkline({ values, status, width = 96, height = 28 }: SparklineProps) {
  if (values.length < 2) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden="true"
        className="shrink-0"
      >
        <line
          x1={2}
          y1={height / 2}
          x2={width - 2}
          y2={height / 2}
          stroke="#334155"
          strokeWidth={1.25}
          strokeDasharray="3 3"
        />
      </svg>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 3;

  const coords = values.map((v, idx) => {
    const x = pad + (idx / (values.length - 1)) * (width - pad * 2);
    const y = height - pad - ((v - min) / span) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const last = coords[coords.length - 1].split(',');
  const color = STROKE_BY_STATUS[status];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      className="shrink-0"
    >
      <polyline
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={coords.join(' ')}
      />
      <circle cx={Number(last[0])} cy={Number(last[1])} r={2.5} fill={color} />
    </svg>
  );
}
