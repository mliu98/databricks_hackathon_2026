-- @param state STRING
-- @param capability STRING
-- District COPD risk proxy versus trust-weighted COPD-care supply.
WITH pin_geo AS (
  SELECT pincode, statename, district FROM (
    SELECT pincode, statename, district,
           ROW_NUMBER() OVER (PARTITION BY pincode ORDER BY COUNT(*) DESC) AS rn
    FROM databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.india_post_pincode_directory
    GROUP BY pincode, statename, district
  ) WHERE rn = 1
),
district_dim AS (
  SELECT
    statename,
    district,
    regexp_replace(UPPER(district), '[^A-Z]', '') AS district_key
  FROM pin_geo
  WHERE UPPER(statename) = UPPER(:state)
  GROUP BY statename, district
),
facilities_scored AS (
  SELECT
    g.statename,
    g.district,
    f.address_city,
    f.affiliated_staff_presence,
    f.acceptsVolunteers,
    try_cast(f.yearEstablished AS INT) AS year_established,
    try_cast(f.numberDoctors AS DOUBLE) AS number_doctors,
    try_cast(f.capacity AS DOUBLE) AS reported_capacity,
    try_cast(f.recency_of_page_update AS DATE) AS page_updated_at,
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
  WHERE UPPER(g.statename) = UPPER(:state)
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
dist_catalog AS (
  SELECT
    regexp_replace(UPPER(district), '[^A-Z]', '') AS district_key,
    COUNT(*) AS catalog_records,
    ROUND(SUM(trust_score) / 100.0, 1) AS catalog_trust_weighted,
    ROUND(AVG(trust_score), 0) AS avg_catalog_trust
  FROM facilities_scored
  GROUP BY 1
),
city_fac AS (
  SELECT
    regexp_replace(UPPER(district), '[^A-Z]', '') AS district_key,
    COALESCE(NULLIF(UPPER(TRIM(address_city)), ''), 'UNKNOWN') AS city_key,
    COUNT(*) AS city_facilities
  FROM fac
  GROUP BY 1, 2
),
city_summary AS (
  SELECT
    district_key,
    COUNT(CASE WHEN city_key <> 'UNKNOWN' THEN 1 END) AS n_cities_with_supply,
    MAX(city_facilities) AS largest_city_facilities
  FROM city_fac
  GROUP BY 1
),
dist_fac AS (
  SELECT
    regexp_replace(UPPER(district), '[^A-Z]', '') AS district_key,
    COUNT(*) AS n_facilities,
    ROUND(SUM(trust_score) / 100.0, 1) AS trust_weighted,
    ROUND(AVG(trust_score), 0) AS avg_trust,
    SUM(CASE WHEN affiliated_staff_presence <> 'true' OR affiliated_staff_presence IS NULL THEN 1 ELSE 0 END) AS n_without_named_staff,
    SUM(CASE WHEN year_established IS NOT NULL AND year_established < 2000 THEN 1 ELSE 0 END) AS n_established_before_2000,
    SUM(CASE WHEN page_updated_at IS NULL OR page_updated_at < DATE'2025-01-01' THEN 1 ELSE 0 END) AS n_stale_web_evidence,
    SUM(CASE WHEN number_doctors IS NOT NULL AND number_doctors >= 0 THEN 1 ELSE 0 END) AS n_with_doctor_count,
    ROUND(SUM(CASE WHEN number_doctors >= 0 THEN number_doctors ELSE 0 END), 0) AS reported_doctors,
    SUM(CASE WHEN reported_capacity IS NOT NULL AND reported_capacity >= 0 THEN 1 ELSE 0 END) AS n_with_capacity,
    ROUND(SUM(CASE WHEN reported_capacity >= 0 THEN reported_capacity ELSE 0 END), 0) AS total_reported_capacity,
    SUM(CASE WHEN lower(COALESCE(acceptsVolunteers, '')) = 'true' THEN 1 ELSE 0 END) AS n_accepts_volunteers,
    SUM(CASE WHEN evidence_text RLIKE 'spirom|pulmonary function|lung function|\\bpft\\b' THEN 1 ELSE 0 END) AS n_spirometry,
    SUM(CASE WHEN evidence_text RLIKE 'oxygen therapy|oxygen concentrator|medical oxygen|ventilat' THEN 1 ELSE 0 END) AS n_oxygen,
    SUM(CASE WHEN evidence_text RLIKE 'nebul|inhaler|bronchodilator' THEN 1 ELSE 0 END) AS n_inhaler_nebulizer,
    SUM(CASE WHEN evidence_text RLIKE 'pulmonary rehab|respiratory rehab' THEN 1 ELSE 0 END) AS n_pulmonary_rehab,
    SUM(CASE WHEN evidence_text RLIKE 'criticalcaremedicine|critical care|intensive care|\\bicu\\b|ventilat' THEN 1 ELSE 0 END) AS n_critical_care
  FROM fac
  GROUP BY 1
),
nfhs AS (
  SELECT
    regexp_replace(regexp_replace(regexp_replace(regexp_replace(
      UPPER(TRIM(state_ut)), '&', 'AND'), '[^A-Z]', ''), '^(THE|NCTOF)', ''), 'MAHARASTRA', 'MAHARASHTRA') AS state_key,
    CASE regexp_replace(UPPER(TRIM(district_name)), '[^A-Z]', '')
      WHEN 'AHMADNAGAR' THEN 'AHMEDNAGAR'
      WHEN 'BID' THEN 'BEED'
      WHEN 'BULDANA' THEN 'BULDHANA'
      WHEN 'GONDIYA' THEN 'GONDIA'
      WHEN 'RAIGARH' THEN 'RAIGAD'
      ELSE regexp_replace(UPPER(TRIM(district_name)), '[^A-Z]', '')
    END AS district_key,
    AVG(households_using_clean_fuel_for_cooking_pct) AS clean_fuel_pct,
    AVG(w15_plus_who_use_any_kind_of_tobacco_pct) AS women_tobacco_pct,
    AVG(m15_plus_who_use_any_kind_of_tobacco_pct) AS men_tobacco_pct,
    AVG(children_prev_symptoms_of_acute_respiratory_infection_ari_2_pct) AS child_ari_pct,
    AVG(hh_member_covered_health_insurance_pct) AS insurance_pct
  FROM databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.nfhs_5_district_health_indicators
  GROUP BY 1, 2
),
combined AS (
  SELECT
    INITCAP(d.district) AS district,
    COALESCE(f.n_facilities, 0) AS n_facilities,
    COALESCE(f.trust_weighted, 0) AS trust_weighted,
    COALESCE(f.avg_trust, 0) AS avg_trust,
    COALESCE(c.catalog_records, 0) AS catalog_records,
    COALESCE(c.catalog_trust_weighted, 0) AS catalog_trust_weighted,
    COALESCE(c.avg_catalog_trust, 0) AS avg_catalog_trust,
    COALESCE(f.n_without_named_staff, 0) AS n_without_named_staff,
    COALESCE(f.n_established_before_2000, 0) AS n_established_before_2000,
    COALESCE(f.n_stale_web_evidence, 0) AS n_stale_web_evidence,
    COALESCE(f.n_with_doctor_count, 0) AS n_with_doctor_count,
    COALESCE(f.reported_doctors, 0) AS reported_doctors,
    COALESCE(f.n_with_capacity, 0) AS n_with_capacity,
    COALESCE(f.total_reported_capacity, 0) AS total_reported_capacity,
    COALESCE(f.n_accepts_volunteers, 0) AS n_accepts_volunteers,
    COALESCE(f.n_spirometry, 0) AS n_spirometry,
    COALESCE(f.n_oxygen, 0) AS n_oxygen,
    COALESCE(f.n_inhaler_nebulizer, 0) AS n_inhaler_nebulizer,
    COALESCE(f.n_pulmonary_rehab, 0) AS n_pulmonary_rehab,
    COALESCE(f.n_critical_care, 0) AS n_critical_care,
    COALESCE(cs.n_cities_with_supply, 0) AS n_cities_with_supply,
    COALESCE(cs.largest_city_facilities, 0) AS largest_city_facilities,
    n.clean_fuel_pct,
    n.women_tobacco_pct,
    n.men_tobacco_pct,
    n.child_ari_pct,
    n.insurance_pct
  FROM district_dim d
  LEFT JOIN dist_fac f ON d.district_key = f.district_key
  LEFT JOIN dist_catalog c ON d.district_key = c.district_key
  LEFT JOIN city_summary cs ON d.district_key = cs.district_key
  LEFT JOIN nfhs n
    ON d.district_key = n.district_key
   AND regexp_replace(regexp_replace(regexp_replace(UPPER(d.statename), '[^A-Z]', ''), '^(THE|NCTOF)', ''), 'MAHARASTRA', 'MAHARASHTRA') = n.state_key
)
SELECT
  district,
  n_facilities,
  trust_weighted,
  avg_trust,
  catalog_records,
  catalog_trust_weighted,
  avg_catalog_trust,
  n_without_named_staff,
  n_established_before_2000,
  n_stale_web_evidence,
  n_with_doctor_count,
  reported_doctors,
  n_with_capacity,
  total_reported_capacity,
  n_accepts_volunteers,
  n_spirometry,
  n_oxygen,
  n_inhaler_nebulizer,
  n_pulmonary_rehab,
  n_critical_care,
  n_cities_with_supply,
  CASE
    WHEN n_facilities > 0 THEN ROUND(100.0 * largest_city_facilities / n_facilities, 1)
  END AS largest_city_share_pct,
  ROUND(clean_fuel_pct, 1) AS clean_fuel_pct,
  ROUND(women_tobacco_pct, 1) AS women_tobacco_pct,
  ROUND(men_tobacco_pct, 1) AS men_tobacco_pct,
  ROUND((women_tobacco_pct + men_tobacco_pct) / 2.0, 1) AS adult_tobacco_pct,
  ROUND(child_ari_pct, 1) AS child_ari_pct,
  ROUND(insurance_pct, 1) AS insurance_pct,
  CASE
    WHEN catalog_records < 2 THEN 'low'
    WHEN catalog_records >= 10 AND catalog_trust_weighted >= 2 THEN 'high'
    WHEN catalog_records >= 3 AND catalog_trust_weighted >= 0.5 THEN 'medium'
    ELSE 'low'
  END AS data_confidence
FROM combined
ORDER BY trust_weighted ASC, n_facilities DESC;
