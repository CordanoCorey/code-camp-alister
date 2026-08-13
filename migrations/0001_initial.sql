PRAGMA foreign_keys = ON;

CREATE TABLE content_records (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('outpost', 'event', 'advancement', 'organization', 'page')),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'archived')) DEFAULT 'draft',
  details_json TEXT NOT NULL CHECK (json_valid(details_json)),
  verified_at TEXT,
  published_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE record_sources (
  id TEXT PRIMARY KEY,
  record_id TEXT NOT NULL REFERENCES content_records(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL DEFAULT 'record',
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  verified_at TEXT NOT NULL
);

CREATE INDEX record_sources_record_id ON record_sources(record_id);
CREATE INDEX content_records_kind_status ON content_records(kind, status);

CREATE TABLE audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  record_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  reason TEXT,
  created_at TEXT NOT NULL
);

CREATE VIRTUAL TABLE record_search USING fts5(
  record_id UNINDEXED,
  title,
  summary,
  details
);

CREATE TRIGGER content_records_search_insert AFTER INSERT ON content_records BEGIN
  INSERT INTO record_search(record_id, title, summary, details)
  VALUES (new.id, new.title, new.summary, new.details_json);
END;

CREATE TRIGGER content_records_search_update AFTER UPDATE ON content_records BEGIN
  DELETE FROM record_search WHERE record_id = old.id;
  INSERT INTO record_search(record_id, title, summary, details)
  VALUES (new.id, new.title, new.summary, new.details_json);
END;

CREATE TRIGGER content_records_search_delete AFTER DELETE ON content_records BEGIN
  DELETE FROM record_search WHERE record_id = old.id;
END;

INSERT INTO content_records
  (id, kind, slug, title, summary, status, details_json, verified_at, published_at, updated_at)
