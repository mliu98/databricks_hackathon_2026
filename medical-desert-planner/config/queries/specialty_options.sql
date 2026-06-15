-- COPD care capabilities derived from facility specialty, procedure, equipment,
-- capability, and description text. Counts communicate how much evidence is
-- available for each filter.
WITH facilities_text AS (
  SELECT lower(concat_ws(
    ' ',
    COALESCE(description, ''),
    COALESCE(procedure, ''),
    COALESCE(equipment, ''),
    COALESCE(capability, ''),
    COALESCE(specialties, '')
  )) AS evidence_text
  FROM databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.facilities
),
options AS (
  SELECT 'pulmonology' AS capability,
         SUM(CASE WHEN evidence_text RLIKE 'copd|chronic obstructive|pulmon|respirat|chest medicine' THEN 1 ELSE 0 END) AS facility_mentions
  FROM facilities_text
  UNION ALL
  SELECT 'spirometry',
         SUM(CASE WHEN evidence_text RLIKE 'spirom|pulmonary function|lung function|\\bpft\\b' THEN 1 ELSE 0 END)
  FROM facilities_text
  UNION ALL
  SELECT 'oxygenTherapy',
         SUM(CASE WHEN evidence_text RLIKE 'oxygen therapy|oxygen concentrator|medical oxygen|ventilat' THEN 1 ELSE 0 END)
  FROM facilities_text
  UNION ALL
  SELECT 'inhalerNebulizer',
         SUM(CASE WHEN evidence_text RLIKE 'nebul|inhaler|bronchodilator' THEN 1 ELSE 0 END)
  FROM facilities_text
  UNION ALL
  SELECT 'pulmonaryRehab',
         SUM(CASE WHEN evidence_text RLIKE 'pulmonary rehab|respiratory rehab' THEN 1 ELSE 0 END)
  FROM facilities_text
  UNION ALL
  SELECT 'criticalCare',
         SUM(CASE WHEN evidence_text RLIKE 'criticalcaremedicine|critical care|intensive care|\\bicu\\b|ventilat' THEN 1 ELSE 0 END)
  FROM facilities_text
)
SELECT capability, facility_mentions
FROM options
WHERE facility_mentions > 0
ORDER BY facility_mentions DESC;
