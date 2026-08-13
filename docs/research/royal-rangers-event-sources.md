# Royal Rangers USA event-source audit

**Research date:** 2026-08-12  
**Scope:** Public sources for Royal Rangers USA national, regional, district, and Frontiersmen Camping Fellowship (FCF) events; related Assemblies of God calendars; publication formats; public feeds/APIs; reuse terms; and the likely effort required to keep a combined calendar current.  
**Source policy:** Current primary and first-party sources only: Royal Rangers USA, region- and district-operated Royal Rangers sites, FCF event sites, and the General Council of the Assemblies of God (GCAG). Third-party registration systems are mentioned only when an official source links to them; their listings were not treated as the event authority.

This is a public-source audit, not legal advice and not a product recommendation. "Not found" means that the reviewed public sources did not expose the item on the research date; it does not prove that a private feed, internal calendar, or unpublished permission does not exist.

## Executive findings

1. Royal Rangers USA does **not** publish one public calendar containing national, regional, district, and FCF events. The national events page tells readers to contact district or regional leadership for those levels, and the national training schedule explicitly says district training schedules are unavailable on the national site. ([National Events](https://royalrangers.com/events); [National Training Schedule](https://royalrangers.com/training/events))
2. National information is split across at least five first-party forms: recurring-event descriptions, a live training schedule, downloadable PDF schedule snapshots, event-specific microsites/pages, and the Rangers NOW email/news archive. ([National Events](https://royalrangers.com/events); [National Training Schedule](https://royalrangers.com/training/events); [2026 training schedule by region](https://royalrangers.com/training/-/media/89A9F997841146028C7A925832D1560B.ashx); [Rangers NOW](https://royalrangers.com/rangersnow))
3. Publication practice is decentralized and inconsistent below the national level. In the regional sample, one site used a short static HTML list, one exposed calendar/RSS/REST machinery but contained no event records, and one still displayed a 2025 event page in August 2026. ([Northeast Region Events](https://northeastregion.org/events/); [Southeast Region Events](https://southeastregionroyalrangers.com/events/); [Gulf Region Events](https://gulfregionrr.org/calendar/))
4. Public WordPress RSS or REST availability is not the same as an event feed. The Northeast and Gulf feeds were ordinary site-post feeds, not calendar exports. The Southeast site exposed event iCal, RSS, and REST endpoints, but a 2020-2030 REST query returned `total: 0` and its iCal/event RSS responses contained no event records on the research date. ([Northeast site feed](https://northeastregion.org/feed/); [Gulf site feed](https://gulfregionrr.org/feed/); [Southeast events REST query](https://southeastregionroyalrangers.com/wp-json/tribe/events/v1/events?start_date=2020-01-01%2000:00:00&end_date=2030-12-31%2023:59:59&per_page=50); [Southeast event RSS](https://southeastregionroyalrangers.com/events/feed/); [Southeast iCal export](https://southeastregionroyalrangers.com/events/list/?ical=1))
5. GCAG's related national calendar is a useful cross-check for a small subset of major Royal Rangers dates, such as Camporama, Royal Rangers Week, and the next LEAD conference. It is not a Royal Rangers district/region/FCF calendar. ([Assemblies of God Events](https://ag.org/Events); [AG Significant Events PDF](https://ag.org/-/media/AGORGV2/Events/AG_Significant_Events.pdf))
6. No reviewed source published an open-data license, event API contract, or blanket permission to copy and republish its event-page content. GCAG permits linking under stated conditions but otherwise restricts mirroring, duplication, and reuse of website text and graphics without written permission. ([GCAG Terms of Use](https://ag.org/Terms%20of%20Use); [GCAG Linking Policy](https://ag.org/Terms-of-Use/Linking-Policies))
7. The likely manual curation burden for comprehensive U.S. coverage is **high**. The evidence is the absence of a centralized source/site directory, different formats and update paths at each organizational level, cancellation/status changes, revisioned PDFs, stale live pages, and calendars that may exist only as prose, images, social posts, or registration links. This is an assessment of the public-source landscape, not an implementation choice.

## 1. What the national office publishes

### 1.1 National event categories and event-specific pages

The national events page is a directory of recurring event types rather than a dated calendar. It describes National Camporama and National FCF Rendezvous as quadrennial, National LEAD as annual, Royal Rangers Week as the first full week of October, and the National Prayer Vigil as occurring during that week. It directs district and regional questions to the relevant leadership and international questions to Royal Rangers International. ([Royal Rangers USA, National Events](https://royalrangers.com/events))

Major events receive separate pages or microsites. For example, the national Camporama page gives July 12-17, 2026 and links to NationalCamporama.com. The national Rendezvous page and NationalRendezvous.com still centered the July 7-12, 2024 event when checked in August 2026, showing that an event-specific page can remain live after its date. ([National Camporama](https://royalrangers.com/camporama); [National Rendezvous](https://royalrangers.com/rendezvous); [NationalRendezvous.com](https://nationalrendezvous.com/))

### 1.2 National training schedule

The national training schedule is the richest current national event source reviewed. It publishes, per event, dates, location, discount and minimum-registration deadlines, current status, registration links, information files, and applications. It includes statuses such as accepting registrations, camp is a go, full, cancelled, and postponed. The page says district training schedules are not available there. ([National Training Schedule](https://royalrangers.com/training/events))

The same schedule is also distributed as PDF snapshots by event type and by region. The 2026 by-region file located during this audit was marked revised May 28, 2026 and included cancellations; an older search-visible snapshot was revised April 14, 2026. Event application PDFs tell readers to use the live national training page for up-to-date status. These revision and status signals show that a downloaded PDF is a dated snapshot rather than a durable feed. ([2026 schedule by region, revised May 28](https://royalrangers.com/training/-/media/89A9F997841146028C7A925832D1560B.ashx); [2026 schedule by type](https://royalrangers.com/training/-/media/948EF53AA8204D05BE1941466D988EC0.ashx); [sample NRMC application](https://royalrangers.com/-/media/RoyalRangers/Schedule-Component/PDFs/NRMC/2026/NRMC-Susquehanna-PA-App.pdf))

Direct inspection of the two national event pages found no advertised iCal, RSS, JSON event feed, public event API, or event JSON-LD block. The information is server-rendered HTML plus linked files. This is a description of the public response on 2026-08-12, not proof that the national office has no internal event system.

### 1.3 News and email

Rangers NOW is the official Royal Rangers news source, distributed by email every six weeks. Its stated content includes upcoming national events, and its articles are archived in the national news blog. This provides another announcement and deadline channel, but the reviewed national pages did not advertise a public RSS/iCal feed for those announcements. ([Rangers NOW](https://royalrangers.com/rangersnow); [News and Updates](https://royalrangers.com/news))

### 1.4 The national planning policy confirms local aggregation

Royal Rangers' annual planning guidance tells local leaders to gather church, district, regional, national, and community dates and add them to a central calendar. It mentions a shared online calendar such as Google Calendar as an option. The guidance describes a manual planning workflow; it does not identify a national subscription feed that combines those levels. ([Annual Program Planning](https://royalrangers.com/policies/planning))

## 2. Regional source sample

The United States has eight English-language Royal Rangers regions. This audit sampled three geographically separate public region sites because the national site does not provide a unified region calendar. The organizational mapping itself is documented separately in [the organization and outpost audit](./royal-rangers-organization-and-outposts.md).

| Region source | What it published on 2026-08-12 | Public machine-readable event source | Observed limitation |
|---|---|---|---|
| [Northeast Region Events](https://northeastregion.org/events/) | Four future entries in static HTML: event name, date, city/state, and external registration/info link | No event export was advertised. The site's generic [WordPress RSS feed](https://northeastregion.org/feed/) had no event items. | The list mixed national events with events physically in the region and did not expose event scope/category fields. Page edits do not appear in the generic post feed. |
| [Southeast Region Events](https://southeastregionroyalrangers.com/events/) | A WordPress/The Events Calendar view and subscription controls | Advertised [iCal](https://southeastregionroyalrangers.com/events/list/?ical=1), [event RSS](https://southeastregionroyalrangers.com/events/feed/), and a public [Events Calendar REST route](https://southeastregionroyalrangers.com/wp-json/tribe/events/v1/events). | A broad [2020-2030 query](https://southeastregionroyalrangers.com/wp-json/tribe/events/v1/events?start_date=2020-01-01%2000:00:00&end_date=2030-12-31%2023:59:59&per_page=50) returned zero published records; iCal was empty and event RSS contained no items. The homepage instead emphasized an embedded social feed. |
| [Gulf Region Events](https://gulfregionrr.org/calendar/) | A long static page for the 2025 EveryONE Conference and 2025 national training in the Gulf region; the homepage also displayed a 2025 FCF territorial event | No event-specific feed was found. The generic [site RSS](https://gulfregionrr.org/feed/) was a post feed whose only visible item was the 2016 WordPress "Hello world!" post. | The page remained 2025-focused in August 2026, so a live URL cannot be assumed current without checking its content. |

This sample demonstrates three different technical states: a maintained static list, installed structured-calendar endpoints with no records, and a stale static page. It does not claim that all eight regions use one of only these three patterns.

## 3. District source sample

District publication is even more decentralized. Royal Rangers USA says districts conduct periodic events and asks users to locate district contact information online; the national training page says district training schedule information is not available on the national site. ([Get Started](https://royalrangers.com/start/); [National Training Schedule](https://royalrangers.com/training/events))

Three district-operated sites in three different Royal Rangers USA regions were checked:

| District and region | Calendar publication | Feed/export observations | Maintenance implications visible from the source |
|---|---|---|---|
| [North Texas Royal Rangers](https://ntxrr.org/calendar.htm), South Central | Manually rendered HTML tables spanning 2026-2028 and mixing district, FCF, regional, and national items. The [homepage](https://ntxrr.org/) also has a short upcoming-events list, linked PDF packets, and registration links. | No RSS or district-wide iCal link was exposed; direct checks of `/feed/` and `/calendar.ics` returned 404, and `?ical=1` remained HTML. | The [FCF page](https://ntxrr.org/fcf.htm) says Facebook is one of the best ways to keep up and links an annual FCF flyer, so the public event trail spans the table, PDFs, registration pages, and social posts. |
| [New York Ministry Network Royal Rangers](https://nyroyalrangers.org/2025-calendar/), Northeast | A static 2026 HTML date table with select detail links, location gaps, and `TBD` entries. Separate event announcements appear in the [events post category](https://nyroyalrangers.org/post/category/events/). | A working [events-category RSS feed](https://nyroyalrangers.org/post/category/events/feed/) contained recent event posts such as Pow Wow and JLDA, but it is a news/post feed rather than a complete calendar export; `/events.ics` returned 404. | A consumer must reconcile the annual table with later posts and cannot assume every row produces a feed item. |
| [Kentucky Royal Rangers](https://www.kyroyalrangers.com/events-calendar/), Great Lakes | A static annual table plus a separate [structured event listing](https://www.kyroyalrangers.com/events/) and detailed event pages; the homepage also contains upcoming events and an embedded Facebook stream. | The general [WordPress RSS feed](https://www.kyroyalrangers.com/feed/) is a news feed, not a guaranteed complete calendar feed. Individual detail pages, such as the [2026 District Pow-Wow](https://www.kyroyalrangers.com/event/kentucky-district-pow-wow/?event_date=2026-08-28), expose per-event iCalendar/Outlook actions. A district-wide ICS was not located. | Some events can be exported one at a time, but annual-table coverage and news/social updates remain separate sources. |

This three-district sample is not a completeness audit of every district. It does establish that even across currently active first-party district sites, a static calendar, an event-news RSS feed, and a per-event calendar export are separate publication patterns rather than one shared national standard.

## 4. FCF event publication

At the national level, National FCF Rendezvous has a Royal Rangers USA landing page, a dedicated microsite, national-news announcements, and registration links. The national page describes it as occurring every four years. The 2024 microsite was still the live public event site in August 2026. ([National Events](https://royalrangers.com/events); [National Rendezvous](https://royalrangers.com/rendezvous); [NationalRendezvous.com](https://nationalrendezvous.com/); [2024 registration announcement](https://royalrangers.com/en/news/General-News/2023/2023-08-National-Rendezvous?D=%7B0DB6EE67-D8C0-4853-9BA4-0D8891FB3FAA%7D))

The national office's 2023 Territorial Rendezvous article identified eight FCF territories and linked separate territory/region sites for event details. It was an event announcement, not a live national FCF calendar or feed. ([Territorial Rendezvous](https://royalrangers.com/en/news/General-News/2023/2023-06-Territorial-Rendezvous?D=%7B39CB0294-58F1-4250-AB82-25E3BF8466D2%7D))

The public national [FCF program page](https://royalrangers.com/fcf) is an advancement/program reference, not an event calendar. Event-dependent requirements tell participants to contact their district, and the page links the FCF Handbook rather than a schedule or feed.

Direct checks found no advertised or working calendar feed on the national Royal Rangers FCF pages: `/events.ics` returned 404 on the national site, the national site's `/feed/` resolved to branded HTML rather than an RSS feed, and `/feed/`, `/events.ics`, and `/calendar.ics` returned 404 on NationalRendezvous.com. The dedicated Rendezvous site provides human-readable detail pages and registration information instead. ([National Rendezvous](https://nationalrendezvous.com/))

Below the national level, FCF events are commonly embedded in district sources rather than separated into a comprehensive FCF calendar. North Texas publishes FCF entries in its combined district calendar and points users to Facebook and an annual flyer; New York's annual table includes Spring and Fall FCF Trace; Kentucky's district source includes FCF entries among other events. ([North Texas calendar](https://ntxrr.org/calendar.htm); [North Texas FCF](https://ntxrr.org/fcf.htm); [New York 2026 calendar](https://nyroyalrangers.org/2025-calendar/); [Kentucky events calendar](https://www.kyroyalrangers.com/events-calendar/))

Some district pages link to `nationalfcf.com` for forms, but that site could not be fetched reliably from the research environment (connection resets/502 responses). Whether it exposes any current event listing or feed is therefore unresolved; it was not counted as an available source.

## 5. Related Assemblies of God sources

The General Council's [Events page](https://ag.org/Events) is a searchable national-office calendar with a downloadable [Significant Events PDF](https://ag.org/-/media/AGORGV2/Events/AG_Significant_Events.pdf). The current PDF cross-listed a small number of major Royal Rangers dates: Royal Rangers Week and Prayer Vigil, 2026 Camporama, and LEAD 2027. It also carried an "as of" revision date. This makes it a first-party cross-check for major denomination-wide dates, not a substitute for the much denser Royal Rangers training schedule or district calendars.

No public iCal, RSS, or documented event API was surfaced in the AG Events page UI or the official-site searches performed for this audit. That absence does not establish that GCAG lacks an internal calendar service.

An AG network calendar can also serve as a machine-readable auxiliary district source. The North Texas Royal Rangers calendar says its dates can also be found on the [North Texas Assemblies of God Events page](https://www.northtexas.ag/events). That network page embeds an Outlook calendar and advertises a [downloadable ICS subscription](https://outlook.office365.com/owa/calendar/0ccda6e5a9d04cea94a987c88628088f%40northtexas.ag/c5ec9502dd2240ee9d6db4d5552a13dd4926958871698727455/calendar.ics). Direct inspection returned a valid `text/calendar` response containing 226 events and multiple Royal Rangers/FCF entries on 2026-08-12. Because it is a network-wide calendar, it also contains many non-Royal-Rangers events and does not replace the district's RR-specific descriptions, packets, or corrections.

## 6. Feed, API, and structured-data audit

| Source | iCal/ICS | RSS/Atom | Public API/structured event data | Result on 2026-08-12 |
|---|---|---|---|---|
| Royal Rangers USA National Events | None advertised | None advertised | No event JSON-LD or documented API found | Recurring-event prose and links |
| Royal Rangers USA National Training Schedule | None advertised | None advertised | No event JSON-LD or documented API found | Rich server-rendered HTML plus PDFs and registration links |
| Northeast Region | None advertised | Generic WordPress feed | WordPress REST exists for site content, not an advertised event contract | Static event page; generic feed had no event records |
| Southeast Region | Advertised iCal/export URLs | Generic site RSS and event RSS | Public WordPress + The Events Calendar REST routes | Event endpoints existed but returned zero event records across 2020-2030 |
| Gulf Region | None found | Generic WordPress feed | WordPress REST exists for site content, not an advertised event contract | Static 2025 event page; generic feed was not an event feed |
| North Texas District | None found | None found | No documented public event API found | Multi-year static HTML calendar plus PDFs, registrations, and social/FCF channels |
| New York District | None found | Events-category RSS | WordPress REST exists for site content, not an advertised complete-calendar contract | Annual static table plus event-news posts; RSS did not represent every calendar row |
| Kentucky District | Per-event iCalendar/Outlook actions | Generic WordPress news feed | Structured event pages, but no documented district event API found | Annual table plus event records and social/news; no district-wide ICS located |
| Assemblies of God Events | None surfaced | None surfaced | No documented public event API surfaced | Searchable HTML calendar and revisioned PDF |
| North Texas Assemblies of God network | Network-wide Outlook ICS | None surfaced | Outlook-hosted ICS subscription | Working structured feed containing RR and non-RR network events; filtering and RR-source reconciliation still required |

Important distinctions:

- A generic WordPress `/feed/` reports posts, not necessarily changes to static calendar pages.
- A WordPress `/wp-json/` index proves a public CMS endpoint exists; it does not create a stable, supported, licensed third-party API contract.
- An iCal or events REST route can be technically valid but operationally empty.
- A PDF can be structured enough for a person to read yet still require revision tracking, text extraction, normalization, and comparison with a live status page.
- No reviewed source published a service-level commitment, versioned schema, stable identifier policy, webhook, or correction history for event reuse.

## 7. Published reuse terms

GCAG's Terms of Use state that its website design, text, graphics, layout, and content are copyrighted. Uses not expressly permitted may not reproduce, upload, post, transmit, download, distribute, mirror, modify, or reuse that content without written permission. The terms permit incidental church/personal printing and prohibit commercial use of content. ([GCAG Terms of Use](https://ag.org/Terms%20of%20Use))

GCAG's Linking Policy encourages links but requires that no sponsorship or approval be implied, prohibits framing or obscuring source identity/navigation, and prohibits duplication without express written permission. ([GCAG Linking Policy](https://ag.org/Terms-of-Use/Linking-Policies))

Royal Rangers' trademark policy separately governs the Royal Rangers names, emblems, logos, and artwork. It allows qualifying ministry entities to use marks to identify associated ministry entities or promote dated ministry events subject to stated conditions; it directs uncertain cases to AG Rights & Permissions. That published policy does not expressly classify an independent nationwide event aggregator as an associated entity. ([Emblems and Trademarks Use](https://royalrangers.com/policies/trademarks))

No regional or district source reviewed displayed an open-data license or a calendar-data republication grant. The existence of a public page, RSS route, REST route, iCal export, or "share" link is technical/public-access evidence, not a documented license to build and redistribute a separate database. The reviewed terms also do not answer whether independently collected event facts, as distinct from copied wording, artwork, or page layout, may be republished. That rights question remains unresolved by these primary sources.

## 8. Likely manual curation burden

The public evidence supports a **high** manual burden for keeping a comprehensive U.S. calendar current:

1. **Source discovery is decentralized.** The national office does not publish district schedules and tells users to contact/search for district or regional leadership. ([National Events](https://royalrangers.com/events); [Get Started](https://royalrangers.com/start/); [National Training Schedule](https://royalrangers.com/training/events))
2. **Formats vary by publisher.** The reviewed set included static HTML, dynamic HTML, revisioned PDFs, dedicated microsites, generic RSS, empty event RSS/iCal/REST endpoints, social embeds, and third-party registration links.
3. **Freshness cannot be inferred from the URL.** The Gulf regional calendar remained 2025-focused in August 2026, and the national Rendezvous pages still featured the completed 2024 event. ([Gulf Region Events](https://gulfregionrr.org/calendar/); [National Rendezvous](https://royalrangers.com/rendezvous))
4. **Event status changes matter.** The national training schedule carries live cancellation/go/full/postponed states, while its PDFs are revisioned snapshots and event applications redirect users to the webpage for current status. ([National Training Schedule](https://royalrangers.com/training/events); [sample NRMC application](https://royalrangers.com/-/media/RoyalRangers/Schedule-Component/PDFs/NRMC/2026/NRMC-Susquehanna-PA-App.pdf))
5. **The same event may be repeated with different detail.** National training events can appear on the national page, national PDFs, region pages, district calendars, registration providers, and AG's significant-events calendar. Cross-source identity and conflict resolution are not encoded in stable public IDs.
6. **FCF adds another parallel publication layer.** National Rendezvous, territorial rendezvous, district/chapter traces, Frontier Adventures, and other FCF gatherings can be published at national, territorial/region, or district/chapter sources rather than through one FCF feed.
7. **Public feed coverage is exceptional, not dependable in the sample.** The one region with explicit iCal/RSS/REST event endpoints had no event records; the other feeds were generic post feeds.

The burden cannot be converted into an exact staff-hours estimate from public evidence alone. That would require a complete, current roster of all authoritative regional, district, Spanish-language district, and FCF chapter sources; their event volumes; update frequency; and permission/coordination arrangements. No such public roster was found.

## 9. High-confidence facts and unresolved questions

### High-confidence

- No single reviewed official public calendar covers all Royal Rangers USA organizational levels.
- The national training schedule is the most detailed current national source but excludes district schedules.
- National dates are also published through event pages/microsites, PDFs, news/email, and the broader AG calendar.
- Regional and district publishing practices are not technically uniform.
- Public WordPress feeds/APIs may be empty or unrelated to events.
- The reviewed sources do not publish an open event-data license or supported cross-organization event API.
- Complete U.S. aggregation would require continuing source discovery, normalization, freshness checks, and correction handling.

### Unresolved from public primary sources

1. A canonical current directory of every region, English/Spanish district, FCF territory/chapter, and the exact event source each maintains.
2. Whether Royal Rangers USA or GCAG has a non-public master calendar, partner API, bulk export, or syndication agreement.
3. Whether any region or district offers an unpublished Google Calendar/iCal share link to leaders but not on its public site.
4. Which page is authoritative when a national live schedule, PDF, regional page, district page, and registration provider disagree.
5. A stable event-ID convention spanning national, regional, district, FCF, and AG publications.
6. Published permissions for copying event facts, descriptions, venue details, registration deadlines, status, images, and marks into an independent database.
7. The current and complete FCF chapter event-source roster, including Spanish-language districts.
8. The expected cadence for checking cancellations, deadline changes, venue changes, and post-event archival.

## Primary-source index

- [Royal Rangers USA - National Events](https://royalrangers.com/events)
- [Royal Rangers USA - National Training Schedule](https://royalrangers.com/training/events)
- [Royal Rangers USA - 2026 Training Schedule by Region PDF](https://royalrangers.com/training/-/media/89A9F997841146028C7A925832D1560B.ashx)
- [Royal Rangers USA - Annual Program Planning](https://royalrangers.com/policies/planning)
- [Royal Rangers USA - Rangers NOW](https://royalrangers.com/rangersnow)
- [Royal Rangers USA - News and Updates](https://royalrangers.com/news)
- [Royal Rangers USA - National Camporama](https://royalrangers.com/camporama)
- [Royal Rangers USA - National Rendezvous](https://royalrangers.com/rendezvous)
- [Royal Rangers USA - Territorial Rendezvous article](https://royalrangers.com/en/news/General-News/2023/2023-06-Territorial-Rendezvous?D=%7B39CB0294-58F1-4250-AB82-25E3BF8466D2%7D)
- [Royal Rangers USA - Get Started](https://royalrangers.com/start/)
- [Royal Rangers USA - Emblems and Trademarks Use](https://royalrangers.com/policies/trademarks)
- [Northeast Region - Events](https://northeastregion.org/events/)
- [Southeast Region - Events](https://southeastregionroyalrangers.com/events/)
- [Southeast Region - Event RSS](https://southeastregionroyalrangers.com/events/feed/)
- [Southeast Region - Event REST endpoint](https://southeastregionroyalrangers.com/wp-json/tribe/events/v1/events)
- [Southeast Region - iCal export](https://southeastregionroyalrangers.com/events/list/?ical=1)
- [Gulf Region - Events](https://gulfregionrr.org/calendar/)
- [North Texas Royal Rangers - Calendar](https://ntxrr.org/calendar.htm)
- [North Texas Royal Rangers - FCF](https://ntxrr.org/fcf.htm)
- [New York Ministry Network Royal Rangers - 2026 Calendar](https://nyroyalrangers.org/2025-calendar/)
- [New York Ministry Network Royal Rangers - Events RSS](https://nyroyalrangers.org/post/category/events/feed/)
- [Kentucky Royal Rangers - Events Calendar](https://www.kyroyalrangers.com/events-calendar/)
- [Kentucky Royal Rangers - Event Listings](https://www.kyroyalrangers.com/events/)
- [Assemblies of God - Events](https://ag.org/Events)
- [Assemblies of God - Significant Events PDF](https://ag.org/-/media/AGORGV2/Events/AG_Significant_Events.pdf)
- [North Texas Assemblies of God - Events](https://www.northtexas.ag/events)
- [North Texas Assemblies of God - Outlook ICS calendar](https://outlook.office365.com/owa/calendar/0ccda6e5a9d04cea94a987c88628088f%40northtexas.ag/c5ec9502dd2240ee9d6db4d5552a13dd4926958871698727455/calendar.ics)
- [Assemblies of God - Terms of Use](https://ag.org/Terms%20of%20Use)
- [Assemblies of God - Linking Policy](https://ag.org/Terms-of-Use/Linking-Policies)

## 2026 event and seed recheck

**Verification date:** 2026-08-12  
**Purpose:** A focused recheck of the three original event seeds and a small set of national, regional, district, and FCF candidates for the Reference Calendar. Live organizer pages were preferred over downloadable snapshots. Third-party registration pages linked by an organizer are links for users, not event authorities.

### Original national-training seeds

The live [Royal Rangers USA National Training Schedule](https://royalrangers.com/training/events) still supports all three original 2026 occurrences. Each is a national training occurrence organized by the Royal Rangers USA national training office, not a region-scoped event merely because it is held in a particular region.

| Existing occurrence | Organizer-supported facts on 2026-08-12 | Publication note |
|---|---|---|
| National Elementary Education Conference (NEEC), Eagle Rock, Missouri | September 11-12, 2026; Camp Eagle Rock, Eagle Rock, Missouri; live status `Accepting Registrations`; discount and minimum-registration deadlines both August 11, 2026. The official [NEEC event-information PDF](https://royalrangers.com/-/media/RoyalRangers/Schedule-Component/PDFs/NEEC/2026/NEEC-SMO-Event-Information.pdf) describes a Friday-through-Saturday leader-training conference focused on early-elementary ministry and Ranger Kids. | Keep the occurrence. The live page continued to say `Accepting Registrations` one day after the two displayed deadlines, so registration status and deadline are separate facts; do not derive one from the other. |
| National Rangers Ministry Conference (NRMC), Susquehanna, Pennsylvania | September 18-20, 2026; Rock Mountain Bible Camp, Susquehanna, Pennsylvania; live status `Accepting Registrations`; discount and minimum-registration deadlines both August 16, 2026. The official [NRMC event-information PDF](https://royalrangers.com/-/media/RoyalRangers/Schedule-Component/PDFs/NRMC/2026/NRMC-NY-Event-Information.pdf) gives the public venue address as 1156 Rock Mountain Dr, Susquehanna, PA 18847 and identifies the event as adult-leader training. | Keep the occurrence. The live schedule is the status authority; the PDF is useful for venue and format details but is a revisioned attachment. |
| Johnnie Barnes Excellence Initiative (JBEI), Waupaca, Wisconsin | September 25-26, 2026; Camp Wilderness, Waupaca, Wisconsin; live status `Accepting Registrations`; discount and minimum-registration deadlines both August 26, 2026. The live schedule describes the intended audience as people who hold or hope to hold district-, regional-, or national-level service positions. | Keep the occurrence. The linked [JBEI information and schedule PDF](https://royalrangers.com/-/media/RoyalRangers/Schedule-Component/PDFs/JBEI/2026/JBEI-NC-Region-Event-Information-and-Schedule.pdf) conflicts with itself about Saturday dismissal (`5:00 pm` in the overview and `4:15 pm` in the detailed schedule), so no end time should be treated as verified without organizer clarification. |

The organizer sources do not publish IANA time-zone identifiers. A calendar implementation may map a verified venue to an IANA zone, but that value should be marked as a derived normalization rather than presented as organizer-supplied. Date-only records must not acquire invented times from the generic information PDFs.

### Supported representative occurrences

- **National, completed, and recurring series:** National Camporama is explicitly conducted once every four years. The official [2026 Camporama schedule](https://nationalcamporama.com/schedule/) gives July 12-17, 2026 at Camp Eagle Rock, and the official [2022 assumption-of-risk document](https://nationalcamporama.com/-/media/NationalCamporama/Downloads/AOR-for-Camporama-2022.pdf) gives July 10-15, 2022 at Eagle Rock, Missouri. These support two separate completed occurrence records joined to one National Camporama series; one occurrence must not overwrite the other. The [national events page](https://royalrangers.com/events) supplies the national scope and four-year cadence.
- **District:** The live [Kentucky District Pow-Wow page](https://www.kyroyalrangers.com/event/kentucky-district-pow-wow/) gives August 28-30, 2026, a Friday start time of 5:00 pm, and Rotary Scout Reservation, 100 Boy Scout Camp Rd, Glasgow, Kentucky 42141. It presents current registration controls. This is a stronger district candidate than a calendar-table row because it is a dedicated organizer page.
- **FCF:** The North Texas organizer homepage publishes the Shawnee Trail Chapter FCF Family Days Camp for October 23-25, 2026 and provides a live registration link. The linked [2026 organizer packet](https://ntxrr.org/Documents/2026/2026%20NTX%20FCF%20Family%20Camp%20Packet%202026%20v1.pdf) identifies the host as the North Texas Shawnee Trail Chapter of FCF, the venue as the Royal Rangers Camp at Lakeview in Maypearl/Waxahachie, Texas, the public address as 860 Royal Rangers Loop, Waxahachie, TX 75167, and the intended audience as Royal Rangers families and friends. It also publishes category pricing through October 6 with a $5 increase afterward. Use the live [North Texas Royal Rangers homepage](https://ntxrr.org/) for current status and the packet only for the supported details it contains.
- **Cancelled lifecycle example:** The live [Kentucky 2026 events calendar](https://www.kyroyalrangers.com/events-calendar/) lists a September 18-20, 2026 PathFinders occurrence as `Cancelled`. Its location is not verified because `Cancelled` occupies the location cell. This can exercise cancellation without converting the occurrence to completed after its former date passes.

### Regional coverage gap

No organizer-controlled region page in the reviewed sample currently supports a publishable, genuinely **region-scoped** 2026 occurrence with complete dates. The [Northeast Region events page](https://northeastregion.org/events/) currently lists Camporama and national training occurrences; physical placement in the Northeast does not change their national scope. The [New York district calendar](https://nyroyalrangers.org/2025-calendar/) names a completed `NE Region Empower 26 Conference` and a future Northeast Region business meeting, but those district-level assertions are not a current region-organizer event page. The Southeast structured endpoints remain empty, and the Gulf page remains 2025-focused. For the beta, this should be a visible regional coverage-gap queue item rather than an event assigned an unsupported regional scope.

### Conflicts and freshness findings

1. The Northeast Region page lists the November 13-14, 2026 JBEI in `Camphill, PA`, while the live national training schedule lists the same dated occurrence at the Red Lion Hotel in Harrisburg, Pennsylvania. The live national organizer schedule should control the public location pending clarification; retain both assertions in an Event Conflict and do not treat `Camphill` as verified.
2. The Kentucky district calendar lists the Camp BaYoCa NRMC as October 23-26, 2026, while the live national organizer schedule lists October 23-25, 2026 at the same venue and city. Prefer the national live end date, retain the district assertion, and record the end-date conflict.
3. The 2026 Camporama microsite still uses future-tense copy and advertises registration after the event, while the North Texas organizer site says Camporama has ended. The dated occurrence is deterministically completed as of this verification date, but the still-live pre-event pages should produce a freshness task rather than a registration call to action.
4. The JBEI information PDF's two dismissal times conflict as noted above. Until resolved, publish the verified local dates but omit the disputed end time or show a neutral details-under-verification state for that field.

These findings reinforce that event scope, lifecycle, registration status, deadlines, and source freshness are independent fields. A region or district page repeating a national event is corroboration, not authority to relabel its scope.
