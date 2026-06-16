# COPD Care-Gap Planner — Design Doc

**Track 2: Medical Desert Planner**
**Capability lens:** Chronic obstructive pulmonary disease (COPD) — diagnosis, treatment & long-term management
**Build target:** React + TypeScript frontend on a premium dark-mode map (MapLibre/Mapbox GL), backend service on a Databricks App
**Visual language:** Adapted from the _Geospatial Discovery Platform_ design system (§8) — dark, calm, single-accent — re-tuned from a discovery aesthetic to an analytics one

---

## 1. Persona & job-to-be-done

**Who:** An NGO coordinator working to reduce the burden of COPD (chronic lung disease) across India. Non-technical. Decides where to run spirometry screening camps, where to improve access to inhalers / oxygen / pulmonary rehab, and where to target awareness about pollution exposure — under a fixed budget.

**The decision they're making:** _"Given limited resources this quarter, which regions have the worst combination of high pollution exposure and weak respiratory care — and can I defend that choice to my board and funders?"_

The starting question is **not** "what solution should we build?" but **"where is the biggest unmet need relative to available services?"** The app turns 10,000 messy facility records — plus air-quality exposure data — into a prioritized, **defensible** answer.

---

## 2. The core question (and why it has two halves)

> _Where are the highest-risk gaps in COPD care, and how confident are we those gaps are real?_

This is deliberately two questions, and the app must answer both:

1. **Where are the gaps?** — respiratory-care capacity vs. pollution-driven need, by geography.
2. **How sure are we?** — confidence in each gap estimate, given how much (and how good) the underlying evidence is.

A region with almost no records is **not** automatically a care gap — it may just be under-reported. Likewise, a region with no air-quality monitor is not automatically clean air. The whole point of this track is to keep "truly bad" separate from "we don't have data."

---

## 3. Needs-assessment framework (how we decide what counts as a gap)

A gap is always measured against a specific population and service. The steps below come from standard NGO needs-assessment practice, annotated with **what this app can actually support** given that our primary dataset is facility records (supply side), now combined with air-quality exposure (need side).

### 3.1 Define the population

Every gap is relative to who you serve — e.g. people in high-PM2.5 industrial districts, rural households using biomass cooking fuel, elderly smokers. In the app this is a **scoping selector** (capability + geography +, where data allows, a population segment). _App support: framing input._

### 3.2 Map the care cascade

For COPD the journey is: exposed/at-risk → symptomatic → **diagnosed (spirometry)** → on treatment (inhalers/bronchodilators) → **managed long-term (follow-up, rehab, oxygen)** → exacerbation care available. The biggest gap is often _not_ the obvious one:

| Stage (illustrative)            | People |
| ------------------------------- | ------ |
| Have COPD                       | 10,000 |
| Diagnosed                       | 3,500  |
| On regular treatment            | 2,000  |
| In long-term management / rehab | 400    |

In India the weakest links are usually **diagnosis** (spirometry is scarce, so most COPD is undiagnosed) and **long-term management** (pulmonary rehab is rare; inhaler adherence is low). _App support: **external/optional** — facility records don't contain patient-journey data. Show only if a survey source is wired in; otherwise mark "not measured" rather than implying zero._

### 3.3 Calculate coverage

`Coverage Rate = People Receiving Service ÷ People Needing Service`. _App support: **partial** — the denominator (people needing) is approximated from exposure × population (see 3.4); the numerator from facility capacity. Always shown next to its confidence._

### 3.4 Compare supply vs demand — **air quality drives demand**

**Demand (need):** COPD prevalence is hard to obtain directly, so we use **pollution exposure as the primary, measurable proxy** — ambient PM2.5 / AQI, ideally combined with household-air-pollution and smoking indicators — weighted by population. **Supply:** pulmonology, spirometry, oxygen therapy, nebulizers/inhalers, pulmonary rehab, exacerbation/ICU capacity, extracted from the records. _App support: **core / strongest fit**. The flagship analysis is the **exposure–capacity mismatch**: high pollution + low respiratory-care capacity = the highest-priority gap._

### 3.5 Look for geographic inequality (access, not just presence) — **amplified for chronic disease**

