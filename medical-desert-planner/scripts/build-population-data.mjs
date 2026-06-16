import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const csvPath = path.join(root, 'data/state-population.csv');
const outPath = path.join(root, 'client/public/data/state-population.json');

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

const raw = readFileSync(csvPath, 'utf8').trim();
const lines = raw.split(/\r?\n/);
const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
const stateIdx = header.indexOf('state');
const populationIdx = header.indexOf('population');

if (stateIdx < 0 || populationIdx < 0) {
  throw new Error(`Unexpected CSV header: ${header.join(',')}`);
}

const states = [];

for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  if (!line.trim()) continue;
  const fields = parseCsvLine(line);
  const state = fields[stateIdx]?.trim();
  const population = Number.parseInt(fields[populationIdx] ?? '', 10);
  if (!state || Number.isNaN(population)) continue;
  states.push({ state, population });
}

states.sort((a, b) => b.population - a.population);

writeFileSync(
  outPath,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      method: '2011 Census of India state and union territory resident population',
      states,
    },
    null,
    2
  )}\n`
);

console.log(`Wrote ${states.length} state populations to ${path.relative(root, outPath)}`);
