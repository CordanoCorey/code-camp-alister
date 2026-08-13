# International directory country structures

Research date: 2026-08-13

## Scope and evidence boundary

This note identifies a deliberately small international fixture cohort for Slice 14. It uses only Royal Rangers International (RRI), national Royal Rangers ministry, or national-ministry-published sources. The purpose is to verify names and shapes that the directory must preserve, not to build a comprehensive international directory.

The evidence supports three representative countries: Malaysia, Germany, and the United Kingdom. A source's mention of a unit does not prove that every country uses that unit, that similarly named units are equivalent, or that a displayed geographic label is an administrative parent. Historical pages are used only for the historical facts they state. In particular, old organization counts are not treated as current.

## Conclusion

International data cannot safely reuse a fixed United States hierarchy. The three verified countries differ at every relevant seam:

- Malaysia currently presents outposts with a state or federal-territory label plus a local number, such as `Kuala Lumpur#1` and `Selangor#6`. Its own recent publication also names four districts but says only Central remains active.
- Germany calls a local unit a `Stamm` or `Stammposten` and identifies it as `RR` plus an ordinal, such as `RR150`. Its published structure places numbered Stammposten below regions and districts.
- The United Kingdom calls local units outposts, but its official history records identifiers made from a home-nation name and ordinal, such as `Wales 01`, while a current news index also uses the simpler display `Outpost 1` and `Outpost 4`.

The fixture model should therefore store the official country-ministry name, the local unit's source label and identifier verbatim, and only those parent units explicitly asserted by a first-party source. It should not parse identifiers into a universal hierarchy or manufacture missing district/region links.

## Global evidence

