import { useEffect, useMemo, useRef, useState } from 'react';
import { geoMercator, geoPath } from 'd3-geo';
import { Skeleton } from '@databricks/appkit-ui/react';
import { normalizeStateKey, type GeoCollection } from '../lib/geo';
import { formatNumber } from '../lib/numbers';

export interface StateDatum {
  /** Display name as it appears in the warehouse data (used for drill-down). */
  state: string;
  value: number;
  valueLabel: string;
  subLabel?: string;
}

export interface FacilityMarker {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  staffCount: number | null;
  copdDepartments: string[];
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
  /** Geocoded care facilities to plot as map dots. */
  markers?: FacilityMarker[];
}

const WIDTH = 720;
const HEIGHT = 780;
const DEFAULT_MARKER_RADIUS = 3.5;
const MIN_REPORTED_RADIUS = 4;
const MAX_MARKER_RADIUS = 14;
/** Staff count at which a dot reaches the max radius — fixed so sizing is identical globally and per-state. */
const STAFF_RADIUS_REFERENCE = 100;

export function markerRadius(staffCount: number | null): number {
  if (staffCount == null) return DEFAULT_MARKER_RADIUS;
  const staff = Math.max(staffCount, 0);
  const ratio = Math.min(staff / STAFF_RADIUS_REFERENCE, 1);
  return MIN_REPORTED_RADIUS + ratio * (MAX_MARKER_RADIUS - MIN_REPORTED_RADIUS);
}

type TooltipState =
  | { kind: 'state'; x: number; y: number; datum: StateDatum | null; name: string }
  | { kind: 'facility'; x: number; y: number; marker: FacilityMarker };

export function IndiaMap({
  data,
  colorVar,
  maxValue,
  selectedState,
  onSelect,
  noDataLabel = 'No facility evidence',
  markers = [],
}: IndiaMapProps) {
  const [geo, setGeo] = useState<GeoCollection | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    fetch('/india-states.geojson')
      .then((r) => r.json() as Promise<GeoCollection>)
      .then((g) => { if (active) setGeo(g); })
      .catch(() => { if (active) setGeo(null); });
    return () => { active = false; };
  }, []);

  const { paths, projectedMarkers } = useMemo(() => {
    if (!geo) return { paths: [], projectedMarkers: [] };

    const projection = geoMercator().fitSize([WIDTH, HEIGHT], geo);
    const pathGen = geoPath(projection);

    const paths = geo.features.map((f) => {
      const key = normalizeStateKey(f.properties.state);
      return { key, name: f.properties.state, d: pathGen(f) ?? '', datum: data.get(key) ?? null };
    });

    const projectedMarkers = markers
      .map((marker) => {
        const coords = projection([marker.longitude, marker.latitude]);
        if (!coords) return null;
        const [x, y] = coords;
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        return {
          ...marker,
          x,
          y,
          r: markerRadius(marker.staffCount),
        };
      })
      .filter((m): m is FacilityMarker & { x: number; y: number; r: number } => m !== null)
      .sort((a, b) => b.r - a.r);

    return { paths, projectedMarkers };
  }, [geo, data, markers]);

  const selectedKey = selectedState ? normalizeStateKey(selectedState) : null;

  function fillFor(datum: StateDatum | null): string {
    if (!datum || maxValue <= 0) return 'var(--muted)';
    const ratio = Math.min(datum.value / maxValue, 1);
    const pct = Math.round(10 + ratio * 90); // keep low values faintly visible
    return `color-mix(in oklch, var(${colorVar}) ${pct}%, var(--muted))`;
  }

  function setTooltipAt(
    e: React.MouseEvent,
    next: Omit<Extract<TooltipState, { kind: 'state' }>, 'x' | 'y'> | Omit<Extract<TooltipState, { kind: 'facility' }>, 'x' | 'y'>
  ) {
    const rect = wrapperRef.current?.getBoundingClientRect();
    setTooltip({
      ...next,
      x: e.clientX - (rect?.left ?? 0),
      y: e.clientY - (rect?.top ?? 0),
    } as TooltipState);
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
        aria-label="Choropleth map of India by state with care facility locations"
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
                setTooltipAt(e, { kind: 'state', datum: p.datum, name: p.datum?.state ?? p.name });
              }}
              onMouseLeave={() => setTooltip(null)}
              onClick={() => { if (p.datum) onSelect(p.datum.state); }}
            />
          );
        })}

        {projectedMarkers.map((marker) => (
          <circle
            key={marker.id}
            cx={marker.x}
            cy={marker.y}
            r={marker.r}
            fill="var(--primary)"
            stroke="var(--background)"
            strokeWidth={1.2}
            style={{ cursor: 'pointer' }}
            onMouseMove={(e) => {
              e.stopPropagation();
              setTooltipAt(e, { kind: 'facility', marker });
            }}
            onMouseLeave={() => setTooltip(null)}
          />
        ))}
      </svg>

      {tooltip && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border bg-popover px-3 py-2 text-xs shadow-md"
          style={{ left: tooltip.x + 12, top: tooltip.y + 12, maxWidth: 280 }}
        >
          {tooltip.kind === 'state' ? (
            <>
              <div className="font-semibold text-popover-foreground">{tooltip.name}</div>
              {tooltip.datum ? (
                <>
                  <div className="text-popover-foreground">{tooltip.datum.valueLabel}</div>
                  {tooltip.datum.subLabel && <div className="text-muted-foreground">{tooltip.datum.subLabel}</div>}
                </>
              ) : (
                <div className="text-muted-foreground">{noDataLabel}</div>
              )}
            </>
          ) : (
            <>
              <div className="font-semibold text-popover-foreground">{tooltip.marker.name}</div>
              <div className="text-popover-foreground">
                {tooltip.marker.staffCount != null
                  ? `${formatNumber(tooltip.marker.staffCount)} staff reported`
                  : 'Staff count not reported'}
              </div>
              {tooltip.marker.copdDepartments.length > 0 && (
                <div className="mt-1 text-muted-foreground">{tooltip.marker.copdDepartments.join(' · ')}</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
