PRAGMA foreign_keys = ON;

-- Enrich the eight region records without collapsing civil, language, and FCF scopes.
UPDATE content_records
SET details_json = json_set(
  details_json,
  '$.scope', 'geographic',
  '$.affiliations', json('[]')
)
WHERE kind = 'organization' AND json_extract(details_json, '$.organizationType') = 'region';

WITH organizations(id, slug, title, summary, organization_type, scope, parent, affiliations) AS (
  VALUES
    ('district-nw-alaska', 'alaska-district', 'Alaska', 'District label in the Northwest Region on the official U.S. map.', 'district', 'geographic', 'Northwest Region', '[]'),
    ('district-nw-northwest', 'northwest-district', 'Northwest', 'District label in the Northwest Region on the official U.S. map.', 'district', 'geographic', 'Northwest Region', '[]'),
    ('district-nw-oregon', 'oregon-district', 'Oregon', 'District label in the Northwest Region on the official U.S. map.', 'district', 'geographic', 'Northwest Region', '[]'),
    ('district-nw-so-idaho', 'so-idaho-district', 'So. Idaho', 'District label in the Northwest Region on the official U.S. map.', 'district', 'geographic', 'Northwest Region', '[]'),
    ('district-nw-montana', 'montana-district', 'Montana', 'District label in the Northwest Region on the official U.S. map.', 'district', 'geographic', 'Northwest Region', '[]'),
    ('district-nw-wyoming', 'wyoming-district', 'Wyoming', 'District label in the Northwest Region on the official U.S. map.', 'district', 'geographic', 'Northwest Region', '[]'),

    ('district-nc-n-dakota', 'n-dakota-district', 'N. Dakota', 'District label in the North Central Region on the official U.S. map.', 'district', 'geographic', 'North Central Region', '[]'),
    ('district-nc-s-dakota', 's-dakota-district', 'S. Dakota', 'District label in the North Central Region on the official U.S. map.', 'district', 'geographic', 'North Central Region', '[]'),
    ('district-nc-nebraska', 'nebraska-district', 'Nebraska', 'District label in the North Central Region on the official U.S. map.', 'district', 'geographic', 'North Central Region', '[]'),
    ('district-nc-minnesota', 'minnesota-district', 'Minnesota', 'District label in the North Central Region on the official U.S. map.', 'district', 'geographic', 'North Central Region', '[]'),
    ('district-nc-wis-n-mich', 'wis-n-mich-district', 'Wis.-N. Mich', 'District label in the North Central Region on the official U.S. map.', 'district', 'geographic', 'North Central Region', '[]'),
    ('district-nc-iowa', 'iowa-district', 'Iowa', 'District label in the North Central Region on the official U.S. map.', 'district', 'geographic', 'North Central Region', '[]'),
    ('district-nc-n-missouri', 'n-missouri-district', 'N. Missouri', 'District label in the North Central Region on the official U.S. map.', 'district', 'geographic', 'North Central Region', '[]'),

    ('district-sw-n-cal-nevada', 'n-cal-nevada-district', 'N. Cal.-Nevada', 'District label in the Southwest Region on the official U.S. map.', 'district', 'geographic', 'Southwest Region', '[]'),
    ('district-sw-s-california', 's-california-district', 'S. California', 'District label in the Southwest Region on the official U.S. map.', 'district', 'geographic', 'Southwest Region', '[]'),
    ('district-sw-arizona', 'arizona-district', 'Arizona', 'District label in the Southwest Region on the official U.S. map.', 'district', 'geographic', 'Southwest Region', '[]'),
    ('district-sw-hawaii', 'hawaii-district', 'Hawaii', 'District label in the Southwest Region on the official U.S. map.', 'district', 'geographic', 'Southwest Region', '[]'),
    ('district-sw-rocky-mountain', 'rocky-mountain-district', 'Rocky Mountain', 'District label in the Southwest Region on the official U.S. map.', 'district', 'geographic', 'Southwest Region', '[]'),

    ('district-sc-new-mexico', 'new-mexico-district', 'New Mexico', 'District label in the South Central Region on the official U.S. map.', 'district', 'geographic', 'South Central Region', '[]'),
    ('district-sc-kansas', 'kansas-district', 'Kansas', 'District label in the South Central Region on the official U.S. map.', 'district', 'geographic', 'South Central Region', '[]'),
    ('district-sc-oklahoma', 'oklahoma-district', 'Oklahoma', 'District label in the South Central Region on the official U.S. map.', 'district', 'geographic', 'South Central Region', '[]'),
    ('district-sc-w-texas', 'w-texas-district', 'W. Texas', 'District label in the South Central Region on the official U.S. map.', 'district', 'geographic', 'South Central Region', '[]'),
    ('district-sc-n-texas', 'n-texas-district', 'N. Texas', 'District label in the South Central Region on the official U.S. map.', 'district', 'geographic', 'South Central Region', '[]'),
    ('district-sc-s-texas', 's-texas-district', 'S. Texas', 'District label in the South Central Region on the official U.S. map.', 'district', 'geographic', 'South Central Region', '[]'),

    ('district-gulf-s-missouri', 's-missouri-district', 'S. Missouri', 'District label in the Gulf Region on the official U.S. map.', 'district', 'geographic', 'Gulf Region', '[]'),
    ('district-gulf-arkansas', 'arkansas-district', 'Arkansas', 'District label in the Gulf Region on the official U.S. map.', 'district', 'geographic', 'Gulf Region', '[]'),
    ('district-gulf-tennessee', 'tennessee-district', 'Tennessee', 'District label in the Gulf Region on the official U.S. map.', 'district', 'geographic', 'Gulf Region', '[]'),
    ('district-gulf-mississippi', 'mississippi-district', 'Mississippi', 'District label in the Gulf Region on the official U.S. map.', 'district', 'geographic', 'Gulf Region', '[]'),
    ('district-gulf-louisiana', 'louisiana-district', 'Louisiana', 'District label in the Gulf Region on the official U.S. map.', 'district', 'geographic', 'Gulf Region', '[]'),

    ('district-se-n-carolina', 'n-carolina-district', 'N. Carolina', 'District label in the Southeast Region on the official U.S. map.', 'district', 'geographic', 'Southeast Region', '[]'),
    ('district-se-s-carolina', 's-carolina-district', 'S. Carolina', 'District label in the Southeast Region on the official U.S. map.', 'district', 'geographic', 'Southeast Region', '[]'),
    ('district-se-georgia', 'georgia-district', 'Georgia', 'District label in the Southeast Region on the official U.S. map.', 'district', 'geographic', 'Southeast Region', '[]'),
    ('district-se-alabama', 'alabama-district', 'Alabama', 'District label in the Southeast Region on the official U.S. map.', 'district', 'geographic', 'Southeast Region', '[]'),
    ('district-se-w-florida', 'w-florida-district', 'W. Florida', 'District label in the Southeast Region on the official U.S. map.', 'district', 'geographic', 'Southeast Region', '[]'),
    ('district-se-pen-florida', 'pen-florida-district', 'Pen. Florida', 'District label in the Southeast Region on the official U.S. map.', 'district', 'geographic', 'Southeast Region', '[]'),
    ('district-se-puerto-rico', 'puerto-rico-district', 'Puerto Rico', 'District label in the Southeast Region on the official U.S. map.', 'district', 'geographic', 'Southeast Region', '[]'),

    ('district-gl-michigan', 'michigan-district', 'Michigan', 'District label in the Great Lakes Region on the official U.S. map.', 'district', 'geographic', 'Great Lakes Region', '[]'),
    ('district-gl-illinois', 'illinois-district', 'Illinois', 'District label in the Great Lakes Region on the official U.S. map.', 'district', 'geographic', 'Great Lakes Region', '[]'),
    ('district-gl-indiana', 'indiana-district', 'Indiana', 'District label in the Great Lakes Region on the official U.S. map.', 'district', 'geographic', 'Great Lakes Region', '[]'),
    ('district-gl-ohio', 'ohio-district', 'Ohio', 'District label in the Great Lakes Region on the official U.S. map.', 'district', 'geographic', 'Great Lakes Region', '[]'),
    ('district-gl-kentucky', 'kentucky-district', 'Kentucky', 'District label in the Great Lakes Region on the official U.S. map.', 'district', 'geographic', 'Great Lakes Region', '[]'),

    ('district-ne-n-new-england', 'n-new-england-district', 'N. New England', 'District label in the Northeast Region on the official U.S. map.', 'district', 'geographic', 'Northeast Region', '[]'),
    ('district-ne-s-new-england', 's-new-england-district', 'S. New England', 'District label in the Northeast Region on the official U.S. map.', 'district', 'geographic', 'Northeast Region', '[]'),
    ('district-ne-new-york', 'new-york-district', 'New York', 'District label in the Northeast Region on the official U.S. map.', 'district', 'geographic', 'Northeast Region', '[]'),
    ('district-ne-penn-del', 'penn-del-district', 'Penn.-Del', 'District label in the Northeast Region on the official U.S. map.', 'district', 'geographic', 'Northeast Region', '[]'),
    ('district-ne-new-jersey', 'new-jersey-district', 'New Jersey', 'District label in the Northeast Region on the official U.S. map.', 'district', 'geographic', 'Northeast Region', '[]'),
    ('district-ne-potomac', 'potomac-district', 'Potomac', 'District label in the Northeast Region on the official U.S. map.', 'district', 'geographic', 'Northeast Region', '[]'),
    ('district-ne-appalachian', 'appalachian-district', 'Appalachian', 'District label in the Northeast Region on the official U.S. map.', 'district', 'geographic', 'Northeast Region', '[]'),

    ('language-region-west-spanish', 'language-west-spanish', 'Language West-Spanish', 'Spanish-language region shown as an overlapping structure on the official language map.', 'language-region', 'language', 'Royal Rangers USA', '[]'),
    ('language-region-east-spanish', 'language-east-spanish', 'Language East-Spanish', 'Spanish-language region shown as an overlapping structure on the official language map.', 'language-region', 'language', 'Royal Rangers USA', '[]'),
    ('language-district-northwest-hispanic', 'northwest-hispanic', 'Northwest Hispanic', 'District label in Language West-Spanish on the official language map.', 'language-district', 'language', 'Language West-Spanish', '[]'),
    ('language-district-northern-pacific-latin-american', 'northern-pacific-latin-american', 'Northern Pacific Latin American', 'District label in Language West-Spanish on the official language map.', 'language-district', 'language', 'Language West-Spanish', '[]'),
    ('language-district-central', 'central-distrito-central', 'Central District / Distrito Central', 'District label in Language West-Spanish on the official language map.', 'language-district', 'language', 'Language West-Spanish', '[]'),
    ('language-district-southern-pacific', 'southern-pacific', 'Southern Pacific', 'District label in Language West-Spanish on the official language map.', 'language-district', 'language', 'Language West-Spanish', '[]'),
    ('language-district-southwest', 'southwest-language-district', 'Southwest', 'District label in Language West-Spanish on the official language map.', 'language-district', 'language', 'Language West-Spanish', '[]'),
    ('language-district-west-texas-plains', 'west-texas-and-plains', 'West Texas and Plains', 'District label in Language West-Spanish on the official language map.', 'language-district', 'language', 'Language West-Spanish', '[]'),
    ('language-district-south-central-hispanic', 'south-central-hispanic', 'South Central Hispanic', 'District label in Language West-Spanish on the official language map.', 'language-district', 'language', 'Language West-Spanish', '[]'),
    ('language-district-texas-louisiana-hispanic', 'texas-louisiana-hispanic', 'Texas Louisiana Hispanic', 'District label in Language West-Spanish on the official language map.', 'language-district', 'language', 'Language West-Spanish', '[]'),
    ('language-district-texas-gulf-spanish', 'texas-gulf-spanish', 'Texas Gulf Spanish', 'District label in Language West-Spanish on the official language map.', 'language-district', 'language', 'Language West-Spanish', '[]'),
    ('language-district-midwest-latin-american', 'midwest-latin-american', 'Midwest Latin American', 'District label in Language East-Spanish on the official language map.', 'language-district', 'language', 'Language East-Spanish', '[]'),
    ('language-district-spanish-eastern', 'spanish-eastern', 'Spanish Eastern', 'District label in Language East-Spanish on the official language map.', 'language-district', 'language', 'Language East-Spanish', '[]'),
    ('language-district-southern-latin', 'southern-latin', 'Southern Latin', 'District label in Language East-Spanish on the official language map.', 'language-district', 'language', 'Language East-Spanish', '[]'),
    ('language-district-florida-multicultural', 'florida-multicultural', 'Florida Multicultural', 'District label in Language East-Spanish on the official language map.', 'language-district', 'language', 'Language East-Spanish', '[]'),
    ('language-district-puerto-rico', 'puerto-rico-language-district', 'Puerto Rico', 'Puerto Rico district label in Language East-Spanish on the official language map.', 'language-district', 'language', 'Language East-Spanish', '[]'),

    ('fcf-territory-trappers', 'trappers-territory', 'Trappers Territory', 'FCF territory officially paired with the Northwest Region.', 'fcf-territory', 'fcf', NULL, '["Northwest Region"]'),
    ('fcf-territory-explorers', 'explorers-territory', 'Explorers Territory', 'FCF territory officially paired with the North Central Region.', 'fcf-territory', 'fcf', NULL, '["North Central Region"]'),
    ('fcf-territory-mountainmen', 'mountainmen-territory', 'Mountainmen Territory', 'FCF territory officially paired with the Southwest Region.', 'fcf-territory', 'fcf', NULL, '["Southwest Region"]'),
    ('fcf-territory-plainsmen', 'plainsmen-territory', 'Plainsmen Territory', 'FCF territory officially paired with the South Central Region.', 'fcf-territory', 'fcf', NULL, '["South Central Region"]'),
    ('fcf-territory-rivermen', 'rivermen-territory', 'Rivermen Territory', 'FCF territory officially paired with the Gulf Region.', 'fcf-territory', 'fcf', NULL, '["Gulf Region"]'),
    ('fcf-territory-riflemen', 'riflemen-territory', 'Riflemen Territory', 'FCF territory officially paired with the Southeast Region.', 'fcf-territory', 'fcf', NULL, '["Southeast Region"]'),
    ('fcf-territory-voyagers', 'voyagers-territory', 'Voyagers Territory', 'FCF territory officially paired with the Great Lakes Region.', 'fcf-territory', 'fcf', NULL, '["Great Lakes Region"]'),
    ('fcf-territory-colonials', 'colonials-territory', 'Colonials Territory', 'FCF territory officially paired with the Northeast Region.', 'fcf-territory', 'fcf', NULL, '["Northeast Region"]')
)
INSERT INTO content_records
  (id, kind, slug, title, summary, status, details_json, verified_at, published_at, updated_at)