COPD needs _repeated_ contact: diagnosis, monthly refills, rehab sessions, exacerbation care. So distance to care matters far more than for a one-time service — a clinic 3 hours away is effectively unavailable for ongoing management. _App support: **core** — drives an "access" layer (travel-time / distance to nearest capable facility); a region with distant-only clinics reads as a gap, not as covered._

### 3.6 Measure affordability — **ongoing, not one-time**

Inhalers, oxygen, and rehab are _recurring_ costs, and patients often miss work for repeat visits — so affordability is an even bigger barrier for COPD than for acute care. _App support: **mostly out of scope from records** (occasional govt-vs-private / fee hints in free text); captured as a qualitative attribute per region — see 3.7._

### 3.7 Conduct community interviews

Numbers tell you _where_; interviews tell you _why_ — surfacing barriers data misses (smoking/biomass norms, stigma around breathlessness, misinformation, cost of inhalers). _App support: **qualitative-notes feature** — the coordinator attaches field notes / interview findings to a region, stored with the planning scenario (Screen 4), so quantitative gaps and the human "why" sit together._

### 3.8 Prioritize with an impact matrix

Score each candidate gap so the choice is explicit and defensible — criteria: population affected, exposure severity, current service shortage, cost to intervene, NGO capability.

| Gap (illustrative)                          | Impact (1-5) | Feasibility (1-5) |
| ------------------------------------------- | ------------ | ----------------- |
| Spirometry screening in high-PM2.5 district | 5            | 4                 |
| Community inhaler-access program            | 4            | 4                 |
| Regional pulmonary-rehab center             | 5            | 2                 |

_App support: **the prioritization output** — Impact auto-seeded from exposure × shortfall, Feasibility adjustable; regions ranked. Wired to the four-quadrant classification in §5._

> **Worked example (a high-pollution district):** PM2.5 runs far above safe limits, so you assume the gap is hospital beds for acute attacks. But on inspection there's _no spirometry_ in the district (so most COPD is undiagnosed) and _no pulmonary rehab_. The real gaps are **diagnosis and long-term management**, not acute beds — pointing to mobile spirometry camps, community inhaler programs, and tele-rehab follow-up. The lesson the app must embody: _the gap is rarely where you first look — find it by measuring the whole cascade against exposure, not the headline number._

**Bottom line:** the strongest needs assessments combine **quantitative data** (exposure, capacity, distance) with **qualitative data** (interviews, community feedback). This app does the quantitative heavy lifting from records + air-quality layers, and gives the coordinator a structured place to fold in the qualitative — so the final priority is both _needed_ and _feasible_.

---

## 4. Data architecture: Unity Catalog is the analytical source of truth

The application should not ingest or join analytical files in the browser or in Lakebase. Almost all read-heavy data comes from governed Unity Catalog tables and views through a Databricks SQL Warehouse. Lakebase is reserved for transactional planner state.

### 4.1 Sources currently available in Unity Catalog

The current build queries these challenge-provided tables:

