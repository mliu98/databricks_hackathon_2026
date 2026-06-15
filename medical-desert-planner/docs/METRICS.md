# How every number in the app is calculated

This document explains, feature by feature, where each number on screen comes from:
which dataset feeds it and exactly how it is computed. It is the plain-language
companion to the SQL in [`config/queries/`](../config/queries) and the TypeScript
in [`client/src/lib/`](../client/src/lib).

> **One-line summary of the philosophy:** the app never claims "this place has no
> care." It separates a measurable **need proxy** (pollution + smoking + biomass)
> from a **trust-weighted supply** signal (facility records discounted by how
> believable they are), and always shows a **confidence** level so a data-poor
> region is never mistaken for a true gap.

---

## 1. Data sources

### 1a. Unity Catalog tables (live, via the SQL Warehouse)

All catalog `schema` = `databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset`.

| Table | What it provides | Used for |
| ----- | ---------------- | -------- |
| `facilities` | One row per facility: `description`, `procedure`, `equipment`, `capability`, `specialties`, address, web-presence signals (`custom_logo_presence`, `affiliated_staff_presence`, `distinct_social_media_presence_count`, `officialWebsite`, `recency_of_page_update`), `numberDoctors`, `capacity`, `yearEstablished`, contacts | Supply, trust score, capability detection, partners |
| `india_post_pincode_directory` | `pincode → statename, district` | Maps each facility to a state/district via its postcode |
| `nfhs_5_district_health_indicators` | Survey indicators per district: clean cooking fuel %, women/men 15+ tobacco %, child ARI %, health-insurance % | The solid-fuel + tobacco components of the COPD **risk proxy** (need side), plus context |

Facilities are joined to geography on `try_cast(facilities.address_zipOrPostcode AS BIGINT) = pincode`. When a pincode maps to multiple localities, the most frequent `(statename, district)` for that pincode wins (`ROW_NUMBER() … ORDER BY COUNT(*) DESC`).

### 1b. Bundled CSVs → static JSON (the two map overlays)

These are pre-processed at build time (`npm run build:client` runs the scripts) and served as static files; they do **not** hit the warehouse.

| Source CSV | Build script | Output | Feeds |
| ---------- | ------------ | ------ | ----- |
| `data/aqi.csv` | [`scripts/build-aqi-data.mjs`](../scripts/build-aqi-data.mjs) | `client/public/data/state-aqi.json` | **AQI overlay** + the 35% ambient-air term of the risk proxy (§2d) |
| `data/cooking.csv` | [`scripts/build-cooking-data.mjs`](../scripts/build-cooking-data.mjs) | `client/public/data/state-cooking.json` | **Cooking-fuel overlay** |

---

## 2. The building-block calculations (used everywhere)

### 2a. Facility **trust score** (0–100) — *how believable is this record?*

Computed per facility in every SQL file. It is a weighted sum of web-presence signals, ×100:

```
trust_score = round(100 × (
    0.22 · has_custom_logo
  + 0.22 · has_affiliated_staff
  + 0.20 · min(distinct_social_media_count / 5, 1)
  + 0.18 · has_official_website
  + 0.18 · page_updated_on_or_after_2025-01-01
))
```

Each term is 0 or 1 (except social media, which scales 0→1 over 0–5 accounts). A record with a logo, named staff, 5+ socials, a website, and a fresh page scores 100; a bare record scores 0.

> Trust is a **web-evidence** signal, not clinical verification. It answers "how much should we believe this listing," not "how good is this clinic."

### 2b. **Trust-weighted supply** — *capacity, discounted by believability*

```
trust_weighted = SUM(trust_score) / 100        (rounded to 1 decimal)
```

So each facility contributes its trust as a fraction of one "full" facility: a trust-100 facility counts as **1.0**, a trust-50 facility as **0.5**. This is the app's headline supply number — it is **not** a raw clinic count. Raw count is shown separately as `n_facilities`.

### 2c. **COPD capability matching** — *which facilities count for the selected filter*

