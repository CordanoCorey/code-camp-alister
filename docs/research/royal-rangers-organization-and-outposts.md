# Royal Rangers organization and outpost geography

**Research date:** 2026-08-12  
**Scope:** United States outposts, regions and districts; Frontiersmen Camping Fellowship (FCF) chapters and territories; Royal Rangers International (RRI) regions and member-nation data; civil country/subdivision data; and public directory/API availability.  
**Source policy:** Primary and first-party sources only: Royal Rangers USA, Royal Rangers International, Assemblies of God directory code, ISO, and U.S. government sources.

This is a source audit, not a product or data-model recommendation. “Not found” means that the reviewed official public sources did not expose the information as of the research date; it does not prove that the national offices do not hold it privately.

## Executive findings

1. Royal Rangers USA documents the core hierarchy as national, region, district, section, and outpost. Current forms also use “division” or “area” at the layer between district and outpost, so the intermediate local label is not completely uniform. ([Royal Rangers USA, “Preserving Royal Ranger History”](https://royalrangers.com/en/news/General-News/2020/2020-12-Preserving-Royal-Ranger-History?D=%7B0DB6EE67-D8C0-4853-9BA4-0D8891FB3FAA%7D); [Royal Rangers USA, Outpost Coordinators Award form](https://royalrangers.com/-/media/4EC85124658A4EE99508EFE97FCF9057.ashx); [Royal Rangers USA, national outreach-coordinator announcement](https://royalrangers.com/en/news/general-news/2019/2019-07-outreach-coord?D=0DB6EE67D8C048539BA40D8891FB3FAA))
2. The current official U.S. English-language map has eight regions: Northwest, North Central, Southwest, South Central, Gulf, Southeast, Great Lakes, and Northeast. A separate Spanish-language map overlays two language regions and multiple language districts whose boundaries do not follow the English district map. ([English Region and District Map](https://royalrangers.com/~/-/media/F5F81CB2C829419A82139A817D8073A2.ashx); [Spanish Language Districts Map](https://royalrangers.com/~/-/media/8C78271475064CB3B4ED1F41C298E885.ashx))
3. A U.S. outpost is a church-based local Royal Rangers group. Annual chartering supplies an official outpost number and makes eligible outposts appear in the national locator, but the national office expressly warns that the locator is incomplete. ([Royal Rangers USA, Charter Membership](https://royalrangers.com/charter); [Royal Rangers USA, Outpost Locator](https://royalrangers.com/locator))
4. FCF uses chapters and eight named territories. The official 2023 territory/event table maps one FCF territory to each of the eight U.S. Royal Rangers regions. Official examples associate a chapter with a district, but no current official public master roster of all FCF chapters was found. ([Royal Rangers USA, “Territorial Rendezvous,” 2023](https://royalrangers.com/en/news/General-News/2023/2023-06-Territorial-Rendezvous?D=%7B39CB0294-58F1-4250-AB82-25E3BF8466D2%7D); [Royal Rangers USA, “Remembering Paul Walters”](https://royalrangers.com/en/news/general-news/2018/2018-09-paul-walters-memorial?D=0DB6EE67D8C048539BA40D8891FB3FAA))
5. RRI’s public international data is country-level, not outpost-level. Its current member-nations page contains 75 ministry-label rows across five displayed regional groups, while the current RRI home page says Royal Rangers operates in more than 90 nations. The member page is therefore not a comprehensive current global directory. ([RRI, Member Nations](https://rri.world/Member_nations.php); [RRI home page](https://rri.world/))
6. “Asia” is not a safe synonym for a civil continent in RRI data. Current RRI contact headings say “Asia”; other official sources say “Asia Pacific”; Nepal and Sri Lanka are placed under RRI Eurasia; and an older official Asia Pacific structure used three areas: Australia and the Pacific Islands, Southeast Asia, and Northern Asia. No current official public source was found that confirms those three area names still govern today. ([RRI, Contact](https://rri.world/contact.php); [RRI, Member Nations](https://rri.world/Member_nations.php); [RRI 360, Fall 2011](https://rri.world/utilities/file_download.php?path=img%2Fnewsletters_RRI360%2FFall+2011+RRI360.pdf))
7. The U.S. locator is backed by a browser-facing Assemblies of God JSONP endpoint, but it is undocumented, unsupported as a third-party API, incomplete by the locator’s own warning, and has no published bulk-use or republication terms. No official public international outpost API or bulk dataset was found. ([Royal Rangers USA locator page source](https://royalrangers.com/locator); [Assemblies of God directory widget source](https://directory.ag.org/content/js/AG.Directory.Widget.js))

## 1. Royal Rangers USA organization

### 1.1 Documented hierarchy and local variants

Official national sources refer to the following levels:

```text
National
  Region
    District
      Section / division / area (terminology varies)
        Outpost (local church program)
```

- A current national article says Royal Rangers history exists at national, regional, district, section, and outpost levels. ([“Preserving Royal Ranger History”](https://royalrangers.com/en/news/General-News/2020/2020-12-Preserving-Royal-Ranger-History?D=%7B0DB6EE67-D8C0-4853-9BA4-0D8891FB3FAA%7D))
- A national leadership biography says one leader served at local outpost, area, section, district, and region levels. ([National Outreach Coordinator announcement](https://royalrangers.com/en/news/general-news/2019/2019-07-outreach-coord?D=0DB6EE67D8C048539BA40D8891FB3FAA))
- Current award forms group “district/division/section events,” showing that “division” and “section” are both live terms rather than a single universal intermediate unit. ([Outpost Coordinators Award form](https://royalrangers.com/-/media/4EC85124658A4EE99508EFE97FCF9057.ashx))
- A current district-leadership form says districts submit annual reports to the region, and regions compile district and national-office data. ([District Leadership Award form, version 2026-01-12](https://royalrangers.com/-/media/4D56F0F7C6B74470ADF7B6DD004488F9.ashx))

The sources establish these organizational names, but they do not provide a current public machine-readable hierarchy of every region, district, section/division/area, and outpost.

### 1.2 U.S. English-language regions and districts

The official English map has eight color-coded regions. The district labels visible on that map are transcribed below. The map itself should remain the authority for boundaries because several districts split states or span multiple states. The PDF has no visible effective date. ([Official Region and District Map](https://royalrangers.com/~/-/media/F5F81CB2C829419A82139A817D8073A2.ashx))

| Region | District labels shown on the official map |
|---|---|
| Northwest | Alaska; Northwest; Oregon; So. Idaho; Montana; Wyoming |
| North Central | N. Dakota; S. Dakota; Nebraska; Minnesota; Wis.-N. Mich; Iowa; N. Missouri |
| Southwest | N. Cal.-Nevada; S. California; Arizona; Hawaii; Rocky Mountain |
| South Central | New Mexico; Kansas; Oklahoma; W. Texas; N. Texas; S. Texas |
| Gulf | S. Missouri; Arkansas; Tennessee; Mississippi; Louisiana |
| Southeast | N. Carolina; S. Carolina; Georgia; Alabama; W. Florida; Pen. Florida; Puerto Rico |
| Great Lakes | Michigan; Illinois; Indiana; Ohio; Kentucky |
| Northeast | N. New England; S. New England; New York; Penn.-Del; New Jersey; Potomac; Appalachian |

Important boundary facts visible in the map:

- A state name alone does not always identify a district: California, Florida, Missouri, Texas, and New England are subdivided; other districts span state lines.
- Puerto Rico is explicitly shown as a district in the Southeast region.
- The map does not show American Samoa, Guam, the Commonwealth of the Northern Mariana Islands, or the U.S. Virgin Islands.

### 1.3 Spanish-language regions and districts

The national “Get Started” page links a separate Spanish map rather than treating Spanish districts as simple translations of the English map. The map has two regions, **Language West-Spanish** and **Language East-Spanish**, with the following district labels. ([Royal Rangers USA, Get Started](https://royalrangers.com/~/link.aspx?_id=EE2A67EE2E6B403AA59E6EBCCB453267&_z=z); [Spanish Language Districts Map](https://royalrangers.com/~/-/media/8C78271475064CB3B4ED1F41C298E885.ashx))

| Spanish-language region | District labels shown on the official map |
|---|---|
| Language West-Spanish | Northwest Hispanic; Northern Pacific Latin American; Central District / Distrito Central; Southern Pacific; Southwest; West Texas and Plains; South Central Hispanic; Texas Louisiana Hispanic; Texas Gulf Spanish |
| Language East-Spanish | Midwest Latin American; Spanish Eastern; Southern Latin; Florida Multicultural; Puerto Rico |

The Spanish map is an overlay with different boundaries. It also repeats some labels across detached map areas, such as Alaska/Hawaii, rather than identifying every detached shape as a separate district. The PDF has no visible effective date.

### 1.4 Outpost identity, chartering, and public fields

Royal Rangers USA defines local groups as outposts and says only churches may conduct a Royal Rangers program. Chartering is annual, produces an official outpost number, and supplies national, regional, and district leaders with program-health information. Multisite churches may register campuses so each campus can appear in the locator. ([Royal Rangers USA, Charter Membership](https://royalrangers.com/charter))

The online chartering page says a church needs its church account number, counts of boys by age group, adult-leader names/contact information, and its district. Those fields are submitted to the chartering system; they are not all public locator fields. ([Royal Rangers Online Chartering](https://chartering.royalrangers.com/))

The official locator publicly renders:

- church/outpost title and subtitle;
- street address;
- city, state, and ZIP code;
- phone and fax;
- geographic map coordinates in the browser’s base pin data.

The fields are visible in the official locator template and widget source. ([Locator template](https://royalrangers.com/areas/RoyalRangersUSA/Content/js/Locator/AG.Directory.Widget.Templates.html); [directory widget source](https://directory.ag.org/content/js/AG.Directory.Widget.js))

The locator is expressly incomplete. Royal Rangers USA says some outposts may not appear when they are affiliated with a parent church or have an expired charter, and its “Get Started” page also warns that local information may be out of date. ([Outpost Locator](https://royalrangers.com/locator); [Get Started](https://royalrangers.com/~/link.aspx?_id=EE2A67EE2E6B403AA59E6EBCCB453267&_z=z))

## 2. Frontiersmen Camping Fellowship geography

FCF is a special program of Royal Rangers USA. Membership requirements tie a person to both a chartered outpost and an FCF chapter, and direct applicants to the district for FCF events. ([Royal Rangers USA, FCF](https://royalrangers.com/fcf))

### 2.1 Territory-to-region mapping

An official 2023 national article published this complete event mapping: ([“Territorial Rendezvous,” 2023](https://royalrangers.com/en/news/General-News/2023/2023-06-Territorial-Rendezvous?D=%7B39CB0294-58F1-4250-AB82-25E3BF8466D2%7D))

| FCF territory | Royal Rangers USA region |
|---|---|
| Trappers | Northwest |
| Explorers | North Central |
| Mountainmen | Southwest |
| Plainsmen | South Central |
| Rivermen | Gulf |
| Riflemen | Southeast |
| Voyagers | Great Lakes |
| Colonials | Northeast |

This is strong evidence that FCF territory is the FCF counterpart to a U.S. region. It is an event article, not a dated master-data specification, so it does not establish whether names have changed after 2023.

### 2.2 Chapter-to-district relationship

Official examples associate chapters with districts and territories with regions:

- George Washington chapter is identified with the Penn-Del District, and Colonials territory with the Northeast region. ([Royal Rangers USA, “Remembering Paul Walters”](https://royalrangers.com/en/news/general-news/2018/2018-09-paul-walters-memorial?D=0DB6EE67D8C048539BA40D8891FB3FAA))
- Current FCF forms collect district, outpost number, and chapter, and accept district-director or FCF-president approval. ([FCF Wilderness application, revised 2024](https://royalrangers.com/-/media/55C370AC70E14202B35FB31493BBED6C.ashx))
- Current district staff material treats the chapter FCF trace as a district event and includes an FCF president district role. ([District Leadership Award materials](https://royalrangers.com/-/media/4D56F0F7C6B74470ADF7B6DD004488F9.ashx))

These official sources support treating the chapter as district-associated. They do not prove from a public master list that every current district has exactly one chapter, that chapter boundaries always equal district boundaries, or that Spanish-language districts follow the same one-to-one rule. No current official public chapter roster was found.

## 3. Royal Rangers International organization

### 3.1 Global, regional, national, and local levels

RRI says it exists to establish, strengthen, and serve Royal Rangers around the world. Its current home page says more than 200,000 Royal Rangers participate in more than 90 nations. ([RRI home page](https://rri.world/))

RRI’s published indigenous-ministry principles say a national office leads its program at all levels independently after launch, remains connected/accountable to its national church, and adapts programming to its ministry context while remaining true to the global ministry’s core identity. ([RRI, *Forging a Mighty Generation of World Changers*, 2020](https://rri.world/utilities/file_library/img/newsletters/2020_RRIPromoMag_LRZ.pdf))

The high-confidence international hierarchy is therefore:

```text
Royal Rangers International
  RRI world region
    Self-governing national Royal Rangers program
      Country-specific organizational levels, if any
        Local outpost / group
```

The official sources do not establish a universal international equivalent of the U.S. district, section, or FCF chapter. A country’s civil state/province/prefecture is also not shown to be the same as a Royal Rangers organizational unit.

### 3.2 Current public regional headings

The current RRI contact page has six headings: Africa, Asia, Eurasia, Latin America Caribbean, Europe, and USA and Canada. ([RRI, Contact](https://rri.world/contact.php))

The current member-nations page displays only five region groups and omits a USA/Canada country list. Its Asia graphic and older/current RRI materials use “Asia Pacific,” while the contact page shortens that heading to “Asia.” ([RRI, Member Nations](https://rri.world/Member_nations.php); [RRI, Newsletters](https://rri.world/newsletters.php); [RRI, 2020 promotional magazine](https://rri.world/utilities/file_library/img/newsletters/2020_RRIPromoMag_LRZ.pdf))

### 3.3 Country labels on the official member-nations page

The page currently contains these 75 rows. Names are transcribed exactly enough to preserve RRI’s ministry labels; they are not a normalized list of sovereign states. For example, one row combines “Bahamas, Turks & Caicos Islands,” and the page uses “Swaziland.” ([RRI, Member Nations](https://rri.world/Member_nations.php))

| Displayed RRI region | Member-nation rows on the page |
|---|---|
| Africa | Ghana; Kenya; Madagascar; Malawi; Nigeria; South Africa; Swaziland; Tanzania; Togo; Zambia |
| Asia Pacific | Australia; Fiji Islands; Indonesia; Japan; Malaysia; New Zealand; Papua New Guinea; Philippines; Singapore; Solomon Islands; Vanuatu |
| Eurasia | Moldova; Mongolia; Nepal; Russia; Sri Lanka; Transnistria; Ukraine |
| Europe | Albania; Austria; Belgium; Bulgaria; Croatia; Czech Republic; Denmark; Finland; France; Germany; Hungary; Iceland; Italy; Latvia; Lithuania; Macedonia; Netherlands; Norway; Poland; Romania; Serbia; Slovak Republic; Slovenia; Spain; Sweden; Switzerland; United Kingdom |
| Latin America and the Caribbean | Argentina; Bahamas, Turks & Caicos Islands; Belize; Bolivia; Brazil; Chile; Colombia; Costa Rica; Curacao; Dominican Republic; Ecuador; El Salvador; Guatemala; Honduras; Mexico; Nicaragua; Panama; Paraguay; Uruguay; Venezuela |

This page cannot be treated as comprehensive current membership data because:

- 75 displayed rows do not reconcile with the home page’s “more than 90 nations” claim;
- the member page omits the contact page’s USA/Canada region;
- its country labels are not normalized civil entities;
- it publishes no “last updated” date, revision history, outpost count, or national-office status field.

The 2020 official magazine also shows why historical snapshots cannot silently fill the gaps: its Asia list included Thailand with an asterisk meaning Royal Rangers was present without a national office, while the current member page does not list Thailand. ([RRI, 2020 promotional magazine](https://rri.world/utilities/file_library/img/newsletters/2020_RRIPromoMag_LRZ.pdf))

### 3.4 How Asia Pacific has been divided

The clearest official structural statement found is in the Fall 2011 RRI newsletter. At the third Asia Pacific Summit, national leaders elected three area representatives: ([RRI 360, Fall 2011](https://rri.world/utilities/file_download.php?path=img%2Fnewsletters_RRI360%2FFall+2011+RRI360.pdf))

| 2011 Asia Pacific area | Representative scope stated in the newsletter |
|---|---|
| Australia and the Pacific Islands | Australia and Pacific island nations |
| Southeast Asia | Southeast Asian nations |
| Northern Asia | Northern Asian nations |

This is historical evidence, not a verified current hierarchy. Current official pages expose only a regional coordinator and do not publish current area representatives, area boundaries, or country-to-area assignments. ([RRI, Contact](https://rri.world/contact.php))

The official RRI allocation also crosses ordinary continental geography:

- Nepal and Sri Lanka are listed under RRI Eurasia, not Asia Pacific. ([RRI, Member Nations](https://rri.world/Member_nations.php))
- RRI’s “Ignite Eurasia” project described India, Nepal, Bangladesh, and Sri Lanka as Southern Asia while keeping the initiative under Eurasia. ([RRI, Ignite Eurasia](https://rri.world/IgniteEurasia/))

Therefore, an RRI region or area cannot be inferred reliably from a country’s ordinary continent/subregion alone. This is a finding about the official terminology, not a proposed implementation.

### 3.5 Canada-specific public evidence

RRI’s contact page groups “USA and Canada” under one heading, but the member-nations page omits that region. A 2024 official Royal Rangers USA catalog offered district patches for these Canadian labels: Alberta & Northwest Territory Canada; B.C. & Yukon Canada; East Ontario Canada; Manitoba & Northwest Ontario Canada; Maritime Canada; Quebec Canada; Saskatchewan Canada; and West Ontario Canada. ([RRI, Contact](https://rri.world/contact.php); [Royal Rangers 2024 catalog, p. 41](https://royalrangers.com/~/-/media/3A2952F075FE4CD189805D8CA844363D.ashx))

The catalog establishes that these district labels were officially recognized for insignia in 2024. It does not provide a Canadian region map, boundary definitions, current outpost roster, or confirmation that every listed district remains operational in 2026.

## 4. Civil countries, subdivisions, and U.S. territories

### 4.1 International civil subdivisions

RRI’s public member data stops at the country/ministry label. It does not publish city, state, province, prefecture, department, territory, or equivalent subnational data for individual international outposts. The reviewed RRI pages provide country contact actions rather than outpost listings. ([RRI, Member Nations](https://rri.world/Member_nations.php))

The official international standard for coded country subdivisions is ISO 3166-2. ISO says the standard is intended for applications that need current country-subdivision names in coded form; edition 4 (2020) was reviewed and confirmed in 2025. “Province” is only one possible local subdivision type, not a universal label. ([ISO 3166-2:2020](https://www.iso.org/standard/72483.html); [ISO 3166 country codes](https://www.iso.org/iso-3166-country-codes.html))

ISO 3166-2 is a civil-geography standard, not a Royal Rangers directory. It cannot establish that a Royal Rangers outpost exists in a subdivision or that a national Royal Rangers program uses the civil subdivision organizationally.

### 4.2 U.S. territories and Royal Rangers evidence

For populated U.S. territorial geography, the U.S. Census Bureau treats Puerto Rico and the four Island Areas—American Samoa, Guam, the Commonwealth of the Northern Mariana Islands, and the U.S. Virgin Islands—as state-equivalent geographies in its national mapping. ([U.S. Census Bureau, Counties and Statistically Equivalent Areas](https://www.census.gov/geographies/reference-maps/2020/geo/county-wallmaps-2020.html))

Royal Rangers-specific public evidence differs by territory:

| U.S. territory / state-equivalent | Royal Rangers-specific official public evidence found |
|---|---|
| Puerto Rico | Explicitly appears as a district in the Southeast region on the English map and as a district in the Language East-Spanish region on the Spanish map. |
| American Samoa | Not shown on either current U.S. district map; a 2020 RRI magazine listed it among places “without Royal Rangers,” which is historical rather than current status. The 2024 catalog also offered a “Samoan” district patch, but did not define its geography or establish an American Samoa outpost. |
| Guam | Not shown on either current U.S. district map; the 2020 RRI magazine used the historical combined label “Guam-Marianas” among places “without Royal Rangers.” |
| Commonwealth of the Northern Mariana Islands | Not separately shown on either current U.S. district map; the historical RRI “Guam-Marianas” label is ambiguous for present-day status. |
| U.S. Virgin Islands | Not shown on either current U.S. district map; no current official public Royal Rangers outpost assignment was found. |

Sources: [English Region and District Map](https://royalrangers.com/~/-/media/F5F81CB2C829419A82139A817D8073A2.ashx); [Spanish Language Districts Map](https://royalrangers.com/~/-/media/8C78271475064CB3B4ED1F41C298E885.ashx); [RRI, 2020 promotional magazine](https://rri.world/utilities/file_library/img/newsletters/2020_RRIPromoMag_LRZ.pdf); [Royal Rangers 2024 catalog, p. 41](https://royalrangers.com/~/-/media/3A2952F075FE4CD189805D8CA844363D.ashx).

The absence of a territory from these maps is not proof that no church there has a local program. It only means that no official public assignment was found in the reviewed sources.

## 5. Directory, API, and public-data audit

### 5.1 U.S. outpost locator

The national locator is the only authoritative public outpost-level source found. It supports ZIP/radius and church-name search and shows mapped chartered outposts. ([Royal Rangers USA, Outpost Locator](https://royalrangers.com/locator))

Its page loads the official Assemblies of God directory widget with entity `RoyalRangerOutpost` and root `https://directory.ag.org/`. The widget calls browser-facing JSONP routes at `api/directoryitem`, `api/directoryitem/{guid}`, and `api/zip/get/`. Its render model exposes title, subtitle, address, city, state, ZIP, phone, fax, GUID, and map coordinates. ([Royal Rangers USA locator page source](https://royalrangers.com/locator); [Assemblies of God directory widget source](https://directory.ag.org/content/js/AG.Directory.Widget.js); [locator HTML templates](https://royalrangers.com/areas/RoyalRangersUSA/Content/js/Locator/AG.Directory.Widget.Templates.html))

Limitations:

- the national site says some outposts are absent or outdated;
- the browser endpoint has no published API documentation, schema contract, service-level commitment, API key/consumer registration, versioning policy, data license, or bulk republication terms;
- direct HTTP requests from this research environment received HTTP 403 even though the endpoint is consumed by the first-party browser widget;
- public results do not expose every charter field, district, region, section, FCF chapter, age-group enrollment, leader roster, meeting schedule, or verification timestamp.

The endpoint’s existence is a technical observation, not evidence of permission to scrape, mirror, or republish its data.

### 5.2 International outpost data

No official public international outpost directory, downloadable file, bulk export, or documented API was found on RRI’s site or the regional partner pages linked by RRI. The RRI member page provides country-level contact actions, not local outpost records. ([RRI, Member Nations](https://rri.world/Member_nations.php); [RRI, Partners](https://rri.world/partners.php))

RRI’s national self-governance principle makes it plausible that detailed records are held separately by national programs, but this is an inference. No reviewed source establishes a shared global registry or common international schema. ([RRI, 2020 promotional magazine](https://rri.world/utilities/file_library/img/newsletters/2020_RRIPromoMag_LRZ.pdf))

### 5.3 Public versus non-public charter data

The national charter system clearly holds more information than the locator publishes: church account number, age-group counts, adult-leader names/contact information, district, and payment/charter status are part of the charter workflow. ([Royal Rangers Online Chartering](https://chartering.royalrangers.com/))

No official source reviewed offers public bulk access to that private charter dataset. The national office directs missing or incorrect locator records to its contact channel. ([Royal Rangers USA, Contact](https://royalrangers.com/contact); [Outpost Locator](https://royalrangers.com/locator))

### 5.4 Outpost-number identifier audit

The public evidence does **not** support treating the bare outpost number as a globally unique, U.S.-nationally unique, or physical-campus identifier.

| Question | Official evidence and finding |
|---|---|
| Is the number unique across the United States? | **No.** A browser-rendered 2026-08-12 snapshot of the official locator's live `RoyalRangerOutpost` feed contained 612 records but only 305 distinct displayed number values; 154 values occurred more than once. For example, `Outpost #002` appeared in eight records in Puerto Rico, New Jersey, Maryland, Ohio, Illinois, Idaho, and two Texas records. The records carried unique locator GUIDs, but the number was reused. The locator is admittedly incomplete, so these are snapshot counts rather than a national total; the observed collisions are nevertheless decisive. ([Outpost Locator](https://royalrangers.com/locator); [live Assemblies of God directory route](https://directory.ag.org/api/directoryitem?callback=test); [directory widget source](https://directory.ag.org/content/js/AG.Directory.Widget.js)) |
| Is it district-scoped in U.S. operations? | Official TRaCclub verification requires an **outpost number and district**, or alternatively a church account number and ZIP. National event forms likewise request `DISTRICT` and `OUTPOST #` separately. This establishes that official workflows use the pair, not the number alone. No reviewed policy formally guarantees uniqueness even within one district. ([TRaCclub User Guide, p. 6](https://royalrangers.com/tracclub/-/media/DBE356BC0AFD4687A35392F2D5802DD6.ashx); [2026 WCO application](https://royalrangers.com/-/media/RoyalRangers/Schedule-Component/PDFs/WCO/2026/WCO-Fort-Meade-FL-App.pdf)) |
| Can geographic and language districts share the same numbering dimension? | National multisite guidance says a site charters within its geographic **or language** district and gives a Texas example contrasting North Texas with South Central Hispanic. The live locator also contains two `#002` Texas records under distinct internal district codes. The public feed does not map those codes to names, so this is evidence of reuse across district records, not proof that this particular collision is geographic-versus-language. ([Multisite Churches](https://royalrangers.com/~/link.aspx?_id=2ADA3777602A4AF8B4D282DD83F9B837&_z=z); [live directory route](https://directory.ag.org/api/directoryitem?callback=test)) |
| Does one displayed number always identify one campus? | **No.** For multiple campuses in one district, national guidance recommends one shared outpost number plus internal lettered location codes such as `125A`, `125B`, and `125C`. Each site charters separately, initially receives a temporary number, and the national office changes the records to the common number plus location code. The codes are not worn on uniforms or shown on certificates or correspondence. The live locator includes letter-suffixed records such as `019C`, `19B`, and `226B`, with inconsistent zero-padding. ([Multisite Churches](https://royalrangers.com/~/link.aspx?_id=2ADA3777602A4AF8B4D282DD83F9B837&_z=z); [live directory route](https://directory.ag.org/api/directoryitem?callback=test)) |
| Is the number stable through renewal or recharter? | Chartering is annual and the site offers a `charter or renew` flow, but no reviewed source promises permanent retention through routine renewal, lapse, closure, move, district transfer, or reactivation. The multisite procedure proves at least that assigned and temporary numbers can be changed administratively. ([Charter Membership](https://royalrangers.com/charter); [Multisite Churches](https://royalrangers.com/~/link.aspx?_id=2ADA3777602A4AF8B4D282DD83F9B837&_z=z)) |
| Is the number globally unique? | **No.** The official Malaysia directory simultaneously lists `Kuala Lumpur #1` and `Selangor #1`, while Singapore separately publishes `Outpost #01`. RRI publishes no global outpost registry or numbering authority. ([Royal Rangers Malaysia, Outposts](https://www.royalrangers.com.my/outposts); [Royal Rangers Singapore, Outpost 01](https://www.royalrangers.org.sg/meeting-locations/outpost-01/); [RRI, Member Nations](https://rri.world/Member_nations.php)) |
| Is public display normal and authorized? | **Yes, for official and outpost identity uses.** The national charter benefit is an official number to wear on the uniform and inclusion in the public locator; special-uniform guidance expressly permits an outpost number and district. Official national and district pages publish numbers. This evidence does not create a third-party bulk-republication license or grant trademark/logo rights. ([Charter Membership](https://royalrangers.com/charter); [Special Uniforms](https://royalrangers.com/~/link.aspx?_id=10FA76BBE29A48D0B0546187F6CA9942&_z=z); [Terms of Use](https://royalrangers.com/policies/termsofuse)) |

The official locator also exposes a GUID and internal item ID for each record. All 612 GUIDs in the snapshot were distinct, but no published API contract guarantees that either value is permanent, portable across systems, or preserved through lifecycle changes. Their presence should not be mistaken for a documented canonical identifier.

Still unresolved from official public sources: the formal within-district allocation/reuse rule; retention after annual renewal or a lapse; reuse after closure; behavior after a church move or district transfer; an explicit collision between a named geographic and named language district; and any global RRI numbering standard.

## 6. High-confidence facts and unresolved questions

### High-confidence

- U.S. local groups are outposts attached to churches and can receive an official number through annual chartering.
- The U.S. English map has eight named regions; the Spanish-language organization uses a separate two-region overlay.
- U.S. ministry hierarchy includes national, region, district, local subdivision terminology such as section/division/area, and outpost.
- FCF has eight named U.S. territories mapped to the eight U.S. regions; chapters are district-associated in official examples and forms.
- RRI operates through world regions and self-governing national programs.
- RRI public international data is country-level and incomplete relative to its own “more than 90 nations” statement.
- RRI’s Asia/Eurasia allocation is an organizational taxonomy, not ordinary continental geography.
- The U.S. locator is useful but explicitly incomplete and has no documented third-party API contract.
- A bare outpost number is reused across U.S. districts and countries and can represent more than one physical campus; official U.S. workflows pair the number with a district.

### Unresolved from official public sources

1. The effective dates and revision history of the current U.S. English and Spanish district maps.
2. A canonical machine-readable U.S. hierarchy of region → district → section/division/area → outpost.
3. A current complete FCF chapter roster, chapter boundary map, or confirmation that every district maps exactly one-to-one to a chapter.
4. Whether Spanish-language districts have independent FCF chapters and how those map into FCF territories.
5. The current formal name of the international region: “Asia” or “Asia Pacific.” Official current pages use both.
6. Whether the 2011 Asia Pacific areas—Australia and Pacific Islands, Southeast Asia, Northern Asia—remain current, and the exact present country-to-area assignments.
7. A current authoritative list of all RRI member nations, national-office maturity/status, official national contacts, and outpost counts.
8. Any public international outpost directory, stable API, common schema, or update feed.
9. Current Royal Rangers presence and organizational assignment for American Samoa, Guam, the Northern Mariana Islands, and the U.S. Virgin Islands.
10. Terms authorizing bulk reuse, storage, geocoding, display, or republication of national locator data.
11. Formal outpost-number allocation, retention, reuse, and transfer rules, including uniqueness within a district.

## Primary-source index

- [Royal Rangers USA — Get Started](https://royalrangers.com/~/link.aspx?_id=EE2A67EE2E6B403AA59E6EBCCB453267&_z=z)
- [Royal Rangers USA — Charter Membership](https://royalrangers.com/charter)
- [Royal Rangers USA — Outpost Locator](https://royalrangers.com/locator)
- [Royal Rangers USA — TRaCclub User Guide](https://royalrangers.com/tracclub/-/media/DBE356BC0AFD4687A35392F2D5802DD6.ashx)
- [Royal Rangers USA — Multisite Churches](https://royalrangers.com/~/link.aspx?_id=2ADA3777602A4AF8B4D282DD83F9B837&_z=z)
- [Royal Rangers USA — Special Uniforms](https://royalrangers.com/~/link.aspx?_id=10FA76BBE29A48D0B0546187F6CA9942&_z=z)
- [Royal Rangers USA — Region and District Map](https://royalrangers.com/~/-/media/F5F81CB2C829419A82139A817D8073A2.ashx)
- [Royal Rangers USA — Spanish Language Districts Map](https://royalrangers.com/~/-/media/8C78271475064CB3B4ED1F41C298E885.ashx)
- [Royal Rangers USA — 2024 catalog](https://royalrangers.com/~/-/media/3A2952F075FE4CD189805D8CA844363D.ashx)
- [Royal Rangers USA — Frontiersmen Camping Fellowship](https://royalrangers.com/fcf)
- [Royal Rangers USA — Territorial Rendezvous](https://royalrangers.com/en/news/General-News/2023/2023-06-Territorial-Rendezvous?D=%7B39CB0294-58F1-4250-AB82-25E3BF8466D2%7D)
- [Royal Rangers Online Chartering](https://chartering.royalrangers.com/)
- [Assemblies of God — Directory Widget source](https://directory.ag.org/content/js/AG.Directory.Widget.js)
- [Assemblies of God — Live Royal Rangers directory route](https://directory.ag.org/api/directoryitem?callback=test)
- [Royal Rangers Malaysia — Outposts](https://www.royalrangers.com.my/outposts)
- [Royal Rangers Singapore — Outpost 01](https://www.royalrangers.org.sg/meeting-locations/outpost-01/)
- [RRI — Home](https://rri.world/)
- [RRI — Member Nations](https://rri.world/Member_nations.php)
- [RRI — Contact](https://rri.world/contact.php)
- [RRI — Partners](https://rri.world/partners.php)
- [RRI — Fall 2011 newsletter](https://rri.world/utilities/file_download.php?path=img%2Fnewsletters_RRI360%2FFall+2011+RRI360.pdf)
- [RRI — 2020 promotional magazine](https://rri.world/utilities/file_library/img/newsletters/2020_RRIPromoMag_LRZ.pdf)
- [ISO — ISO 3166-2:2020](https://www.iso.org/standard/72483.html)
- [U.S. Census Bureau — Counties and Statistically Equivalent Areas](https://www.census.gov/geographies/reference-maps/2020/geo/county-wallmaps-2020.html)
