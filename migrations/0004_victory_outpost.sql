PRAGMA foreign_keys = ON;

INSERT INTO content_records
  (id, kind, slug, title, summary, status, details_json, verified_at, published_at, updated_at)
VALUES
  (
    'outpost-stx-173',
    'outpost',
    'universal-city-texas-outpost-173',
    'Outpost 173 · Victory Assembly of God',
    'A church-published Royal Rangers outpost in Universal City, Texas.',
    'published',
    '{"hubOutpostId":"outpost-stx-173","outpostNumber":"173","campusSuffix":null,"church":"Victory Assembly of God","streetAddress":"1017 West Byrd Boulevard","city":"Universal City","jurisdiction":"Texas","postalCode":"78148","district":"S. Texas","region":"South Central Region","languageOverlay":"","fcfTerritory":"Plainsmen Territory","activeFcf":null,"programs":["Ranger Kids","Discovery Rangers","Adventure Rangers","Expedition Rangers"],"meeting":"Ranger Kids and Discovery Rangers meet Wednesdays from 6:30 to 8:00 p.m.; Adventure Rangers and Expedition Rangers meet Sundays after service from 11:30 a.m. to 1:00 p.m.","contactUrl":"https://vaog.net/contact/"}',
    '2026-08-12T00:00:00.000Z',
    '2026-08-12T00:00:00.000Z',
    '2026-08-12T00:00:00.000Z'
  );

INSERT INTO record_sources (id, record_id, field_name, label, url, verified_at) VALUES
  ('source-173-number', 'outpost-stx-173', 'outpostNumber', 'South Texas District outpost locator', 'https://www.stxroyalrangers.com/outpost-locator/', '2026-08-12T00:00:00.000Z'),
  ('source-173-church', 'outpost-stx-173', 'church', 'Victory Assembly Royal Rangers page', 'https://vaog.net/connect/', '2026-08-12T00:00:00.000Z'),
  ('source-173-address', 'outpost-stx-173', 'streetAddress', 'Victory Assembly public contact page', 'https://vaog.net/contact/', '2026-08-12T00:00:00.000Z'),
  ('source-173-city', 'outpost-stx-173', 'city', 'Victory Assembly public contact page', 'https://vaog.net/contact/', '2026-08-12T00:00:00.000Z'),
  ('source-173-state', 'outpost-stx-173', 'jurisdiction', 'Victory Assembly public contact page', 'https://vaog.net/contact/', '2026-08-12T00:00:00.000Z'),
  ('source-173-postal', 'outpost-stx-173', 'postalCode', 'Victory Assembly public contact page', 'https://vaog.net/contact/', '2026-08-12T00:00:00.000Z'),
  ('source-173-programs', 'outpost-stx-173', 'programs', 'Victory Assembly Royal Rangers page', 'https://vaog.net/connect/', '2026-08-12T00:00:00.000Z'),
  ('source-173-meeting', 'outpost-stx-173', 'meeting', 'Victory Assembly Royal Rangers page', 'https://vaog.net/connect/', '2026-08-12T00:00:00.000Z'),
  ('source-173-contact', 'outpost-stx-173', 'contactUrl', 'Victory Assembly public contact page', 'https://vaog.net/contact/', '2026-08-12T00:00:00.000Z'),
  ('source-173-district', 'outpost-stx-173', 'district', 'South Texas District outpost locator', 'https://www.stxroyalrangers.com/outpost-locator/', '2026-08-12T00:00:00.000Z'),
  ('source-173-region', 'outpost-stx-173', 'region', 'Royal Rangers USA Region and District Map', 'https://royalrangers.com/~/-/media/F5F81CB2C829419A82139A817D8073A2.ashx', '2026-08-12T00:00:00.000Z'),
  ('source-173-fcf-territory', 'outpost-stx-173', 'fcfTerritory', 'Royal Rangers USA Territorial Rendezvous mapping', 'https://royalrangers.com/en/news/General-News/2023/2023-06-Territorial-Rendezvous?D=%7B39CB0294-58F1-4250-AB82-25E3BF8466D2%7D', '2026-08-12T00:00:00.000Z');

INSERT INTO audit_events (record_id, action, actor, after_json, reason, created_at)
SELECT id, 'verified representative seeded', 'MVP seed', details_json,
  'Current church and district sources verify the richer representative listing',
  '2026-08-12T00:00:00.000Z'
FROM content_records
WHERE id = 'outpost-stx-173';