| Unity Catalog object                                                                                         | Role in the current build                                                                                 | Important limitation                                                                              |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.facilities`                        | Facility identity, location, specialties, procedure, equipment, capability text, and web-presence signals | COPD flags are currently derived at query time; materialize them in a silver table for production |
| `databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.india_post_pincode_directory`      | Resolves PIN codes to state and district                                                                  | PINs may be missing, malformed, or map to multiple locality records                               |
| `databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.nfhs_5_district_health_indicators` | Household clean-fuel use, adult tobacco use, child ARI context, and insurance                             | Risk proxy only; it is not measured COPD prevalence                                               |

The current app's need score is a **COPD risk proxy**: 60% household solid-fuel exposure (`100 - clean fuel %`) plus 40% average adult tobacco use. Its supply score comes from respiratory, spirometry, oxygen, inhaler/nebulizer, pulmonary-rehab, and critical-care evidence extracted from facility text. This is COPD-specific, but it is not yet the full PM2.5 × population burden model.

Additional indicators used to explain and route interventions:

| Indicator                                       | Geographic level        | Planning use                                                      | Limitation                                                                      |
| ----------------------------------------------- | ----------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Household smoke exposure (`100 - clean fuel %`) | District/state          | Identifies prevention and clean-cooking outreach need             | Household exposure proxy, not measured PM2.5                                    |
| Adult tobacco use                               | District/state          | Identifies cessation and targeted screening need                  | Survey estimate, not diagnosed COPD                                             |
| Health-insurance coverage                       | District/state          | Flags affordability/referral-navigation barriers                  | Does not measure COPD benefit coverage or actual out-of-pocket cost             |
| Child ARI symptoms                              | District/state          | Respiratory-health context                                        | Pediatric acute indicator; excluded from the COPD risk formula                  |
| Facility capability mix                         | Facility/district/state | Separates diagnosis, treatment, rehab, and exacerbation-care gaps | Extracted from web/catalog text rather than clinical verification               |
| Reported doctors and capacity                   | Facility/district       | Prompts staffing and capacity validation                          | Present for only a subset of records; missing is unknown, not zero              |
| City concentration of matching facilities       | City within district    | Flags possible within-district geographic access concentration    | Facility city is available, but population and travel-time denominators are not |
| Facility age and evidence freshness             | Facility/district       | Prompts infrastructure/equipment audit                            | Does not prove physical condition                                               |

### 4.2 Target medallion model in Unity Catalog

Use a project-owned catalog/schema for derived assets; examples below use `medical_desert_planner`. Challenge-owned source tables remain read-only.

| Layer  | Proposed object                                                     | Purpose                                                                                                                                |
| ------ | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Bronze | `bronze.facilities_raw` or a governed view over the challenge table | Stable snapshot of source facility records                                                                                             |
| Bronze | `bronze.pm25_observations_raw`                                      | CPCB/OpenAQ station observations or imported satellite grid values                                                                     |
| Bronze | `bronze.population_raw`                                             | Census/projection population by district                                                                                               |
| Silver | `silver.facilities_geocoded`                                        | Canonical state/district, valid coordinates, deduplicated facility identity                                                            |
| Silver | `silver.facility_copd_capabilities`                                 | One row per facility/capability with `is_present`, extraction confidence, source snippet, model/rule version, and extraction timestamp |
| Silver | `silver.district_exposure`                                          | Annual PM2.5, source type, monitor distance/coverage, and exposure confidence                                                          |
| Silver | `silver.district_population`                                        | Population denominator and source year                                                                                                 |
| Gold   | `gold.district_copd_gap`                                            | Need, supply, access, confidence, quadrant, and component scores by district/capability                                                |
| Gold   | `gold.state_copd_gap`                                               | State roll-up used by the national map and ranking                                                                                     |
| Gold   | `gold.facility_evidence`                                            | Auditable record-level evidence used by the drill-down                                                                                 |
| Gold   | `gold.specialty_options`                                            | Controlled capability selector values                                                                                                  |

The AppKit SQL files in `config/queries/` should query only the gold contract once it is available. This keeps business logic in governed SQL/views, makes the React client thin, and lets the SQL Warehouse cache and optimize repeated reads.

### 4.3 Canonical gold-view contract

`gold.district_copd_gap` should expose at least:

```text
state, district, capability, population, annual_pm25,
exposure_confidence, n_facilities, verified_capacity,
trust_weighted_capacity, avg_facility_trust,
distance_to_nearest_capable_km, access_score,
need_score, scarcity_score, gap_score,
coverage_confidence, quadrant, computed_at, methodology_version
```

`gold.facility_evidence` should expose the fields needed to defend an aggregate:

```text
facility_id, facility_name, state, district, latitude, longitude,
capability, is_present, extraction_confidence, source_snippet,
record_trust_score, trust_reasons, source_updated_at
```

Every score must carry a `methodology_version` or model/rule version so saved scenario snapshots remain interpretable after the pipeline changes.

### 4.4 Ownership and write paths

- **Unity Catalog + SQL Warehouse:** analytical reads, extracted evidence, geographic enrichment, aggregations, and quality metrics.
- **Lakebase Postgres:** scenario name, selected geography/capability, qualitative notes, overrides, feasibility inputs, and a snapshot of displayed metrics.
- **Databricks Workflows / Lakeflow:** scheduled ingestion, extraction, geocoding, quality checks, and gold-view refresh.
- **Model Serving (optional):** COPD capability extraction from facility text. Persist results back to Unity Catalog; do not invoke the model for every page load.
- **Browser:** rendering and interaction only. It never receives workspace credentials or issues arbitrary SQL.

### 4.5 Data-quality and uncertainty rules

- Reject or quarantine coordinates outside India and retain a geocoding status/reason.
- Deduplicate facilities before aggregation; do not count multiple web records as multiple care sites.
- Keep `unknown` distinct from `false` for every extracted capability.
- Preserve the exact source snippet for each positive or negative extraction.
- Compute supply per population where a valid denominator exists; raw counts are supporting context only.
- Track exposure confidence separately from coverage confidence.
- Mark outcome/prevalence as `not_measured` unless a governed source is joined.
- A region with no facility evidence is a **data desert** unless record completeness is high enough to support a true-gap classification.

**Air-quality caveats remain load-bearing:** station monitoring is sparse and urban-biased, while ambient PM2.5 misses indoor biomass exposure. Prefer a satellite-derived annual surface for coverage, retain station provenance where available, and explicitly flag ambient-only rural estimates.

> V1 fallback: if PM2.5, population, access, or COPD extraction tables are not ready, ship the existing facility/NFHS view as a clearly labeled generic proxy. Do not call it COPD burden or exposure-driven need.

---

## 5. Key concept: Need × Coverage × Confidence

Two engines plus one honesty overlay:

- **Need** = pollution exposure × population (the COPD-burden proxy from §3.4).
- **Coverage** = respiratory-care capacity from the records.
- **Confidence** = how much we trust the coverage estimate (and, secondarily, the exposure estimate).

The headline gap = **high need + low coverage**; confidence tells you whether to act or to go verify first. The Coverage × Confidence quadrant stays the trust engine; need sets _how severe_ a low-coverage region is.

```
                 HIGH CONFIDENCE
                       │
   Unverified  ────────┼────────  TRUE CARE GAP
   (audit claims)      │          (deploy — severity set by exposure)
 HIGH COVERAGE ────────┼──────── LOW COVERAGE
   Well served  ───────┼────────  DATA DESERT
                       │          (go collect data)
                 LOW CONFIDENCE
