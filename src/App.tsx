import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type FormEvent,
  type ReactNode,
} from 'react'
import type {
  AdvancementDetails,
  AdvancementSubtype,
  ContentRecord,
  DirectorySubmissionDetail,
  DirectorySubmissionState,
  DirectorySubmissionSummary,
  EventConflict,
  EventConflictAssertion,
  EventDetails,
  EventLifecycleStatus,
  FreshnessItemType,
  MaintenanceWorkspace,
  OperatorSession,
  OperatorSnapshot,
  OrganizationDetails,
  OutpostDetails,
  PageDetails,
  PublicationStatus,
  PublicBootstrap,
  RecordDetails,
  RecordKind,
  SourceRecord,
  StagedOutpostCandidate,
} from '../shared/domain'
import { maintenanceJobPolicy, sourceMonitorPolicy } from '../shared/maintenance-policy'
import {
  advancementSubtypes,
  eventCategories,
  eventCostStatuses,
  eventLifecycleStatuses,
  eventLocationStatuses,
  eventRegistrationStatuses,
  eventScopes,
  programGroups,
  type HandbookFormat,
  type MeritCategory,
  type MeritColor,
  type ProgramGroup,
} from '../shared/domain'
import {
  advancementDetails,
  advancementRecordLabel,
  advancementSubtypeLabels,
  changeAdvancementSubtype,
  defaultAdvancementDetails,
  isAdvancementRecord,
  meritCategories,
  meritColors,
  recordLabel,
  sortAdvancementRecords,
} from '../shared/advancement'
import {
  defaultEventDetails,
  displayedEventLifecycle,
  eventDetails,
  formatEventDateRange,
  formatEventLocalDate,
  isHomeUpcomingEvent,
  type EventFilters,
  type EventView,
} from '../shared/events'
import { AddOutpostPage } from './AddOutpostPage'
import { AccountPages } from './account/AccountPages'
import { jurisdictions } from './data/jurisdictions'
import { listInternationalCountries } from '../shared/countries'
import {
  fetchMoreOperatorRecords,
  fetchMaintenanceWorkspace,
  fetchOperatorRecord,
  fetchOperatorSession,
  fetchOperatorSnapshot,
  fetchOperatorSubmission,
  fetchOperatorSubmissions,
  fetchStagedOutpostCandidates,
  fetchPublicBootstrap,
  fetchOrdinarySession,
  fetchRecordPage,
  runOperatorAction,
  runOperatorAccountAction,
  saveOperatorRecord,
  searchOperatorOutposts,
  signOutOrdinaryAccount,
} from './data/client'
import { captureInitialTransferToken } from './lib/transfer-fragment'
import {
  fcfLabel,
  filterRecords,
  outpostMapUrl,
  outpostDetails,
  type FcfFilter,
} from './lib/records'
import { preparePublicPreview } from './lib/preview'
import { preferredScrollBehavior } from './lib/motion'
import './App.css'

type Route =
  | '/'
  | '/search'
  | '/outposts'
  | '/add-your-outpost'
  | '/advancement'
  | '/events'
  | '/about'
  | '/other'
  | '/help'
  | '/operator'
  | '/signup'
  | '/sign-in'
  | '/forgot-password'
  | '/reset-password'
  | '/account'

const supportedDirectoryCountries = [
  { code: 'US', name: 'United States' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'DE', name: 'Germany' },
  { code: 'GB', name: 'United Kingdom' },
]

function formatAffiliations(value: OutpostDetails['affiliations']) {
  return (value ?? []).map((item) => `${item.label} | ${item.name} | ${item.scope}`).join('\n')
}

function parseAffiliations(value: string): NonNullable<OutpostDetails['affiliations']> {
  return value.split('\n').map((line) => line.split('|').map((part) => part.trim()))
    .filter((parts) => parts.length === 3 && parts[0] && parts[1] && ['ministry', 'language', 'fcf'].includes(parts[2]))
    .map(([label, name, scope]) => ({ label, name, scope: scope as 'ministry' | 'language' | 'fcf' }))
}

const navItems: Array<{ href: Route; label: string }> = [
  { href: '/outposts', label: 'Find an Outpost' },
  { href: '/add-your-outpost', label: 'Add Your Outpost' },
  { href: '/advancement', label: 'Advancement' },
  { href: '/events', label: 'Events' },
  { href: '/about', label: 'About Royal Rangers' },
  { href: '/other', label: 'Other' },
  { href: '/help', label: 'Help & Sources' },
]

const kindLabels: Record<RecordKind, string> = {
  outpost: 'Outpost',
  event: 'Event',
  advancement: 'Advancement',
  organization: 'Organization',
  page: 'Information page',
}

const routeTitles: Record<Route, string> = {
  '/': 'Home',
  '/search': 'Search',
  '/outposts': 'Find an Outpost',
  '/add-your-outpost': 'Add Your Outpost',
  '/advancement': 'Advancement Library',
  '/events': 'Reference Calendar',
  '/about': 'About Royal Rangers',
  '/other': 'Other Resources',
  '/help': 'Help & Sources',
  '/operator': 'Operator Console',
  '/signup': 'Create an Account',
  '/sign-in': 'Sign In',
  '/forgot-password': 'Reset Password',
  '/reset-password': 'Choose a New Password',
  '/account': 'Account',
}

const navigationEventName = 'ranger-outpost:navigate'
const locationChangeEventName = 'ranger-outpost:locationchange'

