-- @param state STRING
-- Publicly listed COPD-care organizations that may be useful collaborators.
-- These are candidates, not verified NGO partnerships.
WITH pin_geo AS (
  SELECT pincode, statename, district FROM (
    SELECT pincode, statename, district,
           ROW_NUMBER() OVER (PARTITION BY pincode ORDER BY COUNT(*) DESC) AS rn
    FROM databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.india_post_pincode_directory
    GROUP BY pincode, statename, district
  ) WHERE rn = 1
),
facilities_text AS (
  SELECT
    f.unique_id AS facility_id,
    f.name,
    INITCAP(g.district) AS district,
    f.organization_type,
    COALESCE(NULLIF(f.officialPhone, ''), NULLIF(f.phone_numbers, '')) AS phone,
    NULLIF(f.email, '') AS email,
    COALESCE(NULLIF(f.officialWebsite, ''), NULLIF(f.websites, '')) AS website,
    f.source_urls,
    lower(concat_ws(
      ' ',
      COALESCE(f.description, ''),
      COALESCE(f.procedure, ''),
      COALESCE(f.equipment, ''),
      COALESCE(f.capability, ''),
      COALESCE(f.specialties, '')
    )) AS evidence_text
  FROM databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.facilities f
  JOIN pin_geo g ON try_cast(f.address_zipOrPostcode AS BIGINT) = g.pincode
  WHERE UPPER(g.statename) = UPPER(:state)
)
SELECT
  facility_id,
  name,
  district,
  organization_type,
  phone,
  email,
  website,
  source_urls,
  evidence_text RLIKE 'copd|chronic obstructive|pulmon|respirat|chest medicine' AS has_pulmonology,
  evidence_text RLIKE 'spirom|pulmonary function|lung function|\\bpft\\b' AS has_spirometry,
  evidence_text RLIKE 'oxygen therapy|oxygen concentrator|medical oxygen|ventilat' AS has_oxygen,
  evidence_text RLIKE 'nebul|inhaler|bronchodilator' AS has_inhaler_nebulizer,
  evidence_text RLIKE 'pulmonary rehab|respiratory rehab' AS has_pulmonary_rehab,
  evidence_text RLIKE 'criticalcaremedicine|critical care|intensive care|\\bicu\\b|ventilat' AS has_critical_care
FROM facilities_text
WHERE evidence_text RLIKE 'copd|chronic obstructive|pulmon|respirat|chest medicine|spirom|pulmonary function|lung function|\\bpft\\b|oxygen therapy|oxygen concentrator|medical oxygen|nebul|inhaler|bronchodilator|pulmonary rehab|respiratory rehab'
  AND (phone IS NOT NULL OR email IS NOT NULL OR website IS NOT NULL)
ORDER BY district, name
LIMIT 300;
