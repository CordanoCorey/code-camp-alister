export const recordKinds = [
  'outpost',
  'event',
  'advancement',
  'organization',
  'page',
] as const

export type RecordKind = (typeof recordKinds)[number]
export type PublicationStatus = 'draft' | 'published' | 'archived'

export type SourceRecord = {
  id: string
  fieldName: string
  label: string
  url: string
  verifiedAt: string
}

export const programGroups = [
  'Ranger Kids',
  'Discovery Rangers',
  'Adventure Rangers',
  'Expedition Rangers',
] as const

export type ProgramGroup = (typeof programGroups)[number]

export type OutpostDetails = {
  hubOutpostId: string
  outpostNumber: string | null
  campusSuffix: string | null
  church: string
  streetAddress: string | null
  city: string
  jurisdiction: string
  postalCode: string | null
  district: string
  region: string
  languageOverlay: string
  fcfTerritory: string
  activeFcf: boolean | null
  programs: string[]
  meeting: string | null
  contactUrl: string | null
}

export type EventDetails = {
  occurrenceId: string
  series: { id: string; name: string } | null
  category: EventCategory
  host: string
  scope: EventScope
  relatedOrganizations: Array<{ id: string; name: string }>
  startDate: string
  endDate: string | null
  startTime: string | null
  endTime: string | null
  timeZone: string
  allDay: boolean
  locationStatus: EventLocationStatus
  location: string | null
  audience: string[]
  registrationStatus: EventRegistrationStatus
  registrationUrl: string | null
  registrationDeadline: string | null
  deadlineExceptionNote: string | null
  costStatus: EventCostStatus
  costNote: string | null
  lifecycleStatus: EventLifecycleStatus
  officialUrl: string
  verificationWarnings?: string[]
}

export const eventCategories = [
  'camp',
  'conference',
  'fcf',
  'pow-wow',
  'training',
  'other',
] as const
export type EventCategory = (typeof eventCategories)[number]

export const eventScopes = ['outpost', 'district', 'region', 'national', 'fcf', 'other'] as const
export type EventScope = (typeof eventScopes)[number]

export const eventLocationStatuses = ['announced', 'to-be-announced', 'online', 'withheld', 'not-verified'] as const
export type EventLocationStatus = (typeof eventLocationStatuses)[number]

export const eventRegistrationStatuses = ['not-verified', 'not-open', 'open', 'closed', 'full', 'not-required'] as const
export type EventRegistrationStatus = (typeof eventRegistrationStatuses)[number]

export const eventCostStatuses = ['not-verified', 'free', 'paid', 'varies'] as const
export type EventCostStatus = (typeof eventCostStatuses)[number]

export const eventLifecycleStatuses = [
  'scheduled',
  'accepting-registration',
  'confirmed',
  'full',
  'postponed',
  'cancelled',
  'completed',
] as const
export type EventLifecycleStatus = (typeof eventLifecycleStatuses)[number]

export const advancementSubtypes = [
  'program-group',
  'achievement-trail',
  'merit',
  'award',
  'handbook',
] as const

export type AdvancementSubtype = (typeof advancementSubtypes)[number]
export type AdvancementContentStatus = 'current' | 'historical' | 'superseded' | 'not-verified'
export type AdvancementAudience = 'Leaders' | 'FCF'
export type MeritCategory = 'skill' | 'bible' | 'leadership'
export type MeritColor = 'blue' | 'green' | 'silver' | 'orange' | 'brown' | 'red' | 'gold' | 'sky-blue'
export type HandbookFormat = 'print' | 'ebook'
export type HandbookAvailability = 'available' | 'unavailable' | 'not-verified'

export type AdvancementReference = {
  targetId: string
  targetSubtype: AdvancementSubtype
  relationship: string
}

type AdvancementBaseDetails = {
  subtype: AdvancementSubtype
  programGroups: ProgramGroup[]
  audiences: AdvancementAudience[]
  gradeRange: string | null
  officialUrl: string
  contentStatus: AdvancementContentStatus
  references: AdvancementReference[]
}