```

| Quadrant          | Coverage       | Confidence | Recommended action                          |
| ----------------- | -------------- | ---------- | ------------------------------------------- |
| **True care gap** | Low            | High       | Prioritize (rank by exposure-driven need)   |
| **Data desert**   | Low            | Low        | Investigate first — survey before deploying |
| **Unverified**    | High (claimed) | Low        | Audit / verify facility claims              |
| **Well served**   | High           | High       | Monitor only                                |

The app's primary output is not a single ranked list but **four differentiated action types**, with the True-Gap regions ranked by exposure — which is what makes the recommendations trustworthy and fundable.

---

## 6. Extraction & trust pipeline

**6a. Structure extraction (free text → fields).**
Per record, extract: pulmonology present, **spirometry / pulmonary function testing**, **oxygen therapy / concentrators**, nebulizers / inhaled medications, **pulmonary rehabilitation**, exacerbation / ICU / ventilator capacity, chronic-disease follow-up. Store the **source snippet** for each extracted fact as evidence.

**6b. Per-record trust score (0–1).** From signals such as:

- Completeness of structured fields (location, specialty present?)
- Specificity of free text (names concrete equipment/procedures vs. vague claims)
- Internal consistency (does free text match the declared specialty?)
- Geographic resolvability (does the location map to a real district/PIN?)

**6c. Roll-up to region confidence.**
A region's confidence combines _how many_ records back the estimate **and** their average trust — five specific, consistent records beat fifty vague ones. The exposure layer carries its own confidence (satellite vs. station vs. none).

---

## 7. Screens & user flow

**Screen 1 — National map (entry point).**
Clean SVG choropleth of India by state (React; see §8). Flagship view is the **exposure–capacity mismatch**, with switchable layers:

- **Exposure layer:** PM2.5 / AQI (satellite-derived for full coverage) — the need engine.
- **Coverage layer:** per-capita respiratory-care capacity (not raw clinic count).
- **Access layer (§3.5):** travel-time / distance to nearest capable facility.
- **Confidence layer:** trust in the capacity number (hatched / desaturated for low-confidence), plus an "ambient-only / no monitor" marker for exposure uncertainty.
  Breadcrumb, search-to-jump, and a legend tied to the four quadrants. The default rendering highlights **high-exposure + low-coverage** regions.

**Screen 2 — State / district drill-down.**
On click, for the selected region: exposure and coverage vs. population, the access metric, optional outcome layer (or "not measured"), the confidence band (record count + average trust), and a quadrant classification with a plain-language verdict ("High exposure, weak diagnosis capacity — likely true gap" / "Too little data to call"). District breakdown to keep drilling (PIN as a record attribute, not a map layer).

The state click also opens a compact action brief in the map's upper-right corner. It contains:

- Basic state context: COPD risk proxy, matching facility supply, care-gap score, and evidence confidence.
- The top three district-specific interventions, ranked by care-gap score.
- A plain-language rationale and evidence-confidence label for every intervention.
- Up to two same-district potential partner organizations with publicly listed phone, email, or website fields.
- **Add to scenario**, pre-filling the district, intervention, rationale, evidence confidence, and methodology version while remaining editable.

Every displayed metric and gap must explain: what it measures, why it matters for COPD planning, how it is calculated, how to interpret high/low values, and its key limitation. Compact descriptions appear with the metric; an expandable **How this was calculated** section provides the complete method.

### 7.1 Evidence-bounded intervention rules (v1)

The app must not convert weak web signals into unsupported operational claims. V1 uses fixed, visible thresholds:

| Condition                                                        | Recommendation wording                                                   | Guardrail                                                                                                |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| No matching capability + fewer than two broader facility records | **Verify care availability**                                             | Never recommend capital deployment from absence-of-data alone                                            |
| Two or more broader facility records + no matching capability    | **Assess a new access point**; for spirometry, consider a mobile service | Verify the inventory, demand, referral pathways, and operating partner before committing capital         |
| Existing supply + old establishment/stale web-evidence signals   | **Audit and upgrade facility**                                           | Age or stale pages do not prove physical disrepair                                                       |
| Existing supply + missing named-staff evidence                   | **Verify staffing and recruit/outreach**                                 | Missing online staff names do not prove a vacancy                                                        |
| Existing supply concentrated in one city                         | **Extend services beyond the main city**                                 | City concentration is an access warning, not a travel-time result                                        |
| Existing supply + remaining high mismatch                        | **Expand service reach**                                                 | Prefer outreach, referral coordination, or extra service days before assuming a new building is required |

Potential collaborators are facilities or organizations in the same district with complementary COPD capabilities and a public contact field. They are labeled **potential partners**, not verified NGOs or committed collaborators. The app does not infer partnership status from organization type.

**Screen 3 — Evidence (records behind the aggregate).**
The auditable layer. For the selected region, list the actual facility records, each showing extracted COPD-care fields **with the source snippet highlighted**, and the per-record trust score and _why_. For the exposure number, show its source (satellite grid / nearest station) and distance to that station. Traces every regional conclusion back to source.

**Screen 4 — Planning scenario (prioritize / save / revise).**
The coordinator assembles a scenario: capability + geography + ranked regions.

- **Impact matrix (§3.8):** Impact auto-seeded from exposure × capacity shortfall, Feasibility adjustable; regions ranked.
- **Qualitative notes (§3.6–3.7):** attach interview findings / affordability barriers per region.
- **Edit** action items and override a classification (with a reason).
- **Save** and revise later; **export** a board-ready summary.

---

## 8. Visual design system & map experience

Adapted from the _Geospatial Discovery Platform_ spec. The aesthetic carries over wholesale; the **components and color logic are re-tuned from a discovery product to an analytics one**. Two of the spec's rules are deliberately changed for this use case (see ⚠ below).

### 8.1 Design principles (kept)

- **The map is the product** — ~70–80% of the viewport; everything else supports map interaction. A calm, focused canvas suits a non-technical planner.
- **Spatial context first** — the map stays visible at all times; no fully-obscuring modals. Region detail appears in an anchored floating panel (§8.5).
- **Reduced cognitive load** — hide POI labels, street names, and buildings. ⚠ **Do NOT hide administrative boundaries** — for this app, state/district boundaries _are_ the data, so they're kept (subtly styled) while the genuine noise is stripped.

### 8.2 Color system

- **Base palette (kept as-is):** Background `#121212`, Surface `#1A1A1A`, Elevated `#222222`, Border `rgba(255,255,255,0.08)`; text `#FFFFFF` / `rgba(255,255,255,0.65)` / `rgba(255,255,255,0.40)`.
- **Accent `#57FFC4` — scoped to interaction only.** ⚠ The "one accent color" rule can't encode three data dimensions, so the accent is reserved for **selection, hover, active layer, and the priority (True-Gap) quadrant**. Data is _not_ drawn in the accent.
- **Data encoding — one sequential scale at a time.** Only one data layer is active at once, so there are never competing saturated hues on screen (honoring the spirit of "one accent"):
  - _Coverage layer:_ surface-dark → mint (more capacity = brighter).
  - _Exposure layer:_ surface-dark → a single restrained warm hue (kept desaturated to stay calm); high PM2.5 = warmer.
  - _Confidence:_ never a hue — rendered as **opacity / hatch overlay** (low confidence = hatched/desaturated), so "uncertain" reads as visually unresolved rather than as a value.
  - _Quadrant legend:_ accent marks **True Care Gap** only; the other three quadrants use muted neutrals. Focus goes where action goes.