SELECT
  id,
  'organization',
  slug,
  title,
  summary,
  'published',
  json_object(
    'organizationType', organization_type,
    'scope', scope,
    'parent', parent,
    'affiliations', json(affiliations),
    'jurisdictions', json('[]')
  ),
  '2026-08-12T00:00:00.000Z',
  '2026-08-12T00:00:00.000Z',
  '2026-08-12T00:00:00.000Z'
FROM organizations;

-- Refresh organization provenance with the exact official maps or FCF mapping source.
DELETE FROM record_sources WHERE record_id IN (SELECT id FROM content_records WHERE kind = 'organization');
INSERT INTO record_sources (id, record_id, field_name, label, url, verified_at)
SELECT
  'source-' || id,
  id,
  'record',
  CASE
    WHEN json_extract(details_json, '$.scope') = 'language' THEN 'Royal Rangers USA Spanish Language Districts Map'
    WHEN json_extract(details_json, '$.scope') = 'fcf' THEN 'Royal Rangers USA Territorial Rendezvous mapping'
    ELSE 'Royal Rangers USA Region and District Map'
  END,
  CASE
    WHEN json_extract(details_json, '$.scope') = 'language' THEN 'https://royalrangers.com/~/-/media/8C78271475064CB3B4ED1F41C298E885.ashx'
    WHEN json_extract(details_json, '$.scope') = 'fcf' THEN 'https://royalrangers.com/en/news/General-News/2023/2023-06-Territorial-Rendezvous?D=%7B39CB0294-58F1-4250-AB82-25E3BF8466D2%7D'
    ELSE 'https://royalrangers.com/~/-/media/F5F81CB2C829419A82139A817D8073A2.ashx'
  END,
  '2026-08-12T00:00:00.000Z'