export type ProgramGroupDetails = AdvancementBaseDetails & {
  subtype: 'program-group'
  accent: string
  highlights: string[]
}

export type AchievementTrailDetails = AdvancementBaseDetails & {
  subtype: 'achievement-trail'
}

export type MeritDetails = AdvancementBaseDetails & {
  subtype: 'merit'
  meritCategory: MeritCategory
  colors: MeritColor[]
}

export type AwardDetails = AdvancementBaseDetails & {
  subtype: 'award'
  awardLevel: 'program-group' | 'national' | 'junior-leadership' | 'fcf'
}

export type HandbookPurchaseLink = {
  label: string
  format: HandbookFormat
  url: string
}

export type HandbookDetails = AdvancementBaseDetails & {
  subtype: 'handbook'
  publisher: string | null
  itemNumber: string | null
  edition: string | null
  revision: string | null
  publicationYear: number | null
  availability: HandbookAvailability
  formats: HandbookFormat[]
  purchaseUrls: HandbookPurchaseLink[]
}

export type AdvancementDetails =
  | ProgramGroupDetails
  | AchievementTrailDetails
  | MeritDetails
  | AwardDetails
  | HandbookDetails

export type OrganizationDetails = {
  organizationType:
    | 'region'
    | 'district'
    | 'language-region'
    | 'language-district'
    | 'fcf-territory'
  scope: 'geographic' | 'language' | 'fcf'
  parent: string | null
  affiliations: string[]
  jurisdictions: string[]
}

export type PageDetails = {
  section: 'about' | 'other' | 'help'
  body: string[]
  links: Array<{ label: string; url: string }>
}

export type RecordDetails =
  | OutpostDetails
  | EventDetails
  | AdvancementDetails
  | OrganizationDetails
  | PageDetails

export type ContentRecord = {
  id: string
  kind: RecordKind
  slug: string
  title: string
  summary: string
  status: PublicationStatus
  details: RecordDetails
  verifiedAt: string | null
  publishedAt: string | null
  updatedAt: string
  sources: SourceRecord[]
  /** Operator-only optimistic concurrency token. Public serializers omit it. */
  version?: number
}

export type PublicBundle = {
  records: ContentRecord[]
  generatedAt: string
}

export type CursorPage<T> = {
  records: T[]
  nextCursor: string | null
  generatedAt: string
}

export type PublicBootstrap = {
  featuredRecords: ContentRecord[]
  navigation: ContentRecord[]
  counts: Record<RecordKind, number>
  coverage: {
    jurisdictions: Array<{ name: string; code: string; verifiedListingCount: number }>
    regions: Array<{ name: string; verifiedListingCount: number }>
  }
  generatedAt: string
}

export type AuditEvent = {
  id: number
  recordId: string
  action: string
  actorLabel: string
  reason: string | null
  createdAt: string
}

export type OperatorAccountDetails = {
  displayName: string
  email: string
  currentOutpost: { id: string; title: string } | null
  tenureNumber: number
  activatedAt: string
  renewalDueAt: string
  noticeOpensAt: string
  lifecycleState: 'active' | 'notice-due' | 'renewal-required'
  adultEligibilityConfirmed: true
  accessCleanupRequired: boolean
  accessCleanupConfirmedAt: string | null
  version: number
}

export type PendingOperatorTransfer = {
  id: string
  displayName: string
  email: string
  currentOutpost: { id: string; title: string } | null
  createdAt: string
  expiresAt: string
  initiationKind: 'operator' | 'recovery'
}

export type OperatorSession =
  | { role: 'unclaimed'; email: string; recentAuthentication: boolean }
  | {
    role: 'active'
    account: OperatorAccountDetails
    pendingTransfer: PendingOperatorTransfer | null
    recentAuthentication: boolean
  }
  | {
    role: 'pending-successor'
    transferId: string
    transfer: {
      displayName: string
      currentOutpost: { id: string; title: string } | null
      expiresAt: string
    }
    recentAuthentication: boolean
  }

