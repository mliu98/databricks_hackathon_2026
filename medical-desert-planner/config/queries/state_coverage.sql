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
state_pop AS (
  SELECT * FROM (
    SELECT 'ANDHRAPRADESH' AS state_key, 49386799 AS population UNION ALL
    SELECT 'ARUNACHALPRADESH', 1383727 UNION ALL
    SELECT 'ASSAM', 31205576 UNION ALL
    SELECT 'BIHAR', 104099452 UNION ALL
    SELECT 'CHHATTISGARH', 25545198 UNION ALL
    SELECT 'GOA', 1458545 UNION ALL
    SELECT 'GUJARAT', 60439192 UNION ALL
    SELECT 'HARYANA', 25353081 UNION ALL
    SELECT 'HIMACHALPRADESH', 6864602 UNION ALL
    SELECT 'JAMMUANDKASHMIR', 12267013 UNION ALL
    SELECT 'JHARKHAND', 32988134 UNION ALL
    SELECT 'KARNATAKA', 61095297 UNION ALL
    SELECT 'KERALA', 33406061 UNION ALL
    SELECT 'MADHYAPRADESH', 72626809 UNION ALL
    SELECT 'MAHARASHTRA', 112374333 UNION ALL
    SELECT 'MANIPUR', 2856014 UNION ALL
    SELECT 'MEGHALAYA', 2966889 UNION ALL
    SELECT 'MIZORAM', 1097206 UNION ALL
    SELECT 'NAGALAND', 1978502 UNION ALL
    SELECT 'ODISHA', 41947418 UNION ALL
    SELECT 'PUNJAB', 27743338 UNION ALL
    SELECT 'RAJASTHAN', 68548437 UNION ALL
    SELECT 'SIKKIM', 610577 UNION ALL
    SELECT 'TAMILNADU', 72147030 UNION ALL
    SELECT 'TELANGANA', 35003674 UNION ALL
    SELECT 'TRIPURA', 3673917 UNION ALL
    SELECT 'UTTARPRADESH', 199812341 UNION ALL
    SELECT 'UTTARAKHAND', 10086292 UNION ALL
    SELECT 'WESTBENGAL', 91276115 UNION ALL
    SELECT 'ANDAMANANDNICOBARISLANDS', 380581 UNION ALL
    SELECT 'CHANDIGARH', 1055450 UNION ALL
    SELECT 'DADRAANDNAGARHAVELIANDDAMANANDDIU', 586956 UNION ALL
    SELECT 'DELHI', 16787941 UNION ALL
    SELECT 'LADAKH', 274289 UNION ALL
    SELECT 'PUDUCHERRY', 1247953
  )
),
facilities_scored AS (
  SELECT
    regexp_replace(UPPER(g.statename), '[^A-Z]', '') AS state_key,
    f.latitude,
    try_cast(f.capacity AS DOUBLE) AS reported_capacity,
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
    SUM(CASE WHEN latitude BETWEEN 6 AND 37 THEN 1 ELSE 0 END) AS geocoded,
    SUM(CASE WHEN reported_capacity IS NOT NULL AND reported_capacity >= 0 THEN 1 ELSE 0 END) AS n_with_capacity,
    ROUND(SUM(CASE WHEN reported_capacity >= 0 THEN reported_capacity ELSE 0 END), 0) AS total_reported_capacity
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
    d.state_key,
    COALESCE(f.n_facilities, 0) AS n_facilities,
    COALESCE(f.trust_weighted, 0) AS trust_weighted,
    COALESCE(f.avg_trust, 0) AS avg_trust,
    COALESCE(f.geocoded, 0) AS geocoded,
    COALESCE(f.n_with_capacity, 0) AS n_with_capacity,
    COALESCE(f.total_reported_capacity, 0) AS total_reported_capacity,
    sp.population,
    n.clean_fuel_pct,
    n.women_tobacco_pct,
    n.men_tobacco_pct,
    n.child_ari_pct,
    n.insurance_pct,
    CASE
      WHEN sp.population > 0
      THEN (
        (COALESCE(f.trust_weighted, 0) + COALESCE(f.total_reported_capacity, 0) / 1000.0)
        * 1000000.0
      ) / sp.population
    END AS capacity_per_million,
    CASE
      WHEN n.clean_fuel_pct IS NOT NULL
      THEN 100.0 - n.clean_fuel_pct
    END AS solid_fuel_pct,
    CASE
      WHEN n.women_tobacco_pct IS NOT NULL AND n.men_tobacco_pct IS NOT NULL
      THEN (n.women_tobacco_pct + n.men_tobacco_pct) / 2.0
    END AS adult_tobacco_pct
  FROM state_dim d
  LEFT JOIN state_fac f ON d.state_key = f.state_key
  LEFT JOIN nfhs n ON regexp_replace(regexp_replace(d.state_key, '^(THE|NCTOF)', ''), 'MAHARASTRA', 'MAHARASHTRA') = n.state_key
  LEFT JOIN state_pop sp ON d.state_key = sp.state_key
),
scored AS (
  SELECT
    *,
    MIN(capacity_per_million) OVER () AS min_capacity_per_million,
    MAX(capacity_per_million) OVER () AS max_capacity_per_million
  FROM combined
),
with_stress AS (
  SELECT
    *,
    CASE
      WHEN capacity_per_million IS NOT NULL
       AND max_capacity_per_million > min_capacity_per_million
      THEN 100.0 * (
        1.0 - (capacity_per_million - min_capacity_per_million)
          / (max_capacity_per_million - min_capacity_per_million)
      )
      WHEN capacity_per_million IS NOT NULL
      THEN 50.0
    END AS capacity_stress
  FROM scored
),
risked AS (
  SELECT
    *,
    CASE
      WHEN solid_fuel_pct IS NOT NULL
       AND adult_tobacco_pct IS NOT NULL
       AND capacity_stress IS NOT NULL
      THEN (
          0.30 * solid_fuel_pct
        + 0.20 * adult_tobacco_pct
        + 0.25 * capacity_stress
      ) / 0.75
      WHEN solid_fuel_pct IS NOT NULL AND adult_tobacco_pct IS NOT NULL
      THEN (0.30 * solid_fuel_pct + 0.20 * adult_tobacco_pct) / 0.50
      WHEN solid_fuel_pct IS NOT NULL AND capacity_stress IS NOT NULL
      THEN (0.30 * solid_fuel_pct + 0.25 * capacity_stress) / 0.55
      WHEN adult_tobacco_pct IS NOT NULL AND capacity_stress IS NOT NULL
      THEN (0.20 * adult_tobacco_pct + 0.25 * capacity_stress) / 0.45
      WHEN solid_fuel_pct IS NOT NULL THEN solid_fuel_pct
      WHEN adult_tobacco_pct IS NOT NULL THEN adult_tobacco_pct
      WHEN capacity_stress IS NOT NULL THEN capacity_stress
    END AS copd_risk
  FROM with_stress
)
SELECT
  state,
  n_facilities,
  trust_weighted,
  avg_trust,
  geocoded,
  n_with_capacity,
  total_reported_capacity,
  population,
  ROUND(clean_fuel_pct, 1) AS clean_fuel_pct,
  ROUND(women_tobacco_pct, 1) AS women_tobacco_pct,
  ROUND(men_tobacco_pct, 1) AS men_tobacco_pct,
  ROUND(adult_tobacco_pct, 1) AS adult_tobacco_pct,
  ROUND(child_ari_pct, 1) AS child_ari_pct,
  ROUND(insurance_pct, 1) AS insurance_pct,
  ROUND(copd_risk, 1) AS copd_risk_score,
  CASE
    WHEN copd_risk IS NOT NULL
    THEN ROUND(copd_risk * (1 - LEAST(trust_weighted / 20.0, 1)), 1)
  END AS gap_score,
  CASE
    WHEN trust_weighted >= 8 THEN 'high'
    WHEN trust_weighted >= 2 THEN 'medium'
    ELSE 'low'
  END AS data_confidence
FROM risked
ORDER BY gap_score DESC, n_facilities DESC;