function useCursorRecords(path: string, params: URLSearchParams, enabled = true) {
  const queryKey = params.toString()
  const [records, setRecords] = useState<ContentRecord[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    let active = true
    if (!enabled) {
      setRecords([])
      setNextCursor(null)
      setLoading(false)
      setErrorMessage('')
      return () => { active = false }
    }
    setLoading(true)
    setErrorMessage('')
    fetchRecordPage(path, new URLSearchParams(queryKey)).then(({ data }) => {
      if (!active) return
      setRecords(data.records)
      setNextCursor(data.nextCursor)
    }).catch((error: unknown) => {
      if (active) setErrorMessage(error instanceof Error ? error.message : 'The records could not be loaded.')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [enabled, path, queryKey])

  const loadMore = async () => {
    if (!nextCursor || loading) return
    setLoading(true)
    setErrorMessage('')
    try {
      const { data } = await fetchRecordPage(path, new URLSearchParams(queryKey), nextCursor)
      setRecords((current) => [...current, ...data.records])
      setNextCursor(data.nextCursor)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'More records could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  return { records, nextCursor, loading, errorMessage, loadMore }
}

function navigationAllowed() {
  return window.dispatchEvent(new Event(navigationEventName, { cancelable: true }))
}

function navigateTo(to: string) {
  if (!navigationAllowed()) return false
  window.history.pushState({}, '', to)
  window.dispatchEvent(new Event(locationChangeEventName))
  window.scrollTo({ top: 0, behavior: preferredScrollBehavior() })
  return true
}

function useRoute() {
  const [location, setLocation] = useState(() => `${window.location.pathname}${window.location.search}`)
  const locationRef = useRef(location)

  useEffect(() => { locationRef.current = location }, [location])

  useEffect(() => {
    const onPopState = () => {
      const nextLocation = `${window.location.pathname}${window.location.search}`
      if (navigationAllowed()) setLocation(nextLocation)
      else window.history.pushState({}, '', locationRef.current)
    }
    const onLocationChange = () => setLocation(`${window.location.pathname}${window.location.search}`)
    window.addEventListener('popstate', onPopState)
    window.addEventListener(locationChangeEventName, onLocationChange)
    return () => {
      window.removeEventListener('popstate', onPopState)
      window.removeEventListener(locationChangeEventName, onLocationChange)
    }
  }, [])

  const navigate = (to: string) => {
    navigateTo(to)
  }

  const parsed = new URL(location, window.location.origin)
  const knownRoute = [
    '/',
    '/search',
    '/outposts',
    '/add-your-outpost',
    '/advancement',
    '/events',
    '/about',
    '/other',
    '/help',
    '/operator',
    '/signup',
    '/sign-in',
    '/forgot-password',
    '/reset-password',
    '/account',
  ].includes(parsed.pathname)
    ? (parsed.pathname as Route)
    : '/'
  return { route: knownRoute, search: parsed.searchParams, navigate, location }
}

type AppLinkProps = Omit<ComponentPropsWithoutRef<'a'>, 'href'> & { href: string }

function AppLink({ href, children, onClick: providedOnClick, ...anchorProps }: AppLinkProps) {
  const onClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      providedOnClick?.(event)
      return
    }
    providedOnClick?.(event)
    if (event.defaultPrevented) return
    event.preventDefault()
    navigateTo(href)
  }
  return (
    <a href={href} onClick={onClick} {...anchorProps}>
      {children}
    </a>
  )
}

function VerifiedBadge({ date }: { date: string | null }) {
  const label = date
    ? new Intl.DateTimeFormat('en-US', { dateStyle: 'short', timeZone: 'UTC' }).format(new Date(date))
    : null
  return (
    <span className={date ? 'verified-badge' : 'verified-badge unverified'} title="Independent Ranger Outpost Hub verification, not official charter approval">
      <span aria-hidden="true">{date ? '✓' : '?'}</span>
      {label ? `Verified ${label}` : 'Not verified'}
    </span>
  )
}

function SourceLinks({ sources }: { sources: SourceRecord[] }) {
  const uniqueSources = sources.filter((source, index) =>
    sources.findIndex((candidate) => candidate.label === source.label && candidate.url === source.url) === index,
  )
  return (
    <div className="source-links">
      {uniqueSources.map((source) => (
        <a key={source.id} href={source.url} target="_blank" rel="noreferrer">
          {source.label} <span aria-hidden="true">↗</span>
        </a>
      ))}
    </div>
  )
}

function Shell({
  route,
  location,
  children,
  searchQuery,
  setSearchQuery,
  onSearch,
  routeAnnouncement,
}: {
  route: Route
  location: string
  children: ReactNode
  searchQuery: string
  setSearchQuery: (value: string) => void
  onSearch: (event: FormEvent) => void
  routeAnnouncement: string
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [ordinarySession, setOrdinarySession] = useState<{ authenticated: boolean; displayName?: string }>({ authenticated: false })
  useEffect(() => setMenuOpen(false), [location])
  useEffect(() => {
    let active = true
    const refresh = () => {
      fetchOrdinarySession()
        .then(({ data }) => { if (active) setOrdinarySession(data) })
        .catch(() => { if (active) setOrdinarySession({ authenticated: false }) })
    }
    refresh()
    window.addEventListener('ranger-outpost:sessionchange', refresh)
    return () => { active = false; window.removeEventListener('ranger-outpost:sessionchange', refresh) }
  }, [location])
  const signOut = async () => {
    try { await signOutOrdinaryAccount() } finally {
      setOrdinarySession({ authenticated: false })
      navigateTo('/sign-in')
    }
  }
  return (
    <>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="site-header">
        <div className="header-main wrap">
          <AppLink href="/" className="brand" aria-label="Ranger Outpost Hub home">
            <span className="brand-mark" aria-hidden="true"><i /></span>
            <span>
              <strong>Ranger</strong>
              <small>Outpost Hub</small>
            </span>
          </AppLink>
          <form className="global-search" role="search" onSubmit={onSearch}>
            <label className="sr-only" htmlFor="global-search">Search the hub</label>
            <span aria-hidden="true">⌕</span>
            <input
              id="global-search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search outposts, merits, events…"
            />
            <button type="submit">Search</button>
          </form>
          <div className="account-header-actions">
            {ordinarySession.authenticated ? <>
              <AppLink href="/account">Account{ordinarySession.displayName ? ` · ${ordinarySession.displayName}` : ''}</AppLink>
              <button className="link-button" type="button" onClick={() => void signOut()}>Sign out</button>
            </> : <AppLink href="/sign-in">Sign in</AppLink>}
          </div>
          <button
            className="menu-button"
            type="button"
            aria-expanded={menuOpen}
            aria-controls="primary-navigation"
            onClick={() => setMenuOpen((open) => !open)}
          >
            Menu
          </button>
        </div>
        <nav id="primary-navigation" className={menuOpen ? 'primary-nav open' : 'primary-nav'} aria-label="Primary">
          <div className="wrap">
            {navItems.map((item) => (
              <AppLink
                key={item.href}
                href={item.href}
                className={route === item.href ? 'active' : undefined}
                aria-current={route === item.href ? 'page' : undefined}
                onClick={() => setMenuOpen(false)}
              >
                {item.label}
              </AppLink>
            ))}
          </div>
        </nav>
      </header>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{routeAnnouncement}</p>
      <main id="main-content" tabIndex={-1}>{children}</main>
      <footer className="site-footer">
        <div className="wrap footer-grid">
          <div>
            <div className="footer-brand">Ranger Outpost Hub</div>
            <p>An independent directory and learning hub for the Royal Rangers community.</p>
          </div>
          <div>
            <strong>Explore</strong>
            <AppLink href="/outposts">Find an Outpost</AppLink>
            <AppLink href="/add-your-outpost">Add Your Outpost</AppLink>
            <AppLink href="/advancement">Advancement</AppLink>
            <AppLink href="/events">Events</AppLink>
          </div>
          <div>
            <strong>About</strong>
            <AppLink href="/about">About Royal Rangers</AppLink>
            <AppLink href="/help">Help & Sources</AppLink>
            <AppLink href="/operator">Operator</AppLink>
          </div>
        </div>
        <p className="independent-note wrap">
          Independent site · Not an official Royal Rangers or Assemblies of God platform · Confirm details with the source.
        </p>
      </footer>
    </>
  )
}

function PageIntro({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section className="page-intro">
      <div className="wrap narrow">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{children}</p>
      </div>
    </section>
  )
}

function HomePage({ records, outpostCount }: { records: ContentRecord[]; outpostCount: number }) {
  const today = new Date().toISOString().slice(0, 10)
  const events = records
    .filter((record) => isHomeUpcomingEvent(record, today))
    .sort((a, b) => eventDetails(a).startDate.localeCompare(eventDetails(b).startDate))
    .slice(0, 3)
  const programs = sortAdvancementRecords(records).filter((record) => record.details.subtype === 'program-group')
  return (
    <>
      <section className="hero">
        <div className="wrap hero-grid">
          <div>
            <p className="eyebrow light">An independent Royal Rangers resource</p>
            <h1>Find your outpost.<br />Keep moving forward.</h1>
            <p className="hero-copy">
              Verified U.S. outpost information, advancement roadmaps, and events—together in one simple place.
            </p>
            <div className="hero-actions">
              <AppLink href="/outposts" className="button primary">Find an outpost</AppLink>
              <AppLink href="/advancement" className="button ghost">Explore advancement</AppLink>
            </div>
            <p className="hero-proof"><span aria-hidden="true">✓</span> Every published record is tied to a visible source.</p>
          </div>
          <div className="compass-card" role="img" aria-label="Explore, learn, lead and serve">
            <div className="compass-ring">
              <span className="north">Explore</span>
              <span className="east">Learn</span>
              <span className="south">Serve</span>
              <span className="west">Lead</span>
              <div className="compass-needle"><i /></div>
            </div>
          </div>
        </div>
      </section>

      <section className="quick-section wrap" aria-labelledby="quick-heading">
        <div className="section-heading center">
          <p className="eyebrow">Start here</p>
          <h2 id="quick-heading">What do you need today?</h2>
        </div>
        <div className="quick-grid">
          <AppLink href="/outposts" className="quick-card">
            <span className="quick-icon">⌖</span><h3>Find an Outpost</h3>
            <p>Browse verified groups by state, territory, district, region, or number.</p>
            <strong>{outpostCount} verified outposts →</strong>
          </AppLink>
          <AppLink href="/advancement" className="quick-card">
            <span className="quick-icon">◇</span><h3>Advancement Library</h3>
            <p>Start with the four age groups, the GMA, and the Trail of the Saber.</p>
            <strong>View the roadmap →</strong>
          </AppLink>
          <AppLink href="/events" className="quick-card">
            <span className="quick-icon">▦</span><h3>Upcoming Events</h3>
            <p>Explore verified national, district, and FCF occurrences in the public Reference Calendar.</p>
            <strong>Open the calendar →</strong>
          </AppLink>
        </div>
      </section>

      <section className="program-section">
        <div className="wrap">
          <div className="section-heading split">
            <div><p className="eyebrow">Advancement by age</p><h2>One path for every Ranger</h2></div>
            <AppLink href="/advancement">See all advancement resources →</AppLink>
          </div>
          <div className="program-grid">
            {programs.map((record) => {
              const details = advancementDetails(record)
              if (details.subtype !== 'program-group') return null
              return (
                <article key={record.id} className="program-card" style={{ '--program': details.accent } as React.CSSProperties}>
                  <span>{details.gradeRange}</span>
                  <h3><AppLink href={`/advancement?group=${encodeURIComponent(details.programGroups[0])}`}>{record.title}</AppLink></h3>
                  <p>{record.summary}</p>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      <section className="events-preview wrap">
        <div className="section-heading split">
          <div><p className="eyebrow">On the calendar</p><h2>Upcoming verified events</h2></div>
          <AppLink href="/events">View all events →</AppLink>
        </div>
        <div className="event-list compact">
          {events.map((record) => <EventCard key={record.id} record={record} />)}
        </div>
      </section>
    </>
  )
}

function OutpostCard({ record }: { record: ContentRecord }) {
  const details = outpostDetails(record)
  const mapUrl = outpostMapUrl(record)
  const relevantSources = record.sources.filter((source) => {
    const fieldValue = details[source.fieldName as keyof OutpostDetails]
    return Array.isArray(fieldValue) ? fieldValue.length > 0 : fieldValue !== null && fieldValue !== ''
  })
  const number = [details.outpostNumber, details.campusSuffix].filter(Boolean).join('')
  return (
    <article className="outpost-card">
      <div className="card-topline">
        <span className="record-type">Outpost {number || 'number not verified'} · Hub ID {details.hubOutpostId || record.id}</span>
        <VerifiedBadge date={record.verifiedAt} />
      </div>
      <h2>{details.church}</h2>
      <p className="location">
        {details.streetAddress && <>{details.streetAddress}<br /></>}
        {[details.city, details.jurisdiction !== details.countryName ? details.jurisdiction : null, details.postalCode].filter(Boolean).join(', ')}
        {details.countryCode !== 'US' && <><br />{details.countryName}</>}
      </p>
      {(details.countryCode ?? 'US') === 'US' ? <dl className="facts">
        <div><dt>District</dt><dd>{details.district || 'Not verified'}</dd></div>
        <div><dt>Region</dt><dd>{details.region || 'Not verified'}</dd></div>
        <div><dt>Language overlay</dt><dd>{details.languageOverlay || 'Not verified'}</dd></div>
        <div><dt>FCF territory</dt><dd>{details.fcfTerritory || 'Not verified'}</dd></div>
        <div><dt>FCF activity</dt><dd>{fcfLabel(details.activeFcf)}</dd></div>
      </dl> : (details.affiliations?.length ?? 0) > 0 && <dl className="facts">{details.affiliations?.map((item) => <div key={`${item.scope}:${item.label}:${item.name}`}><dt>{item.label}</dt><dd>{item.name}</dd></div>)}</dl>}
      {details.programs.length > 0 && (
        <div className="tags">{details.programs.map((program) => <span key={program}>{program}</span>)}</div>
      )}
      {details.meeting && <p className="meeting"><strong>Meetings:</strong> {details.meeting}</p>}
      {(mapUrl || details.contactUrl) && <div className="outpost-actions">
        {mapUrl && <a href={mapUrl} target="_blank" rel="noreferrer">Open address in Google Maps ↗</a>}
        {details.contactUrl && <a href={details.contactUrl} target="_blank" rel="noreferrer">Contact the church ↗</a>}
      </div>}
      <p className="source-heading">Sources for displayed facts</p>
      <SourceLinks sources={relevantSources} />
      <p className="verification-explanation">Independent directory verification checks current public sources annually; it is not official charter approval.</p>
    </article>
  )
}

function OutpostsPage({ coverage }: { coverage: PublicBootstrap['coverage'] }) {
  const internationalCountries = listInternationalCountries()
  const [entryPath, setEntryPath] = useState<'usa' | 'international'>('usa')
  const [country, setCountry] = useState('')
  const [query, setQuery] = useState('')
  const [jurisdiction, setJurisdiction] = useState('')
  const [affiliation, setAffiliation] = useState('')
  const [program, setProgram] = useState('')
  const [fcf, setFcf] = useState<FcfFilter>('')
  const params = useMemo(() => {
    const next = new URLSearchParams({ limit: '20' })
    if (query.trim()) next.set('q', query.trim())
    if (entryPath === 'usa') next.set('country', 'US')
    if (entryPath === 'international' && country) next.set('country', country)
    if (jurisdiction && entryPath === 'usa') next.set('civil', jurisdiction)
    if (affiliation.trim()) next.set('organization', affiliation.trim())
    if (program) next.set('program', program)
    if (fcf) next.set('fcf', fcf)
    return next
  }, [affiliation, country, entryPath, fcf, jurisdiction, program, query])
  const page = useCursorRecords('/api/public/outposts', params, entryPath === 'usa' || Boolean(country))
  const selectedPlace = jurisdictions.find((place) => place.name === jurisdiction)
  const selectedCoverage = coverage.jurisdictions.find((place) => place.name === jurisdiction)?.verifiedListingCount ?? 0
  const activeFilters = [
    query && `Text: ${query}`,
    jurisdiction,
    affiliation,
    program,
    fcf && `FCF activity: ${fcf === 'not-verified' ? 'Not verified' : fcf === 'yes' ? 'Yes' : 'No'}`,
  ].filter(Boolean) as string[]
  const reset = () => { setQuery(''); setJurisdiction(''); setAffiliation(''); setProgram(''); setFcf('') }
  return (
    <>
      <PageIntro eyebrow={entryPath === 'usa' ? 'U.S. directory' : 'International directory'} title="Find an Outpost">
        This independent directory contains only Operator-verified public facts and is not an official charter system. International coverage is a tiny model-proof fixture; broad population belongs to Slice 15.
      </PageIntro>
      {entryPath === 'usa' && <section className="wrap coverage-summary" aria-labelledby="coverage-heading">
        <div className="section-heading split"><div><p className="eyebrow">Transparent coverage</p><h2 id="coverage-heading">Verified listings by region</h2></div><p>Counts come only from current, publicly eligible listings. No expected totals are invented.</p></div>
        <div className="coverage-counts">{coverage.regions.map((region) => <div key={region.name}><strong>{region.verifiedListingCount}</strong><span>{region.name}</span></div>)}</div>
        <details><summary>Show every state and territory count</summary><div className="jurisdiction-counts">{coverage.jurisdictions.map((place) => <span key={place.code}><strong>{place.verifiedListingCount}</strong> {place.name}</span>)}</div></details>
      </section>}
      <section className="wrap directory-layout">
        <aside className="filter-panel" aria-label="Directory filters">
          <h2>Filter outposts</h2>
          <fieldset><legend>Directory path</legend><label><input type="radio" name="directory-path" checked={entryPath === 'usa'} onChange={() => { setEntryPath('usa'); setCountry(''); setJurisdiction('') }} /> USA</label><label><input type="radio" name="directory-path" checked={entryPath === 'international'} onChange={() => { setEntryPath('international'); setJurisdiction('') }} /> International</label></fieldset>
          {entryPath === 'international' && <><label htmlFor="country">Country or territory</label><select id="country" value={country} onChange={(event) => setCountry(event.target.value)}><option value="">Choose a country</option>{internationalCountries.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></>}
          <label htmlFor="outpost-query">Name, city, or number</label>
          <input id="outpost-query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try Greenville or 70" />
          {entryPath === 'usa' && <><label htmlFor="jurisdiction">State or U.S. territory</label>
          <select id="jurisdiction" value={jurisdiction} onChange={(event) => setJurisdiction(event.target.value)}>
            <option value="">All jurisdictions</option>
            <optgroup label="States and District of Columbia">
              {jurisdictions.filter((place) => place.type !== 'territory').map((place) => (
                <option key={place.abbreviation} value={place.name}>{place.name}</option>
              ))}
            </optgroup>
            <optgroup label="Populated U.S. territories">
              {jurisdictions.filter((place) => place.type === 'territory').map((place) => (
                <option key={place.abbreviation} value={place.name}>{place.name}</option>
              ))}
            </optgroup>
          </select></>}
          <label htmlFor="affiliation">District, region, language overlay, or FCF territory</label>
          <input id="affiliation" value={affiliation} onChange={(event) => setAffiliation(event.target.value)} placeholder="Exact organization name" />
          <label htmlFor="program">Program Group</label>
          <select id="program" value={program} onChange={(event) => setProgram(event.target.value)}>
            <option value="">All Program Groups</option>
            {programGroups.map((value) => <option key={value}>{value}</option>)}
          </select>
          <label htmlFor="fcf-activity">FCF Activity Status</label>
          <select id="fcf-activity" value={fcf} onChange={(event) => setFcf(event.target.value as FcfFilter)}>
            <option value="">All FCF statuses</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
            <option value="not-verified">Not verified</option>
          </select>
          {selectedPlace && (
            <div className="region-note">
              <strong>{selectedCoverage > 0 ? `${selectedCoverage} verified listing${selectedCoverage === 1 ? '' : 's'}` : 'No verified listings yet'}</strong>
              <span>{selectedPlace.region ?? 'Royal Rangers USA regional assignment not verified'}</span>
              <span>{selectedPlace.fcfTerritory ?? 'FCF territory not verified'}</span>
            </div>
          )}
          <button className="text-button" type="button" onClick={reset} disabled={activeFilters.length === 0}>Reset filters</button>
        </aside>
        <div>
          <div className="results-heading">
            <div><p className="eyebrow">Verified records</p><h2 aria-live="polite">Showing {page.records.length} outpost{page.records.length === 1 ? '' : 's'}</h2></div>
            <p>Results are loaded in bounded pages</p>
          </div>
          {activeFilters.length > 0 && <div className="active-filters" aria-label="Active filters">
            <strong>Active filters:</strong>
            {activeFilters.map((filter) => <span key={filter}>{filter}</span>)}
            <button type="button" onClick={reset}>Reset all</button>
          </div>}
          <div className="directory-cta">
            <div><strong>Is your outpost missing?</strong><span>Send public facts for the Operator to verify.</span></div>
            <AppLink className="button primary" href="/add-your-outpost">Add Your Outpost</AppLink>
          </div>
          {page.errorMessage && <p className="form-error" role="alert">{page.errorMessage}</p>}
          {entryPath === 'international' && !country ? <div className="empty-state"><span aria-hidden="true">⌖</span><h2>Choose a country</h2><p>International records are always country-scoped; no global bare-number directory is shown.</p></div> : page.records.length > 0 ? (
            <><div className="outpost-list">{page.records.map((record) => <OutpostCard key={record.id} record={record} />)}</div>
            {page.nextCursor && <button className="button secondary" type="button" onClick={page.loadMore} disabled={page.loading}>{page.loading ? 'Loading…' : 'Load more outposts'}</button>}</>
          ) : (
            !page.loading && <div className="empty-state"><span aria-hidden="true">⌖</span><h2>{jurisdiction && selectedCoverage === 0 ? 'No verified listings yet' : 'No matching verified record yet'}</h2><p>This directory has incomplete coverage. Zero results do not mean that no outpost exists. Reset a filter, propose an addition, or use the official outpost locator.</p><div><button className="text-button" type="button" onClick={reset}>Reset filters</button> · <AppLink href="/add-your-outpost">Add Your Outpost</AppLink> · <a href="https://royalrangers.com/locator" target="_blank" rel="noreferrer">Official locator ↗</a></div></div>
          )}
          {page.loading && page.records.length === 0 && <p role="status">Loading outposts…</p>}
        </div>
      </section>
    </>
  )
}

function AdvancementCard({ record, records }: { record: ContentRecord; records: ContentRecord[] }) {
  if (!isAdvancementRecord(record)) return null
  const details = record.details
  const relatedTitles = new Map(records.map((candidate) => [candidate.id, candidate.title]))
  return (
    <article className="library-card">
      <div className="card-topline">
        <span className="record-type">{advancementRecordLabel(record)}</span>
        <VerifiedBadge date={record.verifiedAt} />
      </div>
      <h3>{record.title}</h3>
      <p>{record.summary}</p>
      <div className="tags">
        {details.programGroups.map((group) => <span key={group}>{group}</span>)}
        {details.audiences.map((audience) => <span key={audience}>{audience}</span>)}
        {details.gradeRange && <span>Grades {details.gradeRange}</span>}
        <span>{details.contentStatus === 'not-verified' ? 'Status not verified' : details.contentStatus}</span>
        {details.subtype === 'merit' && <span>{details.meritCategory} merit</span>}
        {details.subtype === 'merit' && details.colors.map((color) => <span key={color}>{color.replace('-', ' ')}</span>)}
      </div>
      {details.subtype === 'program-group' && details.highlights.length > 0 && (
        <ul>{details.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}</ul>
      )}
      {details.subtype === 'handbook' && (
        <dl className="library-facts">
          <div><dt>Publisher</dt><dd>{details.publisher ?? 'Not verified'}</dd></div>
          <div><dt>Item/catalog no.</dt><dd>{details.itemNumber ?? 'Not verified'}</dd></div>
          <div><dt>Edition/revision/year</dt><dd>{[details.edition, details.revision, details.publicationYear].filter(Boolean).join(' · ') || 'Not verified'}</dd></div>
          <div><dt>Formats</dt><dd>{details.formats.length > 0 ? details.formats.map((format) => format === 'ebook' ? 'E-book' : 'Print').join(', ') : 'Not verified'}</dd></div>
          <div><dt>Publisher listing</dt><dd>{details.availability === 'available' ? 'Current listing (stock not tracked)' : details.availability === 'not-verified' ? 'Not verified' : 'Unavailable'}</dd></div>
        </dl>
      )}
      {details.references.length > 0 && (
        <div className="relationships">
          <strong>Related advancement</strong>
          <ul>{details.references.map((reference) => (
            <li key={`${reference.targetId}-${reference.relationship}`}>
              {reference.relationship}: {relatedTitles.get(reference.targetId) ?? reference.targetId} ({advancementSubtypeLabels[reference.targetSubtype]})
            </li>
          ))}</ul>
        </div>
      )}
      <div className="library-actions">
        <a href={details.officialUrl} target="_blank" rel="noreferrer">Open official information ↗</a>
        {details.subtype === 'handbook' && details.purchaseUrls.map((link) => (
          <a key={`${link.format}-${link.url}`} href={link.url} target="_blank" rel="noreferrer">{link.label} ↗</a>
        ))}
      </div>
      <p className="source-heading">Official provenance</p>
      <SourceLinks sources={record.sources} />
    </article>
  )
}

function AdvancementPage({ navigation, initialGroup }: { navigation: ContentRecord[]; initialGroup: '' | ProgramGroup }) {
  const programs = sortAdvancementRecords(navigation.filter(isAdvancementRecord)).filter((record) => record.details.subtype === 'program-group')
  const [query, setQuery] = useState('')
  const [programGroup, setProgramGroup] = useState<'' | ProgramGroup>(initialGroup)
  const [subtype, setSubtype] = useState<'' | AdvancementSubtype>('')
  const [meritCategory, setMeritCategory] = useState<'' | MeritCategory>('')
  const [color, setColor] = useState<'' | MeritColor>('')

  useEffect(() => setProgramGroup(initialGroup), [initialGroup])

  const params = useMemo(() => {
    const next = new URLSearchParams({ limit: '20' })
    if (query.trim()) next.set('q', query.trim())
    if (programGroup) next.set('program', programGroup)
    if (subtype) next.set('subtype', subtype)
    if (meritCategory) next.set('category', meritCategory)
    if (color) next.set('color', color)
    return next
  }, [color, meritCategory, programGroup, query, subtype])
  const page = useCursorRecords('/api/public/advancement', params)
  const filtered = page.records.filter(isAdvancementRecord)
    .filter((record) => !programGroup || record.details.subtype !== 'program-group')
  const activeFilters = [
    query && `Text: ${query}`,
    programGroup,
    subtype && advancementSubtypeLabels[subtype],
    meritCategory && `${meritCategory} merits`,
    color && `${color.replace('-', ' ')} color`,
  ].filter(Boolean) as string[]
  const reset = () => {
    setQuery('')
    setProgramGroup('')
    setSubtype('')
    setMeritCategory('')
    setColor('')
  }

  return (
    <>
      <PageIntro eyebrow="Advancement library" title="Advancement and handbook library">
        Search independently written summaries and verified public metadata, then use the official source and your leaders for definitive current requirements.
      </PageIntro>
      <section className="program-entry-section wrap" aria-labelledby="program-entry-heading">
        <div className="section-heading split">
          <div><p className="eyebrow">Start by Program Group</p><h2 id="program-entry-heading">Four grade-ordered entry points</h2></div>
          <p>Ranger Kids uses achievement trails; the older groups use merit-based advancement.</p>
        </div>
        <div className="program-grid">
          {programs.map((record) => {
            if (record.details.subtype !== 'program-group') return null
            const group = record.details.programGroups[0]
            return (
              <article key={record.id} className={programGroup === group ? 'program-card selected' : 'program-card'} style={{ '--program': record.details.accent } as React.CSSProperties}>
                <span>Grades {record.details.gradeRange}</span>
                <h3><AppLink href={`/advancement?group=${encodeURIComponent(group)}`}>{record.title}</AppLink></h3>
                <p>{record.summary}</p>
                <AppLink href={`/advancement?group=${encodeURIComponent(group)}`}>Open focused library →</AppLink>
              </article>
            )
          })}
        </div>
      </section>
      <section className="wrap library-layout">
        <aside className="filter-panel" aria-label="Advancement library filters">
          <h2>Filter library</h2>
          <label htmlFor="advancement-query">Title or summary</label>
          <input id="advancement-query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try camping or handbook" />
          <label htmlFor="advancement-group">Program Group</label>
          <select id="advancement-group" value={programGroup} onChange={(event) => setProgramGroup(event.target.value as '' | ProgramGroup)}>
            <option value="">All Program Groups</option>
            {programGroups.map((group) => <option key={group}>{group}</option>)}
          </select>
          <label htmlFor="advancement-subtype">Result type</label>
          <select id="advancement-subtype" value={subtype} onChange={(event) => setSubtype(event.target.value as '' | AdvancementSubtype)}>
            <option value="">All result types</option>
            {advancementSubtypes.map((value) => <option key={value} value={value}>{advancementSubtypeLabels[value]}</option>)}
          </select>
          <label htmlFor="merit-category">Merit category/type</label>
          <select id="merit-category" value={meritCategory} onChange={(event) => setMeritCategory(event.target.value as '' | MeritCategory)}>
            <option value="">All merit categories</option>
            {meritCategories.map((category) => <option key={category}>{category}</option>)}
          </select>
          <label htmlFor="merit-color">Verified merit color</label>
          <select id="merit-color" value={color} onChange={(event) => setColor(event.target.value as '' | MeritColor)}>
            <option value="">All verified colors</option>
            {meritColors.map((value) => <option key={value} value={value}>{value.replace('-', ' ')}</option>)}
          </select>
          <button className="text-button" type="button" onClick={reset} disabled={activeFilters.length === 0}>Reset filters</button>
        </aside>
        <div>
          <div className="results-heading">
            <div><p className="eyebrow">Source-backed records</p><h2 aria-live="polite">{filtered.length} result{filtered.length === 1 ? '' : 's'}</h2></div>
            <p>Results are loaded in bounded pages</p>
          </div>
          {activeFilters.length > 0 && <div className="active-filters" aria-label="Active filters">
            <strong>Active filters:</strong>
            {activeFilters.map((filter) => <span key={filter}>{filter}</span>)}
            <button type="button" onClick={reset}>Reset all</button>
          </div>}
          <aside className="rights-note">
            <strong>Requirements stay official</strong>
            <p>This library does not determine whether a Ranger earned an award and does not save progress. Check current official materials and work with your leaders; handbooks are listings only, never hosted copies.</p>
          </aside>
          {page.errorMessage && <p className="form-error" role="alert">{page.errorMessage}</p>}
          {filtered.length > 0 ? (
            <><div className="library-results">{filtered.map((record) => <AdvancementCard key={record.id} record={record} records={[...navigation, ...page.records]} />)}</div>
            {page.nextCursor && <button className="button secondary" type="button" onClick={page.loadMore} disabled={page.loading}>{page.loading ? 'Loading…' : 'Load more advancement records'}</button>}</>
          ) : (
            !page.loading && <div className="empty-state"><span aria-hidden="true">◇</span><h2>No advancement records match</h2><p>Try a broader Program Group, result type, merit category, or color. The beta is representative and may not include the title you searched for.</p><button className="text-button" type="button" onClick={reset}>Reset filters</button></div>
          )}
          {page.loading && page.records.length === 0 && <p role="status">Loading advancement records…</p>}
        </div>
      </section>
    </>
  )
}

function EventCard({ record }: { record: ContentRecord }) {
  const details = eventDetails(record)
  const [month, day] = formatEventLocalDate(details.startDate, false).split(' ')
  const lifecycle = displayedEventLifecycle(details, new Date().toISOString().slice(0, 10))
  const locationLabels = {
    announced: details.location,
    'to-be-announced': 'Location to be announced',
    online: 'Online event',
    withheld: 'Location withheld by organizer',
    'not-verified': 'Location not verified',
  }
  const registrationLabels = {
    'not-verified': 'Not verified',
    'not-open': 'Not open',
    open: 'Open',
    closed: 'Closed',
    full: 'Full',
    'not-required': 'Not required',
  }
  return (
    <article className={`event-card lifecycle-${lifecycle}`} id={record.id}>
      <time dateTime={details.startDate}><strong>{month}</strong><span>{day}</span></time>
      <div>
        <div className="card-topline"><span className="record-type">{details.scope} · {details.category}</span><VerifiedBadge date={record.verifiedAt} /></div>
        <h2>{record.title}</h2>
        {details.series && <p className="event-series">Series: {details.series.name}</p>}
        <p>{record.summary}</p>
        {details.verificationWarnings && details.verificationWarnings.length > 0 && <p className="verification-warning">Details under verification: {details.verificationWarnings.join(', ')}</p>}
        <dl className="event-facts">
          <div><dt>Lifecycle</dt><dd><span className={`lifecycle-badge ${lifecycle}`}>{lifecycle.replace('-', ' ')}</span></dd></div>
          <div><dt>Host</dt><dd>{details.host}</dd></div>
          <div><dt>Schedule</dt><dd>{formatEventDateRange(details)}</dd></div>
          <div><dt>Location</dt><dd>{locationLabels[details.locationStatus]}</dd></div>
          <div><dt>Audience</dt><dd>{details.audience.length > 0 ? details.audience.join(', ') : 'Not verified'}</dd></div>
          <div><dt>Registration</dt><dd>{registrationLabels[details.registrationStatus]}{details.registrationDeadline ? ` · Deadline ${formatEventLocalDate(details.registrationDeadline)}` : ''}</dd></div>
          <div><dt>Cost</dt><dd>{details.costStatus === 'not-verified' ? 'Not verified' : details.costNote}</dd></div>
          <div><dt>Occurrence ID</dt><dd>{details.occurrenceId}</dd></div>
        </dl>
        <div className="event-actions">
          {details.registrationUrl && !['completed', 'cancelled'].includes(lifecycle) && <a href={details.registrationUrl} target="_blank" rel="noreferrer">Open organizer registration ↗</a>}
          <a href={details.officialUrl} target="_blank" rel="noreferrer">Confirm before travel, registration, or payment ↗</a>
        </div>
        <p className="source-heading">Field-relevant organizer sources</p>
        <SourceLinks sources={record.sources} />
      </div>
    </article>
  )
}

function EventsPage() {
  const [view, setView] = useState<EventView>('upcoming')
  const [filters, setFilters] = useState<EventFilters>({ query: '', category: '', scope: '', lifecycle: '', registration: '', audience: '', year: '', from: '', to: '' })
  const updateFilter = (field: keyof EventFilters, value: string) => setFilters((current) => ({ ...current, [field]: value }))
  const params = useMemo(() => {
    const next = new URLSearchParams({ limit: '20', when: view })
    for (const [name, value] of Object.entries(filters)) if (value) next.set(name === 'query' ? 'q' : name, value)
    return next
  }, [filters, view])
  const page = useCursorRecords('/api/public/events', params)
  const events = page.records
  const years = [...new Set(events.map((record) => eventDetails(record).startDate.slice(0, 4)))].sort().reverse()
  const audiences = [...new Set(events.flatMap((record) => eventDetails(record).audience))].sort()
  const activeFilters = [
    filters.query && `Text: ${filters.query}`,
    filters.category,
    filters.scope,
    filters.lifecycle && `Lifecycle: ${filters.lifecycle}`,
    filters.registration && `Registration: ${filters.registration}`,
    filters.audience && `Audience: ${filters.audience}`,
    filters.year,
    filters.from && `From ${filters.from}`,
    filters.to && `Through ${filters.to}`,
  ].filter(Boolean) as string[]
  const reset = () => setFilters({ query: '', category: '', scope: '', lifecycle: '', registration: '', audience: '', year: '', from: '', to: '' })
  return (
    <>
      <PageIntro eyebrow="Public Reference Calendar" title="Source-backed events and history">
        A representative, incomplete collection of national, district, and FCF occurrences from decentralized organizer sources.
      </PageIntro>
      <section className="wrap stacked-section events-section">
        <div className="calendar-note"><span aria-hidden="true">▦</span><div><strong>This is not an Outpost Calendar.</strong><p>Presence here does not mean any particular outpost or boy plans to attend. Sources are decentralized and this beta is not nationally complete; always confirm with the organizer.</p></div></div>
        <div className="event-tabs" role="group" aria-label="Event history view">
          <button type="button" aria-pressed={view === 'upcoming'} onClick={() => setView('upcoming')}>Upcoming</button>
          <button type="button" aria-pressed={view === 'past'} onClick={() => setView('past')}>Past and completed</button>
        </div>
        <div className="directory-layout event-calendar-layout">
          <aside className="filter-panel" aria-label="Event filters">
            <h2>Filter events</h2>
            <label htmlFor="event-query">Search</label><input id="event-query" value={filters.query} onChange={(event) => updateFilter('query', event.target.value)} placeholder="Host, location, series…" />
            <label htmlFor="event-category">Category</label><select id="event-category" value={filters.category} onChange={(event) => updateFilter('category', event.target.value)}><option value="">All categories</option>{eventCategories.map((value) => <option key={value}>{value}</option>)}</select>
            <label htmlFor="event-scope">Scope</label><select id="event-scope" value={filters.scope} onChange={(event) => updateFilter('scope', event.target.value)}><option value="">All scopes</option>{eventScopes.map((value) => <option key={value}>{value}</option>)}</select>
            <label htmlFor="event-lifecycle">Lifecycle</label><select id="event-lifecycle" value={filters.lifecycle} onChange={(event) => updateFilter('lifecycle', event.target.value)}><option value="">All lifecycle states</option>{eventLifecycleStatuses.map((value) => <option key={value}>{value}</option>)}</select>
            <label htmlFor="event-registration">Registration</label><select id="event-registration" value={filters.registration} onChange={(event) => updateFilter('registration', event.target.value)}><option value="">All registration states</option>{eventRegistrationStatuses.map((value) => <option key={value}>{value}</option>)}</select>
            <label htmlFor="event-audience">Audience</label><select id="event-audience" value={filters.audience} onChange={(event) => updateFilter('audience', event.target.value)}><option value="">All verified audiences</option>{audiences.map((value) => <option key={value}>{value}</option>)}</select>
            <label htmlFor="event-year">Year</label><select id="event-year" value={filters.year} onChange={(event) => updateFilter('year', event.target.value)}><option value="">All years</option>{years.map((value) => <option key={value}>{value}</option>)}</select>
            <label htmlFor="event-from">Starting on or after</label><input id="event-from" type="date" value={filters.from} onChange={(event) => updateFilter('from', event.target.value)} />
            <label htmlFor="event-to">Starting on or before</label><input id="event-to" type="date" value={filters.to} onChange={(event) => updateFilter('to', event.target.value)} />
            <button className="text-button" type="button" onClick={reset} disabled={activeFilters.length === 0}>Reset filters</button>
          </aside>
          <div>
            <div className="results-heading"><div><p className="eyebrow">{view === 'upcoming' ? 'Current calendar' : 'Occurrence history'}</p><h2 aria-live="polite">Showing {events.length} event{events.length === 1 ? '' : 's'}</h2></div><p>Results are loaded in bounded pages</p></div>
            {activeFilters.length > 0 && <div className="active-filters" aria-label="Active filters"><strong>Active filters:</strong>{activeFilters.map((filter) => <span key={filter}>{filter}</span>)}<button type="button" onClick={reset}>Reset all</button></div>}
            {page.errorMessage && <p className="form-error" role="alert">{page.errorMessage}</p>}
            {events.length > 0 ? <><div className="event-list">{events.map((record) => <EventCard key={record.id} record={record} />)}</div>{page.nextCursor && <button className="button secondary" type="button" onClick={page.loadMore} disabled={page.loading}>{page.loading ? 'Loading…' : 'Load more events'}</button>}</> : !page.loading && <div className="empty-state"><span aria-hidden="true">◇</span><h2>No events match</h2><p>Try another view, clear a date, or broaden the category, scope, status, or audience. The source landscape is decentralized and this beta is intentionally incomplete.</p><button className="text-button" type="button" onClick={reset}>Reset filters</button></div>}
            {page.loading && events.length === 0 && <p role="status">Loading events…</p>}
          </div>
        </div>
      </section>
    </>
  )
}

function InformationArticle({ record }: { record: ContentRecord }) {
  const details = record.details as PageDetails
  return (
    <article className="information-article">
      <div className="card-topline"><span className="record-type">Independent summary</span><VerifiedBadge date={record.verifiedAt} /></div>
      <h2>{record.title}</h2>
      {details.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
      <div className="article-links">
        {details.links.map((link) => link.url.startsWith('/')
          ? <AppLink key={link.url} href={link.url}>{link.label} →</AppLink>
          : <a key={link.url} href={link.url} target="_blank" rel="noreferrer">{link.label} ↗</a>)}
      </div>
      <SourceLinks sources={record.sources} />
    </article>
  )
}

function InformationPage({ records, section }: { records: ContentRecord[]; section: PageDetails['section'] }) {
  const matching = records.filter((record) => record.kind === 'page' && (record.details as PageDetails).section === section)
  const titles = {
    about: ['Independent introduction', 'About Royal Rangers'],
    other: ['Program essentials', 'Other Royal Rangers Resources'],
    help: ['Use the hub confidently', 'Help, Sources & Independent-Site Notice'],
  } as const
  return (
    <>
      <PageIntro eyebrow={titles[section][0]} title={titles[section][1]}>
        Clear summaries, visible sources, and a direct path back to the organization responsible for each fact.
      </PageIntro>
      <section className="wrap article-stack">{matching.map((record) => <InformationArticle key={record.id} record={record} />)}</section>
    </>
  )
}

function SearchPage({ query }: { query: string }) {
  const params = useMemo(() => new URLSearchParams({ q: query, limit: '20' }), [query])
  const page = useCursorRecords('/api/search', params)
  return (
    <>
      <PageIntro eyebrow="Search" title={query ? `Results for “${query}”` : 'Search the hub'}>
        Search across outposts, events, organizations and FCF, Program Groups, merits, awards, handbooks, and information pages.
      </PageIntro>
      <section className="wrap search-results">
        <p>Showing {page.records.length} result{page.records.length === 1 ? '' : 's'}</p>
        {page.errorMessage && <p className="form-error" role="alert">{page.errorMessage}</p>}
        {page.records.map((record) => <SearchResultCard key={record.id} record={record} />)}
        {page.nextCursor && <button className="button secondary" type="button" onClick={page.loadMore} disabled={page.loading}>{page.loading ? 'Loading…' : 'Load more results'}</button>}
        {page.loading && page.records.length === 0 && <p role="status">Searching…</p>}
      </section>
    </>
  )
}

function SearchResultCard({ record }: { record: ContentRecord }) {
  return (
    <article>
      <div className="card-topline"><span className="record-type">{recordLabel(record)}</span><VerifiedBadge date={record.verifiedAt} /></div>
      <h2>{record.title}</h2>
      <p>{record.summary}</p>
      <SourceLinks sources={record.sources} />
    </article>
  )
}

function PublicRecordPresentation({ record, records }: { record: ContentRecord; records: ContentRecord[] }) {
  if (record.kind === 'outpost') return <OutpostCard record={record} />
  if (record.kind === 'event') return <EventCard record={record} />
  if (record.kind === 'advancement') return <AdvancementCard record={record} records={records} />
  if (record.kind === 'page') return <InformationArticle record={record} />
  return <SearchResultCard record={record} />
}

function DraftPreviewDialog({
  draft,
  records,
  conflicts,
  onClose,
}: {
  draft: ContentRecord
  records: ContentRecord[]
  conflicts: EventConflict[]
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const preview = useMemo(() => preparePublicPreview(draft, conflicts), [draft, conflicts])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    dialog.showModal()
    closeRef.current?.focus()
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [])

  return (
    <dialog
      ref={dialogRef}
      className="preview-dialog"
      aria-labelledby="preview-title"
      aria-describedby="preview-description"
      onCancel={(event) => { event.preventDefault(); onClose() }}
    >
      <div className="preview-dialog-heading">
        <div>
          <p className="eyebrow">Private preview</p>
          <h2 id="preview-title">Public presentation preview</h2>
        </div>
        <button ref={closeRef} type="button" onClick={onClose}>Close preview</button>
      </div>
      <div className="private-preview-banner" role="status">
        <strong>Private preview — not published</strong>
        <span>Draft status: {draft.status}</span>
      </div>
      <p id="preview-description">
        This panel uses the public content presentation and omission rules for the current unsaved draft. It does not save, publish, or create a public URL.
      </p>
      {preview.warnings.length > 0 && (
        <div className="preview-warning" role="alert">
          <strong>Preview warnings</strong>
          <ul>{preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        </div>
      )}
      <div className="preview-presentation">
        {preview.record
          ? <PublicRecordPresentation record={preview.record} records={[...records.filter((record) => record.id !== draft.id), preview.record]} />
          : <article className="preview-placeholder"><VerifiedBadge date={draft.verifiedAt} /><h2>{draft.title || 'Untitled record'}</h2><p>{draft.summary || 'No public summary is available yet.'}</p><p>Complete the warned fields before relying on this presentation.</p></article>}
      </div>
    </dialog>
  )
}

function defaultDetails(kind: RecordKind): RecordDetails {
  if (kind === 'outpost') return {
    hubOutpostId: '', countryCode: 'US', countryName: 'United States', localUnitLabel: 'Outpost', identifierRaw: null, displayNameRaw: null, outpostNumber: null, campusSuffix: null, church: '', streetAddress: null,
    city: '', jurisdiction: '', civilSubdivisionLabel: 'State', postalCode: null, district: '', region: '', languageOverlay: '',
    fcfTerritory: '', activeFcf: null, fcfAvailability: 'available', affiliations: [], programs: [], meeting: null, contactUrl: null,
  }
  if (kind === 'event') return defaultEventDetails()
  if (kind === 'advancement') return defaultAdvancementDetails()
  if (kind === 'organization') return { organizationType: 'district', scope: 'geographic', countryCode: 'US', unitLabel: 'District', parent: null, affiliations: [], jurisdictions: [] }
  return { section: 'other', body: [], links: [] }
}

function newDraft(kind: RecordKind): ContentRecord {
  return {
    id: '', kind, slug: '', title: '', summary: '', status: 'draft', details: defaultDetails(kind),
    verifiedAt: null, publishedAt: null, updatedAt: new Date().toISOString(),
    sources: [{ id: '', fieldName: 'record', label: '', url: '', verifiedAt: new Date().toISOString() }],
  }
}

function DetailsEditor({ draft, updateDetails }: { draft: ContentRecord; updateDetails: (details: RecordDetails) => void }) {
  if (draft.kind === 'outpost') {
    const details = draft.details as OutpostDetails
    const countryChoices = supportedDirectoryCountries
    const update = (field: keyof OutpostDetails, value: OutpostDetails[keyof OutpostDetails]) => updateDetails({ ...details, [field]: value })
    return <fieldset><legend>Outpost details</legend><div className="form-grid">
      <label>Hub Outpost ID<input value={details.hubOutpostId || draft.id || 'Assigned when saved'} readOnly /></label>
      <label>Country<select value={details.countryCode ?? 'US'} onChange={(event) => { const selected = countryChoices.find((item) => item.code === event.target.value); updateDetails({ ...details, countryCode: event.target.value, countryName: selected?.name ?? event.target.value, jurisdiction: event.target.value === 'US' ? '' : selected?.name ?? '', civilSubdivisionLabel: event.target.value === 'US' ? 'State' : null, fcfAvailability: event.target.value === 'US' ? 'available' : 'not-verified', activeFcf: null, affiliations: [] }) }}>{countryChoices.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
      <label>Local unit label<input value={details.localUnitLabel ?? 'Outpost'} onChange={(event) => update('localUnitLabel', event.target.value)} /></label>
      <label>Source-native identifier<input value={details.identifierRaw ?? ''} onChange={(event) => update('identifierRaw', event.target.value || null)} /></label>
      <label>Source display name<input value={details.displayNameRaw ?? ''} onChange={(event) => update('displayNameRaw', event.target.value || null)} /></label>
      <label>Outpost number<input value={details.outpostNumber ?? ''} onChange={(event) => update('outpostNumber', event.target.value || null)} /></label>
      <label>Campus suffix<input value={details.campusSuffix ?? ''} onChange={(event) => update('campusSuffix', event.target.value || null)} /></label>
      <label>Church<input value={details.church} onChange={(event) => update('church', event.target.value)} /></label>
      <label className="full">Public street address<input value={details.streetAddress ?? ''} onChange={(event) => update('streetAddress', event.target.value || null)} /></label>
      <label>City / locality (optional outside USA)<input value={details.city} onChange={(event) => update('city', event.target.value)} /></label>
      {details.countryCode === 'US' ? <label>State or territory<select value={details.jurisdiction} onChange={(event) => update('jurisdiction', event.target.value)}><option value="">Choose…</option>{jurisdictions.map((place) => <option key={place.abbreviation} value={place.name}>{place.name}</option>)}</select></label> : <><label>Civil subdivision name (optional)<input value={details.jurisdiction === details.countryName ? '' : details.jurisdiction} onChange={(event) => update('jurisdiction', event.target.value || details.countryName)} /></label><label>Subdivision label (optional)<input placeholder="State, province, federal territory…" value={details.civilSubdivisionLabel ?? ''} onChange={(event) => update('civilSubdivisionLabel', event.target.value || null)} /></label></>}
      <label>Postal code<input inputMode="numeric" value={details.postalCode ?? ''} onChange={(event) => update('postalCode', event.target.value || null)} /></label>
      <label>District<input value={details.district} onChange={(event) => update('district', event.target.value)} /></label>
      <label>Region<input value={details.region} onChange={(event) => update('region', event.target.value)} /></label>
      <label>Language overlay<input value={details.languageOverlay} onChange={(event) => update('languageOverlay', event.target.value)} /></label>
      <label>FCF territory<input value={details.fcfTerritory} onChange={(event) => update('fcfTerritory', event.target.value)} /></label>
      <label>FCF Activity Status<select value={details.activeFcf === null ? 'unknown' : String(details.activeFcf)} onChange={(event) => update('activeFcf', event.target.value === 'unknown' ? null : event.target.value === 'true')}><option value="unknown">Not verified</option><option value="true">Yes</option><option value="false">No</option></select></label>
      <label>FCF availability<select value={details.fcfAvailability ?? 'not-verified'} onChange={(event) => update('fcfAvailability', event.target.value as OutpostDetails['fcfAvailability'])}><option value="not-verified">Not verified</option><option value="available">Available</option><option value="not-offered">Not offered</option></select></label>
      <label className="full">Country-defined affiliations (label | name | ministry/language/fcf)<textarea value={formatAffiliations(details.affiliations)} onChange={(event) => update('affiliations', parseAffiliations(event.target.value))} /></label>
      <label className="full">Program Groups (comma separated)<input value={details.programs.join(', ')} onChange={(event) => update('programs', event.target.value.split(',').map((value) => value.trim()).filter(Boolean))} /></label>
      <label className="full">Meeting information<textarea value={details.meeting ?? ''} onChange={(event) => update('meeting', event.target.value || null)} /></label>
      <label className="full">Public church contact URL<input type="url" value={details.contactUrl ?? ''} onChange={(event) => update('contactUrl', event.target.value || null)} /></label>
    </div></fieldset>
  }
  if (draft.kind === 'event') {
    const details = draft.details as EventDetails
    const update = (field: keyof EventDetails, value: EventDetails[keyof EventDetails]) => updateDetails({ ...details, [field]: value })
    return <fieldset><legend>Event details</legend><div className="form-grid">
      <label>Occurrence ID<input value={details.occurrenceId} onChange={(event) => update('occurrenceId', event.target.value)} /></label>
      <label>Category<select value={details.category} onChange={(event) => update('category', event.target.value as EventDetails['category'])}>{eventCategories.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="full">Host or organizer<input value={details.host} onChange={(event) => update('host', event.target.value)} /></label>
      <label>Scope<select value={details.scope} onChange={(event) => update('scope', event.target.value as EventDetails['scope'])}>{eventScopes.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Lifecycle<select value={details.lifecycleStatus} onChange={(event) => update('lifecycleStatus', event.target.value as EventLifecycleStatus)}>{eventLifecycleStatuses.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Series ID<input value={details.series?.id ?? ''} onChange={(event) => update('series', event.target.value || details.series?.name ? { id: event.target.value, name: details.series?.name ?? '' } : null)} /></label>
      <label>Series name<input value={details.series?.name ?? ''} onChange={(event) => update('series', event.target.value || details.series?.id ? { id: details.series?.id ?? '', name: event.target.value } : null)} /></label>
      <div className="full structured-editor"><strong>Related organizations</strong>{details.relatedOrganizations.map((organization, index) => <div key={`${organization.id}-${index}`}>
        <label>Record ID<input value={organization.id} onChange={(event) => { const relatedOrganizations = [...details.relatedOrganizations]; relatedOrganizations[index] = { ...organization, id: event.target.value }; update('relatedOrganizations', relatedOrganizations) }} /></label>
        <label>Name<input value={organization.name} onChange={(event) => { const relatedOrganizations = [...details.relatedOrganizations]; relatedOrganizations[index] = { ...organization, name: event.target.value }; update('relatedOrganizations', relatedOrganizations) }} /></label>
        <button type="button" onClick={() => update('relatedOrganizations', details.relatedOrganizations.filter((_, organizationIndex) => organizationIndex !== index))}>Remove</button>
      </div>)}<button type="button" className="text-button" onClick={() => update('relatedOrganizations', [...details.relatedOrganizations, { id: '', name: '' }])}>+ Add related organization</button></div>
      <label>Start date<input type="date" value={details.startDate} onChange={(event) => update('startDate', event.target.value)} /></label>
      <label>End date<input type="date" value={details.endDate ?? ''} onChange={(event) => update('endDate', event.target.value || null)} /></label>
      <label>Start time<input type="time" value={details.startTime ?? ''} disabled={details.allDay} onChange={(event) => update('startTime', event.target.value || null)} /></label>
      <label>End time<input type="time" value={details.endTime ?? ''} disabled={details.allDay} onChange={(event) => update('endTime', event.target.value || null)} /></label>
      <label>Organizer IANA time zone<input value={details.timeZone} onChange={(event) => update('timeZone', event.target.value)} placeholder="America/Chicago" /></label>
      <label className="checkbox-label"><input type="checkbox" checked={details.allDay} onChange={(event) => { updateDetails({ ...details, allDay: event.target.checked, startTime: event.target.checked ? null : details.startTime, endTime: event.target.checked ? null : details.endTime }) }} />All-day/date-only event</label>
      <label>Location status<select value={details.locationStatus} onChange={(event) => { const locationStatus = event.target.value as EventDetails['locationStatus']; updateDetails({ ...details, locationStatus, location: locationStatus === 'announced' ? details.location : null }) }}>{eventLocationStatuses.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="full">Verified public venue, address, or location text<input value={details.location ?? ''} disabled={details.locationStatus !== 'announced'} onChange={(event) => update('location', event.target.value || null)} /></label>
      <label className="full">Intended audience (one non-personal label per line)<textarea value={details.audience.join('\n')} onChange={(event) => update('audience', event.target.value.split('\n').map((value) => value.trim()).filter(Boolean))} /></label>
      <label>Registration status<select value={details.registrationStatus} onChange={(event) => update('registrationStatus', event.target.value as EventDetails['registrationStatus'])}>{eventRegistrationStatuses.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Registration HTTPS URL<input type="url" value={details.registrationUrl ?? ''} onChange={(event) => update('registrationUrl', event.target.value || null)} /></label>
      <label>Registration deadline<input type="date" value={details.registrationDeadline ?? ''} onChange={(event) => update('registrationDeadline', event.target.value || null)} /></label>
      <label>Deadline exception note<input value={details.deadlineExceptionNote ?? ''} onChange={(event) => update('deadlineExceptionNote', event.target.value || null)} /></label>
      <label>Cost status<select value={details.costStatus} onChange={(event) => update('costStatus', event.target.value as EventDetails['costStatus'])}>{eventCostStatuses.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="full">Original verified public cost note<textarea value={details.costNote ?? ''} onChange={(event) => update('costNote', event.target.value || null)} /></label>
      <label className="full">Official event HTTPS URL<input type="url" value={details.officialUrl} onChange={(event) => update('officialUrl', event.target.value)} /></label>
    </div></fieldset>
  }
  if (draft.kind === 'advancement') {
    const details = draft.details as AdvancementDetails
    const update = (patch: Partial<AdvancementDetails>) => updateDetails({ ...details, ...patch } as AdvancementDetails)
    const toggleProgram = (group: ProgramGroup) => update({
      programGroups: details.programGroups.includes(group)
        ? details.programGroups.filter((candidate) => candidate !== group)
        : [...details.programGroups, group],
    })
    const toggleAudience = (audience: 'Leaders' | 'FCF') => update({
      audiences: details.audiences.includes(audience)
        ? details.audiences.filter((candidate) => candidate !== audience)
        : [...details.audiences, audience],
    })
    return <fieldset><legend>Advancement details</legend><div className="form-grid">
      <label>Subtype<select value={details.subtype} onChange={(event) => updateDetails(changeAdvancementSubtype(details, event.target.value as AdvancementSubtype))}>{advancementSubtypes.map((value) => <option key={value} value={value}>{advancementSubtypeLabels[value]}</option>)}</select></label>
      <label>Current/historical status<select value={details.contentStatus} onChange={(event) => update({ contentStatus: event.target.value as AdvancementDetails['contentStatus'] })}><option value="current">Current</option><option value="historical">Historical</option><option value="superseded">Superseded</option><option value="not-verified">Not verified</option></select></label>
      <label>Grade range<input value={details.gradeRange ?? ''} onChange={(event) => update({ gradeRange: event.target.value || null })} /></label>
      <label>Official information URL<input required type="url" value={details.officialUrl} onChange={(event) => update({ officialUrl: event.target.value })} /></label>
      <div className="full choice-editor"><strong>Applicable Program Groups</strong><div>{programGroups.map((group) => <label key={group}><input type="checkbox" checked={details.programGroups.includes(group)} onChange={() => toggleProgram(group)} />{group}</label>)}</div></div>
      <div className="full choice-editor"><strong>Additional audiences</strong><div>{(['Leaders', 'FCF'] as const).map((audience) => <label key={audience}><input type="checkbox" checked={details.audiences.includes(audience)} onChange={() => toggleAudience(audience)} />{audience}</label>)}</div></div>
      {details.subtype === 'program-group' && <>
        <label>Accent color<input type="color" value={details.accent} onChange={(event) => update({ accent: event.target.value })} /></label>
        <label className="full">Highlights (one per line)<textarea value={details.highlights.join('\n')} onChange={(event) => update({ highlights: event.target.value.split('\n').map((value) => value.trim()).filter(Boolean) })} /></label>
      </>}
      {details.subtype === 'merit' && <>
        <label>Merit category/type<select value={details.meritCategory} onChange={(event) => update({ meritCategory: event.target.value as MeritCategory, colors: [] })}>{meritCategories.map((category) => <option key={category}>{category}</option>)}</select></label>
        <div className="full choice-editor"><strong>Verified colors</strong><div>{meritColors.map((meritColor) => <label key={meritColor}><input type="checkbox" checked={details.colors.includes(meritColor)} onChange={() => update({ colors: details.colors.includes(meritColor) ? details.colors.filter((candidate) => candidate !== meritColor) : [...details.colors, meritColor] })} />{meritColor.replace('-', ' ')}</label>)}</div></div>
      </>}
      {details.subtype === 'award' && <label>Award level<select value={details.awardLevel} onChange={(event) => update({ awardLevel: event.target.value as typeof details.awardLevel })}><option value="program-group">Program Group</option><option value="national">National</option><option value="junior-leadership">Junior leadership</option><option value="fcf">FCF</option></select></label>}
      {details.subtype === 'handbook' && <>
        <label>Publisher<input value={details.publisher ?? ''} onChange={(event) => update({ publisher: event.target.value || null })} /></label>
        <label>Item/catalog number<input value={details.itemNumber ?? ''} onChange={(event) => update({ itemNumber: event.target.value || null })} /></label>
        <label>Edition<input value={details.edition ?? ''} onChange={(event) => update({ edition: event.target.value || null })} /></label>
        <label>Revision<input value={details.revision ?? ''} onChange={(event) => update({ revision: event.target.value || null })} /></label>
        <label>Publication year<input type="number" min="1900" max="2100" value={details.publicationYear ?? ''} onChange={(event) => update({ publicationYear: event.target.value ? Number(event.target.value) : null })} /></label>
        <label>Listing availability<select value={details.availability} onChange={(event) => update({ availability: event.target.value as typeof details.availability })}><option value="available">Current product listing</option><option value="unavailable">Unavailable</option><option value="not-verified">Not verified</option></select></label>
        <div className="full choice-editor"><strong>Confirmed formats</strong><div>{(['print', 'ebook'] as HandbookFormat[]).map((format) => <label key={format}><input type="checkbox" checked={details.formats.includes(format)} onChange={() => update({ formats: details.formats.includes(format) ? details.formats.filter((candidate) => candidate !== format) : [...details.formats, format] })} />{format === 'ebook' ? 'E-book' : 'Print'}</label>)}</div></div>
        <div className="full structured-editor"><strong>Authorized purchase links</strong>{details.purchaseUrls.map((link, index) => <div key={`${link.url}-${index}`}>
          <label>Format<select value={link.format} onChange={(event) => { const purchaseUrls = [...details.purchaseUrls]; purchaseUrls[index] = { ...link, format: event.target.value as HandbookFormat }; update({ purchaseUrls }) }}><option value="print">Print</option><option value="ebook">E-book</option></select></label>
          <label>Label<input value={link.label} onChange={(event) => { const purchaseUrls = [...details.purchaseUrls]; purchaseUrls[index] = { ...link, label: event.target.value }; update({ purchaseUrls }) }} /></label>
          <label>HTTPS URL<input type="url" value={link.url} onChange={(event) => { const purchaseUrls = [...details.purchaseUrls]; purchaseUrls[index] = { ...link, url: event.target.value }; update({ purchaseUrls }) }} /></label>
          <button type="button" onClick={() => update({ purchaseUrls: details.purchaseUrls.filter((_, linkIndex) => linkIndex !== index) })}>Remove</button>
        </div>)}<button type="button" className="text-button" onClick={() => update({ purchaseUrls: [...details.purchaseUrls, { label: '', format: 'print', url: '' }] })}>+ Add purchase link</button></div>
      </>}
      <div className="full structured-editor"><strong>Typed advancement relationships</strong>{details.references.map((reference, index) => <div key={`${reference.targetId}-${index}`}>
        <label>Target subtype<select value={reference.targetSubtype} onChange={(event) => { const references = [...details.references]; references[index] = { ...reference, targetSubtype: event.target.value as AdvancementSubtype }; update({ references }) }}>{advancementSubtypes.map((value) => <option key={value} value={value}>{advancementSubtypeLabels[value]}</option>)}</select></label>
        <label>Target record ID<input value={reference.targetId} onChange={(event) => { const references = [...details.references]; references[index] = { ...reference, targetId: event.target.value }; update({ references }) }} /></label>
        <label>Relationship label<input value={reference.relationship} onChange={(event) => { const references = [...details.references]; references[index] = { ...reference, relationship: event.target.value }; update({ references }) }} /></label>
        <button type="button" onClick={() => update({ references: details.references.filter((_, referenceIndex) => referenceIndex !== index) })}>Remove</button>
      </div>)}<button type="button" className="text-button" onClick={() => update({ references: [...details.references, { targetId: '', targetSubtype: 'award', relationship: '' }] })}>+ Add relationship</button></div>
    </div></fieldset>
  }
  if (draft.kind === 'organization') {
    const details = draft.details as OrganizationDetails
    const update = (field: keyof OrganizationDetails, value: OrganizationDetails[keyof OrganizationDetails]) => updateDetails({ ...details, [field]: value })
    return <fieldset><legend>Organization details</legend><div className="form-grid">
      <label>Country code<input value={details.countryCode} maxLength={2} onChange={(event) => update('countryCode', event.target.value.toUpperCase())} /></label>
      <label>Country-defined label<input value={details.unitLabel} onChange={(event) => update('unitLabel', event.target.value)} /></label>
      <label>Type<select value={details.organizationType} onChange={(event) => update('organizationType', event.target.value as OrganizationDetails['organizationType'])}><option value="region">U.S. region</option><option value="district">U.S. district</option><option value="language-region">Language region</option><option value="language-district">Language district</option><option value="fcf-territory">FCF territory</option><option value="country-defined">Country-defined unit</option></select></label>
      <label>Scope<select value={details.scope} onChange={(event) => update('scope', event.target.value as OrganizationDetails['scope'])}><option value="geographic">Geographic</option><option value="language">Language</option><option value="fcf">FCF</option></select></label>
      <label>Parent<input value={details.parent ?? ''} onChange={(event) => update('parent', event.target.value || null)} /></label>
      <label className="full">Affiliations (one per line)<textarea value={details.affiliations.join('\n')} onChange={(event) => update('affiliations', event.target.value.split('\n').filter(Boolean))} /></label>
      <label className="full">Jurisdictions (one per line)<textarea value={details.jurisdictions.join('\n')} onChange={(event) => update('jurisdictions', event.target.value.split('\n').filter(Boolean))} /></label>
    </div></fieldset>
  }
  const details = draft.details as PageDetails
  const update = (field: keyof PageDetails, value: PageDetails[keyof PageDetails]) => updateDetails({ ...details, [field]: value })
  return <fieldset><legend>Page details</legend><div className="form-grid">
    <label>Section<select value={details.section} onChange={(event) => update('section', event.target.value as PageDetails['section'])}><option value="about">About Royal Rangers</option><option value="other">Other</option><option value="help">Help & Sources</option></select></label>
    <label className="full">Paragraphs (one per line)<textarea value={details.body.join('\n')} onChange={(event) => update('body', event.target.value.split('\n').filter(Boolean))} /></label>
    <label className="full">Links (one per line: Label | https://url)<textarea value={details.links.map((link) => `${link.label} | ${link.url}`).join('\n')} onChange={(event) => update('links', event.target.value.split('\n').map((line) => { const [label, url] = line.split('|').map((value) => value.trim()); return { label: label ?? '', url: url ?? '' } }).filter((link) => link.label && link.url))} /></label>
  </div></fieldset>
}

const freshnessItemTypes: FreshnessItemType[] = ['listing-due', 'listing-grace', 'listing-expired', 'archived-review', 'submission-retention', 'verification-due', 'verification-stale', 'completion', 'broken-source', 'event-conflict', 'coverage-gap']

function OperatorFreshness({
  snapshot,
  reload,
  openRecord,
  report,
}: {
  snapshot: OperatorSnapshot
  reload: () => Promise<unknown>
  openRecord: (recordId: string) => void
  report: (notice: string, error?: string) => void
}) {
  const [queueType, setQueueType] = useState<'' | FreshnessItemType>('')
  const [reason, setReason] = useState('')
  const [sourceId, setSourceId] = useState('')
  const [lifecycleEventId, setLifecycleEventId] = useState('')
  const [lifecycleStatus, setLifecycleStatus] = useState<EventLifecycleStatus>('completed')
  const [conflictEventId, setConflictEventId] = useState('')
  const [conflictField, setConflictField] = useState('')
  const [assertions, setAssertions] = useState<EventConflictAssertion[]>([
    { sourceId: null, sourceLabel: '', assertedValue: '' },
    { sourceId: null, sourceLabel: '', assertedValue: '' },
  ])
  const [gapScope, setGapScope] = useState('')
  const [gapDescription, setGapDescription] = useState('')
  const [gapSourceUrl, setGapSourceUrl] = useState('')
  const events = snapshot.records.filter((record) => record.kind === 'event')
  const eventSources = events.flatMap((record) => record.sources.map((source) => ({ ...source, recordId: record.id, recordTitle: record.title })))
  const selectedSource = eventSources.find((source) => source.id === sourceId)
  const selectedSourceBroken = selectedSource && snapshot.brokenSources.some((observation) => observation.sourceId === selectedSource.id && !observation.clearedAt)
  const queue = queueType ? snapshot.freshnessQueue.filter((item) => item.type === queueType) : snapshot.freshnessQueue

  const submitOperatorAction = async (path: string, method: 'POST' | 'PUT', body?: unknown, success = 'Operator action saved.') => {
    report('')
    try {
      await runOperatorAction(path, method, body)
      await reload()
      report(success)
      setReason('')
    } catch (error) {
      report('', error instanceof Error ? error.message : 'Operator action failed.')
    }
  }

  const updateAssertion = (index: number, patch: Partial<EventConflictAssertion>) => {
    const next = [...assertions]
    next[index] = { ...next[index], ...patch }
    setAssertions(next)
  }

  return (
    <section className="freshness-workspace" aria-labelledby="freshness-heading">
      <div className="section-heading split"><div><p className="eyebrow">Private worklist</p><h2 id="freshness-heading">Freshness Queue</h2></div><p>60-day verification · 14-day approaching-expiry window</p></div>
      <div className="queue-counts" role="group" aria-label="Freshness queue counts">
        <button type="button" className={queueType === '' ? 'selected' : ''} onClick={() => setQueueType('')}>All <strong>{snapshot.freshnessQueue.length}</strong></button>
        {freshnessItemTypes.map((type) => <button type="button" className={queueType === type ? 'selected' : ''} key={type} onClick={() => setQueueType(type)}>{type.replaceAll('-', ' ')} <strong>{snapshot.freshnessQueue.filter((item) => item.type === type).length}</strong></button>)}
      </div>
      <label className="queue-reason">Action reason or observation note<input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required for lifecycle, broken-source, resolution, and dismissal actions" /></label>
      <div className="queue-list">
        {queue.length === 0 && <p className="empty-queue">No queue items match this filter.</p>}
        {queue.map((item) => <article key={item.id} className={`queue-item severity-${item.severity}`} id={item.actionTarget.replace(':', '-')}>
          <div><span className="record-type">{item.type.replaceAll('-', ' ')} · {item.severity}</span><h3>{item.title}</h3><p>{item.fieldName ? `Field: ${item.fieldName}` : 'Record-level item'}{item.sourceLabel ? ` · ${item.sourceLabel}` : ''}</p><small>{item.lastCheckedAt ? `Last checked ${new Date(item.lastCheckedAt).toLocaleDateString()}` : 'No check date recorded'}</small></div>
          <div className="queue-actions">
            {item.recordId && <button type="button" onClick={() => openRecord(item.recordId!)}>Open record</button>}
            {item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer">Open source ↗</a>}
            {item.sourceId && <button type="button" onClick={() => submitOperatorAction(`/api/operator/sources/${item.sourceId}/reverify`, 'POST', undefined, 'Source marked reverified.')}>Reverify now</button>}
            {item.type === 'completion' && item.recordId && <button type="button" disabled={!reason.trim()} onClick={() => submitOperatorAction(`/api/operator/events/${item.recordId}/lifecycle`, 'POST', { status: 'completed', reason }, 'Lifecycle marked completed.')}>Mark completed</button>}
            {item.type === 'broken-source' && item.sourceId && <button type="button" disabled={!reason.trim()} onClick={() => submitOperatorAction(`/api/operator/sources/${item.sourceId}/broken`, 'POST', { broken: false, note: reason }, 'Broken-source observation cleared.')}>Clear observation</button>}
            {item.type === 'event-conflict' && <button type="button" disabled={!reason.trim()} onClick={() => submitOperatorAction(`/api/operator/conflicts/${item.id.replace('conflict:', '')}`, 'PUT', { resolutionNote: reason }, 'Event conflict resolved.')}>Resolve conflict</button>}
            {item.type === 'coverage-gap' && <><button type="button" disabled={!reason.trim()} onClick={() => submitOperatorAction(`/api/operator/coverage-gaps/${item.id.replace('gap:', '')}`, 'PUT', { status: 'resolved', reason }, 'Coverage gap resolved.')}>Resolve gap</button><button type="button" disabled={!reason.trim()} onClick={() => submitOperatorAction(`/api/operator/coverage-gaps/${item.id.replace('gap:', '')}`, 'PUT', { status: 'dismissed', reason }, 'Coverage gap dismissed.')}>Dismiss gap</button></>}
            {item.type === 'submission-retention' && <button type="button" disabled={!reason.trim()} onClick={() => submitOperatorAction(`/api/operator/submissions/${encodeURIComponent(item.actionTarget.replace('submission:', ''))}/scrub`, 'POST', { reason }, 'Proposal personal data scrubbed.')}>Scrub personal data</button>}
            {item.type === 'listing-grace' && item.actionTarget.startsWith('grace:') && <button type="button" disabled={!reason.trim()} onClick={() => submitOperatorAction(`/api/operator/outposts/${encodeURIComponent(item.actionTarget.replace('grace:', ''))}/lifecycle`, 'POST', { action: 'grace', reason }, 'Listing entered its recorded grace period.')}>Enter grace</button>}
            {item.type === 'listing-expired' && item.actionTarget.startsWith('expire:') && <button type="button" disabled={!reason.trim()} onClick={() => submitOperatorAction(`/api/operator/outposts/${encodeURIComponent(item.actionTarget.replace('expire:', ''))}/lifecycle`, 'POST', { action: 'expire', reason }, 'Expired listing removed from public discovery.')}>Expire listing</button>}
          </div>
        </article>)}
      </div>

      <div className="operator-action-grid">
        <form onSubmit={(event) => { event.preventDefault(); if (sourceId) submitOperatorAction(`/api/operator/sources/${sourceId}/broken`, 'POST', { broken: !selectedSourceBroken, note: reason }, selectedSourceBroken ? 'Broken-source observation cleared.' : 'Broken-source observation recorded.') }}>
          <h3>Source health and verification</h3>
          <label>Event field source<select value={sourceId} onChange={(event) => setSourceId(event.target.value)}><option value="">Choose a source…</option>{eventSources.map((source) => <option key={source.id} value={source.id}>{source.recordTitle} · {source.fieldName}</option>)}</select></label>
          <div className="inline-actions"><button type="button" disabled={!sourceId} onClick={() => submitOperatorAction(`/api/operator/sources/${sourceId}/reverify`, 'POST', undefined, 'Source marked reverified.')}>Reverify now</button><button type="submit" disabled={!sourceId || !reason.trim()}>{selectedSourceBroken ? 'Clear broken observation' : 'Record broken source'}</button></div>
        </form>

        <form onSubmit={(event) => { event.preventDefault(); if (lifecycleEventId) submitOperatorAction(`/api/operator/events/${lifecycleEventId}/lifecycle`, 'POST', { status: lifecycleStatus, reason }, 'Event lifecycle updated.') }}>
          <h3>Apply lifecycle status</h3>
          <label>Event<select value={lifecycleEventId} onChange={(event) => setLifecycleEventId(event.target.value)}><option value="">Choose an event…</option>{events.map((record) => <option key={record.id} value={record.id}>{record.title}</option>)}</select></label>
          <label>Lifecycle<select value={lifecycleStatus} onChange={(event) => setLifecycleStatus(event.target.value as EventLifecycleStatus)}>{eventLifecycleStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
          <button type="submit" disabled={!lifecycleEventId || !reason.trim()}>Apply with audit note</button>
        </form>

        <form onSubmit={(event) => { event.preventDefault(); submitOperatorAction('/api/operator/conflicts', 'POST', { eventId: conflictEventId, fieldName: conflictField, assertions, reason }, 'Event conflict opened.'); setConflictField('') }}>
          <h3>Open event conflict</h3>
          <label>Event<select value={conflictEventId} onChange={(event) => setConflictEventId(event.target.value)}><option value="">Choose an event…</option>{events.map((record) => <option key={record.id} value={record.id}>{record.title}</option>)}</select></label>
          <label>Disputed field<input value={conflictField} onChange={(event) => setConflictField(event.target.value)} placeholder="location, endDate, costNote…" /></label>
          {assertions.map((assertion, index) => <div className="assertion-editor" key={index}><label>Source {index + 1} label<input value={assertion.sourceLabel} onChange={(event) => updateAssertion(index, { sourceLabel: event.target.value })} /></label><label>Source {index + 1} assertion<input value={assertion.assertedValue} onChange={(event) => updateAssertion(index, { assertedValue: event.target.value })} /></label></div>)}
          <button type="submit" disabled={!conflictEventId || !conflictField.trim() || assertions.some((assertion) => !assertion.sourceLabel.trim() || !assertion.assertedValue.trim())}>Open conflict</button>
        </form>

        <form onSubmit={(event) => { event.preventDefault(); submitOperatorAction('/api/operator/coverage-gaps', 'POST', { scope: gapScope, description: gapDescription, sourceUrl: gapSourceUrl || null }, 'Coverage gap recorded.'); setGapScope(''); setGapDescription(''); setGapSourceUrl('') }}>
          <h3>Record coverage gap</h3>
          <label>Geography or scope<input value={gapScope} onChange={(event) => setGapScope(event.target.value)} /></label>
          <label>Description<textarea value={gapDescription} onChange={(event) => setGapDescription(event.target.value)} /></label>
          <label>Checked source HTTPS URL<input type="url" value={gapSourceUrl} onChange={(event) => setGapSourceUrl(event.target.value)} /></label>
          <button type="submit" disabled={!gapScope.trim() || !gapDescription.trim()}>Record gap</button>
        </form>
      </div>
    </section>
  )
}

type OutpostChoice = { id: string; title: string }

function OperatorOutpostField({
  id,
  value,
  onChange,
}: {
  id: string
  value: OutpostChoice | null
  onChange: (value: OutpostChoice | null) => void
}) {
  const [query, setQuery] = useState(value?.title ?? '')
  const [choices, setChoices] = useState<OutpostChoice[]>([])

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => {
      searchOperatorOutposts(query).then(({ data }) => {
        if (active) setChoices(data.items)
      }).catch(() => { if (active) setChoices([]) })
    }, 150)
    return () => { active = false; window.clearTimeout(timer) }
  }, [query])

  return <div className="operator-outpost-field">
    <label htmlFor={`${id}-search`}>Current Outpost (optional)</label>
    <input
      id={`${id}-search`}
      value={query}
      onChange={(event) => { setQuery(event.target.value); onChange(null) }}
      placeholder="Search existing Outpost Hub listings"
      autoComplete="off"
    />
    <div className="outpost-choice-list" role="group" aria-label="Current Outpost choices">
      <button type="button" className={!value ? 'selected' : ''} onClick={() => { setQuery(''); onChange(null) }}>
        No Current Outpost / not yet listed
      </button>
      {choices.map((choice) => <button
        type="button"
        className={value?.id === choice.id ? 'selected' : ''}
        key={choice.id}
        onClick={() => { setQuery(choice.title); onChange(choice) }}
      >{choice.title}</button>)}
    </div>
    {value && <p className="field-note">Selected: {value.title}</p>}
  </div>
}

function OperatorClaimForm({ session, reload }: { session: Extract<OperatorSession, { role: 'unclaimed' }>; reload: () => Promise<void> }) {
  const [displayName, setDisplayName] = useState('')
  const [currentOutpost, setCurrentOutpost] = useState<OutpostChoice | null>(null)
  const [birthYear, setBirthYear] = useState('')
  const [adultAttestation, setAdultAttestation] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const errorRef = useRef<HTMLParagraphElement>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setErrorMessage('')
    try {
      await runOperatorAccountAction('/api/operator/account/claim', 'POST', {
        displayName, currentOutpostId: currentOutpost?.id ?? null, birthYear, adultAttestation,
      })
      setBirthYear('')
      await reload()
    } catch (claimError) {
      setBirthYear('')
      setErrorMessage(claimError instanceof Error ? claimError.message : 'Setup failed.')
      window.setTimeout(() => errorRef.current?.focus(), 0)
    } finally { setSaving(false) }
  }

  return <section className="wrap operator-account-shell">
    <div className="account-card">
      <p className="eyebrow">First verified sign-in</p><h2>Claim the sole Operator Account</h2>
      <p>This is private Operator setup, not public registration. Your verified Cloudflare Access email is <strong>{session.email}</strong>.</p>
      {errorMessage && <p ref={errorRef} className="alert error" role="alert" tabIndex={-1}>{errorMessage}</p>}
      <form onSubmit={submit} className="account-form">
        <label>Display Name<input required maxLength={80} autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
        <OperatorOutpostField id="claim-outpost" value={currentOutpost} onChange={setCurrentOutpost} />
        <label>Birth Year<input required inputMode="numeric" pattern="[0-9]{4}" autoComplete="off" value={birthYear} onChange={(event) => setBirthYear(event.target.value)} aria-describedby="birth-year-note" /></label>
        <p id="birth-year-note" className="field-note">Used only for this adult eligibility check. It is not stored, returned, logged, audited, or cached.</p>
        <label className="checkbox-line"><input required type="checkbox" checked={adultAttestation} onChange={(event) => setAdultAttestation(event.target.checked)} />I confirm I am 18 or older. False information may cause access to be refused or removed.</label>
        <button className="button primary" disabled={saving}>{saving ? 'Claiming…' : 'Claim Operator Account'}</button>
      </form>
    </div>
  </section>
}

function PendingSuccessorForm({
  session,
  transferToken,
  reload,
}: {
  session: Extract<OperatorSession, { role: 'pending-successor' }>
  transferToken: string | null
  reload: () => Promise<void>
}) {
  const [birthYear, setBirthYear] = useState('')
  const [adultAttestation, setAdultAttestation] = useState(false)
  const [responsibilityAccepted, setResponsibilityAccepted] = useState(false)
  const [currentOutpostAccepted, setCurrentOutpostAccepted] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const errorRef = useRef<HTMLParagraphElement>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setErrorMessage('')
    try {
      await runOperatorAccountAction('/api/operator/account/transfer/accept', 'POST', {
        token: transferToken, birthYear, adultAttestation, responsibilityAccepted, currentOutpostAccepted,
      })
      setBirthYear('')
      await reload()
    } catch (acceptError) {
      setBirthYear('')
      setErrorMessage(acceptError instanceof Error ? acceptError.message : 'Transfer acceptance failed.')
      window.setTimeout(() => errorRef.current?.focus(), 0)
    } finally { setSaving(false) }
  }

  return <section className="wrap operator-account-shell">
    <div className="account-card">
      <p className="eyebrow">Pending responsibility transfer</p><h2>Accept the Operator Account</h2>
      <p>You are accepting responsibility as <strong>{session.transfer.displayName}</strong>. No predecessor personal information or privileged account history is shown here.</p>
      <dl className="account-facts"><div><dt>Current Outpost</dt><dd>{session.transfer.currentOutpost?.title ?? 'No Current Outpost'}</dd></div><div><dt>Accept before</dt><dd>{new Date(session.transfer.expiresAt).toLocaleString()}</dd></div></dl>
      {!transferToken && <p className="alert error" role="alert">Open the complete acceptance link supplied by the current Operator. Its one-time token was intentionally not sent to the server.</p>}
      {errorMessage && <p ref={errorRef} className="alert error" role="alert" tabIndex={-1}>{errorMessage}</p>}
      <form onSubmit={submit} className="account-form">
        <label>Birth Year<input required inputMode="numeric" pattern="[0-9]{4}" autoComplete="off" value={birthYear} onChange={(event) => setBirthYear(event.target.value)} /></label>
        <p className="field-note">Used only for this adult eligibility check and immediately discarded.</p>
        <label className="checkbox-line"><input required type="checkbox" checked={adultAttestation} onChange={(event) => setAdultAttestation(event.target.checked)} />I confirm I am 18 or older. False information may cause access to be refused or removed.</label>
        <label className="checkbox-line"><input required type="checkbox" checked={responsibilityAccepted} onChange={(event) => setResponsibilityAccepted(event.target.checked)} />I accept responsibility for operating Ranger Outpost Hub.</label>
        <label className="checkbox-line"><input required type="checkbox" checked={currentOutpostAccepted} onChange={(event) => setCurrentOutpostAccepted(event.target.checked)} />I accept the Current Outpost shown above, including No Current Outpost when shown.</label>
        <button className="button primary" disabled={saving || !transferToken}>{saving ? 'Accepting…' : 'Accept Operator responsibility'}</button>
      </form>
    </div>
  </section>
}

function OperatorAccountPanel({
  session,
  reload,
}: {
  session: Extract<OperatorSession, { role: 'active' }>
  reload: () => Promise<void>
}) {
  const [displayName, setDisplayName] = useState(session.account.displayName)
  const [currentOutpost, setCurrentOutpost] = useState<OutpostChoice | null>(session.account.currentOutpost)
  const [successorDisplayName, setSuccessorDisplayName] = useState('')
  const [successorEmail, setSuccessorEmail] = useState('')
  const [successorOutpost, setSuccessorOutpost] = useState<OutpostChoice | null>(null)
  const [deliberateConfirmation, setDeliberateConfirmation] = useState(false)
  const [acceptanceLink, setAcceptanceLink] = useState('')
  const [notice, setNotice] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const errorRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    setDisplayName(session.account.displayName)
    setCurrentOutpost(session.account.currentOutpost)
  }, [session.account])

  const reportError = (actionError: unknown) => {
    setNotice(''); setErrorMessage(actionError instanceof Error ? actionError.message : 'Account action failed.')
    window.setTimeout(() => errorRef.current?.focus(), 0)
  }
  const freshAction = async (intendedAction: 'renew' | 'transfer' | 'settings') => {
    setErrorMessage('')
    try {
      const { data } = await runOperatorAccountAction<{ ready?: boolean; logoutUrl?: string }>(
        '/api/operator/account/reauthenticate', 'POST', { intendedAction },
      )
      if (data.logoutUrl) window.location.assign(data.logoutUrl)
    } catch (reauthError) {
      reportError(reauthError)
    }
  }
  const renew = async () => {
    setErrorMessage('')
    try {
      await runOperatorAccountAction('/api/operator/account/renew', 'POST', {})
      await reload(); setNotice('Operator privileges renewed for four years.')
    } catch (renewError) { reportError(renewError) }
  }

  return <section className="operator-account" aria-labelledby="operator-account-heading">
    <div className="section-heading split"><div><p className="eyebrow">Private settings</p><h2 id="operator-account-heading">Operator Account</h2></div><span className="tenure-badge">Operator tenure {session.account.tenureNumber}</span></div>
    {errorMessage && <p ref={errorRef} className="alert error" role="alert" tabIndex={-1}>{errorMessage}</p>}
    {notice && <p className="alert success" role="status">{notice}</p>}
    {session.account.lifecycleState !== 'active' && <div className="renewal-notice" role="status">
      <h3>{session.account.lifecycleState === 'renewal-required' ? 'Renewal required' : 'Four-year renewal is due soon'}</h3>
      <p>Operator privileges are due {new Date(session.account.renewalDueAt).toLocaleString()}. The account, tenure, renewal, and transfer controls remain available.</p>
      <div className="inline-actions"><button className="button primary" type="button" onClick={() => void renew()}>Yes, renew for four years</button>{!session.recentAuthentication && <button type="button" onClick={() => void freshAction('renew')}>Start fresh Access session</button>}</div>
    </div>}
    {session.account.accessCleanupRequired && <div className="cleanup-banner" role="alert">
      <h3>Cloudflare Access cleanup required</h3>
      <p>Remove the predecessor email from the existing Operator Access Allow policy. Verify that exactly one email remains and that there is no Everyone, domain-wide, login-method-wide, or Bypass rule. Application authorization already rejects the old identity.</p>
      <button type="button" onClick={async () => { try { await runOperatorAccountAction('/api/operator/account/access-cleanup', 'POST', {}); await reload(); setNotice('Your cleanup confirmation was recorded. This records your statement, not provider verification.') } catch (cleanupError) { reportError(cleanupError) } }}>I completed and checked the policy</button>
    </div>}
    <dl className="account-facts">
      <div><dt>Verified sign-in email</dt><dd>{session.account.email}</dd></div>
      <div><dt>Current Outpost</dt><dd>{session.account.currentOutpost?.title ?? 'No Current Outpost'}</dd></div>
      <div><dt>Activated</dt><dd>{new Date(session.account.activatedAt).toLocaleString()}</dd></div>
      <div><dt>Renewal due</dt><dd>{new Date(session.account.renewalDueAt).toLocaleString()}</dd></div>
      <div><dt>Adult eligibility</dt><dd>Confirmed; Birth Year not retained</dd></div>
    </dl>
    <div className="account-grid">
      <form className="account-card account-form" onSubmit={async (event) => {
        event.preventDefault(); setErrorMessage('')
        try {
          await runOperatorAccountAction('/api/operator/account/settings', 'PUT', {
            displayName, currentOutpostId: currentOutpost?.id ?? null, expectedVersion: session.account.version,
          })
          await reload(); setNotice('Account settings updated.')
        } catch (settingsError) { reportError(settingsError) }
      }}>
        <h3>Display and Outpost settings</h3>
        <label>Display Name<input required maxLength={80} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
        <OperatorOutpostField id="settings-outpost" value={currentOutpost} onChange={setCurrentOutpost} />
        <p className="field-note">Current Outpost never grants authority. Email changes use the transfer process.</p>
        <div className="inline-actions"><button type="submit">Save settings</button>{!session.recentAuthentication && <button type="button" onClick={() => void freshAction('settings')}>Start fresh Access session</button>}</div>
      </form>
      <div className="account-card transfer-card">
        <h3>Transfer responsibility</h3>
        <ol><li>Stage one seven-day transfer while you remain the only active Operator.</li><li>Add exactly the successor email temporarily to the existing Access Allow policy.</li><li>Send the one-time fragment link through a channel you control.</li><li>Keep your email in Access until acceptance. The successor then removes it and checks the policy.</li></ol>
        {session.pendingTransfer ? <div className="pending-transfer">
          <p><strong>Pending for {session.pendingTransfer.displayName}</strong> ({session.pendingTransfer.email})</p>
          <p>Expires {new Date(session.pendingTransfer.expiresAt).toLocaleString()}. You retain all authority until acceptance.</p>
          <button type="button" onClick={async () => { try { await runOperatorAccountAction('/api/operator/account/transfer/cancel', 'POST', {}); await reload(); setAcceptanceLink(''); setNotice('Pending transfer cancelled. You remain the active Operator.') } catch (cancelError) { reportError(cancelError) } }}>Cancel pending transfer</button>
        </div> : <form className="account-form" onSubmit={async (event) => {
          event.preventDefault(); setErrorMessage(''); setAcceptanceLink('')
          try {
            const { data } = await runOperatorAccountAction<{ acceptanceLink: string }>('/api/operator/account/transfer', 'POST', {
              successorDisplayName, successorEmail, successorCurrentOutpostId: successorOutpost?.id ?? null, deliberateConfirmation,
            })
            setAcceptanceLink(data.acceptanceLink); await reload(); setNotice('Transfer staged. Copy the acceptance link now; it will not be shown again after reload.')
          } catch (transferError) { reportError(transferError) }
        }}>
          <label>Successor Display Name<input required maxLength={80} value={successorDisplayName} onChange={(event) => setSuccessorDisplayName(event.target.value)} /></label>
          <label>Successor email<input required type="email" autoComplete="off" value={successorEmail} onChange={(event) => setSuccessorEmail(event.target.value)} /></label>
          <OperatorOutpostField id="successor-outpost" value={successorOutpost} onChange={setSuccessorOutpost} />
          <label className="checkbox-line"><input required type="checkbox" checked={deliberateConfirmation} onChange={(event) => setDeliberateConfirmation(event.target.checked)} />I intend to stage this transfer. I will not remove my Access email before acceptance.</label>
          <div className="inline-actions"><button type="submit">Stage seven-day transfer</button>{!session.recentAuthentication && <button type="button" onClick={() => void freshAction('transfer')}>Start fresh Access session</button>}</div>
        </form>}
        {acceptanceLink && <div className="acceptance-link" role="status"><label>One-time acceptance link<input readOnly value={acceptanceLink} /></label><button type="button" onClick={() => void navigator.clipboard.writeText(acceptanceLink).then(() => setNotice('Acceptance link copied.'))}>Copy link</button></div>}
      </div>
    </div>
    <details className="recovery-guidance"><summary>Lost-email recovery limit and procedure</summary><p>The authenticated Cloudflare account owner can run the recovery staging script. It creates the same expiring successor acceptance flow; it never overwrites this account. Loss of the Cloudflare account and all provider recovery methods cannot be solved inside Ranger Outpost Hub.</p></details>
  </section>
}

const submissionStates: DirectorySubmissionState[] = [
  'new', 'triage', 'needs-information', 'duplicate', 'verified-ready', 'converted', 'rejected', 'withdrawn', 'pii-scrubbed',
]
const proposalFields = [
  'church', 'city', 'jurisdiction', 'outpostNumber', 'campusSuffix', 'streetAddress', 'postalCode',
  'district', 'languageOverlay', 'programs', 'meeting', 'contactUrl', 'activeFcf',
]

function OperatorSubmissions({ reloadContent, report }: {
  reloadContent: () => Promise<unknown>
  report: (notice: string, error?: string) => void
}) {
  const [items, setItems] = useState<DirectorySubmissionSummary[]>([])
  const [counts, setCounts] = useState<Partial<Record<DirectorySubmissionState, number>>>({})
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [selected, setSelected] = useState<DirectorySubmissionDetail | null>(null)
  const [stateFilter, setStateFilter] = useState('')
  const [jurisdictionFilter, setJurisdictionFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [duplicateFilter, setDuplicateFilter] = useState('')
  const [ageFilter, setAgeFilter] = useState('')
  const [reason, setReason] = useState('')
  const [relatedOutpostId, setRelatedOutpostId] = useState('')
  const [sourceLabel, setSourceLabel] = useState('')
  const [checkedAt, setCheckedAt] = useState(new Date().toISOString().slice(0, 10))
  const [verifiedFields, setVerifiedFields] = useState(['church', 'city', 'jurisdiction'])

  const loadQueue = useCallback(async (cursor: string | null = null, append = false) => {
    const filters = new URLSearchParams({ pageSize: '50' })
    if (stateFilter) filters.set('state', stateFilter)
    if (jurisdictionFilter) filters.set('jurisdiction', jurisdictionFilter)
    if (typeFilter) filters.set('type', typeFilter)
    if (duplicateFilter) filters.set('duplicate', duplicateFilter)
    if (ageFilter) filters.set('age', ageFilter)
    if (cursor) filters.set('cursor', cursor)
    const { data } = await fetchOperatorSubmissions(filters)
    setItems((current) => append ? [...current, ...data.items] : data.items)
    setCounts(data.counts)
    setNextCursor(data.nextCursor)
  }, [ageFilter, duplicateFilter, jurisdictionFilter, stateFilter, typeFilter])

  useEffect(() => { void loadQueue().catch((error: unknown) => report('', error instanceof Error ? error.message : 'Could not load proposals.')) }, [loadQueue, report])

  const open = async (id: string) => {
    try {
      const { data } = await fetchOperatorSubmission(id)
      setSelected(data.item)
      setReason('')
      setRelatedOutpostId(data.item.targetOutpostId ?? '')
      setSourceLabel('')
      setVerifiedFields(['church', 'city', 'jurisdiction'])
    } catch (error) {
      report('', error instanceof Error ? error.message : 'Could not open proposal.')
    }
  }

  const act = async (action: string) => {
    if (!selected || !reason.trim()) return
    if (['duplicate', 'reject', 'withdraw', 'scrub'].includes(action)
      && !window.confirm(`Confirm ${action.replaceAll('-', ' ')}. This action disposes private proposal data.`)) return
    try {
      await runOperatorAction(`/api/operator/submissions/${selected.id}/${action}`, 'POST', {
        reason, relatedOutpostId: relatedOutpostId || null,
      })
      await loadQueue()
      const { data } = await fetchOperatorSubmission(selected.id)
      setSelected(data.item)
      setReason('')
      report(`Proposal action “${action.replaceAll('-', ' ')}” saved.`)
    } catch (error) {
      report('', error instanceof Error ? error.message : 'Proposal action failed.')
    }
  }

  const convert = async () => {
    if (!selected || !reason.trim() || !sourceLabel.trim() || !checkedAt) return
    try {
      let expectedVersion: number | null = null
      if (selected.submissionType === 'correction' && selected.targetOutpostId) {
        const { data } = await fetchOperatorRecord(selected.targetOutpostId)
        expectedVersion = data.record.version ?? null
      }
      const { data } = await runOperatorAction<{ id: string }>(`/api/operator/submissions/${selected.id}/convert`, 'POST', {
        reason, sourceLabel, checkedAt, verifiedFields, expectedVersion,
      })
      await Promise.all([loadQueue(), reloadContent()])
      setSelected(null)
      report(`Proposal converted to private draft ${data.id}. Review and preview it before publication.`)
    } catch (error) {
      report('', error instanceof Error ? error.message : 'Draft conversion failed.')
    }
  }

  return (
    <section className="submission-workspace" aria-labelledby="submission-queue-heading">
      <div className="section-heading split">
        <div><p className="eyebrow">Private intake</p><h2 id="submission-queue-heading">Directory Submission Queue</h2></div>
        <p>Proposals never publish directly. Terminal personal data is scrubbed.</p>
      </div>
      <div className="submission-filters">
        <label>State<select value={stateFilter} onChange={(event) => setStateFilter(event.target.value)}><option value="">All states</option>{submissionStates.map((state) => <option key={state} value={state}>{state} ({counts[state] ?? 0})</option>)}</select></label>
        <label>Jurisdiction<select value={jurisdictionFilter} onChange={(event) => setJurisdictionFilter(event.target.value)}><option value="">All jurisdictions</option>{jurisdictions.map((place) => <option key={place.abbreviation} value={place.name}>{place.name}</option>)}</select></label>
        <label>Proposal type<select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="">Both types</option><option value="new-listing">New listing</option><option value="correction">Correction</option></select></label>
        <label>Likely duplicate<select value={duplicateFilter} onChange={(event) => setDuplicateFilter(event.target.value)}><option value="">Either</option><option value="yes">Yes</option><option value="no">No</option></select></label>
        <label>Age<select value={ageFilter} onChange={(event) => setAgeFilter(event.target.value)}><option value="">Any age</option><option value="older-30-days">Older than 30 days</option><option value="retention-due">Retention deadline reached</option></select></label>
      </div>
      <div className="submission-queue-layout">
        <div className="submission-private-list" aria-label="Private proposals">
          {items.length === 0 && <p className="empty-queue">No proposals match these filters.</p>}
          {items.map((item) => <button key={item.id} type="button" className={selected?.id === item.id ? 'selected' : ''} onClick={() => void open(item.id)}><span>{item.submissionType} · {item.state}{item.likelyDuplicate ? ' · possible duplicate' : ''}</span><strong>{item.church}</strong><small>{item.city}, {item.jurisdiction} · {new Date(item.createdAt).toLocaleDateString()}</small></button>)}
          {nextCursor && <button type="button" className="text-button" onClick={() => void loadQueue(nextCursor, true)}>Load more proposals</button>}
        </div>
        <div className="submission-private-detail">
          {!selected ? <div className="empty-editor"><h3>Select a proposal</h3><p>Open a private proposal to verify its linked source and decide each field.</p></div> : <>
            <div className="section-heading split"><div><span className="record-type">{selected.referenceCode} · {selected.state}</span><h3>{selected.church}</h3></div><button type="button" className="text-button" onClick={() => setSelected(null)}>Close</button></div>
            <dl className="proposal-facts">
              <div><dt>Location</dt><dd>{selected.streetAddress ? `${selected.streetAddress}, ` : ''}{selected.city}, {selected.jurisdiction} {selected.postalCode}</dd></div>
              <div><dt>Scoped number</dt><dd>{selected.outpostNumber ?? 'Not proposed'}{selected.campusSuffix ? ` · ${selected.campusSuffix}` : ''}</dd></div>
              <div><dt>District / language</dt><dd>{selected.district ?? 'Not proposed'} / {selected.languageOverlay ?? 'Not proposed'}</dd></div>
              <div><dt>Program Groups</dt><dd>{selected.programs.join(', ') || 'Not proposed'}</dd></div>
              <div><dt>Meeting / FCF</dt><dd>{selected.meeting ?? 'Not proposed'} · {selected.fcfActivityStatus}</dd></div>
              <div><dt>Private reply</dt><dd>{selected.replyEmail ?? 'Scrubbed'}</dd></div>
              <div><dt>Private notes</dt><dd>{selected.notes ?? 'None or scrubbed'}</dd></div>
            </dl>
            <a href={selected.sourceUrl} target="_blank" rel="noreferrer">Open proposed public source ↗</a>
            <h4>Candidate matches</h4>
            {selected.matches.length === 0 ? <p>No candidate match was recorded. This is not proof that no duplicate exists.</p> : <ul>{selected.matches.map((match) => <li key={match.id}><code>{match.hubOutpostId}</code> · {match.matchKind} · {match.evidence}</li>)}</ul>}
            <label>Decision reason<input value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} /></label>
            <label>Related stable Hub Outpost ID<input value={relatedOutpostId} onChange={(event) => setRelatedOutpostId(event.target.value)} placeholder="Required evidence for duplicate/correction decisions" /></label>
            <div className="proposal-actions">
              {selected.state === 'new' && <button type="button" disabled={!reason.trim()} onClick={() => void act('triage')}>Start triage</button>}
              {!['converted', 'rejected', 'withdrawn', 'duplicate', 'pii-scrubbed'].includes(selected.state) && <>
                <button type="button" disabled={!reason.trim()} onClick={() => void act('needs-information')}>Needs information</button>
                <button type="button" disabled={!reason.trim() || !relatedOutpostId.trim()} onClick={() => void act('duplicate')}>Mark duplicate</button>
                <button type="button" disabled={!reason.trim()} onClick={() => void act('verified-ready')}>Mark verified-ready</button>
                <button type="button" disabled={!reason.trim()} onClick={() => void act('reject')}>Reject</button>
                <button type="button" disabled={!reason.trim()} onClick={() => void act('withdraw')}>Withdraw</button>
              </>}
              {selected.piiScrubbedAt === null && <button type="button" disabled={!reason.trim()} onClick={() => void act('scrub')}>Scrub personal data</button>}
            </div>
            {selected.state === 'verified-ready' && <fieldset className="conversion-fields">
              <legend>Convert verified fields to a private draft</legend>
              <p>The proposal is not the source. Check the linked first-party Source Document, then select only facts it supports.</p>
              <label>Source Document label<input value={sourceLabel} maxLength={200} onChange={(event) => setSourceLabel(event.target.value)} /></label>
              <label>Checked date<input type="date" value={checkedAt} onChange={(event) => setCheckedAt(event.target.value)} /></label>
              <div>{proposalFields.map((field) => <label key={field}><input type="checkbox" disabled={['church', 'city', 'jurisdiction'].includes(field)} checked={verifiedFields.includes(field)} onChange={(event) => setVerifiedFields(event.target.checked ? [...verifiedFields, field] : verifiedFields.filter((value) => value !== field))} />{field}</label>)}</div>
              <button type="button" disabled={!reason.trim() || !sourceLabel.trim()} onClick={() => void convert()}>Convert to draft only</button>
            </fieldset>}
            <details><summary>Non-personal event history</summary><ol>{selected.events.map((event) => <li key={event.id}>{event.action} · {new Date(event.createdAt).toLocaleString()}{event.reason ? ` — ${event.reason}` : ''}</li>)}</ol></details>
          </>}
        </div>
      </div>
    </section>
  )
}

const populationStates: StagedOutpostCandidate['state'][] = [
  'staged', 'duplicate-review', 'converted-to-draft', 'rejected',
]

function OperatorPopulation({ reloadContent, report }: {
  reloadContent: () => Promise<unknown>
  report: (notice: string, error?: string) => void
}) {
  const [items, setItems] = useState<StagedOutpostCandidate[]>([])
  const [counts, setCounts] = useState<Partial<Record<StagedOutpostCandidate['state'], number>>>({})
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [stateFilter, setStateFilter] = useState('')
  const [selected, setSelected] = useState<StagedOutpostCandidate | null>(null)
  const [reason, setReason] = useState('')
  const [duplicateDecision, setDuplicateDecision] = useState<'confirmed-correction' | 'no-match' | ''>('')

  const load = useCallback(async (cursor: string | null = null, append = false) => {
    const filters = new URLSearchParams({ pageSize: '50' })
    if (stateFilter) filters.set('state', stateFilter)
    if (cursor) filters.set('cursor', cursor)
    const { data } = await fetchStagedOutpostCandidates(filters)
    setItems((current) => append ? [...current, ...data.items] : data.items)
    setCounts(data.counts)
    setNextCursor(data.nextCursor)
    if (!append) setSelected((current) => current ? data.items.find((item) => item.id === current.id) ?? null : null)
  }, [stateFilter])

  useEffect(() => { void load().catch((error: unknown) => report('', error instanceof Error ? error.message : 'Could not load staged candidates.')) }, [load, report])

  const apply = async () => {
    if (!selected || !reason.trim()) return
    try {
      let expectedVersion: number | null = null
      if (selected.operation === 'correction' && selected.targetOutpostId) {
        const { data } = await fetchOperatorRecord(selected.targetOutpostId)
        expectedVersion = data.record.version ?? null
      }
      const { data } = await runOperatorAction<{ id: string }>(
        `/api/operator/population/candidates/${encodeURIComponent(selected.id)}/apply`,
        'POST',
        { reason, expectedVersion, duplicateDecision: duplicateDecision || null },
      )
      await Promise.all([load(), reloadContent()])
      setSelected(null)
      setReason('')
      setDuplicateDecision('')
      report(`Staged candidate converted to private draft ${data.id}. It was not published.`)
    } catch (error) {
      report('', error instanceof Error ? error.message : 'Staged-candidate conversion failed.')
    }
  }

  return <section className="submission-workspace" aria-labelledby="population-queue-heading">
    <div className="section-heading split">
      <div><p className="eyebrow">Source batches</p><h2 id="population-queue-heading">Staged Outpost Candidates</h2></div>
      <p>Validated batches remain private until each candidate and exact source is reviewed.</p>
    </div>
    <div className="submission-filters"><label>Candidate state<select value={stateFilter} onChange={(event) => setStateFilter(event.target.value)}><option value="">All states</option>{populationStates.map((state) => <option key={state} value={state}>{state} ({counts[state] ?? 0})</option>)}</select></label></div>
    <div className="submission-queue-layout">
      <div className="submission-private-list" aria-label="Staged candidates">
        {items.length === 0 && <p className="empty-queue">No staged candidates match this filter.</p>}
        {items.map((item) => <button key={item.id} type="button" className={selected?.id === item.id ? 'selected' : ''} onClick={() => { setSelected(item); setReason(''); setDuplicateDecision('') }}><span>{item.operation} · {item.state}</span><strong>{item.church}</strong><small>{item.city}, {item.jurisdiction}{item.outpostNumber ? ` · Outpost ${item.outpostNumber}` : ''}</small></button>)}
        {nextCursor && <button type="button" className="text-button" onClick={() => void load(nextCursor, true)}>Load more candidates</button>}
      </div>
      <div className="submission-private-detail">
        {!selected ? <div className="empty-editor"><h3>Select a staged candidate</h3><p>Review its per-field sources and candidate matches before creating a draft.</p></div> : <>
          <div className="section-heading split"><div><span className="record-type">{selected.candidateKey} · {selected.state}</span><h3>{selected.church}</h3></div><button type="button" className="text-button" onClick={() => setSelected(null)}>Close</button></div>
          {selected.targetOutpostId && <p>Correction target: <code>{selected.targetOutpostId}</code></p>}
          <h4>Exact field evidence</h4>
          <ul className="population-evidence">{selected.sources.map((source, index) => <li key={`${source.field}-${source.url}-${index}`}><strong>{source.field}</strong> · {source.factKind} · <a href={source.url} target="_blank" rel="noreferrer">{source.label} ↗</a> · checked {source.checkedAt}{source.mappingSourceUrl && <> · <a href={source.mappingSourceUrl} target="_blank" rel="noreferrer">mapping source ↗</a></>}</li>)}</ul>
          <h4>Candidate matches</h4>
          {selected.matches.length === 0 ? <p>No candidate match was recorded. This is not proof that no duplicate exists.</p> : <ul>{selected.matches.map((match) => <li key={match.id}><code>{match.hubOutpostId}</code> · {match.matchKind} · {match.evidence}</li>)}</ul>}
          {selected.state === 'duplicate-review' && <label>Duplicate decision<select value={duplicateDecision} onChange={(event) => setDuplicateDecision(event.target.value as typeof duplicateDecision)}><option value="">Choose after review</option>{selected.operation === 'correction' && <option value="confirmed-correction">Confirmed correction target</option>}<option value="no-match">Candidate match dismissed</option></select></label>}
          <label>Decision reason<input value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} /></label>
          {['staged', 'duplicate-review'].includes(selected.state) && <button type="button" disabled={!reason.trim() || (selected.state === 'duplicate-review' && !duplicateDecision)} onClick={() => void apply()}>Convert to draft only</button>}
          {selected.appliedOutpostId && <p>Applied draft: <code>{selected.appliedOutpostId}</code></p>}
        </>}
      </div>
    </div>
  </section>
}

function OperatorAutomation({ workspace, reload, loadNextPage, report }: {
  workspace: MaintenanceWorkspace
  reload: () => Promise<void>
  loadNextPage: (queue: keyof MaintenanceWorkspace['pagination'], cursor: string) => Promise<void>
  report: (notice: string, error?: string) => void
}) {
  const [reason, setReason] = useState('')
  const [sourceDocumentId, setSourceDocumentId] = useState(workspace.availableSources[0]?.id ?? '')
  const [busy, setBusy] = useState(false)

  const submitAutomationAction = async (path: string, method: 'POST' | 'PUT', body: unknown, notice: string) => {
    setBusy(true); report('')
    try {
      await runOperatorAction(path, method, body)
      await reload()
      setReason('')
      report(notice)
    } catch (error) {
      report('', error instanceof Error ? error.message : 'Automation action failed.')
    } finally { setBusy(false) }
  }
  const requireReason = () => {
    if (reason.trim()) return true
    report('', 'Enter a decision reason before changing automation state.')
    return false
  }

  return <section className="automation-workspace" aria-labelledby="automation-heading">
    <div className="section-heading split">
      <div><p className="eyebrow">Private operations</p><h2 id="automation-heading">Automation</h2></div>
      <span className={`automation-health ${workspace.scheduler.openAlertCount ? 'has-alerts' : ''}`}>
        {workspace.scheduler.openAlertCount} open alert{workspace.scheduler.openAlertCount === 1 ? '' : 's'}
      </span>
    </div>
    <p className="automation-policy"><strong>Technical checks are not factual verification.</strong> “Reachable” or “unchanged” means only that approved bytes or metadata were available. It never advances a verification date. A failure or changed page never closes an Outpost, cancels an Event, or publishes content.</p>
    {workspace.readOnly && <p className="alert error" role="status">Operator privilege renewal is required. Scheduler health and alerts remain visible, while configuration, Run now, and review actions are read-only. Safety and retention jobs continue.</p>}

    <div className="automation-summary" aria-label="Scheduler status">
      <div><strong>{workspace.scheduler.lastRunStatus ?? 'Not run'}</strong><span>Last outcome</span></div>
      <div><strong>{workspace.scheduler.dueJobCount}</strong><span>Due jobs</span></div>
      <div><strong>{workspace.scheduler.dueSourceCount}</strong><span>Due sources</span></div>
      <div><strong>{workspace.scheduler.cadence}</strong><span>Production Cron</span></div>
    </div>
    {!workspace.readOnly && <div className="automation-controls">
      <label>Decision reason<input value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder="Why is this action appropriate?" /></label>
      <button className="button primary" type="button" disabled={busy} onClick={() => {
        if (!window.confirm('Run only currently due, bounded maintenance now?')) return
        void submitAutomationAction('/api/operator/automation/run', 'POST', { confirmed: true }, 'Due maintenance finished. Review the sanitized outcome and alerts below.')
      }}>Run due maintenance now</button>
    </div>}

    <h3>Jobs</h3>
    <div className="automation-card-grid">
      {workspace.jobs.map((job) => <form key={job.key} className="automation-card" onSubmit={(event) => {
        event.preventDefault()
        if (!requireReason()) return
        const values = new FormData(event.currentTarget)
        void submitAutomationAction(`/api/operator/automation/jobs/${encodeURIComponent(job.key)}`, 'PUT', {
          enabled: values.get('enabled') === 'true', batchSize: Number(values.get('batchSize')),
          intervalSeconds: Number(values.get('intervalSeconds')), reason,
        }, `${job.key} configuration saved.`)
      }}>
        <div className="card-topline"><strong>{job.key.replaceAll('-', ' ')}</strong><span>{job.circuitState}</span></div>
        <p>{job.ruleVersion} · last success {job.lastSuccessAt ? new Date(job.lastSuccessAt).toLocaleString() : 'not recorded'}</p>
        <label>State<select name="enabled" defaultValue={String(job.enabled)} disabled={workspace.readOnly}><option value="true">Enabled</option><option value="false">Paused</option></select></label>
        <label>Batch<select name="batchSize" defaultValue={String(job.batchSize)} disabled={workspace.readOnly}>
          {maintenanceJobPolicy(job.key).batchSizes.map((value) => <option key={value}>{value}</option>)}
        </select></label>
        <label>Cadence<select name="intervalSeconds" defaultValue={String(job.intervalSeconds)} disabled={workspace.readOnly}>
          {maintenanceJobPolicy(job.key).intervals
            .map((value) => <option key={value} value={value}>{value < 3600 ? '30 minutes' : value < 86400 ? `${value / 3600} hour${value === 3600 ? '' : 's'}` : 'Daily'}</option>)}
        </select></label>
        {!workspace.readOnly && <button type="submit" disabled={busy}>Save job</button>}
        {!workspace.readOnly && job.circuitState === 'open' && <button type="button" disabled={busy} onClick={() => {
          if (requireReason()) void submitAutomationAction(
            `/api/operator/automation/jobs/${encodeURIComponent(job.key)}/circuit`, 'POST', { reason },
            `${job.key} circuit reset for another bounded attempt.`,
          )
        }}>Reset job circuit</button>}
      </form>)}
    </div>

    {!workspace.readOnly && <><h3>Approve a Source Document</h3><form className="source-approval-form" onSubmit={(event) => {
      event.preventDefault()
      if (!sourceDocumentId || !requireReason()) return
      const values = new FormData(event.currentTarget)
      void submitAutomationAction(`/api/operator/automation/sources/${encodeURIComponent(sourceDocumentId)}/approve`, 'POST', {
        mode: values.get('mode'), intervalSeconds: Number(values.get('intervalSeconds')),
        maximumResponseBytes: Number(values.get('maximumResponseBytes')),
        maximumRedirects: Number(values.get('maximumRedirects')), reason,
      }, 'Source Monitor approval recorded. It remains disabled until explicitly enabled below.')
    }}>
      <label>Exact canonical Source Document<select value={sourceDocumentId} onChange={(event) => setSourceDocumentId(event.target.value)} required><option value="">Choose a source…</option>{workspace.availableSources.map((source) => <option key={source.id} value={source.id}>{source.label} — {source.url}</option>)}</select></label>
      <label>Mode<select name="mode"><option value="availability-metadata">Availability and metadata</option><option value="bounded-fingerprint">Bounded fingerprint</option></select></label>
      <label>Interval<select name="intervalSeconds" defaultValue="86400">{sourceMonitorPolicy.intervals.map((value) => <option key={value} value={value}>{value < 86400 ? `${value / 3600} hours` : value === 86400 ? 'Daily' : value === 259200 ? '3 days' : 'Weekly'}</option>)}</select></label>
      <label>Maximum bytes<select name="maximumResponseBytes" defaultValue="65536">{sourceMonitorPolicy.responseCaps.map((value) => <option key={value} value={value}>{value / 1024} KiB</option>)}</select></label>
      <label>Same-host redirects<select name="maximumRedirects" defaultValue="1">{sourceMonitorPolicy.redirectCounts.map((value) => <option key={value} value={value}>{value === 0 ? 'None' : 'One'}</option>)}</select></label>
      <button type="submit" disabled={busy || !sourceDocumentId}>Approve disabled monitor</button>
    </form></>}
    {!workspace.readOnly && workspace.pagination.availableSources && <button type="button" onClick={() => void loadNextPage('availableSources', workspace.pagination.availableSources!)}>Load more Source Documents</button>}

    {!workspace.readOnly && <><h3>Approved Source Monitors</h3><div className="automation-card-grid">
      {workspace.monitors.length === 0 && <p className="empty-queue">No Source Documents are approved for monitoring.</p>}
      {workspace.monitors.map((monitor) => <article className="automation-card" key={monitor.sourceDocumentId}>
        <div className="card-topline"><strong>{monitor.sourceLabel}</strong><span>{monitor.technicalStatus}</span></div>
        <p><a href={monitor.sourceUrl} target="_blank" rel="noreferrer">Open public source</a> · {monitor.hostname} · {monitor.mode}</p>
        <p>Last technical success: {monitor.lastSuccessAt ? new Date(monitor.lastSuccessAt).toLocaleString() : 'No baseline'} · failures: {monitor.consecutiveFailures}</p>
        <div className="inline-actions">
          <button type="button" disabled={busy} onClick={() => { if (requireReason()) void submitAutomationAction(`/api/operator/automation/sources/${encodeURIComponent(monitor.sourceDocumentId)}/state`, 'PUT', { action: monitor.enabled ? 'disable' : 'enable', reason }, monitor.enabled ? 'Source Monitor disabled.' : 'Source Monitor enabled.') }}>{monitor.enabled ? 'Disable' : 'Enable'}</button>
          {monitor.circuitState === 'open' && <button type="button" disabled={busy} onClick={() => { if (requireReason()) void submitAutomationAction(`/api/operator/automation/sources/${encodeURIComponent(monitor.sourceDocumentId)}/state`, 'PUT', { action: 'reset-circuit', reason }, 'Source Monitor circuit reset for another bounded attempt.') }}>Reset circuit</button>}
        </div>
      </article>)}
      {workspace.pagination.monitors && <button type="button" onClick={() => void loadNextPage('monitors', workspace.pagination.monitors!)}>Load more Source Monitors</button>}
    </div></>}

    {!workspace.readOnly && <><h3>Source-change review</h3><div className="automation-card-grid">
      {workspace.candidates.length === 0 && <p className="empty-queue">No open Automated Update Drafts.</p>}
      {workspace.candidates.map((candidate) => <article className="automation-card" key={candidate.id}>
        <div className="card-topline"><strong>{candidate.sourceLabel}</strong><span>{candidate.state}</span></div>
        <p><a href={candidate.sourceUrl} target="_blank" rel="noreferrer">Inspect public source</a> · {candidate.adapterVersion}</p>
        {candidate.affectedFieldsTruncated && <p>Showing the first {candidate.affectedFields.length} of at least {candidate.affectedFieldCount} affected field references. Inspect every current Field Provenance link before deciding.</p>}
        <ul>{candidate.priorPublicValues.map((field) => <li key={`${field.contentId}:${field.fieldPath}`}><code>{field.fieldPath}</code>: {JSON.stringify(field.value)}</li>)}</ul>
        {!candidate.hasTypedProposal && <p>No value was extracted or guessed. Inspect the source, then edit the canonical record manually if needed.</p>}
        <div className="inline-actions">
          {(['review', 'no-material-change', 'supersede', 'dismiss'] as const).map((action) => <button key={action} type="button" disabled={busy} onClick={() => { if (requireReason()) void submitAutomationAction(`/api/operator/automation/candidates/${encodeURIComponent(candidate.id)}`, 'PUT', { action, reason }, `Candidate marked ${action.replaceAll('-', ' ')}.`) }}>{action.replaceAll('-', ' ')}</button>)}
        </div>
      </article>)}
      {workspace.pagination.candidates && <button type="button" onClick={() => void loadNextPage('candidates', workspace.pagination.candidates!)}>Load more source-change candidates</button>}
    </div></>}

    <h3>Automation Alerts</h3><div className="automation-card-grid" role="list">
      {workspace.alerts.length === 0 && <p className="empty-queue">No open Automation Alerts.</p>}
      {workspace.alerts.map((alert) => <article className={`automation-card alert-${alert.severity}`} key={alert.id} role="listitem">
        <div className="card-topline"><strong>{alert.type.replaceAll('-', ' ')}</strong><span>{alert.status}</span></div>
        <p>{alert.summary}</p><small>Seen {alert.occurrenceCount} time{alert.occurrenceCount === 1 ? '' : 's'} · last {new Date(alert.lastSeenAt).toLocaleString()}</small>
        {!workspace.readOnly && <div className="inline-actions">
          {alert.status === 'open' && <button type="button" disabled={busy} onClick={() => { if (requireReason()) void submitAutomationAction(`/api/operator/automation/alerts/${encodeURIComponent(alert.id)}`, 'PUT', { action: 'acknowledged', reason }, 'Automation Alert acknowledged.') }}>Acknowledge</button>}
          <button type="button" disabled={busy} onClick={() => { if (requireReason()) void submitAutomationAction(`/api/operator/automation/alerts/${encodeURIComponent(alert.id)}`, 'PUT', { action: 'resolved', reason }, 'Automation Alert resolved.') }}>Resolve</button>
        </div>}
      </article>)}
      {workspace.pagination.alerts && <button type="button" onClick={() => void loadNextPage('alerts', workspace.pagination.alerts!)}>Load more Automation Alerts</button>}
    </div>

    <details><summary>Recent sanitized outcomes</summary><ol className="maintenance-run-list">{workspace.recentRuns.map((run) => <li key={`${run.startedAt}:${run.trigger}`}><time dateTime={run.startedAt}>{new Date(run.startedAt).toLocaleString()}</time> — {run.trigger}, {run.status}; {run.jobsClaimed} jobs, {run.actionsApplied} actions, {run.failedTasks} failures, {run.outboundSubrequests} source requests, {run.fetchedBytes} bytes.</li>)}</ol></details>
  </section>
}

function OperatorPage() {
  const [session, setSession] = useState<OperatorSession | null>(null)
  const [transferToken] = useState(() => captureInitialTransferToken(
    window.location,
    (url) => window.history.replaceState(null, '', url),
  ))
  const [snapshot, setSnapshot] = useState<OperatorSnapshot | null>(null)
  const [automation, setAutomation] = useState<MaintenanceWorkspace | null>(null)
  const [draft, setDraft] = useState<ContentRecord | null>(null)
  const [draftBaseline, setDraftBaseline] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [reason, setReason] = useState('')
  const [notice, setNotice] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const previewButtonRef = useRef<HTMLButtonElement>(null)
  const errorRef = useRef<HTMLParagraphElement>(null)
  const dirty = draft !== null && (JSON.stringify(draft) !== draftBaseline || reason.trim() !== '')
  const reportOperatorResult = useCallback((nextNotice: string, nextError = '') => {
    setNotice(nextNotice)
    setErrorMessage(nextError)
  }, [])

  const loadSession = async () => {
    const { data } = await fetchOperatorSession()
    setSession(data)
    return data
  }

  const loadAutomation = async () => {
    const { data } = await fetchMaintenanceWorkspace()
    setAutomation(data)
  }

  const loadNextAutomationPage = async (
    queue: keyof MaintenanceWorkspace['pagination'],
    cursor: string,
  ) => {
    const { data } = await fetchMaintenanceWorkspace({ queue, cursor })
    setAutomation((current) => current ? {
      ...current,
      [queue]: [...current[queue], ...data[queue]],
      pagination: { ...current.pagination, [queue]: data.pagination[queue] },
    } : data)
  }

  const load = async () => {
    setErrorMessage('')
    const operatorSession = await loadSession()
    if (operatorSession.role !== 'active') {
      setSnapshot(null)
      setAutomation(null)
      return null
    }
    await loadAutomation()
    if (operatorSession.account.lifecycleState === 'renewal-required') {
      setSnapshot(null)
      return null
    }
    const { data } = await fetchOperatorSnapshot()
    setSnapshot(data)
    return data
  }

  useEffect(() => { load().catch((error: unknown) => setErrorMessage(error instanceof Error ? error.message : 'Could not load.')) }, [])

  useEffect(() => {
    if (!dirty) return
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    const guardNavigation = (event: Event) => {
      if (!window.confirm('Discard unsaved Operator edits?')) event.preventDefault()
    }
    window.addEventListener('beforeunload', warnBeforeUnload)
    window.addEventListener(navigationEventName, guardNavigation)
    return () => {
      window.removeEventListener('beforeunload', warnBeforeUnload)
      window.removeEventListener(navigationEventName, guardNavigation)
    }
  }, [dirty])

  const confirmDiscard = () => !dirty || window.confirm('Discard unsaved Operator edits?')
  const openDraft = (record: ContentRecord) => {
    if (!confirmDiscard()) return false
    const nextDraft = structuredClone(record)
    setDraft(nextDraft)
    setDraftBaseline(JSON.stringify(nextDraft))
    setReason('')
    setNotice('')
    setErrorMessage('')
    return true
  }
  const closeDraft = () => {
    if (!confirmDiscard()) return
    setDraft(null)
    setDraftBaseline('')
    setReason('')
  }
  const closePreview = () => {
    setPreviewOpen(false)
    window.setTimeout(() => previewButtonRef.current?.focus(), 0)
  }

  const openRecord = async (id: string) => {
    if (!confirmDiscard()) return
    try {
      const { data } = await fetchOperatorRecord(id)
      openDraft(data.record)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'The record could not be loaded.')
    }
  }

  const loadMoreRecords = async () => {
    if (!snapshot?.recordsNextCursor) return
    try {
      const { data } = await fetchMoreOperatorRecords(snapshot.recordsNextCursor)
      setSnapshot({ ...snapshot, records: [...snapshot.records, ...data.records], recordsNextCursor: data.nextCursor })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'More records could not be loaded.')
    }
  }

  const filtered = snapshot ? filterRecords(snapshot.records, filter) : []
  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!draft) return
    setSaving(true); setErrorMessage(''); setNotice('')
    try {
      const { data } = await saveOperatorRecord(draft, reason)
      const nextSnapshot = await load()
      setNotice('Saved. Public changes appear immediately when status is Published.')
      setReason('')
      if (data.id) {
        setDraft(null)
        setDraftBaseline('')
      } else {
        const savedRecord = nextSnapshot?.records.find((record) => record.id === draft.id)
          ?? (await fetchOperatorRecord(draft.id)).data.record
        if (savedRecord) {
          const nextDraft = structuredClone(savedRecord)
          setDraft(nextDraft)
          setDraftBaseline(JSON.stringify(nextDraft))
        }
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Save failed.')
      window.setTimeout(() => errorRef.current?.focus(), 0)
    } finally { setSaving(false) }
  }

  if (!session && !errorMessage) return <div className="load-state" role="status"><div className="loader" /><p>Checking Operator Account…</p></div>
  if (session?.role === 'unclaimed') return <><PageIntro eyebrow="Protected workspace" title="Operator Account setup">Complete the same adult-attested setup used in production. No public signup is created.</PageIntro><OperatorClaimForm session={session} reload={async () => { await load() }} /></>
  if (session?.role === 'pending-successor') return <><PageIntro eyebrow="Protected workspace" title="Operator transfer">Only the matching pending successor can open this acceptance flow.</PageIntro><PendingSuccessorForm session={session} transferToken={transferToken} reload={async () => { await load() }} /></>

  return (
    <>
      <PageIntro eyebrow="Protected workspace" title="Operator Console">
        Create, verify, preview, publish, and archive records. Local beta access is limited to localhost; production uses the sole Cloudflare Access identity.
      </PageIntro>
      <section className="wrap operator-shell">
        {errorMessage && <p ref={errorRef} className="alert error" role="alert" tabIndex={-1}>{errorMessage}</p>}
        {notice && <p className="alert success" role="status">{notice}</p>}
        {session?.role === 'active' && <OperatorAccountPanel session={session} reload={async () => { await load() }} />}
      {automation && <OperatorAutomation workspace={automation} reload={loadAutomation} loadNextPage={loadNextAutomationPage} report={reportOperatorResult} />}
        {snapshot && <div className="operator-status"><span className="status-dot" /> Authorized as <strong>{snapshot.operatorLabel}</strong><span>Showing {snapshot.records.length} records</span></div>}
        {snapshot && <div className="operator-layout">
          <aside className="record-manager">
            <div className="manager-heading"><h2>Content</h2><button type="button" onClick={() => openDraft(newDraft('outpost'))}>+ New</button></div>
            <label className="sr-only" htmlFor="record-filter">Filter records</label><input id="record-filter" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter records…" />
            <div className="record-list">
              {filtered.map((record) => <button type="button" key={record.id} className={draft?.id === record.id ? 'selected' : ''} onClick={() => void openRecord(record.id)}><span>{recordLabel(record)} · {record.status}</span><strong>{record.title}</strong></button>)}
            </div>
            {snapshot?.recordsNextCursor && <button type="button" className="text-button" onClick={() => void loadMoreRecords()}>Load more records</button>}
          </aside>
          <div className="editor-panel">
            {!draft ? <div className="empty-editor"><span>✦</span><h2>Select a record</h2><p>Choose a record to edit, or create a new one.</p></div> : (
              <form onSubmit={save}>
                <div className="editor-heading"><div><p className="eyebrow">{draft.id ? 'Edit record' : 'New record'}</p><h2>{draft.title || 'Untitled record'}</h2>{dirty && <span className="unsaved-indicator">Unsaved edits</span>}</div><button type="button" className="text-button" onClick={closeDraft}>Close</button></div>
                <fieldset><legend>Publishing</legend><div className="form-grid">
                  <label>Record type<select value={draft.kind} onChange={(event) => { const kind = event.target.value as RecordKind; setDraft({ ...draft, kind, details: defaultDetails(kind) }) }}>{Object.entries(kindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  <label>Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as PublicationStatus })}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label>
                  <label className="full">Title<input required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
                  <label className="full">Slug<input required value={draft.slug} pattern="[a-z0-9-]+" onChange={(event) => setDraft({ ...draft, slug: event.target.value })} /></label>
                  <label className="full">Summary<textarea required value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} /></label>
                  <label>Verified date<input type="date" value={draft.verifiedAt?.slice(0, 10) ?? ''} onChange={(event) => setDraft({ ...draft, verifiedAt: event.target.value ? `${event.target.value}T00:00:00.000Z` : null })} /></label>
                  <p className="field-help">Set this only after every populated public field below has a source checked on the same date.</p>
                </div></fieldset>
                <DetailsEditor draft={draft} updateDetails={(details) => setDraft({ ...draft, details })} />
                <fieldset><legend>Field-level sources</legend>{draft.sources.map((source, index) => <div className="source-editor" key={`${source.id}-${index}`}>
                  <label>Field name<input required value={source.fieldName} onChange={(event) => { const sources = [...draft.sources]; sources[index] = { ...source, fieldName: event.target.value }; setDraft({ ...draft, sources }) }} /></label>
                  <label>Source label<input required value={source.label} onChange={(event) => { const sources = [...draft.sources]; sources[index] = { ...source, label: event.target.value }; setDraft({ ...draft, sources }) }} /></label>
                  <label>HTTPS URL<input required type="url" value={source.url} onChange={(event) => { const sources = [...draft.sources]; sources[index] = { ...source, url: event.target.value }; setDraft({ ...draft, sources }) }} /></label>
                  <label>Verified date<input required type="date" value={source.verifiedAt.slice(0, 10)} onChange={(event) => { const sources = [...draft.sources]; sources[index] = { ...source, verifiedAt: `${event.target.value}T00:00:00.000Z` }; setDraft({ ...draft, sources }) }} /></label>
                  {draft.sources.length > 1 && <button type="button" onClick={() => setDraft({ ...draft, sources: draft.sources.filter((_, sourceIndex) => sourceIndex !== index) })}>Remove</button>}
                </div>)}<button type="button" className="text-button" onClick={() => setDraft({ ...draft, sources: [...draft.sources, { id: '', fieldName: 'record', label: '', url: '', verifiedAt: new Date().toISOString() }] })}>+ Add source</button></fieldset>
                <label>Change note<input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="What changed and why?" /></label>
                <div className="editor-actions"><button className="button primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save record'}</button><button ref={previewButtonRef} className="button secondary" type="button" onClick={() => setPreviewOpen(true)}>Preview</button><span>Drafts, archived records, and previews stay private.</span></div>
              </form>
            )}
          </div>
        </div>}
        {snapshot && <OperatorSubmissions
          reloadContent={load}
          report={reportOperatorResult}
        />}
        {snapshot && <OperatorPopulation
          reloadContent={load}
          report={reportOperatorResult}
        />}
        {snapshot && <OperatorFreshness
          snapshot={snapshot}
          reload={load}
          openRecord={(recordId) => {
            void openRecord(recordId).then(() => window.setTimeout(() => document.querySelector('.operator-layout')?.scrollIntoView({ behavior: preferredScrollBehavior() }), 0))
          }}
          report={reportOperatorResult}
        />}
        {snapshot && <section className="audit-panel"><h2>Recent activity</h2>{snapshot.audit.slice(0, 12).map((event) => <div key={event.id}><strong>{event.action}</strong><span>{event.actorLabel} · {snapshot.records.find((record) => record.id === event.recordId)?.title ?? event.recordId}</span><time>{new Date(event.createdAt).toLocaleString()}</time></div>)}</section>}
      </section>
      {previewOpen && draft && snapshot && (
        <DraftPreviewDialog draft={draft} records={snapshot.records} conflicts={snapshot.conflicts} onClose={closePreview} />
      )}
    </>
  )
}

function App() {
  const { route, search, navigate, location } = useRoute()
  const [bundle, setBundle] = useState<PublicBootstrap | null>(null)
  const [loadError, setLoadError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [usingOfflineData, setUsingOfflineData] = useState(false)
  const [searchQuery, setSearchQuery] = useState(() => search.get('q') ?? '')
  const previousLocation = useRef(location)

  const pageTitle = route === '/search' && search.get('q')
    ? `Search: ${search.get('q')}`
    : routeTitles[route]

  useEffect(() => {
    document.title = `${pageTitle} | Ranger Outpost Hub`
    if (previousLocation.current !== location) {
      window.setTimeout(() => document.getElementById('main-content')?.focus({ preventScroll: true }), 0)
    }
    previousLocation.current = location
  }, [location, pageTitle])

  useEffect(() => {
    let active = true
    fetchPublicBootstrap()
      .then(({ data, fromCache }) => {
        if (!active) return
        setUsingOfflineData(fromCache)
        setBundle(data)
        setLoadError('')
      })
      .catch(() => {
        if (!active) return
        setLoadError(
          navigator.onLine
            ? 'The public information could not be loaded. Try again in a moment.'
            : 'Public information is unavailable offline because this device has not saved it yet. Reconnect and try again.',
        )
      })
    return () => { active = false }
  }, [loadAttempt])

  const records = useMemo(() => {
    const byId = new Map([...(bundle?.navigation ?? []), ...(bundle?.featuredRecords ?? [])].map((record) => [record.id, record]))
    return [...byId.values()]
  }, [bundle])
  const requestedGroup = search.get('group')
  const advancementGroup = requestedGroup && programGroups.includes(requestedGroup as ProgramGroup)
    ? requestedGroup as ProgramGroup
    : ''
  const onSearch = (event: FormEvent) => {
    event.preventDefault()
    navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`)
  }

  let content: ReactNode
  if (route === '/operator') content = <OperatorPage />
  else if (route === '/signup' || route === '/sign-in' || route === '/forgot-password'
    || route === '/reset-password' || route === '/account') {
    content = <AccountPages route={route} navigate={navigate} />
  }
  else if (loadError) content = <div className="load-state"><h1>The hub could not load</h1><p>{loadError}</p><button type="button" onClick={() => { setLoadError(''); setBundle(null); setLoadAttempt((attempt) => attempt + 1) }}>Try again</button></div>
  else if (!bundle) content = <div className="load-state" role="status"><div className="loader" /><p>Loading verified records…</p></div>
  else if (route === '/outposts') content = <OutpostsPage coverage={bundle.coverage} />
  else if (route === '/add-your-outpost') content = <AddOutpostPage />
  else if (route === '/advancement') content = <AdvancementPage navigation={bundle.navigation} initialGroup={advancementGroup} />
  else if (route === '/events') content = <EventsPage />
  else if (route === '/about') content = <InformationPage records={records} section="about" />
  else if (route === '/other') content = <InformationPage records={records} section="other" />
  else if (route === '/help') content = <InformationPage records={records} section="help" />
  else if (route === '/search') content = <SearchPage query={search.get('q') ?? ''} />
  else content = <HomePage records={records} outpostCount={bundle.counts.outpost} />

  return (
    <Shell
      route={route}
      location={location}
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
      onSearch={onSearch}
      routeAnnouncement={`${pageTitle} page loaded.`}
    >
      {usingOfflineData && bundle && (
        <div className="offline-data-banner" role="status">
          Offline: showing saved public information generated {new Date(bundle.generatedAt).toLocaleString()}. Verification dates are unchanged; confirm current details with each source.
        </div>
      )}
      {content}
    </Shell>
  )
}

export default App
