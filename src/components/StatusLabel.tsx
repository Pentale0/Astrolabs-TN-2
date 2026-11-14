import type { OverallStatus } from '../shared/types.ts';

interface StatusLabelProps {
  status: OverallStatus | 'info';
  className?: string;
}

const CONFIG: Record<
  OverallStatus | 'info',
  { glyph: string; label: string; colorClass: string }
> = {
  normal: { glyph: '●', label: 'Nominal', colorClass: 'text-emerald-400' },
  watch: { glyph: '▲', label: 'Watch', colorClass: 'text-amber-400' },
  alert: { glyph: '✖', label: 'Alert', colorClass: 'text-rose-400' },
  no_data: { glyph: '○', label: 'No Data', colorClass: 'text-slate-400' },
  info: { glyph: '●', label: 'Info', colorClass: 'text-cyan-400' },
};

export function StatusLabel({ status, className = '' }: StatusLabelProps) {
  const cfg = CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-xs font-medium whitespace-nowrap shrink-0 ${cfg.colorClass} ${className}`}
    >
      <span aria-hidden="true">{cfg.glyph}</span>
      <span>{cfg.label}</span>
    </span>
  );
}
