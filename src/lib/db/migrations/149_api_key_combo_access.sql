-- 149: Make API-key Combo access explicit: combo/* allows all; [] denies all.
-- Existing null/empty/malformed values meant allow-all before this migration.

UPDATE api_keys
SET allowed_combos = json_array('combo/*')
WHERE allowed_combos IS NULL
  OR trim(allowed_combos) = ''
  OR json_valid(allowed_combos) = 0
  OR (
    json_valid(allowed_combos) = 1
    AND json_type(allowed_combos) != 'array'
  )
  OR (
    json_valid(allowed_combos) = 1
    AND json_type(allowed_combos) = 'array'
    AND json_array_length(allowed_combos) = 0
  );