A facility's `evidence_text` is `lower(description + procedure + equipment + capability + specialties)`. A facility "has" a capability if `evidence_text` matches that capability's regex:

| Capability filter | Matches `evidence_text RLIKE …` |
| ----------------- | ------------------------------- |
| All COPD care | any of the keyword sets below |
| Pulmonology / respiratory | `copd | chronic obstructive | pulmon | respirat | chest medicine` |
| Spirometry / lung function | `spirom | pulmonary function | lung function | \bpft\b` |
| Oxygen therapy | `oxygen therapy | oxygen concentrator | medical oxygen | ventilat` |
| Inhalers / nebulizers | `nebul | inhaler | bronchodilator` |
| Pulmonary rehab | `pulmonary rehab | respiratory rehab` |
| Critical / exacerbation care | `critical care | intensive care | \bicu\b | ventilat` |

This same matching drives the capability dropdown counts, the map, the district table, the facility flags, and partner detection.

### 2d. **COPD risk proxy** (need side) — *who is likely to get COPD*

Computed **client-side** in [`copdRisk.ts`](../client/src/lib/copdRisk.ts) by combining the AQI overlay (§1b) with the NFHS indicators (§1a). All three components are on a 0–100 scale and the weights sum to 1.0:

```
copd_risk = 0.35 · aqi_norm
          + 0.40 · (100 − clean_fuel_pct)
          + 0.25 · ((women_tobacco_pct + men_tobacco_pct) / 2)
```

- **35% ambient air** = `aqi_norm` = the state's average PM2.5 AQI **min–max normalized to 0–100** across all states: `100 · (avgAqi − minAqi) / (maxAqi − minAqi)`.
- **40% household smoke exposure** = `100 − clean_fuel_pct` (households *not* using clean cooking fuel).
- **25% adult tobacco** = the average of women-15+ and men-15+ tobacco-use rates.
- It is `null` (shown as "not measured") unless the AQI value, AQI bounds, and all three NFHS inputs exist.

> **This moved out of SQL.** The SQL queries (`state_coverage.sql`, `district_coverage.sql`, `national_kpis.sql`) no longer compute `copd_risk_score` or `gap_score`; they return the raw NFHS/supply columns, and the risk + gap are derived in the browser via `enrichStateCoverageRows` / `enrichDistrictCoverageRows`. Districts inherit their **state's** AQI value (AQI data is state-level).

Two derived display values come straight out of this:
- **Adult tobacco %** on screen = `(women_tobacco_pct + men_tobacco_pct) / 2`.
- **Household smoke exposure %** = `100 − clean_fuel_pct`.

> This is a **planning proxy**, not measured COPD prevalence. Child-ARI % and insurance % are shown for context but are **not** in the formula.

### 2e. **Gap score** — *need that is not met by trustworthy supply*

Also computed client-side in [`copdRisk.ts`](../client/src/lib/copdRisk.ts):

```
gap = copd_risk × (1 − min(trust_weighted / TARGET, 1))
```

The gap is the risk scaled down by how close supply is to a "fully served" target:

| Level | TARGET (trust-weighted facilities for "served") | Function |
| ----- | ----------------------------------------------- | -------- |
| District | **3** | `computeDistrictGapScore` |
| State | **20** | `computeStateGapScore` |

So a district with ≥3 trust-weighted facilities has gap = 0 regardless of risk; a district with risk 50 and **zero** supply has gap = 50. Higher gap = more urgent unmet need.

### 2f. **Data confidence** — *should we trust the gap, or go verify?*

Confidence is deliberately separate from the gap, and is driven by *all* facility records in the region (`catalog_records` / `catalog_trust_weighted`), not just the capability-matched ones — a region we know a lot about is high-confidence even if it has few matching clinics.

**District** (`district_coverage.sql`):
- `low` if `catalog_records < 2`
- `high` if `catalog_records ≥ 10` **and** `catalog_trust_weighted ≥ 2`
- `medium` if `catalog_records ≥ 3` **and** `catalog_trust_weighted ≥ 0.5`
- otherwise `low`

