import { useEffect, useMemo, useRef, useState } from 'react';
import { geoMercator, geoPath } from 'd3-geo';
import { Skeleton } from '@databricks/appkit-ui/react';
import { normalizeStateKey, type GeoCollection } from '../lib/geo';

export interface StateDatum {
  /** Display name as it appears in the warehouse data (used for drill-down). */
  state: string;
  value: number;
  valueLabel: string;
  subLabel?: string;
}

interface IndiaMapProps {
  /** Keyed by normalizeStateKey(state). */
  data: Map<string, StateDatum>;
  /** Design token to scale the choropleth fill, e.g. '--destructive'. */
  colorVar: string;
  maxValue: number;
  selectedState: string | null;
  onSelect: (state: string) => void;
  noDataLabel?: string;
}

const WIDTH = 720;
const HEIGHT = 780;

export function IndiaMap({
  data,
  colorVar,
  maxValue,
  selectedState,
  onSelect,
  noDataLabel = 'No facility evidence',
}: IndiaMapProps) {
  const [geo, setGeo] = useState<GeoCollection | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; datum: StateDatum | null; name: string } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    fetch('/india-states.geojson')
      .then((r) => r.json() as Promise<GeoCollection>)
      .then((g) => { if (active) setGeo(g); })
      .catch(() => { if (active) setGeo(null); });
    return () => { active = false; };
  }, []);

  const paths = useMemo(() => {
    if (!geo) return [];
    const projection = geoMercator().fitSize([WIDTH, HEIGHT], geo);
    const pathGen = geoPath(projection);
    return geo.features.map((f) => {
      const key = normalizeStateKey(f.properties.state);
      return { key, name: f.properties.state, d: pathGen(f) ?? '', datum: data.get(key) ?? null };
    });
  }, [geo, data]);

  const selectedKey = selectedState ? normalizeStateKey(selectedState) : null;

  function fillFor(datum: StateDatum | null): string {
    if (!datum || maxValue <= 0) return 'var(--muted)';
    const ratio = Math.min(datum.value / maxValue, 1);
    const pct = Math.round(10 + ratio * 90); // keep low values faintly visible
    return `color-mix(in oklch, var(${colorVar}) ${pct}%, var(--muted))`;
  }

  if (!geo) {
    return <Skeleton className="w-full" style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }} />;
  }

  return (
    <div ref={wrapperRef} className="relative w-full">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="mx-auto h-auto w-full max-w-[620px]"
        role="img"
        aria-label="Choropleth map of India by state"
      >
        {paths.map((p) => {
          const isSelected = p.key === selectedKey;
          const hasData = p.datum !== null;
          return (
            <path
              key={p.key}
              d={p.d}
              fill={fillFor(p.datum)}
              stroke={isSelected ? 'var(--primary)' : 'var(--background)'}
              strokeWidth={isSelected ? 2.5 : 0.6}
              style={{ cursor: hasData ? 'pointer' : 'default', transition: 'fill 120ms ease' }}
              onMouseMove={(e) => {
                const rect = wrapperRef.current?.getBoundingClientRect();
                setTooltip({ x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0), datum: p.datum, name: p.datum?.state ?? p.name });
              }}
              onMouseLeave={() => setTooltip(null)}
              onClick={() => { if (p.datum) onSelect(p.datum.state); }}
            />
          );
        })}
      </svg>

      {tooltip && (
          <div
            className="pointer-events-none absolute z-10 rounded-md border bg-popover px-3 py-2 text-xs shadow-md"
            style={{ left: tooltip.x + 12, top: tooltip.y + 12, maxWidth: 220 }}
          >
            <div className="font-semibold text-popover-foreground">{tooltip.name}</div>
            {tooltip.datum ? (
              <>
                <div className="text-popover-foreground">{tooltip.datum.valueLabel}</div>
                {tooltip.datum.subLabel && <div className="text-muted-foreground">{tooltip.datum.subLabel}</div>}
              </>
            ) : (
              <div className="text-muted-foreground">{noDataLabel}</div>
            )}
          </div>
        )}
    </div>
  );
}