FROM content_records
WHERE kind = 'organization';

-- Upgrade representative listings. Unresolved language and FCF activity remain explicitly unverified.
UPDATE content_records
SET title = 'Outpost 1 · LifeChange Church',
    summary = 'A draft retained for re-verification after its former first-party outpost page became unavailable.',
    status = 'draft',
    published_at = NULL,
    details_json = '{"hubOutpostId":"outpost-greenville-1","outpostNumber":null,"campusSuffix":null,"church":"LifeChange Church","streetAddress":"201 Glendale Avenue","city":"Greenville","jurisdiction":"Alabama","postalCode":"36037","district":"Alabama","region":"Southeast Region","languageOverlay":"","fcfTerritory":"Riflemen Territory","activeFcf":null,"programs":[],"meeting":null,"contactUrl":"https://lifechangechurch.tv/contact/contact-us"}',
    updated_at = '2026-08-12T00:00:00.000Z'
WHERE id = 'outpost-greenville-1';

UPDATE content_records
SET title = 'Outpost 70 · First Assembly of God',
    details_json = '{"hubOutpostId":"outpost-stx-70","outpostNumber":"70","campusSuffix":null,"church":"First Assembly of God","streetAddress":"329 North Anderson Street","city":"Angleton","jurisdiction":"Texas","postalCode":"77515","district":"S. Texas","region":"South Central Region","languageOverlay":"","fcfTerritory":"Plainsmen Territory","activeFcf":null,"programs":[],"meeting":null,"contactUrl":"https://angletonfirst.org/contact/"}',
    updated_at = '2026-08-12T00:00:00.000Z'
