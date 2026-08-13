# U.S. minor accounts and privacy research

**Research date:** 2026-08-12  
**Scope:** An independent, nationwide Royal Rangers information service that is intended for K–12 boys and adult leaders and would allow boys, including children under 13, to create accounts using a first name, email address, outpost number or membership, claimed Royal Rangers position, and password, then view a members-only Outpost Calendar.  
**Source policy:** Primary official sources only: the Federal Trade Commission, eCFR/Federal Register, U.S. Department of Education, NIST, state legislatures and attorneys general, and official federal-court materials.

This is a source review, not legal advice. Whether a particular operator, entity, data flow, or feature is covered is fact-specific. A U.S. privacy attorney should review the operating entity, launch states, account flow, vendor contracts, and exact screens before minor accounts are enabled.

## Executive findings

1. **The proposed service deliberately includes children.** Royal Rangers serves K–12 boys, and the proposed account form expressly allows a user to identify as a boy. A legal analysis cannot safely treat under-13 use as accidental. COPPA applies to covered commercial child-directed services and to general-audience services with actual knowledge that they collect personal information from a child under 13. A service aimed at boys and adult leaders may require a fact-specific “child-directed,” “mixed audience,” and operator-status analysis. ([16 C.F.R. §§ 312.2–312.3](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312); [FTC COPPA FAQs, A and D](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions))
2. **An email address is expressly personal information under COPPA.** COPPA defines online contact information to include an email address. It also covers persistent identifiers such as IP addresses and cookies, and information concerning a child that is combined with one of the listed identifiers. Consequently, an account containing an email address plus a first name, outpost affiliation, and claimed position is not outside COPPA merely because only a first name is requested. ([16 C.F.R. § 312.2](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312))
3. **A site password is not the user's email password.** The service must never ask for the password to Gmail, Outlook, or any other mailbox. The FTC has specifically identified a company’s unnecessary collection and clear-text storage of users’ email-account passwords as creating risk to those email accounts. If local authentication is used, the field must be labeled as a new password for this site, and the service should store only a salted password verifier, not the plaintext password. ([FTC, “Start with Security”](https://www.ftc.gov/business-guidance/resources/start-security-guide-business); [NIST SP 800-63B, § 3.1.1](https://pages.nist.gov/800-63-4/sp800-63b.html))
4. **For a covered operator, verifiable parental consent normally must precede account collection from a child under 13.** The narrow exception allowing temporary collection of a child’s or parent’s name/online contact information solely to provide notice and obtain consent does not permit an ordinary account to become active first. If consent is not obtained within a reasonable time, that temporary data must be deleted. ([16 C.F.R. §§ 312.4–312.5](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312))
5. **A private calendar does not eliminate COPPA.** COPPA regulates collection, use, and disclosure, not just public posting. Keeping a calendar members-only may reduce safety exposure, but the child’s email, account identifier, outpost affiliation, access logs, cookies, and other account data are still collected. Whether showing the child's identity or membership to leaders or other outpost members constitutes disclosure to third parties depends on the exact data flow; “private” must not be assumed to mean “not disclosed.” ([16 C.F.R. §§ 312.2–312.5](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312))
6. **COPPA now includes specific written-program requirements.** The 2025 amendments became effective June 23, 2025, with general compliance due April 22, 2026. As of this research date, covered operators must comply with the amended rule, including the expanded direct/online notices, separate consent for non-integral third-party disclosures, a written information-security program, vendor diligence and written assurances, and a written retention policy with deletion timeframes. ([90 Fed. Reg. 16918, 16918 (Apr. 22, 2025)](https://www.govinfo.gov/content/pkg/FR-2025-04-22/pdf/2025-05904.pdf); [16 C.F.R. §§ 312.4, 312.5, 312.8, 312.10](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312))
7. **COPPA is not the full national answer for teenagers.** COPPA defines a child as under 13, but several state laws protect minors through age 17. Most materially for this account concept, New York regulates processing for actually known users under 18 without an express operator-size threshold, and Colorado imposes enhanced minor-data duties without the Colorado Privacy Act’s normal volume thresholds. Mississippi adds age-verification and parental-consent duties through age 17 if the product has all of the social-profile/user-content features in that Act’s applicability test. These laws require state-specific counsel analysis even if the federal COPPA operator question is resolved. ([New York Child Data Protection Act implementation guidance](https://ag.ny.gov/child-data-protection-act-guidance); [Colorado S.B. 24-041 (2024), enacted summary](https://www.leg.colorado.gov/bills/sb24-041); [Mississippi H.B. 1126 (2024), as sent to Governor](https://billstatus.ls.state.ms.us/documents/2024/html/HB/1100-1199/HB1126SG.htm))
8. **Church or outpost approval is not a substitute for parental consent.** COPPA defines “parent” to include a legal guardian. The FTC’s school-consent guidance is limited to a school acting as the parent’s agent where an operator is contracted to provide a service solely for the school’s use and benefit and for no other commercial purpose. Nothing in that guidance makes an independent church youth group, pastor, outpost coordinator, or adult leader the child’s parent or legal guardian. ([16 C.F.R. § 312.2](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312); [FTC COPPA FAQs, N](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions))

## 1. Federal COPPA coverage

### 1.1 What COPPA covers

The current rule defines a child as a person under age 13. It governs a covered operator of a commercial website or online service that is directed to children, and an otherwise general-audience operator that has actual knowledge it is collecting or maintaining personal information from a child. Child-directed status is determined from the totality of factors including subject matter, visual and audio content, child-oriented activities, models’ ages, language, advertising, reliable audience evidence, and the operator’s intended-audience and marketing evidence. ([16 C.F.R. §§ 312.2–312.3](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312))

This service has a mixed factual audience: K–12 boys are intended users, while leaders, parents, and other adults are also intended users. The FTC defines a “mixed audience” service as a subset of child-directed services—directed to children under the rule’s factors, but not targeting children as the primary audience. A mixed-audience service may determine age before collecting other personal information and then apply COPPA protections to children; an operator whose service primarily targets children generally must treat all visitors as children. A legal classification cannot be based only on a terms-of-service statement. ([16 C.F.R. § 312.2](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312); [FTC COPPA FAQs, D.1 and D.4–D.7](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions))

### 1.2 Operator and nonprofit uncertainty

COPPA’s regulatory definition of “operator” concerns services operated for commercial purposes and excludes a nonprofit entity that would otherwise be exempt from FTC Act § 5. The FTC says many nonprofits are therefore outside COPPA, but a nonprofit that operates for the profit of commercial members may be covered. It nevertheless encourages nonprofits to provide COPPA protections. ([16 C.F.R. § 312.2](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312); [FTC COPPA FAQs, A.5](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions))

“Independent,” “free,” “church member,” and “not official” do not by themselves establish a COPPA exemption. Coverage depends on the legal entity and its actual organization, revenue, commerce, vendors, advertising, and relationships. State privacy and child-account laws may apply to nonprofits even where FTC jurisdiction does not. This is a legal-counsel question before launch.

## 2. Proposed registration data

| Proposed or inevitable datum | Federal treatment and significance |
|---|---|
| Email address | Expressly “online contact information,” and therefore personal information, under 16 C.F.R. § 312.2. |
| First name only | COPPA expressly lists first **and** last name, so first name alone is not that enumerated category. It does not remove coverage where email or another identifier is also collected. Information concerning the child that is combined with a listed identifier is personal information. |
| Outpost number or membership | Not separately enumerated, but when stored with the child’s email/account identifier it is information concerning the child combined with an identifier. It also may reveal association with a particular church or religious youth program and warrants separate state-sensitive-data analysis. |
| Claimed position (“Boy,” leader, national leader, etc.) | “Boy” is not a reliable age measure: Royal Rangers spans K–12 and an age threshold must distinguish under 13 from older users. A claimed organizational position also must not be treated as proof of authority or adult status. When combined with email/account identifiers, it is account information concerning that person. |
| Website password | A password is not expressly named in COPPA’s definition, but a credential stored for a child account is security-sensitive child-account data and is governed by the rule’s confidentiality, security, and integrity duties when part of the covered system. It must not be stored in plaintext. |
| Email-provider password | Must never be requested. It is not needed to authenticate to this service and would expose the user's separate mailbox. The FTC cited unnecessary collection of email passwords as a security failure. |
| IP address, cookie, device or user identifier | A persistent identifier capable of recognizing a user over time/across services is personal information. Some collection solely for defined internal operations has a limited consent exception but still carries notice and use restrictions. |
| Age or birth month/year | Age information is needed to separate under-13 users in a mixed-audience flow. It must be collected neutrally before other personal information under the mixed-audience rule. Age-assurance data can itself be personal information and must be minimized and protected. |
| Calendar access/membership logs | Account access records tied to an email, account ID, device, or IP concern an identifiable child and are part of the data inventory, even if users cannot see them. |

Sources: [16 C.F.R. § 312.2](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312); [FTC COPPA FAQs, A.3 and D.7](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions); [FTC, “Start with Security”](https://www.ftc.gov/business-guidance/resources/start-security-guide-business); [NIST SP 800-63B](https://pages.nist.gov/800-63-4/sp800-63b.html).

### Password terminology and handling

The registration copy must distinguish:

- **Email address:** the address the user owns or is authorized to use.
- **Password for this site:** a new credential used only to sign in to this service.
- **Email password:** the secret that signs into Gmail, Outlook, Yahoo, or another mailbox; the service has no legitimate reason to request it.

The FTC’s RockYou example says collecting users’ email passwords when they were not needed, then keeping them in clear text, unnecessarily put email accounts at risk. NIST says central password verifiers store salted and iteratively hashed verification secrets, use protected authenticated channels when requesting passwords, and rate-limit failed attempts. These are security authorities, not a determination that a password is a separately enumerated COPPA identifier. ([FTC, “Start with Security”](https://www.ftc.gov/business-guidance/resources/start-security-guide-business); [NIST SP 800-63B, § 3.1.1](https://pages.nist.gov/800-63-4/sp800-63b.html))

## 3. Age assurance

### 3.1 COPPA mixed-audience age screen

The amended rule permits a mixed-audience service to collect age information or use another method reasonably calculated to determine whether a visitor is a child before collecting other personal information. The process must be neutral: it cannot default to an age, encourage falsification, or first collect the user's email or other account data. The FTC gives freely entered birth month and year as a neutral-screen example and advises technical measures to prevent a child from simply returning to enter a different age. ([16 C.F.R. § 312.2](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312); [FTC COPPA FAQs, D.4–D.8](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions))

Role selection cannot replace an age determination. “Boy” encompasses children both below and above 13, and self-selecting “leader” does not prove adulthood.

### 3.2 FTC’s 2026 age-verification enforcement policy

In February 2026, the FTC announced that it will not bring a COPPA enforcement action against general- and mixed-audience operators that collect, use, or disclose personal information solely to determine age without first obtaining parental consent, if they satisfy stated conditions: use it only for age determination, delete it promptly when no longer necessary, limit disclosures to capable third parties backed by written assurances, clearly notify parents and children, use reasonable safeguards, and take reasonable steps to choose an accurate method or vendor. The policy remains in effect until withdrawn or superseded by final rule amendments. It is an enforcement policy, not a blanket exemption from other laws. ([FTC, “COPPA Enforcement Policy Statement Promoting the Adoption of Age-Verification,” Feb. 25, 2026](https://www.ftc.gov/system/files/ftc_gov/pdf/coppa-age-verification-policy-statement.pdf); [FTC announcement](https://www.ftc.gov/news-events/news/press-releases/2026/02/ftc-issues-coppa-policy-statement-incentivize-use-age-verification-technologies-protect-children))

State requirements differ. Mississippi affirmatively requires commercially reasonable age-verification efforts for account holders if the service meets that statute’s three-part social-feature applicability test, while Colorado’s minor amendments say they do not require age verification or age gating and provide a protection for erroneous commercially reasonable age estimation. A single nationwide flow needs counsel to reconcile the applicable rules and litigation posture.

## 4. Verifiable parental consent

### 4.1 Timing

A covered operator generally must give direct notice and obtain verifiable parental consent **before** collecting, using, or disclosing a child’s personal information. The narrow onboarding exception permits collecting a parent’s or child’s name and online contact information solely to give notice and obtain consent. The information must be deleted if consent is not obtained within a reasonable time. It does not authorize an ordinary active account containing outpost membership, role, and continuing calendar access before consent. ([16 C.F.R. §§ 312.4–312.5](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312))

### 4.2 Acceptable methods

The method must be reasonably calculated, in light of available technology, to ensure the consenting person is the child’s parent. The current rule lists methods including:

- a signed form returned by mail, fax, or electronic scan;
- a payment-card or online-payment transaction that notifies the primary account holder;
- a staffed toll-free call or videoconference;
- government-ID database verification with prompt deletion of the ID;
- qualifying knowledge-based authentication;
- a verified government photo ID plus a live image and trained-person match, with prompt deletion; and
- if the operator does **not disclose** children’s personal information, email-plus or text-plus, which requires an additional confirmation step and notice that consent can be revoked.

The listed methods are not necessarily exhaustive, but an alternative still must satisfy the rule’s standard. ([16 C.F.R. § 312.5(b)](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312); [FTC COPPA FAQs, I.3–I.4](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions))

### 4.3 Private outpost membership and “disclosure”

The rule defines disclosure broadly as release of identifiable child information for any purpose, except to a provider supporting the service’s internal operations, and includes making such information available through online communications. It also requires separate parental consent for third-party disclosure unless that disclosure is integral to the service. ([16 C.F.R. §§ 312.2 and 312.5(a)(2)](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312))

Therefore, two different flows must not be conflated:

1. **The child views a private outpost calendar, but no other member can see the child’s identity, email, membership, or activity.** That is still collection and use requiring the COPPA analysis, but the mere display of a group calendar to the child is not necessarily disclosure of the child’s personal information.
2. **Leaders or other members can see a roster, identity, membership claim, account activity, RSVP, or planned attendance tied to the child.** That may be disclosure to one or more third parties and can affect both the notice and allowable consent method. Calling the space “members only” does not answer the legal question.

The exact role of a verified adult outpost leader—operator personnel, agent, service provider, or third party—depends on contracts, authority, data use, and system design and requires counsel.

### 4.4 Parent rights after consent

Upon a verified parent’s request, a covered operator must describe the personal-information categories collected from children; provide a non-burdensome means for the parent to review the child’s information; allow the parent to refuse further use or collection; and delete the child’s information at the parent’s direction. The operator may end the child’s service after consent is withdrawn, subject to the rule’s data-minimization limitation. ([16 C.F.R. § 312.6](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312))

## 5. Notices and privacy policy

COPPA requires both direct notice to the parent and a prominent, clearly labeled online children’s-privacy notice. The direct notice must be clear, understandable, complete, and free of unrelated or contradictory material. For consent, it must identify the information to be collected, uses, possible disclosures, identities or specific categories of third parties and disclosure purposes, the parent’s option to consent without non-integral third-party disclosure, a privacy-notice link, the consent mechanism, and the deletion consequence if consent is not returned. Material changes to previously consented practices require new notice and consent. ([16 C.F.R. § 312.4(a)–(c)](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312))

The online notice link must appear prominently on the home/landing screen and near each area that collects children’s personal information. The notice must include:

- operator names and the required physical address, telephone number, and email contact;
- what information is collected, including passive collection and whether children can make it public;
- how the information is used;
- disclosure recipients or specific categories and purposes;
- the written retention policy required by § 312.10;
- any claimed internal-operations persistent-identifier use and how it is constrained; and
- the procedures for parent review, deletion, and refusal of further collection or use.

([16 C.F.R. § 312.4(d)](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312))

State law may require additional, age-appropriate notices for users through age 17. A generic adult legal policy alone may not satisfy those requirements.

## 6. Data minimization, retention, and deletion

COPPA prohibits conditioning a child’s participation in any online activity on providing more personal information than is reasonably necessary. The FTC says operators must examine each activity, not only games and prizes. Every registration field therefore needs a documented purpose tied to the account and calendar activity. ([16 C.F.R. § 312.7](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312); [FTC COPPA FAQs, M.2](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions))

The amended retention rule provides that a child’s personal information may be kept only as long as reasonably necessary for the specific purpose for which it was collected and never indefinitely. A covered operator must establish, implement, and maintain a written retention policy identifying collection purposes, the business need for retention, and deletion timeframes; publish that policy in the online notice; and delete using reasonable measures that protect against unauthorized access or use during deletion. ([16 C.F.R. § 312.10](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312))

The relevant inventory is broader than profile rows. It includes pending-consent records, email-verification data, session and authentication logs, IP/device identifiers, outpost access grants, audit logs, backups, support records, vendor copies, and data used for age or parent verification. Counsel should determine how legal holds, fraud/security records, and parent-directed deletion interact with the published schedule.

## 7. Security and vendors

The amended COPPA rule requires reasonable confidentiality, security, and integrity procedures and, at minimum, a written information-security program appropriate to the sensitivity and volume of children’s data and the operator’s size and complexity. The program must:

1. designate one or more responsible employees;
2. identify internal and external risks and reassess them at least annually;
3. implement safeguards responsive to volume, sensitivity, likelihood, and impact;
4. regularly test and monitor those safeguards; and
5. evaluate and modify the program at least annually and when material circumstances change.

Before another operator, service provider, or third party collects or maintains children’s personal information, the operator must reasonably determine that the recipient can protect it and obtain written assurances that it will use reasonable safeguards. ([16 C.F.R. § 312.8](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312))

For this service, that requirement reaches at least hosting/database providers, authentication and email vendors, analytics/error monitoring, backups, support tooling, and any age- or parent-verification vendor. Third-party scripts on child-directed pages also matter: the FTC says the first-party operator is responsible for collection through its service and must inquire into embedded third parties’ practices. ([FTC COPPA FAQs, D.9–D.11](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions))

The site credential must be transmitted through an authenticated encrypted channel and stored as a salted password verifier rather than plaintext. Rate limiting and secure recovery are part of the authentication threat model. These NIST practices support, but do not exhaust, COPPA’s reasonable-security standard. ([NIST SP 800-63B, § 3.1.1](https://pages.nist.gov/800-63-4/sp800-63b.html))

Outpost-calendar confidentiality deserves separate threat modeling because even a calendar with no boys’ names can reveal where a youth group will be at a future date. That is a safety risk distinct from whether the calendar record itself meets a particular statutory definition of personal information.

## 8. School, church, and Royal Rangers consent distinctions

The FTC allows a school to act as a parent’s agent only in a limited setting: the school has contracted with the operator for a service solely for the school’s use and benefit and for no other commercial purpose. The operator must give the school full COPPA notice, have a method reasonably calculated to ensure the school—not a child posing as a teacher—is providing authorization, honor review/deletion/cessation rights, and limit the data to the school-authorized educational context. The FTC says COPPA compliance remains the operator’s responsibility. ([FTC COPPA FAQs, N.1–N.4](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions))

That guidance does not establish any equivalent agency rule for:

- a church merely because it sponsors an outpost;
- a pastor, Outpost Coordinator, commander, leader, or national/district/regional officer;
- a charter or membership relationship with Royal Rangers; or
- an independent reference site used voluntarily outside a school contract.

Under COPPA, a parent includes a legal guardian. Unless an adult leader is also that child’s parent or legal guardian, the leader’s verification of membership and the parent’s consent are legally different actions. ([16 C.F.R. § 312.2](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312))

FERPA applies to educational agencies and institutions receiving funds under U.S. Department of Education programs. The Department says private and parochial elementary and secondary schools generally do not receive such funds and therefore generally are not subject to FERPA. A church youth outpost is not transformed into a FERPA-covered school merely because it teaches boys. If the service later contracts with public schools or federally funded educational institutions, FERPA, state student-privacy laws, and the FTC’s school-COPPA guidance require a separate analysis. ([U.S. Department of Education, “To which educational agencies or institutions does FERPA apply?”](https://studentprivacy.ed.gov/faq/which-educational-agencies-or-institutions-does-ferpa-apply); [34 C.F.R. § 99.1](https://studentprivacy.ed.gov/ferpa?exp=8))

## 9. State laws that materially change a national minor-account launch

This is not a 50-state survey. The entries below are the primary-source laws most directly material to a general youth account and ordinary member calendar; social-media-only, adult-content, student-record, and targeted-advertising-only statutes are not cataloged unless they materially overlap this service. State applicability can depend on residence, entity form, revenue or user thresholds, targeting, data practices, and contested definitions.

### 9.1 New York — under-18 processing rules without an express operator-size threshold

The New York Child Data Protection Act took effect June 20, 2025. It covers a New York user who is actually known by the operator to be under 18 or who uses a service or delineable portion primarily directed to minors. “Operator” is defined as a person that operates or provides an online service and controls the purposes and means of processing; the statutory definition shown in the official text does not state a revenue, user-count, or for-profit threshold. Personal data is any data that identifies or could reasonably be linked directly or indirectly to a person or device, and “processing” includes collection, use, access, storage, disclosure, retention, and deletion. ([N.Y. Gen. Bus. Law § 899-ee](https://www.nysenate.gov/legislation/laws/GBS/899-EE); [New York Attorney General implementation guidance](https://ag.ny.gov/child-data-protection-act-guidance))

For a covered user age 12 or younger, New York adopts COPPA’s processing standard. For a covered user age 13–17, processing requires the teen’s informed consent unless it is strictly necessary for a listed purpose, including providing or maintaining the specific product the user requested and narrowly defined internal, security, legal, or vital-interest operations. The Attorney General says necessary product processing is judged against a reasonable covered user’s expectations and cannot be used for another purpose. Non-necessary processing requires separate, freely revocable consent with refusal presented at least as prominently; refusing it cannot degrade a feature that does not need that processing. Purchase or sale of a covered user’s data is prohibited. ([N.Y. Gen. Bus. Law § 899-ff](https://www.nysenate.gov/legislation/laws/GBS/899-FF); [New York Attorney General implementation guidance](https://ag.ny.gov/child-data-protection-act-guidance))

The Attorney General says that once an operator learns a user is a minor and associates that fact with an account, it has actual knowledge anywhere it recognizes that login, including across devices or products using the credentials. It also cautions that the 13–17-year-old’s statutory control over non-necessary processing cannot be lightly disregarded even where a parent requested the core service. ([New York Attorney General implementation guidance](https://ag.ny.gov/child-data-protection-act-guidance))

The proposed “Boy” position does not state an exact age, but it deliberately flags a potentially minor user in a K–12 service. Whether that fact alone creates actual knowledge, willful disregard, or a duty to ask a neutral age question is a high-risk counsel question; it is not safe to assume the operator knows nothing about age.

### 9.2 Colorado — enhanced duties for known minors through age 17, regardless of ordinary volume thresholds

Colorado S.B. 24-041 became effective October 1, 2025. For its enhanced minor provisions, the enacted summary says it applies to a controller doing business in Colorado or delivering products or services targeted to Colorado residents **regardless of processing volume or revenue**. A controller offering an online service, product, or feature to a consumer it knows or willfully disregards is a minor must use reasonable care to avoid a heightened risk of harm and, when such a risk exists, conduct and document a data-protection assessment. Without consent from the minor—or the parent/legal guardian for a child under 13—the law restricts targeted advertising, sale, certain profiling, undisclosed secondary processing, and retaining data longer than reasonably necessary. It also restricts manipulative engagement features and precise geolocation absent consent. The law does not itself require age verification or age gating. ([Colorado S.B. 24-041 (2024), enacted summary and signed act](https://www.leg.colorado.gov/bills/sb24-041); [current 4 CCR 904-3](https://www.sos.state.co.us/CCR/GenerateRulePdf.do?fileName=4+CCR+904-3&ruleVersionId=11819))

The ordinary Colorado Privacy Act separately applies only at its statutory thresholds, but it expressly covers qualifying nonprofits. It treats all personal data regarding a child under 13, as well as data revealing religious beliefs, as sensitive data; covered controllers must obtain consent before processing sensitive data and owe transparency, minimization, purpose limitation, reasonable security, rights-response, processor-contract, and assessment duties. ([Colorado Attorney General, “Colorado Privacy Act”](https://coag.gov/resources/colorado-privacy-act/))

The proposed account’s outpost affiliation may allow an inference about association with a named church or religious youth ministry. Whether that field “reveals” religious beliefs under Colorado law, and whether the service “targets” Colorado residents by publishing and serving Colorado outposts, need counsel’s factual analysis. No official court injunction against the Colorado minor-data provisions was located in this review.

### 9.3 Mississippi — conditional social-service account rule through age 17; currently operative during litigation

The Walker Montgomery Protecting Children Online Act defines a digital service broadly, but its operative applicability section requires all three of the following features: the provider primarily functions to connect users for social interaction; allows users to create public, semi-public, or private profiles for signing into and using the service; and allows users to create or post content viewable by other users, such as a message board, chat room, video channel, direct message, or main feed. It also contains express exclusions. If those conditions are met, the provider must make commercially reasonable efforts to verify every account holder’s age and may not allow a known minor under 18 to become an account holder without express parent/guardian consent. It limits collection to reasonably necessary information, use to the collection purpose, precise geolocation, and sharing/sale/disclosure, and requires a harm-mitigation strategy. It took effect July 1, 2024. ([Mississippi H.B. 1126 (2024), §§ 2–6](https://billstatus.ls.state.ms.us/documents/2024/dt/HB/1100-1199/HB1126SG.pdf))

The law’s enforceability has changed during litigation. The Fifth Circuit vacated the initial preliminary injunction in April 2025 and remanded for the analysis required by *Moody v. NetChoice*. After the district court again enjoined the law, the Fifth Circuit stayed that injunction in July 2025. The U.S. Supreme Court denied NetChoice’s application to vacate the stay; Justice Kavanaugh wrote separately that NetChoice was likely to succeed on the merits but had not shown the balance of harms and equities warranted interim relief. The merits appeal, No. 25-60348, remained pending on the official docket materials reviewed. Thus, as of this research date, the injunction is stayed and counsel should treat the statute as operative while monitoring the appeal. ([*NetChoice, L.L.C. v. Fitch*, 134 F.4th 799 (5th Cir. 2025)](https://www.ca5.uscourts.gov/Opinions/pub/24/24-60341-CV0.pdf); [U.S. Supreme Court docket 25A97](https://www.supremecourt.gov/docket/docketfiles/html/public/25a97.html))

For this project, a read-only calendar with invisible viewer accounts may fall outside the three-part test. Adding member profiles plus boys’ comments, posts, RSVPs viewable by others, chat, direct messaging, or feeds could materially change the result. Counsel must apply each element and exclusion to the exact release, not to the broad product name.

### 9.4 California — business thresholds and under-16 opt-in for sale or sharing

The CCPA/CPRA applies only when its definition of a covered business is met. For covered businesses, California Civil Code § 1798.120(c) prohibits selling or sharing personal information when the business has actual knowledge the consumer is under 16 unless the consumer, if age 13–15, or the parent/guardian, if under 13, affirmatively authorizes it. The statute says a business that willfully disregards age has actual knowledge. “Sharing” in this provision is tied to cross-context behavioral advertising, not every operational disclosure. ([California Civil Code §§ 1798.120 and 1798.140, official Legislature text](https://leginfo.legislature.ca.gov/faces/codes_displayText.xhtml?division=3.&chapter=1.&part=4.&lawCode=CIV&title=1.81.5.))

This provision does not create a general California parental-consent rule for every ordinary teen account. It becomes material if the operating entity meets the business thresholds or sells/shares data, uses cross-context behavioral advertising, or engages vendors outside statutory service-provider/contractor constraints. The exact entity and revenue/data thresholds must be rechecked near launch because statutory thresholds can be adjusted.

California’s separate Age-Appropriate Design Code Act applies only to a CCPA-defined business. In March 2026, the Ninth Circuit kept preliminary injunctions against the challenged data-use and dark-pattern provisions, vacated the blanket injunction, and vacated the injunction against the age-estimation provision; earlier risk-assessment/reporting provisions remained enjoined. The case was remanded, so current provision-by-provision enforceability must be rechecked and should not be reduced to “the whole law is in effect” or “the whole law is blocked.” ([Ninth Circuit opinion, *NetChoice, LLC v. Bonta*, No. 25-2366 (Mar. 12, 2026)](https://cdn.ca9.uscourts.gov/datastore/opinions/2026/03/12/25-2366.pdf); [current California Civil Code § 1798.99.31](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=1798.99.31.))

### 9.5 Connecticut — known-minor duties, with entity exemptions

Connecticut’s current statutes impose enhanced duties on controllers that offer an online service to a consumer the controller actually knows or willfully disregards is under 18. They include reasonable care concerning heightened risks, data-protection assessments, purpose and retention limits, covered-consent requirements, geolocation restrictions, and safeguards concerning unsolicited communications between adults and minors. Effective July 1, 2026, the statute prohibits targeted advertising to and sale of a minor’s personal data and tightens precise-geolocation and messaging defaults. ([Conn. Gen. Stat. §§ 42-529–42-529b, 2026 Supplement](https://prdext2.cga.ct.gov/2026/sup/chap_743jj.htm))

The chapter exempts several entity categories, including organizations exempt under Internal Revenue Code § 501(c)(3), (4), (6), or (12). Whether this independent service is operated personally, by a church, by a qualifying tax-exempt entity, or by another organization therefore changes the Connecticut analysis. ([Conn. Gen. Stat. § 42-529d](https://prdext2.cga.ct.gov/2026/sup/chap_743jj.htm))

### 9.6 Maryland — broad children-under-18 design code, but only for qualifying for-profit covered entities

Maryland’s Kids Code took effect October 1, 2024 and treats a child as under 18. It applies to a for-profit covered entity doing business in Maryland that controls collection/processing and meets one of the statute’s revenue, 50,000-consumer/household/device, or data-sale thresholds. An online product is reasonably likely to be accessed by children if, among other criteria, it is COPPA-directed, routinely accessed by a significant number of children, marketed to children, or the entity knows or should know a user is a child. ([Maryland H.B. 603, Ch. 461 (2024), §§ 14-4601–14-4613](https://mgaleg.maryland.gov/2024RS/chapters_noln/Ch_461_hb0603T.pdf))

A covered product must complete a child-focused data-protection assessment, use high-privacy defaults, provide age-suitable notices and privacy tools, limit processing to what is reasonably necessary for the product the child is actively using, limit secondary use, restrict default profiling and precise geolocation, and avoid dark patterns. Existing products continuing after July 1, 2026 had an April 1, 2026 assessment deadline; products first offered after April 1, 2026 must complete the assessment within 90 days. The statute does not require age gating. ([Maryland H.B. 603, §§ 14-4604–14-4610](https://mgaleg.maryland.gov/2024RS/chapters_noln/Ch_461_hb0603T.pdf))

A small genuinely nonprofit project may fall outside this particular statute, but entity form and thresholds must be verified, not assumed. The statute also classifies account-login information together with the required password or credential as sensitive personal data, reinforcing that credentials need heightened treatment when the Act applies. Maryland’s separate Online Data Privacy Act generally has lower consumer thresholds, can include nonprofits, and prohibits targeted advertising or sale where a covered controller knew or should have known the consumer was under 18; its applicability requires a separate threshold analysis. ([Maryland Attorney General, “Maryland Online Data Privacy Act”](https://oag.maryland.gov/resources-info/Pages/data-privacy.aspx); [Md. Code, Commercial Law § 14-4707](https://mgaleg.maryland.gov/mgawebsite/Laws/StatuteText?article=gcl&enactments=false&section=14-4707))

### 9.7 Vermont — enacted future requirements beginning January 1, 2027

Vermont Act 63 (S.69) was signed June 12, 2025 and establishes an age-appropriate design code effective January 1, 2027. The official enactment index identifies duties concerning care, default privacy, transparency, prohibited data/design practices, age-assurance privacy, and covered minors’ rights. It is not yet effective as of the research date, but it is relevant to an ongoing national service expected to operate in 2027. Counsel should assess its covered-business definition, exemptions, and implementing rules before that date. ([Vermont S.69 / Act 63 status and enacted sections](https://legislature.vermont.gov/bill/status/2026/S.69))

### 9.8 State-law conclusion

The legal floor cannot be set by COPPA’s under-13 threshold alone. New York and Colorado impose material duties through age 17 without ordinary volume thresholds; Connecticut may add duties depending on entity status; Mississippi may impose a parent-consent rule through age 17 if social/profile/user-content features trigger it; and other state laws add duties based on scale, data type, advertising, residence, and design. A complete launch review should include all states and U.S. territories actually served, plus a monitoring process for injunctions, appeals, regulations, and newly effective statutes.

## 10. Facts that follow from the sources, without choosing a product policy

- A registration flow that collects a boy’s email, first name, outpost, position, and site credential before determining age is inconsistent with the COPPA mixed-audience sequence if the service is covered.
- Under-13 users cannot simply check a consent box for themselves under COPPA; a covered operator needs direct parent notice and verifiable parental consent unless a narrow exception applies.
- “Only outpost members can see it” affects exposure but does not eliminate collection or parental-consent duties.
- An outpost coordinator, pastor, leader, district officer, regional officer, national officer, church, or Royal Rangers office is not automatically the parent or legal guardian and cannot supply COPPA parental consent merely by virtue of organizational position.
- The website must never collect an email-provider password. A local password, if used, is a separate site credential and should be labeled accordingly.
- Claimed position cannot be used as age assurance or authority verification.
- Under the present Mississippi litigation posture, a service that satisfies the statute’s social-interaction, profile, and user-content conditions faces an age-verification and parental-consent rule through age 17. A read-only calendar does not automatically satisfy those conditions.

## 11. Questions requiring U.S. privacy counsel before minor accounts launch

1. **Operating entity:** Who legally operates the service? Is it an individual, church, nonprofit corporation, or for-profit entity? Does it fall within FTC § 5/COPPA jurisdiction, and which state nonprofit exemptions do or do not apply?
2. **Audience classification:** Is the whole service primarily child-directed, mixed audience, general audience with a child-directed portion, or different classifications for the public reference library and authenticated outpost area?
3. **Geographic availability:** Will minor accounts be offered in every state, including New York, Colorado, Connecticut, and Mississippi? Which state/territory residency facts will be collected or inferred to apply local rules?
4. **Age method:** What age-screen or age-assurance method is proportionate and legally adequate under COPPA, the 2026 FTC policy, Mississippi law, and state privacy laws? Can it avoid collecting a full birth date?
5. **Parent verification:** Which verifiable-parental-consent method is appropriate? Is email-plus unavailable because leaders or members can see a child’s identity, membership, RSVP, or other personal information?
6. **Membership data flow:** Exactly which adults and boys can see a member roster, first name/display name, email, outpost affiliation, role, calendar activity, RSVP, or attendance intention? Is each recipient operator staff/agent, a contracted service provider, or a third party?
7. **Church verification:** How should the separate processes of (a) parent consent and (b) church/outpost membership verification work without treating a leader as a parent or disclosing unnecessary child information?
8. **Religious affiliation:** Does storing a child’s outpost or church association reveal or infer religious belief under Colorado or other state sensitive-data definitions, and what consent or assessment follows?
9. **Privacy notices:** What separate parent notice, children’s notice, general privacy notice, state notices, retention policy, and age-appropriate wording are required for the final data inventory?
10. **Security program:** Who is the designated coordinator; what risk assessment, test schedule, incident plan, access controls, credential storage, logging, and vendor assurances satisfy the amended COPPA rule and state laws for this operator’s size and risk?
11. **Deletion:** What concrete retention periods apply to active accounts, unconfirmed registrations, withdrawn consent, inactive outposts, access logs, backups, age-verification evidence, leader-verification records, and security/fraud records?
12. **Calendar safety:** Even when no individual child is named, what safeguarding, access, notification, and incident-response rules are appropriate for future group-location data?
13. **Terms and contracts:** Can minors assent to the site terms under the relevant state contract law, and must the parent separately accept them in addition to privacy consent?
14. **Ongoing state survey:** Which other state laws, regulations, and currently enjoined account/age-assurance statutes apply on the actual launch date, especially if the product adds messaging, social profiles, targeted recommendations, advertising, payments, photos, attendance, or advancement records? Recheck the pending Mississippi appeal and California remand immediately before launch.

## Primary-source index

- [16 C.F.R. Part 312 — current COPPA Rule](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312)
- [FTC — Complying with COPPA: Frequently Asked Questions](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions)
- [FTC — 2025 final COPPA amendments](https://www.ftc.gov/legal-library/browse/federal-register-notices/16-cfr-part-312-coppa-final-rule-amendments)
- [Federal Register — 90 Fed. Reg. 16918 (Apr. 22, 2025)](https://www.govinfo.gov/content/pkg/FR-2025-04-22/pdf/2025-05904.pdf)
- [FTC — 2026 age-verification enforcement policy](https://www.ftc.gov/system/files/ftc_gov/pdf/coppa-age-verification-policy-statement.pdf)
- [FTC — Start with Security](https://www.ftc.gov/business-guidance/resources/start-security-guide-business)
- [NIST SP 800-63B — Authentication and Authenticator Management](https://pages.nist.gov/800-63-4/sp800-63b.html)
- [U.S. Department of Education — FERPA applicability](https://studentprivacy.ed.gov/faq/which-educational-agencies-or-institutions-does-ferpa-apply)
- [New York Child Data Protection Act — definitions](https://www.nysenate.gov/legislation/laws/GBS/899-EE)
- [New York Child Data Protection Act — processing and consent](https://www.nysenate.gov/legislation/laws/GBS/899-FF)
- [New York Attorney General — implementation guidance](https://ag.ny.gov/child-data-protection-act-guidance)
- [Mississippi H.B. 1126 (2024), as sent to Governor](https://billstatus.ls.state.ms.us/documents/2024/html/HB/1100-1199/HB1126SG.htm)
- [Fifth Circuit — *NetChoice v. Fitch*, No. 24-60341 (Apr. 17, 2025)](https://www.ca5.uscourts.gov/Opinions/pub/24/24-60341-CV0.pdf)
- [U.S. Supreme Court — docket 25A97, *NetChoice v. Fitch*](https://www.supremecourt.gov/docket/docketfiles/html/public/25a97.html)
- [Colorado S.B. 24-041 (2024)](https://www.leg.colorado.gov/bills/sb24-041)
- [Colorado Attorney General — Colorado Privacy Act](https://coag.gov/resources/colorado-privacy-act/)
- [California Civil Code §§ 1798.100–1798.199.100](https://leginfo.legislature.ca.gov/faces/codes_displayText.xhtml?division=3.&chapter=1.&part=4.&lawCode=CIV&title=1.81.5.)
- [Ninth Circuit — *NetChoice v. Bonta*, No. 25-2366 (Mar. 12, 2026)](https://cdn.ca9.uscourts.gov/datastore/opinions/2026/03/12/25-2366.pdf)
- [Connecticut General Statutes, Chapter 743jj](https://prdext2.cga.ct.gov/2026/sup/chap_743jj.htm)
- [Maryland H.B. 603, Chapter 461 (2024)](https://mgaleg.maryland.gov/2024RS/chapters_noln/Ch_461_hb0603T.pdf)
- [Vermont S.69 / Act 63](https://legislature.vermont.gov/bill/status/2026/S.69)
