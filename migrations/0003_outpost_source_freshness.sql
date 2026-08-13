PRAGMA foreign_keys = ON;

-- Keep locally applied Slice 1 data aligned with the final source re-check.
UPDATE content_records
SET title = 'Outpost 1 · LifeChange Church',
    summary = 'A draft retained for re-verification after its former first-party outpost page became unavailable.',
    status = 'draft',
    published_at = NULL,
    details_json = '{"hubOutpostId":"outpost-greenville-1","outpostNumber":null,"campusSuffix":null,"church":"LifeChange Church","streetAddress":"201 Glendale Avenue","city":"Greenville","jurisdiction":"Alabama","postalCode":"36037","district":"Alabama","region":"Southeast Region","languageOverlay":"","fcfTerritory":"Riflemen Territory","activeFcf":null,"programs":[],"meeting":null,"contactUrl":"https://lifechangechurch.tv/contact/contact-us"}',
    updated_at = '2026-08-12T00:00:00.000Z'
WHERE id = 'outpost-greenville-1';

UPDATE content_records
SET summary = 'A draft retained while the stale district identity is reconciled with the church successor.',
    status = 'draft',
    published_at = NULL,
    updated_at = '2026-08-12T00:00:00.000Z'
WHERE id = 'outpost-stx-41';

UPDATE content_records
SET details_json = json_set(details_json, '$.contactUrl', 'https://friendshipchurch.cc/about-us/contact-us/'),
    updated_at = '2026-08-12T00:00:00.000Z'
WHERE id = 'outpost-stx-132';

UPDATE content_records
SET details_json = json_set(details_json, '$.contactUrl', 'https://lightchristiancenter.com/contact'),
    updated_at = '2026-08-12T00:00:00.000Z'
WHERE id = 'outpost-stx-355';

DELETE FROM record_sources
WHERE record_id = 'outpost-greenville-1'
  AND field_name IN ('outpostNumber', 'programs', 'meeting');

UPDATE record_sources
SET label = 'LifeChange Church public contact page',
    url = 'https://lifechangechurch.tv/contact/contact-us'
WHERE record_id = 'outpost-greenville-1'
  AND field_name IN ('church', 'streetAddress', 'city', 'jurisdiction', 'postalCode', 'contactUrl');

UPDATE record_sources
SET label = 'Friendship Church public contact page',
    url = 'https://friendshipchurch.cc/about-us/contact-us/'
WHERE record_id = 'outpost-stx-132'
  AND field_name IN ('streetAddress', 'city', 'jurisdiction', 'postalCode', 'contactUrl');

UPDATE record_sources
SET label = 'Light Christian Center public contact page',
    url = 'https://lightchristiancenter.com/contact'
WHERE record_id = 'outpost-stx-355'
  AND field_name IN ('streetAddress', 'city', 'jurisdiction', 'postalCode', 'contactUrl');

UPDATE content_records
SET title = 'Puerto Rico'
WHERE id = 'language-district-puerto-rico';

INSERT INTO audit_events (record_id, action, actor, after_json, reason, created_at)
SELECT id, 'source freshness corrected', 'MVP seed', details_json,
  'Conflicting or unavailable primary-source fields were removed from publication',
  '2026-08-12T00:00:00.000Z'
FROM content_records
WHERE id IN ('outpost-greenville-1', 'outpost-stx-41', 'outpost-stx-132', 'outpost-stx-355');
