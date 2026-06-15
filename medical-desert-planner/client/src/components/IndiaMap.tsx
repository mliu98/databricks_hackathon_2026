import { useEffect, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl';
import { Skeleton } from '@databricks/appkit-ui/react';
import { normalizeStateKey, type GeoCollection } from '../lib/geo';

export interface StateDatum {
  state: string;
  value: number;
  valueLabel: string;
  subLabel?: string;
}

interface IndiaMapProps {
  data: Map<string, StateDatum>;
  colorVar: string;
  maxValue: number;
  selectedState: string | null;
  onSelect: (state: string) => void;
}

interface MapFeatureProperties {
  state: string;
  dataState: string;
  metricValue: number;
  valueLabel: string;
  subLabel: string;
}

const SOURCE_ID = 'india-states';
const FILL_LAYER = 'india-state-fill';
const BORDER_LAYER = 'india-state-border';
const SELECTED_LAYER = 'india-state-selected';
const INDIA_BOUNDS: maplibregl.LngLatBoundsLike = [
  [67.2, 6.2],
  [98.7, 37.4],
];

function enrichGeoJson(geo: GeoCollection, data: Map<string, StateDatum>) {
  return {
    ...geo,
    features: geo.features.map((feature) => {
      const datum = data.get(normalizeStateKey(feature.properties.state));
      return {
        ...feature,
        properties: {
          ...feature.properties,
          dataState: datum?.state ?? '',
          metricValue: datum?.value ?? 0,
          valueLabel: datum?.valueLabel ?? 'No matching evidence',
          subLabel: datum?.subLabel ?? '',
        },
      };
    }),
  };
}

export function IndiaMap({ data, colorVar, maxValue, selectedState, onSelect }: IndiaMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const geoRef = useRef<GeoCollection | null>(null);
  const onSelectRef = useRef(onSelect);
  const initialDataRef = useRef(data);
  const initialMaxValueRef = useRef(maxValue);
  const initialSelectedStateRef = useRef(selectedState);
  const [ready, setReady] = useState(false);
  const lowColor = colorVar === '--success' ? '#163d36' : '#3b2026';
  const highColor = colorVar === '--success' ? '#57ffc4' : '#ff6675';
  const initialLowColorRef = useRef(lowColor);
  const initialHighColorRef = useRef(highColor);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          'dark-basemap': {
            type: 'raster',
            tiles: [
              'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
              'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
              'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
            ],
            tileSize: 512,
            attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
          },
        },
        layers: [{ id: 'dark-basemap', type: 'raster', source: 'dark-basemap' }],
      },
      bounds: INDIA_BOUNDS,
      fitBoundsOptions: { padding: 34 },
      maxBounds: [
        [58, 0],
        [106, 42],
      ],
      minZoom: 3,
      maxZoom: 8,
      canvasContextAttributes: { preserveDrawingBuffer: true },
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

    map.on('load', () => {
      void (async () => {
        const response = await fetch('/india-states.geojson');
        const geo = (await response.json()) as GeoCollection;
        geoRef.current = geo;
        map.addSource(SOURCE_ID, { type: 'geojson', data: enrichGeoJson(geo, initialDataRef.current) });
        map.addLayer({
          id: FILL_LAYER,
          type: 'fill',
          source: SOURCE_ID,
          paint: {
            'fill-color': [
              'interpolate',
              ['linear'],
              ['get', 'metricValue'],
              0,
              initialLowColorRef.current,
              Math.max(initialMaxValueRef.current, 1),
              initialHighColorRef.current,
            ],
            'fill-opacity': 0.72,
          },
        });
        map.addLayer({
          id: BORDER_LAYER,
          type: 'line',
          source: SOURCE_ID,
          paint: { 'line-color': 'rgba(255,255,255,0.38)', 'line-width': 0.8 },
        });
        map.addLayer({
          id: SELECTED_LAYER,
          type: 'line',
          source: SOURCE_ID,
          filter: ['==', ['get', 'dataState'], initialSelectedStateRef.current ?? '__none__'],
          paint: {
            'line-color': '#57ffc4',
            'line-width': 3,
            'line-blur': 1.5,
          },
        });

        const popup = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
          className: 'medical-map-popup',
          offset: 14,
        });

        map.on('mousemove', FILL_LAYER, (event) => {
          map.getCanvas().style.cursor = 'pointer';
          const properties = event.features?.[0]?.properties as MapFeatureProperties | undefined;
          if (!properties || !event.lngLat) return;
          popup
            .setLngLat(event.lngLat)
            .setHTML(
              `<strong>${properties.dataState || properties.state}</strong><span>${properties.valueLabel}</span><small>${properties.subLabel}</small>`
            )
            .addTo(map);
        });
        map.on('mouseleave', FILL_LAYER, () => {
          map.getCanvas().style.cursor = '';
          popup.remove();
        });
        map.on('click', FILL_LAYER, (event) => {
          const properties = event.features?.[0]?.properties as MapFeatureProperties | undefined;
          if (properties?.dataState) onSelectRef.current(properties.dataState);
        });
        map.resize();
        map.triggerRepaint();
        setReady(true);
      })();
    });

    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);
    mapRef.current = map;
    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const geo = geoRef.current;
    if (!map || !geo || !map.isStyleLoaded()) return;
    map.getSource<GeoJSONSource>(SOURCE_ID)?.setData(enrichGeoJson(geo, data));
    map.setPaintProperty(FILL_LAYER, 'fill-color', [
      'interpolate',
      ['linear'],
      ['get', 'metricValue'],
      0,
      lowColor,
      Math.max(maxValue, 1),
      highColor,
    ]);
  }, [data, highColor, lowColor, maxValue]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer(SELECTED_LAYER)) return;
    map.setFilter(SELECTED_LAYER, ['==', ['get', 'dataState'], selectedState ?? '__none__']);
  }, [selectedState]);

  return (
    <div className="relative h-[660px] overflow-hidden rounded-[28px] bg-[#202224]">
      {!ready && <Skeleton className="absolute inset-0 z-10 h-full w-full rounded-[28px]" />}
      <div
        ref={containerRef}
        style={{ position: 'absolute', inset: 0 }}
        aria-label="Interactive COPD care map of India"
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,transparent_35%,rgba(0,0,0,0.25)_100%)]" />
      <div className="pointer-events-none absolute left-4 top-4 rounded-full border border-white/10 bg-black/55 px-3 py-1.5 text-[11px] font-medium text-white/70 backdrop-blur">
        Scroll to zoom · drag to explore
      </div>
    </div>
  );
}