- **Contrast:** ⚠ the desaturated data scales must still clear the 4.5:1 minimum (§8.7) against `#121212` — verify the low end of each ramp; lift it if it fails.

### 8.3 Typography & layout (kept)

- **Inter** (fallback SF Pro Display). Page title 22/600, section 18/600, card title 16/500, body 14/400, metadata 12/500.
- Desktop: 72px header; **320–420px sidebar** (search + ranked region/facility list); map fills the rest.

### 8.4 Map styling

- Base: **MapLibre/Mapbox GL**, `dark-v11`. Land `#202020`, water `#181818`, roads `#3A3A3A`/`#4D4D4D`/`#5A5A5A` at ~1.5× width, buildings disabled, labels hidden (country/city optional).
- **Region fills (the core adaptation):** the choropleth lives in fill layers over the dark base, not in POI markers. State → district drill via click; locked India bounds + reset control + breadcrumb so a non-technical user can't get lost. (Earlier doc versions proposed an SVG choropleth for exactly this calm-navigation reason; MapLibre with fill layers achieves the same while delivering the premium dark aesthetic the spec calls for.)

### 8.5 Components (repurposed for analytics)

- **Floating information panel** (anchored upper-right, ≤420px, `rgba(20,20,20,0.95)`, 24px radius, 20px backdrop blur) → **state action brief** = state context plus the top three district-specific interventions, partner contacts, evidence confidence, and **Add to scenario**. Full district and record evidence remains below the map.
- **Result cards** (88px, 24px radius, `#181818`) → the **ranked region list** and, on drill-down, the **facility list**. Selected state uses the 2px `#57FFC4` border + glow.
- **Markers** (badge + stat chip) → used **only at district level** for facilities: badge carries a capability glyph (not a brand logo), stat chip shows trust score or distance.
- **Route visualization (3-layer glow)** → the **access layer**: glowing route from population centroid to nearest capable facility, making "served but far" tangible. Glow 16px/0.30/blur 10, core 8px mint, round caps.

