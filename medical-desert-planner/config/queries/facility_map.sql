-- @param capability STRING
-- Geocoded COPD-care facilities for map markers (name, location, staff count).
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
    f.unique_id,
    f.name,
    f.latitude,
    f.longitude,
    f.specialties,
    g.statename,
    try_cast(f.numberDoctors AS DOUBLE) AS staff_count,
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
  WHERE f.latitude BETWEEN 6 AND 37
    AND f.longitude BETWEEN 68 AND 98
)
SELECT
  unique_id AS facility_id,
  name,
  statename AS state,
  latitude,
  longitude,
  CASE WHEN staff_count IS NOT NULL AND staff_count >= 0 THEN staff_count ELSE NULL END AS staff_count,
  array_join(slice(array_distinct(from_json(specialties, 'array<string>')), 1, 6), ', ') AS specialties,
  evidence_text RLIKE 'copd|chronic obstructive|pulmon|respirat|chest medicine' AS has_pulmonology,
  evidence_text RLIKE 'spirom|pulmonary function|lung function|\\bpft\\b' AS has_spirometry,
  evidence_text RLIKE 'oxygen therapy|oxygen concentrator|medical oxygen|ventilat' AS has_oxygen,
  evidence_text RLIKE 'nebul|inhaler|bronchodilator' AS has_inhaler_nebulizer,
  evidence_text RLIKE 'pulmonary rehab|respiratory rehab' AS has_pulmonary_rehab,
  evidence_text RLIKE 'criticalcaremedicine|critical care|intensive care|\\bicu\\b|ventilat' AS has_critical_care
FROM facilities_scored
WHERE
  (:capability = 'all' AND evidence_text RLIKE 'copd|chronic obstructive|pulmon|respirat|chest medicine|spirom|pulmonary function|lung function|\\bpft\\b|oxygen therapy|oxygen concentrator|medical oxygen|nebul|inhaler|bronchodilator|pulmonary rehab|respiratory rehab')
  OR (:capability = 'pulmonology' AND evidence_text RLIKE 'copd|chronic obstructive|pulmon|respirat|chest medicine')
  OR (:capability = 'spirometry' AND evidence_text RLIKE 'spirom|pulmonary function|lung function|\\bpft\\b')
  OR (:capability = 'oxygenTherapy' AND evidence_text RLIKE 'oxygen therapy|oxygen concentrator|medical oxygen|ventilat')
  OR (:capability = 'inhalerNebulizer' AND evidence_text RLIKE 'nebul|inhaler|bronchodilator')
  OR (:capability = 'pulmonaryRehab' AND evidence_text RLIKE 'pulmonary rehab|respiratory rehab')
  OR (:capability = 'criticalCare' AND evidence_text RLIKE 'criticalcaremedicine|critical care|intensive care|\\bicu\\b|ventilat')
ORDER BY trust_score DESC, name
LIMIT 500;
