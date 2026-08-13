# Normalize the production content model

Ranger Outpost Hub keeps shared identity and publication metadata in one content envelope, but stores every filterable domain fact in typed, foreign-keyed tables. Bounded presentational snapshots may use JSON for revisions or compatibility projections; `content_records.details_json` and the other Slice 1-4 JSON stores become read-only legacy evidence after a one-way backfill and are not independently editable sources of truth.

- Civil Location and Royal Rangers Organizational Affiliations remain separate. Affiliations are typed many-to-many scopes, including overlapping geographic, Spanish-language, and FCF associations, rather than one management hierarchy.
- Every Outpost uses its stable Hub Outpost ID. Displayed numbers remain external identifiers scoped by National Program, organizational evidence, and campus, never globally unique bare keys.
- Event Series and dated Event Occurrences remain separate.
- HTTPS Source Documents are deduplicated, while Field Provenance attaches a Source Document and verification date to an exact content field path; several sources may support one field and one source may support many fields.
- Public and Operator lists use indexed, bounded keyset pagination with opaque cursors. Detail and provenance are loaded only for the selected page or record.
- The existing `ContentRecord` shape remains a generated read projection for the React delivery layer and private preview. Normalized rows are canonical, so changing or replacing the frontend does not move domain storage or validation into the framework.
