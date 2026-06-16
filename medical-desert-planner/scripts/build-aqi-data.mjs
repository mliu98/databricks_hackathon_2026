import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const csvPath = path.join(root, 'data/aqi.csv');
const outPath = path.join(root, 'client/public/data/state-aqi.json');

// The raw CSV is a local-only build input (excluded from deployment uploads; it
// also exceeds the Databricks Apps per-file limit). When it is absent (e.g. on
// the Databricks Apps build), keep the committed prebuilt JSON instead of failing.
if (!existsSync(csvPath)) {
  console.log(`Skipping AQI data build: ${path.relative(root, csvPath)} not found; using prebuilt JSON.`);
  process.exit(0);
}

/** Parse one CSV line, respecting double-quoted fields. */
function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  fields.push(current);
  return fields;
}

function aqiStatus(value) {
  if (value <= 50) return 'Good';
  if (value <= 100) return 'Satisfactory';
  if (value <= 200) return 'Moderate';
  if (value <= 300) return 'Poor';
  if (value <= 400) return 'Very Poor';
  return 'Severe';
}

const raw = readFileSync(csvPath, 'utf8').trim();
const lines = raw.split(/\r?\n/);
const header = parseCsvLine(lines[0]);
const stateIdx = header.indexOf('state');
const pollutantsIdx = header.indexOf('prominent_pollutants');
const aqiIdx = header.indexOf('aqi_value');

if (stateIdx < 0 || pollutantsIdx < 0 || aqiIdx < 0) {
  throw new Error(`Unexpected CSV header: ${header.join(',')}`);
}

/** @type {Map<string, { sum: number; count: number }>} */
const byState = new Map();

for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  if (!line.trim()) continue;
  const fields = parseCsvLine(line);
  const pollutants = fields[pollutantsIdx] ?? '';
  if (!pollutants.includes('PM2.5')) continue;

  const state = fields[stateIdx]?.trim();
  const aqi = Number.parseFloat(fields[aqiIdx] ?? '');
  if (!state || Number.isNaN(aqi)) continue;

  const bucket = byState.get(state) ?? { sum: 0, count: 0 };
  bucket.sum += aqi;
  bucket.count += 1;
  byState.set(state, bucket);
}

const states = [...byState.entries()]
  .map(([state, { sum, count }]) => {
    const avgAqi = Math.round((sum / count) * 10) / 10;
    return { state, avgAqi, readingCount: count, status: aqiStatus(avgAqi) };
  })
  .sort((a, b) => b.avgAqi - a.avgAqi);

writeFileSync(
  outPath,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      method: 'Average AQI readings where PM2.5 is a prominent pollutant, grouped by state across all dates',
      states,
    },
    null,
    2
  )}\n`
);

console.log(`Wrote ${states.length} state AQI averages to ${path.relative(root, outPath)}`);