WHERE id = 'outpost-stx-70';

UPDATE content_records
SET title = 'Outpost 41 · Glad Tidings Assembly of God',
    summary = 'A draft retained while the stale district identity is reconciled with the church successor.',
    status = 'draft',
    published_at = NULL,
    details_json = '{"hubOutpostId":"outpost-stx-41","outpostNumber":"41","campusSuffix":null,"church":"Glad Tidings Assembly of God","streetAddress":null,"city":"Houston","jurisdiction":"Texas","postalCode":null,"district":"S. Texas","region":"South Central Region","languageOverlay":"","fcfTerritory":"Plainsmen Territory","activeFcf":null,"programs":[],"meeting":null,"contactUrl":null}',
    updated_at = '2026-08-12T00:00:00.000Z'
WHERE id = 'outpost-stx-41';

UPDATE content_records
SET title = 'Outpost 132 · Friendship Church',
    details_json = '{"hubOutpostId":"outpost-stx-132","outpostNumber":"132","campusSuffix":null,"church":"Friendship Church","streetAddress":"4640 Richmond-Foster Road","city":"Richmond","jurisdiction":"Texas","postalCode":"77406","district":"S. Texas","region":"South Central Region","languageOverlay":"","fcfTerritory":"Plainsmen Territory","activeFcf":null,"programs":[],"meeting":null,"contactUrl":"https://friendshipchurch.cc/about-us/contact-us/"}',
    updated_at = '2026-08-12T00:00:00.000Z'
