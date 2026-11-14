import type { OverallStatus, RegionSummary } from '../shared/types.ts';
import { StatusLabel } from './StatusLabel.tsx';

interface BodyMapProps {
  regions: RegionSummary[];
  selectedRegionId: string;
  onSelectRegion: (regionId: string) => void;
}

const REGION_PALETTE: Record<
  OverallStatus,
  { stroke: string; fill: string; node: string }
> = {
  normal: {
    stroke: '#10B981',
    fill: 'rgba(16, 185, 129, 0.14)',
    node: '#34D399',
  },
  watch: {
    stroke: '#F59E0B',
    fill: 'rgba(245, 158, 11, 0.18)',
    node: '#FBBF24',
  },
  alert: {
    stroke: '#F43F5E',
    fill: 'rgba(244, 63, 94, 0.22)',
    node: '#FB7185',
  },
  no_data: {
    stroke: '#475569',
    fill: 'rgba(71, 85, 105, 0.12)',
    node: '#64748B',
  },
};

interface RegionHotspot {
  id: string;
  cx: number;
  cy: number;
  labelX: number;
  labelY: number;
  align: 'left' | 'right';
}

const HOTSPOTS: RegionHotspot[] = [
  { id: 'neuro_ocular', cx: 180, cy: 58, labelX: 256, cyOffset: 0, labelY: 50, align: 'right' },
  { id: 'behavioral_sleep', cx: 180, cy: 86, labelX: 104, labelY: 86, align: 'left' },
  { id: 'cardiovascular', cx: 194, cy: 148, labelX: 256, labelY: 142, align: 'right' },
  { id: 'immune_radiation', cx: 162, cy: 158, labelX: 104, labelY: 162, align: 'left' },
  { id: 'metabolic', cx: 180, cy: 214, labelX: 256, labelY: 214, align: 'right' },
  { id: 'musculoskeletal', cx: 148, cy: 318, labelX: 104, labelY: 318, align: 'left' },
].map((h) => ({
  id: h.id,
  cx: h.cx,
  cy: h.cy,
  labelX: h.labelX,
  labelY: h.labelY,
  align: h.align as 'left' | 'right',
}));