export type EventConflictAssertion = {
  sourceId: string | null
  sourceLabel: string
  assertedValue: string
}

export type EventConflict = {
  id: string
  eventId: string
  fieldName: string
  assertions: EventConflictAssertion[]
  status: 'open' | 'resolved'
  openedAt: string
  openedBy: string
  resolutionNote: string | null
  resolvedAt: string | null
  resolvedBy: string | null
}

export type BrokenSourceObservation = {
  id: string
  sourceId: string
  recordId: string
  observedAt: string
  observedBy: string
  note: string
  clearedAt: string | null
  clearedBy: string | null
}

export type CoverageGap = {
  id: string
  scope: string
  description: string
  sourceUrl: string | null
  lastCheckedAt: string | null
  status: 'open' | 'resolved' | 'dismissed'
  resolutionReason: string | null
  createdAt: string
  createdBy: string
  resolvedAt: string | null
  resolvedBy: string | null
}

export type FreshnessItemType =
  | 'verification-due'
  | 'verification-stale'
  | 'listing-due'
  | 'listing-grace'
  | 'listing-expired'
  | 'archived-review'
  | 'submission-retention'
  | 'completion'
  | 'broken-source'
  | 'event-conflict'
  | 'coverage-gap'

export type FreshnessQueueItem = {
  id: string
  type: FreshnessItemType
  severity: 'info' | 'due' | 'overdue'
  title: string
  recordId: string | null
  fieldName: string | null
  sourceId: string | null
  sourceLabel: string | null
  sourceUrl: string | null
  lastCheckedAt: string | null
  actionTarget: string
}

export type OperatorSnapshot = PublicBundle & {
  recordsNextCursor?: string | null
  counts?: Record<RecordKind, number>
  audit: AuditEvent[]
  operatorLabel: string
  conflicts: EventConflict[]
  brokenSources: BrokenSourceObservation[]
  coverageGaps: CoverageGap[]
  freshnessQueue: FreshnessQueueItem[]
}

export type DirectorySubmissionState =
  | 'new'
  | 'triage'
  | 'needs-information'
  | 'duplicate'
  | 'verified-ready'
  | 'converted'
  | 'rejected'
  | 'withdrawn'
  | 'pii-scrubbed'

export type DirectorySubmissionSummary = {
  id: string
  referenceCode: string
  submissionType: 'new-listing' | 'correction'
  targetOutpostId: string | null
  church: string
  city: string
  jurisdiction: string
  state: DirectorySubmissionState
  likelyDuplicate: boolean
  createdAt: string
  retentionDeadline: string
  piiScrubbedAt: string | null
}

export type DirectorySubmissionDetail = DirectorySubmissionSummary & {
  outpostNumber: string | null
  campusSuffix: string | null
  streetAddress: string | null
  postalCode: string | null
  district: string | null
  languageOverlay: string | null
  programs: string[]
  meeting: string | null
  sourceUrl: string
  fcfActivityStatus: 'yes' | 'no' | 'not-verified'
  replyEmail: string | null
  notes: string | null
  matches: Array<{
    id: string
    hubOutpostId: string
    matchKind: 'church-location' | 'address' | 'scoped-number' | 'source-identifier' | 'source-url'
    evidence: string
    state: 'candidate' | 'confirmed-duplicate' | 'dismissed'
  }>
  events: Array<{
    id: number
    action: string
    reason: string | null
    relatedOutpostId: string | null
    operatorTenureId: number | null
    createdAt: string
  }>
}