VALUES
  ('program-ranger-kids', 'advancement', 'ranger-kids', 'Ranger Kids', 'The Royal Rangers program group for boys in kindergarten through grade 2.', 'published',
   '{"program":"Ranger Kids","grades":"K–2","accent":"#D34A36","highlights":["Four advancement trails organize age-appropriate growth.","Leaders use the current official curriculum and award materials.","Families can use the official store link to locate the current handbook."],"officialUrl":"https://royalrangers.com/programs/ranger-kids"}',
   '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z'),
  ('program-discovery', 'advancement', 'discovery-rangers', 'Discovery Rangers', 'The Royal Rangers program group for boys in grades 3 through 5.', 'published',
   '{"program":"Discovery Rangers","grades":"3–5","accent":"#187A61","highlights":["Advancement combines Bible, leadership, and skill learning.","Merit requirements should be checked against current official materials.","The Gold Falcon is the group capstone award."],"officialUrl":"https://royalrangers.com/programs/discovery-rangers"}',
   '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z'),
  ('program-adventure', 'advancement', 'adventure-rangers', 'Adventure Rangers', 'The Royal Rangers program group for boys in grades 6 through 8.', 'published',
   '{"program":"Adventure Rangers","grades":"6–8","accent":"#1D5E91","highlights":["Advancement adds deeper skills, leadership, and service.","The Adventure Gold is the group capstone award.","Official merit and curriculum resources remain the source of record."],"officialUrl":"https://royalrangers.com/programs/adventure-rangers"}',
   '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z'),
  ('program-expedition', 'advancement', 'expedition-rangers', 'Expedition Rangers', 'The Royal Rangers program group for young men in grades 9 through 12.', 'published',
   '{"program":"Expedition Rangers","grades":"9–12","accent":"#73528F","highlights":["Older Rangers pursue advanced skills, ministry, leadership, and service.","The E3 award is the Expedition Rangers capstone.","Progress can contribute to the Gold Medal of Achievement pathway."],"officialUrl":"https://royalrangers.com/programs/expedition-rangers"}',
   '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z'),

  ('region-northwest', 'organization', 'northwest-region', 'Northwest Region', 'Royal Rangers USA geographic region paired with the FCF Trappers Territory.', 'published',
   '{"organizationType":"region","parent":"Royal Rangers USA","jurisdictions":["Alaska","Idaho","Montana","Oregon","Washington","Wyoming"]}',
   '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z'),
  ('region-north-central', 'organization', 'north-central-region', 'North Central Region', 'Royal Rangers USA geographic region paired with the FCF Explorers Territory.', 'published',
   '{"organizationType":"region","parent":"Royal Rangers USA","jurisdictions":["Iowa","Minnesota","Missouri (north)","Nebraska","North Dakota","South Dakota","Wisconsin"]}',
   '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z'),
  ('region-southwest', 'organization', 'southwest-region', 'Southwest Region', 'Royal Rangers USA geographic region paired with the FCF Mountainmen Territory.', 'published',
   '{"organizationType":"region","parent":"Royal Rangers USA","jurisdictions":["Arizona","California","Colorado","Hawaii","Nevada","Utah"]}',
   '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z'),
  ('region-south-central', 'organization', 'south-central-region', 'South Central Region', 'Royal Rangers USA geographic region paired with the FCF Plainsmen Territory.', 'published',
   '{"organizationType":"region","parent":"Royal Rangers USA","jurisdictions":["Kansas","New Mexico","Oklahoma","Texas"]}',
   '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z'),
  ('region-gulf', 'organization', 'gulf-region', 'Gulf Region', 'Royal Rangers USA geographic region paired with the FCF Rivermen Territory.', 'published',
   '{"organizationType":"region","parent":"Royal Rangers USA","jurisdictions":["Arkansas","Louisiana","Mississippi","Missouri (south)","Tennessee"]}',
   '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z'),
  ('region-southeast', 'organization', 'southeast-region', 'Southeast Region', 'Royal Rangers USA geographic region paired with the FCF Riflemen Territory.', 'published',
   '{"organizationType":"region","parent":"Royal Rangers USA","jurisdictions":["Alabama","Florida","Georgia","North Carolina","Puerto Rico","South Carolina"]}',
   '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z'),
  ('region-great-lakes', 'organization', 'great-lakes-region', 'Great Lakes Region', 'Royal Rangers USA geographic region paired with the FCF Voyagers Territory.', 'published',
   '{"organizationType":"region","parent":"Royal Rangers USA","jurisdictions":["Illinois","Indiana","Kentucky","Michigan","Ohio"]}',
   '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z'),
  ('region-northeast', 'organization', 'northeast-region', 'Northeast Region', 'Royal Rangers USA geographic region paired with the FCF Colonials Territory.', 'published',
   '{"organizationType":"region","parent":"Royal Rangers USA","jurisdictions":["Connecticut","Delaware","District of Columbia","Maine","Maryland","Massachusetts","New Hampshire","New Jersey","New York","Pennsylvania","Rhode Island","Vermont","Virginia","West Virginia"]}',
   '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z'),

  ('outpost-greenville-1', 'outpost', 'greenville-alabama-outpost-1', 'Outpost 1 · LifeChange Church', 'A church-published Royal Rangers outpost in Greenville, Alabama.', 'published',
   '{"outpostNumber":"1","church":"LifeChange Church","city":"Greenville","jurisdiction":"Alabama","district":"Alabama District","region":"Southeast Region","fcfTerritory":"Riflemen Territory","activeFcf":null,"programs":["Ranger Kids","Discovery Rangers","Adventure Rangers"],"meeting":"Ranger Kids and Discovery Rangers meet Sunday; Adventure Rangers meets Wednesday. Confirm times with the church."}',
   '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z'),
  ('outpost-stx-70', 'outpost', 'angleton-texas-outpost-70', 'Outpost 70 · First Assembly of God', 'A South Texas District outpost listed in the Gulf Coast section.', 'published',
   '{"outpostNumber":"70","church":"First Assembly of God","city":"Angleton","jurisdiction":"Texas","district":"South Texas District","region":"South Central Region","fcfTerritory":"Plainsmen Territory","activeFcf":null,"programs":[],"meeting":null}',
   '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z'),
  ('outpost-stx-41', 'outpost', 'houston-texas-outpost-41', 'Outpost 41 · Glad Tidings Assembly of God', 'A South Texas District outpost listed in the Houston section.', 'published',
   '{"outpostNumber":"41","church":"Glad Tidings Assembly of God","city":"Houston","jurisdiction":"Texas","district":"South Texas District","region":"South Central Region","fcfTerritory":"Plainsmen Territory","activeFcf":null,"programs":[],"meeting":null}',
   '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z'),
  ('outpost-stx-132', 'outpost', 'richmond-texas-outpost-132', 'Outpost 132 · Friendship Church', 'A South Texas District outpost listed in the Houston section.', 'published',
   '{"outpostNumber":"132","church":"Friendship Church","city":"Richmond","jurisdiction":"Texas","district":"South Texas District","region":"South Central Region","fcfTerritory":"Plainsmen Territory","activeFcf":null,"programs":[],"meeting":null}',
   '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z'),
  ('outpost-stx-355', 'outpost', 'alvin-texas-outpost-355', 'Outpost 355 · Light Christian Center', 'A South Texas District outpost listed in the Gulf Coast section.', 'published',
   '{"outpostNumber":"355","church":"Light Christian Center","city":"Alvin","jurisdiction":"Texas","district":"South Texas District","region":"South Central Region","fcfTerritory":"Plainsmen Territory","activeFcf":null,"programs":[],"meeting":null}',
   '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z'),

  ('event-nrmc-pa-2026', 'event', 'nrmc-susquehanna-2026', 'National Rangers Ministry Conference · Pennsylvania', 'A national leader-training event listed by Royal Rangers USA.', 'published',
   '{"startDate":"2026-09-18","endDate":"2026-09-20","location":"Rock Mountain Bible Camp, Susquehanna, Pennsylvania","level":"national","eventUrl":"https://royalrangers.com/training/events"}',
   '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z'),
  ('event-neec-mo-2026', 'event', 'neec-eagle-rock-2026', 'National Elementary Education Conference · Missouri', 'A national training event focused on early elementary ministry and Ranger Kids.', 'published',
   '{"startDate":"2026-09-11","endDate":"2026-09-12","location":"Camp Eagle Rock, Eagle Rock, Missouri","level":"national","eventUrl":"https://royalrangers.com/training/events"}',
   '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z'),
  ('event-jbei-wi-2026', 'event', 'jbei-waupaca-2026', 'Johnnie Barnes Excellence Initiative · Wisconsin', 'A national leadership-development seminar listed by Royal Rangers USA.', 'published',
   '{"startDate":"2026-09-25","endDate":"2026-09-26","location":"Camp Wilderness, Waupaca, Wisconsin","level":"national","eventUrl":"https://royalrangers.com/training/events"}',
   '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z'),

  ('page-about', 'page', 'about-royal-rangers', 'About Royal Rangers', 'An independent introduction to the mission, program groups, and structure of Royal Rangers.', 'published',
   '{"section":"about","body":["Royal Rangers is a church ministry that mentors boys and young men through Christian discipleship, practical skills, leadership, service, and outdoor adventure.","Local churches organize groups called outposts. In the United States, outposts connect with districts and one of eight geographic regions. Royal Rangers USA also recognizes two Spanish-language regions that serve Spanish-speaking districts and ministries.","Ranger Outpost Hub is an independent directory and study aid. It is not operated by or an official publication of Royal Rangers, the General Council of the Assemblies of God, or Gospel Publishing House."],"links":[{"label":"Royal Rangers USA","url":"https://royalrangers.com"},{"label":"Royal Rangers International","url":"https://royalrangersinternational.com"}]}',
   '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z'),
  ('page-trail-gma', 'page', 'trail-of-the-saber-and-gma', 'Trail of the Saber & GMA', 'A starting point for understanding two major Royal Rangers USA advancement pathways.', 'published',
   '{"section":"other","body":["The Trail of the Saber is the adult-leader advancement path. It recognizes training, service, and ongoing development through successive levels. Use the current national application and training pages to confirm every requirement before applying.","The Gold Medal of Achievement (GMA) is the highest Royal Rangers achievement award. The current national pathway combines advancement awards, specified merit categories, leadership development, and service. Requirements can change, so this hub links to the official award page instead of reproducing controlled curriculum."],"links":[{"label":"Official Trail of the Saber page","url":"https://royalrangers.com/training/trail-of-the-saber"},{"label":"Official GMA information","url":"https://royalrangers.com/awards/gold-medal-of-achievement"}]}',
   '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z'),
  ('page-uniforms-pledges', 'page', 'uniforms-and-pledges', 'Uniforms & Pledges', 'Verified links and plain-language context for uniforms, emblems, mottos, and pledges.', 'published',
   '{"section":"other","body":["Uniforms help identify a Ranger group and provide a consistent place for approved insignia. Official uniform standards and products should be checked through current Royal Rangers USA resources before purchase or placement.","Royal Rangers uses a pledge, code, motto, and Golden Rule as short statements of commitment and character. To prevent an outdated or altered copy from becoming authoritative, this hub directs readers to the official program pages."],"links":[{"label":"Official uniform resources","url":"https://royalrangers.com/resources/uniforms"},{"label":"Royal Rangers USA home","url":"https://royalrangers.com"}]}',
   '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z'),
  ('page-fcf', 'page', 'frontiersmen-camping-fellowship', 'Frontiersmen Camping Fellowship', 'An introduction to FCF, its advancement path, and the eight U.S. territories.', 'published',
   '{"section":"other","body":["Frontiersmen Camping Fellowship (FCF) is a Royal Rangers service and camping fellowship with a historical-frontier theme. Its U.S. advancement path progresses through Frontiersman, Buckskin, and Wilderness membership.","FCF is organized into eight territories that correspond to the eight Royal Rangers USA geographic regions: Trappers, Explorers, Mountainmen, Plainsmen, Rivermen, Riflemen, Voyagers, and Colonials.","An outpost directory record reports Active FCF as Yes, No, or Not verified. It does not infer a status from district or regional activity."],"links":[{"label":"Official FCF page","url":"https://royalrangers.com/programs/fcf"}]}',
   '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z'),
  ('page-help', 'page', 'help-sources-and-disclaimer', 'Help, Sources & Independent-Site Notice', 'How to use this site, understand verification, and reach the official source.', 'published',
   '{"section":"help","body":["Search by church, city, state or territory, outpost number, program group, event, region, or FCF territory. Empty fields mean the information was not verified; they are not assumptions.","Each published record includes at least one source and a verification date. Source links open the organization responsible for the information so you can confirm details before travel, registration, purchase, or award submission.","This independent site does not host paid handbooks, curriculum, merit worksheets, or restricted artwork. It provides original summaries and links to official sources. Event details can change; always confirm with the organizer."],"links":[{"label":"Official outpost locator","url":"https://royalrangers.com/about/outpost-locator"},{"label":"Official national events","url":"https://royalrangers.com/events"},{"label":"Official training schedule","url":"https://royalrangers.com/training/events"}]}',
   '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z');