WHERE id = 'outpost-stx-132';

UPDATE content_records
SET title = 'Outpost 355 · Light Christian Center',
    details_json = '{"hubOutpostId":"outpost-stx-355","outpostNumber":"355","campusSuffix":null,"church":"Light Christian Center","streetAddress":"1501 West South Street","city":"Alvin","jurisdiction":"Texas","postalCode":"77511","district":"S. Texas","region":"South Central Region","languageOverlay":"","fcfTerritory":"Plainsmen Territory","activeFcf":null,"programs":[],"meeting":null,"contactUrl":"https://lightchristiancenter.com/contact"}',
    updated_at = '2026-08-12T00:00:00.000Z'
WHERE id = 'outpost-stx-355';

DELETE FROM record_sources WHERE record_id LIKE 'outpost-%';

-- Church/outpost controlled facts.
INSERT INTO record_sources (id, record_id, field_name, label, url, verified_at) VALUES
  ('source-greenville-church', 'outpost-greenville-1', 'church', 'LifeChange Church public contact page', 'https://lifechangechurch.tv/contact/contact-us', '2026-08-12T00:00:00.000Z'),
  ('source-greenville-address', 'outpost-greenville-1', 'streetAddress', 'LifeChange Church public contact page', 'https://lifechangechurch.tv/contact/contact-us', '2026-08-12T00:00:00.000Z'),
  ('source-greenville-city', 'outpost-greenville-1', 'city', 'LifeChange Church public contact page', 'https://lifechangechurch.tv/contact/contact-us', '2026-08-12T00:00:00.000Z'),
  ('source-greenville-state', 'outpost-greenville-1', 'jurisdiction', 'LifeChange Church public contact page', 'https://lifechangechurch.tv/contact/contact-us', '2026-08-12T00:00:00.000Z'),
  ('source-greenville-postal', 'outpost-greenville-1', 'postalCode', 'LifeChange Church public contact page', 'https://lifechangechurch.tv/contact/contact-us', '2026-08-12T00:00:00.000Z'),
  ('source-greenville-contact', 'outpost-greenville-1', 'contactUrl', 'LifeChange Church public contact page', 'https://lifechangechurch.tv/contact/contact-us', '2026-08-12T00:00:00.000Z'),

  ('source-70-number', 'outpost-stx-70', 'outpostNumber', 'South Texas District outpost locator', 'https://www.stxroyalrangers.com/outpost-locator/', '2026-08-12T00:00:00.000Z'),
  ('source-70-church', 'outpost-stx-70', 'church', 'South Texas District outpost locator', 'https://www.stxroyalrangers.com/outpost-locator/', '2026-08-12T00:00:00.000Z'),
  ('source-70-address', 'outpost-stx-70', 'streetAddress', 'Angleton First public contact page', 'https://angletonfirst.org/contact/', '2026-08-12T00:00:00.000Z'),
  ('source-70-city', 'outpost-stx-70', 'city', 'Angleton First public contact page', 'https://angletonfirst.org/contact/', '2026-08-12T00:00:00.000Z'),
  ('source-70-state', 'outpost-stx-70', 'jurisdiction', 'Angleton First public contact page', 'https://angletonfirst.org/contact/', '2026-08-12T00:00:00.000Z'),
  ('source-70-postal', 'outpost-stx-70', 'postalCode', 'Angleton First public contact page', 'https://angletonfirst.org/contact/', '2026-08-12T00:00:00.000Z'),
  ('source-70-contact', 'outpost-stx-70', 'contactUrl', 'Angleton First public contact page', 'https://angletonfirst.org/contact/', '2026-08-12T00:00:00.000Z'),

  ('source-41-number', 'outpost-stx-41', 'outpostNumber', 'South Texas District outpost locator', 'https://www.stxroyalrangers.com/outpost-locator/', '2026-08-12T00:00:00.000Z'),
  ('source-41-church', 'outpost-stx-41', 'church', 'South Texas District outpost locator', 'https://www.stxroyalrangers.com/outpost-locator/', '2026-08-12T00:00:00.000Z'),
  ('source-41-city', 'outpost-stx-41', 'city', 'South Texas District outpost locator', 'https://www.stxroyalrangers.com/outpost-locator/', '2026-08-12T00:00:00.000Z'),
  ('source-41-state', 'outpost-stx-41', 'jurisdiction', 'South Texas District outpost locator', 'https://www.stxroyalrangers.com/outpost-locator/', '2026-08-12T00:00:00.000Z'),

  ('source-132-number', 'outpost-stx-132', 'outpostNumber', 'South Texas District outpost locator', 'https://www.stxroyalrangers.com/outpost-locator/', '2026-08-12T00:00:00.000Z'),
  ('source-132-church', 'outpost-stx-132', 'church', 'South Texas District outpost locator', 'https://www.stxroyalrangers.com/outpost-locator/', '2026-08-12T00:00:00.000Z'),
  ('source-132-address', 'outpost-stx-132', 'streetAddress', 'Friendship Church public contact page', 'https://friendshipchurch.cc/about-us/contact-us/', '2026-08-12T00:00:00.000Z'),
  ('source-132-city', 'outpost-stx-132', 'city', 'Friendship Church public contact page', 'https://friendshipchurch.cc/about-us/contact-us/', '2026-08-12T00:00:00.000Z'),
  ('source-132-state', 'outpost-stx-132', 'jurisdiction', 'Friendship Church public contact page', 'https://friendshipchurch.cc/about-us/contact-us/', '2026-08-12T00:00:00.000Z'),
  ('source-132-postal', 'outpost-stx-132', 'postalCode', 'Friendship Church public contact page', 'https://friendshipchurch.cc/about-us/contact-us/', '2026-08-12T00:00:00.000Z'),
  ('source-132-contact', 'outpost-stx-132', 'contactUrl', 'Friendship Church public contact page', 'https://friendshipchurch.cc/about-us/contact-us/', '2026-08-12T00:00:00.000Z'),

  ('source-355-number', 'outpost-stx-355', 'outpostNumber', 'South Texas District outpost locator', 'https://www.stxroyalrangers.com/outpost-locator/', '2026-08-12T00:00:00.000Z'),
  ('source-355-church', 'outpost-stx-355', 'church', 'South Texas District outpost locator', 'https://www.stxroyalrangers.com/outpost-locator/', '2026-08-12T00:00:00.000Z'),
  ('source-355-address', 'outpost-stx-355', 'streetAddress', 'Light Christian Center public contact page', 'https://lightchristiancenter.com/contact', '2026-08-12T00:00:00.000Z'),
  ('source-355-city', 'outpost-stx-355', 'city', 'Light Christian Center public contact page', 'https://lightchristiancenter.com/contact', '2026-08-12T00:00:00.000Z'),
  ('source-355-state', 'outpost-stx-355', 'jurisdiction', 'Light Christian Center public contact page', 'https://lightchristiancenter.com/contact', '2026-08-12T00:00:00.000Z'),
  ('source-355-postal', 'outpost-stx-355', 'postalCode', 'Light Christian Center public contact page', 'https://lightchristiancenter.com/contact', '2026-08-12T00:00:00.000Z'),
  ('source-355-contact', 'outpost-stx-355', 'contactUrl', 'Light Christian Center public contact page', 'https://lightchristiancenter.com/contact', '2026-08-12T00:00:00.000Z');