**State** (`state_coverage.sql`), based on capability-matched trust-weighted supply:
- `high` if `trust_weighted ≥ 8`; `medium` if `≥ 2`; else `low`

---

## 3. Screen-by-screen: which number is which

### 3a. National KPI cards (top of the Planner) — `national_kpis.sql`

| Card | Value | How |
| ---- | ----- | --- |
| **COPD-care facilities** | `n_facilities` | Count of capability-matched facilities nationwide. Sub-label "X mapped" = `geocoded` = rows with `latitude BETWEEN 6 AND 37` (inside India). |
| **States with supply** | `n_states` | Distinct `statename` among matches. Sub-label = `n_districts` distinct districts. |
| **Avg COPD risk proxy** | `avgCopdRisk` | The **mean of the per-state §2d risk scores** (`averageCopdRiskScore` over the AQI-enriched state rows), computed client-side — not the SQL `avg_copd_risk`. Hint: "AQI + solid fuel + tobacco". |
| **Trust-weighted capacity** | `trust_weighted` | §2b nationwide. Sub-label = `avg_trust` = `AVG(trust_score)`. |

### 3b. The national map + ranking rail — `state_coverage.sql` (+ overlay JSON)

The map view toggle picks which value colors each state and orders the list:

| Map view | Value per state | Source |
| -------- | --------------- | ------ |
| **Coverage** | `trust_weighted` (§2b) | SQL |
| **Care gaps** | `gap_score` (§2e, state target 20) | SQL + client enrichment |
| **Risk** | `copd_risk_score` (§2d) | SQL (NFHS) + AQI JSON, computed client-side |
| **AQI** | `avgAqi` (§3e) | static JSON |
| **Cooking fuel** | `solidBiomassPct` (§3f) | static JSON |

**Choropleth color** ([`IndiaMap.tsx`](../client/src/components/IndiaMap.tsx)): each state's value is normalized `ratio = value / maxValue`, then the fill mixes the muted base with the layer's accent at `10 + ratio·90` percent — the +10 keeps the lowest values faintly visible. AQI/cooking show no action panel (they are context overlays).

### 3c. State action brief (click a state) — `district_coverage.sql` + `partner_candidates.sql`

Top metric chips for the state come from the selected state's **AQI-enriched** row (`copd_risk_score` and `gap_score` are added client-side per §2d/§2e), shown as: Risk proxy, Supply (`n_facilities`), Gap (a colored pill), and a sub-row of Avg AQI, household smoke exposure, adult tobacco, and confidence. The **gap pill color** ([`StatBits.tsx`](../client/src/components/StatBits.tsx)): `ratio = min(score/50, 1)` → red >0.66, amber >0.33, else green. District rows in the brief are enriched with the **state's** AQI value before ranking.

**Top-3 interventions** ([`interventions.ts`](../client/src/lib/interventions.ts)) — districts are sorted by `gap_score` desc, then the app picks the first three with **distinct** action types using this decision tree (first match wins):

| Condition (per district) | Action | Kind |
| ------------------------ | ------ | ---- |
| `n_facilities = 0` **and** `catalog_records < 2` | Verify care availability (too little data) | `verify` |
| `n_facilities = 0` | Assess a new access point (mobile service for spirometry) | `build` |
| ≥50% of matches `established_before_2000` **or** ≥50% have stale web evidence | Audit & upgrade | `upgrade` |
| ≥50% of matches have no named staff | Verify staffing & recruit | `staff` |
| `n_facilities ≥ 3` **and** `largest_city_share_pct ≥ 75` | Extend beyond the main city | `expand` |
| no facility reports a doctor count | Validate staffing capacity | `staff` |
| otherwise | Expand service reach | `expand` |

Every intervention's `priorityScore = gap_score`, and its confidence label is the district's `data_confidence`.