INSERT INTO record_sources (id, record_id, field_name, label, url, verified_at)
SELECT 'source-' || id, id, 'record',
  CASE
    WHEN kind = 'advancement' THEN 'Royal Rangers USA program page'
    WHEN kind = 'organization' THEN 'Royal Rangers USA regions and districts'
    WHEN kind = 'event' THEN 'Royal Rangers USA national training schedule'
    WHEN id = 'outpost-greenville-1' THEN 'LifeChange Church Royal Rangers outpost site'
    WHEN kind = 'outpost' THEN 'South Texas District Royal Rangers outpost locator'
    WHEN id = 'page-fcf' THEN 'Royal Rangers USA FCF page'
    ELSE 'Royal Rangers USA official website'
  END,
  CASE
    WHEN kind = 'advancement' THEN json_extract(details_json, '$.officialUrl')
    WHEN kind = 'organization' THEN 'https://royalrangers.com/about/regions-districts'
    WHEN kind = 'event' THEN 'https://royalrangers.com/training/events'
    WHEN id = 'outpost-greenville-1' THEN 'https://www.royalrangersgreenville.org/aboutus'
    WHEN kind = 'outpost' THEN 'https://www.stxroyalrangers.com/outpost-locator/'
    WHEN id = 'page-fcf' THEN 'https://royalrangers.com/programs/fcf'
    ELSE 'https://royalrangers.com'
  END,
  '2026-08-12T00:00:00.000Z'
FROM content_records;

INSERT INTO audit_events (record_id, action, actor, after_json, reason, created_at)
SELECT id, 'seeded', 'MVP seed', details_json, 'Initial verified MVP record', '2026-08-12T00:00:00.000Z'
FROM content_records;