export function BodyMap({ regions, selectedRegionId, onSelectRegion }: BodyMapProps) {
  const regionById = new Map(regions.map((r) => [r.region_id, r]));

  const statusFor = (id: string): OverallStatus =>
    regionById.get(id)?.status ?? 'no_data';

  const zoneAttrs = (id: string) => {
    const st = statusFor(id);
    const pal = REGION_PALETTE[st];
    const selected = selectedRegionId === id;
    return {
      fill: pal.fill,
      stroke: selected ? '#22D3EE' : pal.stroke,
      strokeWidth: selected ? 2.25 : 1.25,
      className: 'cursor-pointer transition-opacity hover:opacity-95',
      onClick: () => onSelectRegion(id),
    };
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="relative flex items-center justify-center rounded-lg border border-slate-800 bg-[#0A0F1A] p-4">
        <svg
          viewBox="-36 0 432 440"
          className="w-full max-w-[380px] h-auto select-none"
          role="img"
          aria-label="Interactive astronaut anatomical region map"
        >
          {/* Subtle calibration coordinate grid */}
          <defs>
            <pattern id="vigil-grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <path
                d="M 24 0 L 0 0 0 24"
                fill="none"
                stroke="#1E293B"
                strokeWidth="0.6"
                opacity="0.55"
              />
            </pattern>
          </defs>
          <rect x="-36" y="0" width="432" height="440" fill="url(#vigil-grid)" rx="6" />
          <line x1="180" y1="12" x2="180" y2="428" stroke="#1E293B" strokeDasharray="3 4" strokeWidth="1" />

          {/* Anatomical silhouette outline */}
          <g fill="none" stroke="#334155" strokeWidth="1.2">
            {/* Arms */}
            <path d="M 134 118 L 106 196 L 98 258 L 112 260 L 122 204 L 138 150" />
            <path d="M 226 118 L 254 196 L 262 258 L 248 260 L 238 204 L 222 150" />
            {/* Shoulders & Neck */}
            <path d="M 166 96 L 164 112 L 134 118" />
            <path d="M 194 96 L 196 112 L 226 118" />
          </g>

          {/* 1. Neuro & Ocular (Head upper/eyes) */}
          <path
            d="M 152 62 C 152 36, 208 36, 208 62 L 204 72 L 156 72 Z"
            {...zoneAttrs('neuro_ocular')}
          />

          {/* 2. Behavioral & Sleep (Lower cranium / circadian axis) */}
          <path
            d="M 156 74 L 204 74 C 202 92, 192 98, 180 98 C 168 98, 158 92, 156 74 Z"
            {...zoneAttrs('behavioral_sleep')}
          />

          {/* 3. Immune & Radiation (Upper thorax left / lymphatics) */}
          <path
            d="M 138 118 L 178 118 L 178 184 L 142 184 Z"
            {...zoneAttrs('immune_radiation')}
          />

          {/* 4. Cardiovascular (Heart / right thorax & mediastinum) */}
          <path
            d="M 182 118 L 222 118 L 218 184 L 182 184 Z"
            {...zoneAttrs('cardiovascular')}
          />

          {/* 5. Metabolic & Nutrition (Abdomen / core) */}
          <path
            d="M 143 188 L 217 188 L 212 248 L 148 248 Z"
            {...zoneAttrs('metabolic')}
          />

          {/* 6. Musculoskeletal (Pelvis & lower limbs) */}
          <path
            d="M 146 252 L 214 252 L 216 286 L 208 408 L 188 408 L 184 294 L 176 294 L 172 408 L 152 408 L 144 286 Z"
            {...zoneAttrs('musculoskeletal')}
          />

          {/* Callout leader lines & telemetry nodes */}
          {HOTSPOTS.map((spot) => {
            const st = statusFor(spot.id);
            const pal = REGION_PALETTE[st];
            const isSel = selectedRegionId === spot.id;
            const reg = regionById.get(spot.id);
            const shortName = reg ? reg.name.split(' (')[0] : spot.id;

            return (
              <g
                key={spot.id}
                className="cursor-pointer"
                onClick={() => onSelectRegion(spot.id)}
              >
                <polyline
                  points={`${spot.cx},${spot.cy} ${spot.labelX},${spot.labelY}`}
                  fill="none"
                  stroke={isSel ? '#22D3EE' : pal.stroke}
                  strokeWidth={isSel ? 1.5 : 1}
                  opacity={0.85}
                />
                <circle
                  cx={spot.cx}
                  cy={spot.cy}
                  r={isSel ? 5.5 : 4}
                  fill={isSel ? '#22D3EE' : pal.node}
                  stroke="#070B12"
                  strokeWidth={1.5}
                />
                <text
                  x={spot.align === 'right' ? spot.labelX + 4 : spot.labelX - 4}
                  y={spot.labelY + 4}
                  textAnchor={spot.align === 'right' ? 'start' : 'end'}
                  fill={isSel ? '#E0F2FE' : '#CBD5E1'}
                  fontSize="10.5"
                  fontFamily="IBM Plex Sans, sans-serif"
                  fontWeight={isSel ? '600' : '500'}
                >
                  {shortName}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Accessible 6-region selector buttons */}
      <div className="grid grid-cols-2 gap-2" role="list" aria-label="Body regions">
        {regions.map((reg) => {
          const selected = reg.region_id === selectedRegionId;
          return (
            <button
              key={reg.region_id}
              type="button"
              onClick={() => onSelectRegion(reg.region_id)}
              aria-pressed={selected}
              className={`flex flex-col items-start gap-1 rounded-md border px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                selected
                  ? 'border-cyan-500/70 bg-cyan-950/30'
                  : 'border-slate-800 bg-[#0E1522] hover:border-slate-700'
              }`}
            >
              <span className="text-xs font-semibold text-slate-100 truncate w-full">
                {reg.name}
              </span>
              <StatusLabel status={reg.status} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