RRI's current member-nations page lists all three selected countries under their source-facing country names: **Malaysia**, **Germany**, and **United Kingdom**. It also places Malaysia in its Asia grouping and Germany and the United Kingdom in Europe. Those groupings are useful provenance, but they do not establish parentage inside a national ministry. See the [RRI member-nations directory](https://rri.world/Member_nations.php) and RRI's [regional contact page](https://rri.world/contact.php).

RRI's TRaC terms describe a local unit generically as an “outpost (Royal Rangers group)” and distinguish a nation's `chartering steward` or `national Royal Rangers office`. This establishes a useful global source vocabulary, but RRI explicitly supports national adaptation; it does not justify renaming Germany's `Stamm` to an outpost in stored source data. See the [RRI TRaC terms](https://www.rritrac.world/app/public/).

## Verified country structures

### Malaysia

**Official country/ministry label:** `Malaysia` on RRI's member list; `Royal Rangers Malaysia` on the national ministry's current home page and publications. The public national team is headed by a National Director and National Commander, but those roles are not directory subdivisions. See [RRI member nations](https://rri.world/Member_nations.php), [Royal Rangers Malaysia](https://www.royalrangers.com.my/), and the [national team](https://www.royalrangers.com.my/national-team).

**Verified subdivisions and local units:** The national outpost directory groups entries under `Kuala Lumpur` and `Selangor`, then identifies local units with a geographic label and number: `Kuala Lumpur#1 (Bukit Jalil)`, `Kuala Lumpur#6 (Sentul)`, `Kuala Lumpur#13 (Cheras)`, `Selangor#1 (Klang)`, `Selangor#6 (Klang)`, `Selangor#7 (Petaling Jaya)`, `Selangor#9 (Batu Caves)`, `Selangor#18 (Subang Jaya)`, `Selangor#21 (Klang)`, `Selangor#23 (Klang)`, and `Selangor#24 (Seri Kembangan)`. The page says it was updated in March 2020, so these are source-backed fixture candidates, not a claim of exhaustive 2026 operation. The same national site defines the church-level program as an `outpost`, which may contain one or more age groups. See the [national outpost directory](https://www.royalrangers.com.my/outposts) and [program description](https://www.royalrangers.com.my/program).

The ministry's March 2025 patch catalog explicitly names four districts—`Central`, `Northern`, `Southern`, and `Eastern`—and says only Central remains active today. This supports district records with lifecycle/provenance state; it does **not** prove that Kuala Lumpur and Selangor are children of Central in the directory, because the inspected sources do not explicitly state that linkage. See the [Royal Rangers Malaysia patch catalog](https://www.royalrangers.com.my/wp-content/uploads/2025/06/RR-Malaysian-Patch-Catalog_web_Mar25.pdf).

**Explicitly verified FCF structure:** Yes, but only to a limited depth. The national uniform guide identifies `Frontiersman Camping Fellowship` as an affiliate program with a unique leadership structure, integral to the national program and under the executive leadership of the National Commander. It also recognizes FCF membership and Trappers Brigade pins. A Malaysia-localized merit refers to a local `(district) chapter` of FCF. These sources verify a national affiliate, district chapters, membership, and Trappers Brigade recognition. They do not provide chapter names, boundaries, or a complete hierarchy, so fixtures should not invent them. See the [Royal Rangers Malaysia uniform guide, section 6](https://www.royalrangers.com.my/wp-content/files/Malaysia%20RR%20Uniform%20Guide%20Rev00%2022%20Feb%202020.pdf) and the [Malaysia-localized history merit, requirement 11](https://www.royalrangers.com.my/wp-content/files/Malaysian%20History%20Merit%20%28Green%29%20%28Mar%202020%29.pdf).

### Germany

**Official country/ministry label:** `Germany` on RRI's member list and `Royal Rangers Deutschland` on the national ministry's current public pages. The national office identifies itself as `Royal Rangers Bundesgeschäftsstelle`. A first-party organizational portrait says Royal Rangers Deutschland belongs to the `Bundesjugendwerk des Bundes Freikirchlicher Pfingstgemeinden KdöR (BFP)`. Store the public ministry label separately from that sponsoring-body relationship rather than collapsing the two names. See [RRI member nations](https://rri.world/Member_nations.php), the current [Royal Rangers Deutschland training page](https://royal-rangers.de/ausbildung/els/), and the national ministry's [organizational portrait](https://intern.royal-rangers.de/PDF/Presse/2014_Ausgezeichnet_3_RR_Portraet.pdf).

**Verified subdivisions and local units:** The first-party organizational portrait gives the structure `Bund` / national bodies → five `Distrikte` (`Nord`, `West`, `Ost`, `Bayern`, `Baden-Württemberg`) → `Regionen` → numbered `Stammposten`. Within a Stammposten it describes age-level groups and teams, with a team as the smallest unit. It states that the designation is `RR` plus an ordinal and gives `RR150` as its example. The source is a 2014 portrait still hosted by the national ministry; its counts of 33 regions and 349 Stammposten must not be represented as current. The structural terminology and identifier grammar are corroborated by current national pages that repeatedly use `Stamm`, `Stammleiter`, and the Bundesgeschäftsstelle, but those current pages do not republish the complete parent chain. See the [organizational portrait, pp. 143–147](https://intern.royal-rangers.de/PDF/Presse/2014_Ausgezeichnet_3_RR_Portraet.pdf), a current [leader seminar page](https://royal-rangers.de/ausbildung/els/), and the national `Starker Stammtreff` [initiative](https://stammtreff.royal-rangers.de/).

**Explicitly verified FCF structure:** None found in the inspected first-party Germany sources. Record this as `unknown/not evidenced`, not `none`.

### United Kingdom

**Official country/ministry label:** `United Kingdom` on RRI's member list; `Royal Rangers UK` on the national ministry's current site. The about page describes a newly formed board of trustees and the history page says the ministry received charitable status in 2002, but the inspected national pages do not expose a fuller legal entity name suitable for an authoritative organization record. Use `Royal Rangers UK` as the verified public ministry name and leave the legal-name field unset pending stronger first-party evidence. See [RRI member nations](https://rri.world/Member_nations.php), the [Royal Rangers UK home page](https://www.royalrangers.co.uk/), and [about page](https://www.royalrangers.co.uk/about/).

**Verified subdivisions and local units:** Current pages consistently use `outpost` for the local church unit and state that all outposts operate under the authority of a local church. The official history records the launch sequence `Wales 01`, `Wales 02`, and `Wales 03`, and later identifies `Scunthorpe (England 18)`. A current national blog uses the display labels `Outpost 1` and `Outpost 4`. These first-party examples verify that UK local-unit identifiers and display labels have varied over time; the country prefix must not be discarded or reconstructed from a bare number. Although a current curriculum page mentions contact with peers from other `outposts, regions, or countries`, it does not state a national parent hierarchy. No region records or outpost-to-region links should be inferred. See the [Royal Rangers UK history](https://www.royalrangers.co.uk/about/our-history/), [safeguarding page](https://www.royalrangers.co.uk/about/safeguarding/), [national blog index](https://www.royalrangers.co.uk/blog/), and [curriculum patches page](https://www.royalrangers.co.uk/age-groups/ukpatches/).

**Explicitly verified FCF structure:** None found in the inspected first-party UK sources. Record this as `unknown/not evidenced`, not `none`.

## Recommended fixtures

Use one country-ministry fixture and one or two local-unit fixtures from each country:

1. **Malaysia — `Royal Rangers Malaysia`; `Kuala Lumpur#1 (Bukit Jalil)` and `Selangor#6 (Klang)`.** This is the Asian fixture and exercises a compound geographic-plus-number identifier, two source grouping labels, a ministry that includes boys and girls, named but partly inactive districts, and the only explicitly verified FCF affiliate structure in this cohort.
2. **Germany — `Royal Rangers Deutschland`; identifier example `RR150`.** This exercises translated/local terminology, a deep explicitly published national → district → region → Stammposten shape, and an identifier whose prefix is part of the official designation. Because `RR150` is an identifier example rather than a current directory listing in the cited portrait, mark it as a source example or replace it only after a current national locator record is obtained.
3. **United Kingdom — `Royal Rangers UK`; historical `Wales 01` and current display `Outpost 1`.** This exercises identifier/display-label drift and a deliberately sparse parent structure. Prefer `Wales 01` as a historical identifier fixture and `Outpost 1` as a separately sourced current display fixture; do not assert they are the same local unit without direct evidence.

This cohort is intentionally small. It covers deep, shallow/unknown, active/inactive, compound identifier, prefixed identifier, and changing display-label cases without pretending to sample every RRI region.

## Data and intake consequences

1. Preserve `country_source_name`, `ministry_display_name`, `unit_type_source_label`, `identifier_raw`, and `display_name_raw`. A normalized search label may be additive, never destructive.
2. Make organization parentage an evidenced edge with its own source and observation date. Do not derive parentage by splitting an identifier or matching a place name.
3. Allow national ministry, district, region, local unit, age group, team, sponsoring church, sponsoring denomination, and affiliate program as distinct concepts. Do not require every country to instantiate every concept.
4. Model lifecycle and evidence freshness. Malaysia's publication explicitly distinguishes active and formerly active districts; Malaysia's public outpost list carries a March 2020 update date; Germany's complete hierarchy source is historical.
5. Model FCF as an optional affiliate structure, not a mandatory parallel tree. For Malaysia, store only the verified national relationship and the generic existence of district chapters unless a chapter-specific source is added. For Germany and the UK, the cohort's value is unknown.
6. Do not translate source identifiers (`Stamm`, `Stammposten`, `Kuala Lumpur#1`, `Wales 01`) into a universal `outpost_number`. A generic local-unit classification can coexist with the source-native label.

## Remaining uncertainties

- Obtain a current Germany locator or national register before using a real, currently operating numbered Stamm as a production directory fixture. The present evidence is sufficient for schema behavior, not current operating status.
- Obtain a first-party UK register or direct national-office confirmation before connecting a bare current `Outpost 1` label to historical `Wales 01` or assigning UK region parents.
- Malaysia's public outpost page is explicitly dated March 2020. Reconfirm individual outpost operation before publishing addresses or contact data, and do not treat the page as exhaustive.
- The Malaysia sources verify that FCF district chapters exist but do not name them or establish whether chapter boundaries equal Royal Rangers ministry districts.
- RRI membership verifies country participation, not the exact internal hierarchy of each national ministry. National sources remain controlling for local structure.