-- Affiliation provenance is separate from civil geography and outpost-level activity.
INSERT INTO record_sources (id, record_id, field_name, label, url, verified_at)
SELECT 'source-' || id || '-district', id, 'district',
  CASE WHEN id = 'outpost-greenville-1' THEN 'Royal Rangers USA Region and District Map' ELSE 'South Texas District outpost locator' END,
  CASE WHEN id = 'outpost-greenville-1' THEN 'https://royalrangers.com/~/-/media/F5F81CB2C829419A82139A817D8073A2.ashx' ELSE 'https://www.stxroyalrangers.com/outpost-locator/' END,
  '2026-08-12T00:00:00.000Z'
FROM content_records WHERE kind = 'outpost';

INSERT INTO record_sources (id, record_id, field_name, label, url, verified_at)
SELECT 'source-' || id || '-region', id, 'region', 'Royal Rangers USA Region and District Map',
  'https://royalrangers.com/~/-/media/F5F81CB2C829419A82139A817D8073A2.ashx', '2026-08-12T00:00:00.000Z'
FROM content_records WHERE kind = 'outpost';

INSERT INTO record_sources (id, record_id, field_name, label, url, verified_at)
SELECT 'source-' || id || '-fcf-territory', id, 'fcfTerritory', 'Royal Rangers USA Territorial Rendezvous mapping',
  'https://royalrangers.com/en/news/General-News/2023/2023-06-Territorial-Rendezvous?D=%7B39CB0294-58F1-4250-AB82-25E3BF8466D2%7D', '2026-08-12T00:00:00.000Z'
FROM content_records WHERE kind = 'outpost';

INSERT INTO audit_events (record_id, action, actor, after_json, reason, created_at)
SELECT id, 'directory foundation seeded', 'MVP seed', details_json,
  'Slice 1 verified U.S. directory foundation', '2026-08-12T00:00:00.000Z'
FROM content_records
WHERE kind = 'organization' OR kind = 'outpost';
