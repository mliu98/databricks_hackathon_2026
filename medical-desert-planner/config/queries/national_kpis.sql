-- @param capability STRING
-- National COPD-care supply and risk-proxy KPIs.
WITH pin_geo AS (
  SELECT pincode, statename, district FROM (
    SELECT pincode, statename, district,
           ROW_NUMBER() OVER (PARTITION BY pincode ORDER BY COUNT(*) DESC) AS rn
    FROM databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.india_post_pincode_directory
    GROUP BY pincode, statename, district
  ) WHERE rn = 1
),
facilities_scored AS (
  SELECT
    g.statename,
    g.district,
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
nfhs AS (
  SELECT
    AVG(households_using_clean_fuel_for_cooking_pct) AS clean_fuel_pct,
    AVG(w15_plus_who_use_any_kind_of_tobacco_pct) AS women_tobacco_pct,
    AVG(m15_plus_who_use_any_kind_of_tobacco_pct) AS men_tobacco_pct
  FROM databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.nfhs_5_district_health_indicators
)
SELECT
  COUNT(*) AS n_facilities,
  COUNT(DISTINCT statename) AS n_states,
  COUNT(DISTINCT district) AS n_districts,
  ROUND(AVG(trust_score), 0) AS avg_trust,
  ROUND(SUM(trust_score) / 100.0, 0) AS trust_weighted,
  SUM(CASE WHEN latitude BETWEEN 6 AND 37 THEN 1 ELSE 0 END) AS geocoded,
  ROUND(
    0.60 * (100 - nfhs.clean_fuel_pct)
    + 0.40 * ((nfhs.women_tobacco_pct + nfhs.men_tobacco_pct) / 2.0),
    1
  ) AS avg_copd_risk
FROM fac
CROSS JOIN nfhs
GROUP BY nfhs.clean_fuel_pct, nfhs.women_tobacco_pct, nfhs.men_tobacco_pct;
