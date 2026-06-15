// Normalize Indian state names so the bundled GeoJSON map features line up with
// the postal-directory state names coming back from the warehouse queries
// (handles "&" vs "and", casing, punctuation, and a leading "The").
export function normalizeStateKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z]/g, '')
    .replace(/^the/, '');
}

export interface GeoFeature {
  type: 'Feature';
  properties: { state: string };
  geometry: { type: 'MultiPolygon'; coordinates: number[][][][] };
}

export interface GeoCollection {
  type: 'FeatureCollection';
  features: GeoFeature[];
}