### 8.6 Motion (kept)

Marker hover 1.0→1.08 (150ms); card-selection glow fade 200ms; route reveal animated draw 500ms easeOutCubic.

### 8.7 Accessibility (kept, with a data caveat)

4.5:1 minimum contrast, 44px touch targets, full keyboard navigation, screen-reader labels. Plus: the choropleth must not rely on color alone — pair it with the hatch encoding for confidence and with the on-hover numeric tooltip, so colorblind users and low-vision users get the value without the hue.

---

## 9. Architecture & engineering stack

- **Current frontend:** React + TypeScript + Vite, Tailwind CSS, Databricks AppKit UI, React Router, and local React state. The national map now uses MapLibre GL with a dark CARTO/OpenStreetMap basemap and the bundled India state GeoJSON as an interactive choropleth source.
- **Target map enhancements:** add district geometry, facility-point markers, PM2.5 grids, and evidence-backed access routes as those governed datasets become available. Zustand, Framer Motion, and deck.gl remain optional future choices.
- **Current navigation UX:** Planner and Saved Scenarios routes, capability filter, coverage/gap toggle, state selection, district table, and facility evidence cards.
- **Target navigation UX:** breadcrumb (India › Maharashtra › Pune), exposure/coverage/access/confidence layer switcher, quadrant legend, search-to-jump, and district geometry.
- **Backend / data layer:** Node + Express through Databricks AppKit. The Analytics plugin executes named, parameterized SQL files against a SQL Warehouse; the browser never sends arbitrary SQL. The Lakebase plugin persists scenarios through server-owned API routes. COPD extraction should run upstream in a Workflow or Serving Endpoint and write versioned results to Unity Catalog rather than running synchronously during page requests.
- **Unity Catalog contract:** challenge source tables feed project-owned silver and gold views described in §4. The app reads pre-aggregated state/district gap views and record-level evidence views. PM2.5 is spatially joined upstream, so the client renders values rather than performing geospatial joins.
- **Map assets:** state GeoJSON is currently bundled with the client. District boundaries can later move to a Unity Catalog Volume or vector-tile endpoint if size/performance requires it.
- **Transactional storage:** Lakebase stores user-owned scenarios and notes only; it is not a duplicate analytics warehouse.
- **Phasing (from the spec, mapped to this app):** Phase 2 — heatmaps (PM2.5 surface), temporal playback (seasonal AQI, §11.3), cluster expansion, AI-generated region summaries. Phase 3 — story mode for board presentations, agent-driven exploration of the gap list.

