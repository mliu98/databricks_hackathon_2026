import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const csvPath = path.join(root, 'data/cooking.csv');
const outPath = path.join(root, 'client/public/data/state-cooking.json');

/** Map abbreviated NFHS state labels to GeoJSON / warehouse names. */
const STATE_ALIASES = {
  'A & N Islands': 'Andaman and Nicobar Islands',
  'Daman & Diu': 'Dadra and Nagar Haveli and Daman and Diu',
};

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

function canonicalStateName(raw) {
  const trimmed = raw.trim();
  if (STATE_ALIASES[trimmed]) return STATE_ALIASES[trimmed];
  return trimmed.replace(/&/g, ' and ');
}

function parsePercent(value) {
  const trimmed = value?.trim();
  if (!trimmed) return 0;
  const n = Number.parseFloat(trimmed);
  return Number.isNaN(n) ? 0 : n;
}

const raw = readFileSync(csvPath, 'utf8').trim();
const lines = raw.split(/\r?\n/);
const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
const stateIdx = header.indexOf('state');
const firewoodIdx = header.indexOf('firewood');
const otherNaturalIdx = header.indexOf('other natural sources');

if (stateIdx < 0 || firewoodIdx < 0 || otherNaturalIdx < 0) {
  throw new Error(`Unexpected CSV header: ${header.join(',')}`);
}

const states = [];

for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  if (!line.trim()) continue;
  const fields = parseCsvLine(line);
  const state = canonicalStateName(fields[stateIdx] ?? '');
  if (!state) continue;

  const firewoodPct = parsePercent(fields[firewoodIdx]);
  const otherNaturalPct = parsePercent(fields[otherNaturalIdx]);
  const solidBiomassPct = Math.round((firewoodPct + otherNaturalPct) * 100) / 100;

  states.push({
    state,
    solidBiomassPct,
    firewoodPct,
    otherNaturalPct,
  });
}

states.sort((a, b) => b.solidBiomassPct - a.solidBiomassPct);

writeFileSync(
  outPath,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      method: 'Sum of Firewood and Other natural sources household cooking fuel shares by state (NFHS)',
      states,
    },
    null,
    2
  )}\n`
);

console.log(`Wrote ${states.length} state cooking-fuel shares to ${path.relative(root, outPath)}`);