export type StagedOutpostCandidate = {
  id: string
  batchId: string
  candidateKey: string
  operation: 'new-listing' | 'correction'
  targetOutpostId: string | null
  church: string
  city: string
  jurisdiction: string
  outpostNumber: string | null
  campusSuffix: string | null
  state: 'staged' | 'duplicate-review' | 'converted-to-draft' | 'rejected'
  createdAt: string
  appliedOutpostId: string | null
  sources: Array<{
    field: string
    url: string
    label: string
    checkedAt: string
    factKind: 'direct' | 'derived'
    mappingSourceUrl: string | null
  }>
  matches: Array<{
    id: string
    hubOutpostId: string
    matchKind: 'church-location' | 'address' | 'scoped-number' | 'source-identifier' | 'source-url'
    evidence: string
    state: 'candidate' | 'confirmed-duplicate' | 'dismissed'
  }>
}

export type MaintenanceJobSummary = {
  key: string
  enabled: boolean
  ruleVersion: string
  intervalSeconds: number
  batchSize: number
  nextDueAt: string
  lastSuccessAt: string | null
  consecutiveFailures: number
  circuitState: 'closed' | 'open'
  leasedUntil: string | null
}

export type ApprovedSourceMonitorSummary = {
  sourceDocumentId: string
  sourceLabel: string
  sourceUrl: string
  enabled: boolean
  hostname: string
  mode: 'availability-metadata' | 'bounded-fingerprint'
  intervalSeconds: number
  maximumResponseBytes: number
  maximumRedirects: number
  nextDueAt: string
  lastAttemptAt: string | null
  lastSuccessAt: string | null
  consecutiveFailures: number
  circuitState: 'closed' | 'open'
  technicalStatus: 'not-checked' | 'reachable' | 'backoff' | 'circuit-open'
}

export type AutomatedUpdateCandidateSummary = {
  id: string
  sourceDocumentId: string
  sourceLabel: string
  sourceUrl: string
  state: 'open' | 'reviewing' | 'converted-to-draft' | 'no-material-change' | 'superseded' | 'dismissed'
  affectedFields: Array<{ contentId: string; fieldPath: string }>
  affectedFieldCount: number
  affectedFieldsTruncated: boolean
  priorPublicValues: Array<{ contentId: string; fieldPath: string; value: unknown }>
  hasTypedProposal: boolean
  adapterVersion: string
  createdAt: string
}

export type AutomationAlertSummary = {
  id: string
  type: 'repeated-failure' | 'scheduler-overdue' | 'circuit-open' | 'invariant-failure' | 'backlog-threshold'
  severity: 'warning' | 'critical'
  summary: string
  status: 'open' | 'acknowledged' | 'resolved'
  occurrenceCount: number
  firstSeenAt: string
  lastSeenAt: string
}

export type MaintenanceWorkspace = {
  readOnly: boolean
  scheduler: {
    cadence: string
    lastRunAt: string | null
    lastRunStatus: 'succeeded' | 'partial' | 'failed' | null
    nextDueAt: string | null
    dueJobCount: number
    dueSourceCount: number
    openAlertCount: number
  }
  jobs: MaintenanceJobSummary[]
  recentRuns: Array<{
    id: string
    trigger: 'cron' | 'operator-run-now' | 'local-test'
    status: 'succeeded' | 'partial' | 'failed'
    startedAt: string
    completedAt: string | null
    jobsClaimed: number
    actionsApplied: number
    failedTasks: number
    outboundSubrequests: number
    fetchedBytes: number
  }>
  monitors: ApprovedSourceMonitorSummary[]
  availableSources: Array<{ id: string; label: string; url: string }>
  candidates: AutomatedUpdateCandidateSummary[]
  alerts: AutomationAlertSummary[]
  pagination: {
    monitors: string | null
    availableSources: string | null
    candidates: string | null
    alerts: string | null
  }
}

export function isRecordKind(value: unknown): value is RecordKind {
  return typeof value === 'string' && recordKinds.includes(value as RecordKind)
}

export function isPublicationStatus(value: unknown): value is PublicationStatus {
  return value === 'draft' || value === 'published' || value === 'archived'
}