---

## 10. Mapping to the challenge rubric

| Requirement                                                                                    | Where it's met                                                                                              |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Extract structure from records                                                                 | §6a extraction pipeline                                                                                     |
| Show evidence for conclusions                                                                  | Screen 3 (snippets + per-record trust + exposure source)                                                    |
| Communicate uncertainty honestly                                                               | §4 data limits & air-quality caveats, §5 confidence axis, §8.2 confidence-as-hatch, "not measured" handling |
| Distinguish real gaps from data-poor regions                                                   | §5 quadrants (True gap vs Data desert); applies to both facility and air data                               |
| Save / revise work                                                                             | Screen 4 (impact matrix + qualitative notes + save)                                                         |
| Minimum workflow (select capability + geography → coverage → drill to records → save scenario) | Screens 1 → 2 → 3 → 4                                                                                       |
| Methodology / needs assessment                                                                 | §3 framework, operationalized across §5–§7                                                                  |
| Trustworthy, non-technical UX                                                                  | §8 design system (calm dark canvas, accent-for-focus, accessible)                                           |

---

## 11. Open decisions before build

1. **Air-quality source & resolution:** CPCB stations (sparse, urban) vs. satellite-derived PM2.5 (full coverage). Default to satellite for spatial completeness; carry exposure confidence per region.
2. **Indoor air pollution:** can we add household biomass-fuel data? Without it, rural exposure (and therefore rural COPD risk) is undercounted — decide explicitly and label affected regions.
3. **Temporal dimension:** AQI is seasonal (e.g. winter peaks). Use an annual average for prioritization v1; consider a seasonal view later for _timing_ deployments.
4. **External outcome data:** can we source COPD prevalence / cascade in time? If not, scope to exposure + capacity + access and label outcome "not measured."
5. **Access modeling:** straight-line distance vs. road/travel-time. Start with distance-to-nearest-capable-facility (weighted toward repeat-visit feasibility for chronic care).
6. **Extraction approach:** LLM-based vs. rules. LLM is more robust to messy text; its uncertainty should feed the trust score.
7. **Thresholds & weights:** v1 uses fixed, transparent rules and records `methodology_version = district-actions-v1` in saved action snapshots. Planner-adjustable thresholds remain a later feature because silent configurability would weaken comparability between scenarios.
8. **Exposure color scale:** the desaturated warm ramp must clear 4.5:1 contrast on `#121212` (§8.2/§8.7) — confirm the low end is legible, and that exposure vs. coverage ramps are distinguishable when users switch layers.
9. **Backend framework:** Node + Express is now selected through AppKit. Keep extraction in Databricks Workflows/Model Serving rather than introducing a second application backend.

---

## 12. Current build audit (June 15, 2026)

### Implemented