**Potential partners**: from `partner_candidates.sql` — same-state facilities that match the COPD regex **and** have at least one public phone/email/website. Labeled candidates, not verified partnerships.

### 3d. District drill-down table — `district_coverage.sql`

Per district: `n_facilities` (raw count), `trust_weighted` (§2b), `n_cities_with_supply` (distinct non-unknown cities with a matching facility), doctor data = `n_with_doctor_count / n_facilities`, `copd_risk_score` (§2d), clean-fuel %, adult-tobacco %, child-ARI %, `gap_score` (§2e), and `data_confidence` (§2f). "Why this gap appears" also surfaces `largest_city_share_pct = 100 × largest_city_facilities / n_facilities`, insurance %, and which capabilities have **zero** evidence (`n_spirometry`, `n_oxygen`, `n_inhaler_nebulizer`, `n_pulmonary_rehab` = 0).

**Facility evidence cards** — `facility_list.sql`: each shows `trust_score` (§2a), the capability flags (regex booleans), up to 3 matched `procedure/equipment/capability` snippets as `evidence`, and trust chips (`has_logo`, `has_staff`, `social_count`, `has_website`, `recently_updated`). Top 200 by trust.

### 3e. AQI overlay — `state-aqi.json` (from `data/aqi.csv`)

```
avgAqi(state) = mean of aqi_value over all rows for that state
                where prominent_pollutants contains "PM2.5"
```

Rounded to 1 decimal. `readingCount` = number of such rows. **Status band** by `avgAqi`: ≤50 Good · ≤100 Satisfactory · ≤200 Moderate · ≤300 Poor · ≤400 Very Poor · else Severe.

### 3f. Cooking-fuel overlay — `state-cooking.json` (from `data/cooking.csv`)

```
solidBiomassPct(state) = Firewood% + Other-natural-sources%   (NFHS shares)
```

`firewoodPct` and `otherNaturalPct` are also kept for the hover/sub-labels.

---

## 4. Saved scenarios & the PDF report

### 4a. Scenario snapshot

When you save from the action brief, the snapshot stores the **district** row's values verbatim (`n_facilities`, `trust_weighted`, `copd_risk_score`, `gap_score`, `data_confidence`, the recommended action, and `methodology_version: 'district-actions-v1'`). Saving from the region drill-down ([`RegionDetail.tsx`](../client/src/components/RegionDetail.tsx)) instead rolls the districts up: `n_facilities`/`trust_weighted` are **summed**, risk/clean-fuel/tobacco/child-ARI are **averaged over districts that have a value**, and `gap_score` = the **worst (max)** district gap.

### 4b. PDF report verdict ([`scenarioReport.ts`](../client/src/lib/scenarioReport.ts))

The plain-language headline is derived from the snapshot:
- `data_confidence = low` → **"Investigate before deploying"** (data-poor, verify first)
- else `gap_score ≥ 30` → **"Likely a true care gap — prioritise"**
- else `gap_score ≥ 12` → **"Moderate gap — worth a closer look"**
- else → **"Reasonably served on current evidence"**

---

## 5. Formatting conventions

[`numbers.ts`](../client/src/lib/numbers.ts): `formatNumber` adds thousands separators (0 decimals by default); `formatFixed` fixes decimals; percentages show 1 decimal; missing values render as `—` or "not measured" rather than `0`, to keep "unknown" distinct from "zero."

---

## 6. Known limitations (so the numbers aren't over-read)

- **Supply** = web-evidence-weighted facility listings, not verified clinical capacity.
- **Need** = a pollution/smoking/biomass proxy, not measured COPD prevalence.
- **AQI** is averaged across all dates and only where PM2.5 is a prominent pollutant; station coverage is sparse/urban-biased.
- No population denominator and no travel-time/access modelling yet, so supply is not strictly per-capita and "served but far" is not captured.
- District name matching reconciles common NFHS/postal spelling variants (e.g. `AHMADNAGAR→AHMEDNAGAR`, `MAHARASTRA→MAHARASHTRA`) but is not exhaustive.
