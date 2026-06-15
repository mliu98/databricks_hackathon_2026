-- @param capability STRING
-- State-level COPD risk proxy versus trust-weighted COPD-care supply.
WITH pin_geo AS (
  SELECT pincode, statename, district FROM (
    SELECT pincode, statename, district,
           ROW_NUMBER() OVER (PARTITION BY pincode ORDER BY COUNT(*) DESC) AS rn
    FROM databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.india_post_pincode_directory
    GROUP BY pincode, statename, district
  ) WHERE rn = 1
),
state_dim AS (
  SELECT
    regexp_replace(UPPER(statename), '[^A-Z]', '') AS state_key,
    INITCAP(MAX(statename)) AS state
  FROM pin_geo
  WHERE statename IS NOT NULL
    AND UPPER(TRIM(statename)) NOT IN ('NA', 'N/A', 'NULL', '')
  GROUP BY 1
),
facilities_scored AS (
  SELECT
    regexp_replace(UPPER(g.statename), '[^A-Z]', '') AS state_key,
    f.latitude,
    lower(concat_ws(
      ' ',
      COALESCE(f.description, ''),
      COALESCE(f.procedure, ''),
      COALESCE(f.equipment, ''),
      COALESCE(f.capability, ''),
      COALESCE(f.specialties, '')
    )) AS evidence_text,
    ROUND(100 * (
        0.22 * (CASE WHEN f.custom_logo_presence = 'true' THEN 1 ELSE 0 END)
      + 0.22 * (CASE WHEN f.affiliated_staff_presence = 'true' THEN 1 ELSE 0 END)
      + 0.20 * LEAST(COALESCE(try_cast(f.distinct_social_media_presence_count AS DOUBLE), 0) / 5.0, 1)
      + 0.18 * (CASE WHEN f.officialWebsite IS NOT NULL AND f.officialWebsite <> '' THEN 1 ELSE 0 END)
      + 0.18 * (CASE WHEN try_cast(f.recency_of_page_update AS DATE) >= DATE'2025-01-01' THEN 1 ELSE 0 END)
    ), 0) AS trust_score
  FROM databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.facilities f
  JOIN pin_geo g ON try_cast(f.address_zipOrPostcode AS BIGINT) = g.pincode
),
fac AS (
  SELECT *
  FROM facilities_scored
  WHERE
    (:capability = 'all' AND evidence_text RLIKE 'copd|chronic obstructive|pulmon|respirat|chest medicine|spirom|pulmonary function|lung function|\\bpft\\b|oxygen therapy|oxygen concentrator|medical oxygen|nebul|inhaler|bronchodilator|pulmonary rehab|respiratory rehab')
    OR (:capability = 'pulmonology' AND evidence_text RLIKE 'copd|chronic obstructive|pulmon|respirat|chest medicine')
    OR (:capability = 'spirometry' AND evidence_text RLIKE 'spirom|pulmonary function|lung function|\\bpft\\b')
    OR (:capability = 'oxygenTherapy' AND evidence_text RLIKE 'oxygen therapy|oxygen concentrator|medical oxygen|ventilat')
    OR (:capability = 'inhalerNebulizer' AND evidence_text RLIKE 'nebul|inhaler|bronchodilator')
    OR (:capability = 'pulmonaryRehab' AND evidence_text RLIKE 'pulmonary rehab|respiratory rehab')
    OR (:capability = 'criticalCare' AND evidence_text RLIKE 'criticalcaremedicine|critical care|intensive care|\\bicu\\b|ventilat')
),
state_fac AS (
  SELECT
    state_key,
    COUNT(*) AS n_facilities,
    ROUND(SUM(trust_score) / 100.0, 1) AS trust_weighted,
    ROUND(AVG(trust_score), 0) AS avg_trust,
    SUM(CASE WHEN latitude BETWEEN 6 AND 37 THEN 1 ELSE 0 END) AS geocoded
  FROM fac
  GROUP BY state_key
),
nfhs AS (
  SELECT
    regexp_replace(regexp_replace(regexp_replace(regexp_replace(
      UPPER(TRIM(state_ut)), '&', 'AND'), '[^A-Z]', ''), '^(THE|NCTOF)', ''), 'MAHARASTRA', 'MAHARASHTRA') AS state_key,
    AVG(households_using_clean_fuel_for_cooking_pct) AS clean_fuel_pct,
    AVG(w15_plus_who_use_any_kind_of_tobacco_pct) AS women_tobacco_pct,
    AVG(m15_plus_who_use_any_kind_of_tobacco_pct) AS men_tobacco_pct,
    AVG(children_prev_symptoms_of_acute_respiratory_infection_ari_2_pct) AS child_ari_pct,
    AVG(hh_member_covered_health_insurance_pct) AS insurance_pct
  FROM databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.nfhs_5_district_health_indicators
  GROUP BY 1
),
combined AS (
  SELECT
    d.state,
    COALESCE(f.n_facilities, 0) AS n_facilities,
    COALESCE(f.trust_weighted, 0) AS trust_weighted,
    COALESCE(f.avg_trust, 0) AS avg_trust,
    COALESCE(f.geocoded, 0) AS geocoded,
    n.clean_fuel_pct,
    n.women_tobacco_pct,
    n.men_tobacco_pct,
    n.child_ari_pct,
    n.insurance_pct
  FROM state_dim d
  LEFT JOIN state_fac f ON d.state_key = f.state_key
  LEFT JOIN nfhs n ON regexp_replace(regexp_replace(d.state_key, '^(THE|NCTOF)', ''), 'MAHARASTRA', 'MAHARASHTRA') = n.state_key
)
SELECT
  state,
  n_facilities,
  trust_weighted,
  avg_trust,
  geocoded,
  ROUND(clean_fuel_pct, 1) AS clean_fuel_pct,
  ROUND(women_tobacco_pct, 1) AS women_tobacco_pct,
  ROUND(men_tobacco_pct, 1) AS men_tobacco_pct,
  ROUND((women_tobacco_pct + men_tobacco_pct) / 2.0, 1) AS adult_tobacco_pct,
  ROUND(child_ari_pct, 1) AS child_ari_pct,
  ROUND(insurance_pct, 1) AS insurance_pct,
  CASE
    WHEN trust_weighted >= 8 THEN 'high'
    WHEN trust_weighted >= 2 THEN 'medium'
    ELSE 'low'
  END AS data_confidence
FROM combined
ORDER BY trust_weighted ASC, n_facilities DESC;