- React/TypeScript planner with an India state choropleth and state ranking.
- Named AppKit Analytics queries against Unity Catalog for national, state, district, specialty, and facility evidence views.
- State-to-district drill-down and record-level facility evidence.
- Trust-weighted facility counts and explicit low/medium/high data-confidence labels.
- Lakebase-backed scenario create, list, update API, and delete.
- Production build, type checking, linting, and Playwright smoke-test scaffolding.

### Implemented in this revision

- Saved scenarios can be revised from the UI, matching the existing `PATCH /api/scenarios/:id` route.
- Unity Catalog and Lakebase responsibilities are documented explicitly.
- AppKit Analytics parameter objects are memoized to prevent render-driven SQL refetch loops.
- AppKit alerts now use the required description slot, fixing collapsed notices and error messages.
- COPD capability filters now cover pulmonology, spirometry, oxygen therapy, inhaler/nebulizer access, pulmonary rehabilitation, and critical care.
- The gap score now combines NFHS household solid-fuel exposure and adult tobacco use with trust-weighted COPD-care scarcity.
- District rows expose COPD risk, clean-fuel coverage, adult tobacco use, child ARI context, supply, confidence, and gap score.
- Facility evidence cards expose the matched COPD capability flags and respiratory-specific source snippets.
- Regions with zero matching COPD facilities remain visible instead of disappearing from the analysis.
- State selection opens a map-anchored action brief with state context and the three highest-gap district interventions.
- Recommendation rules distinguish verified scarcity from insufficient catalog evidence; low-confidence districts receive a verification action first.
- Facility age, web freshness, and named-staff presence are used only as audit prompts, not as proof of disrepair or vacancies.
- Same-district potential partners show public Unity Catalog contact fields and complementary COPD capability tags.
- Intervention cards can be added directly to a Lakebase planning scenario with the action, rationale, confidence, and methodology version pre-filled.
- Metric cards, district tables, and the action panel explain what each risk, supply, gap, and confidence measure means and how it should be used.
- Intervention ranking now selects distinct action types where the evidence supports them instead of filling all three slots with the same recommendation.
- District analysis now includes city concentration, doctor/capacity reporting, capability-mix gaps, insurance coverage, and household-smoke/tobacco gap drivers.
- Common NFHS/postal district spelling variants are reconciled so valid Maharashtra indicators are not dropped.
- The planner shell now follows the supplied dark geospatial reference: left result rail, full interactive MapLibre canvas, rounded glass panels, mint selection/coverage styling, dark street context, hover popups, and map navigation controls.

### Missing for the COPD design target

1. **Materialized extraction:** COPD flags are derived in named SQL queries, but are not yet persisted as a versioned silver extraction table.
2. **Ambient exposure:** no PM2.5/AQI source is joined; current need uses household solid-fuel exposure and tobacco use.
3. **Population normalization:** coverage is a raw/trust-weighted facility count, not capacity per population.
4. **Access modeling:** distance or travel time to the nearest capable facility is not computed.
5. **Quadrant classification:** recommendation behavior now distinguishes low-confidence verification from adequate-evidence scarcity, but the complete four-quadrant visualization is not yet displayed.
6. **Evidence semantics:** current trust uses web presence and recency; it is not extraction confidence or clinical verification.
7. **Planning workflow:** recommendations can be added to scenarios, but impact/feasibility scoring, classification overrides, structured regional notes, and board-ready export are not built.
8. **Map depth:** district table drill-down exists, but district geometry, facility points, confidence hatching, and route visualization do not.
9. **Pipeline operations:** no scheduled ingestion/extraction job, data-quality tests, lineage dashboard, or freshness SLA is defined.
10. **Automated coverage:** smoke tests cover page shells only; SQL contracts, scenario CRUD, map interactions, and error states need tests.
11. **Visual target:** the current AppKit UI is light and card-based; the premium dark, map-dominant design in §8 has not been implemented.

### Recommended build order

1. Create the silver facility/geography views and gold generic-gap contract in Unity Catalog.
2. Add COPD capability extraction with source snippets and versioned confidence.
3. Ingest population and PM2.5, then replace the NFHS proxy in the gold gap views.
4. Add access distance and quadrant classification.
5. Update the UI to consume the stable gold contract, then add impact/feasibility and export.
