import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  claimedPositions,
  ordinaryProfileDraft,
  validateOrdinaryProfileDraft,
  type OrdinaryAccountProfile,
  type OrdinaryProfileDraft,
  type OnboardingPath,
} from '../../shared/account'
import { listInternationalCountries } from '../../shared/countries'
import { usJurisdictions } from '../../shared/us-directory'
import {
  fetchOrdinaryLifecycle,
  fetchOrdinaryProfile,
  renewOrdinaryAccount,
  searchOrdinaryOutposts,
  updateOrdinaryProfile,
  type OrdinaryLifecycleStatus,
  type OrdinaryOutpostMatch,
} from '../data/client'

const internationalCountries = listInternationalCountries()

export function OrdinaryAccountPage({ navigate }: { navigate: (path: string) => void }) {
  const [profile, setProfile] = useState<OrdinaryAccountProfile | null>(null)
  const [lifecycle, setLifecycle] = useState<OrdinaryLifecycleStatus | null>(null)
  const [draft, setDraft] = useState<OrdinaryProfileDraft | null>(null)
  const [matches, setMatches] = useState<OrdinaryOutpostMatch[]>([])
  const [outpostQuery, setOutpostQuery] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const [renewing, setRenewing] = useState(false)
  const [lifecycleUnavailable, setLifecycleUnavailable] = useState(false)
  const errorRef = useRef<HTMLDivElement>(null)
  const renewalKey = useRef(`account-renewal-${crypto.randomUUID()}`)

  useEffect(() => {
    fetchOrdinaryLifecycle().then(async ({ data }) => {
      setLifecycle(data.lifecycle)
      if (data.lifecycle.state === 'expired') return
      const profileResponse = await fetchOrdinaryProfile()
      setProfile(profileResponse.data.profile)
      setDraft(ordinaryProfileDraft(profileResponse.data.profile))
    }).catch(() => setLifecycleUnavailable(true))
  }, [navigate])

  useEffect(() => {
    if (error) errorRef.current?.focus()
  }, [error])

  const changeDraft = (change: Partial<OrdinaryProfileDraft>) => {
    setDraft((current) => current ? { ...current, ...change } : current)
  }

  const search = async () => {
    if (!draft) return
    setError('')
    try {
      const path = draft.onboardingPath as OnboardingPath
      const scope = path === 'usa' ? draft.usaJurisdictionId : draft.countryCode
      if (!scope || !outpostQuery.trim()) throw new Error('Choose the location and enter an outpost number, church, or city.')
      const { data } = await searchOrdinaryOutposts(path, scope, outpostQuery, true)
      setMatches(data.items)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Outpost search failed.')
    }
  }

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!profile || !draft) return
    setError('')
    setSaved('')
    try {
      const { data } = await updateOrdinaryProfile(validateOrdinaryProfileDraft(draft), profile.version)
      setProfile(data.profile)
      setDraft(ordinaryProfileDraft(data.profile))
      setMatches([])
      setSaved('Private profile updated. No membership or editing access moved.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Update failed.')
    }
  }

  const renew = async () => {
    if (!lifecycle || renewing) return
    setError('')
    setSaved('')
    setRenewing(true)
    try {
      const { data } = await renewOrdinaryAccount(lifecycle.version, renewalKey.current)
      setLifecycle(data.lifecycle)
      renewalKey.current = `account-renewal-${crypto.randomUUID()}`
      setSaved(`Your Account is renewed. Access is now due ${formatLifecycleTime(data.lifecycle.accessDueAt)}.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Renewal failed.')
    } finally {
      setRenewing(false)
    }
  }

  if (lifecycle?.state === 'expired') {
    return <section className="account-page wrap narrow">
      <p className="eyebrow">Private ordinary account</p>
      <h1>Account access ended</h1>
      <div className="account-lifecycle-notice expired" role="status" aria-live="polite">
        <h2>This Account was not renewed before {formatLifecycleTime(lifecycle.accessDueAt)}</h2>
        <p>Private Account features are locked and signed-in sessions have ended. Public Ranger Outpost Hub pages remain available without an Account.</p>
        {lifecycle.deletionDueAt && <p>The Account and its private information are scheduled for permanent deletion after {formatLifecycleTime(lifecycle.deletionDueAt)}. The old Account cannot be restored or renewed.</p>}
      </div>
      <button className="button primary" type="button" onClick={() => navigate('/')}>Browse public information</button>
    </section>
  }

  if (lifecycleUnavailable) {
    return <section className="account-page wrap narrow">
      <p className="eyebrow">Private ordinary account</p>
      <h1>Account access unavailable</h1>
      <div className="account-lifecycle-notice expired" role="status">
        <h2>Your private session has ended</h2>
        <p>The Account may have expired or been permanently deleted. An expired Account cannot be renewed or restored. Public Ranger Outpost Hub pages remain available without an Account.</p>
      </div>
      <div className="account-actions">
        <button type="button" onClick={() => navigate('/sign-in')}>Sign in</button>
        <button className="button primary" type="button" onClick={() => navigate('/')}>Browse public information</button>
      </div>
    </section>
  }

  if (!lifecycle || !profile || !draft) {
    return <section className="account-page wrap narrow"><p className="eyebrow">Private ordinary account</p><h1>Account</h1><p>Loading your private profile…</p></section>
  }

  const claimedPosition = profile.claimedPosition === 'Other'
    ? profile.claimedPositionOther
    : profile.claimedPosition
  const currentOutpost = profile.currentOutpost
    ? `${profile.currentOutpost.title}, ${profile.currentOutpost.city}, ${profile.currentOutpost.jurisdiction}`
    : profile.outpostClaim
      ? `Private unmatched claim: ${profile.outpostClaim}`
      : 'No Current Outpost'

  return <section className="account-page wrap narrow">
    <p className="eyebrow">Private ordinary account</p>
    <h1>Account</h1>
    <p>Only you can read this private profile. It is not a public roster.</p>
    <dl className="account-summary">
      <div><dt>Access state</dt><dd>{lifecycle.state === 'renewal-notice' ? 'Renewal available' : 'Active'}</dd></div>
      <div><dt>Access due</dt><dd>{formatLifecycleTime(lifecycle.accessDueAt)}</dd></div>
    </dl>
    {lifecycle.state === 'renewal-notice' && <div className="account-lifecycle-notice" role="status" aria-live="polite">
      <h2>Renew your Account for another year</h2>
      <p>Your private Account access ends {formatLifecycleTime(lifecycle.accessDueAt)} unless you renew. Renewal does not verify membership, position, or Outpost association.</p>
      <p>{warningDeliveryMessage(lifecycle.warningDelivery)}</p>
      <button className="button primary" type="button" disabled={renewing} onClick={() => void renew()}>{renewing ? 'Renewing…' : 'Yes, renew for one year'}</button>
    </div>}
    {error && <div ref={errorRef} tabIndex={-1} className="form-error" role="alert">{error}</div>}
    {saved && <p className="success-note" role="status">{saved}</p>}
    <dl className="account-summary">
      <div><dt>Sign-in email</dt><dd>{profile.email} · Verified</dd></div>
      <div><dt>Adult eligibility</dt><dd>Confirmed {new Date(profile.adultEligibility.confirmedAt).toLocaleDateString()} · Birth Year not retained</dd></div>
      <div><dt>Onboarding Path</dt><dd>{profile.onboardingPath === 'usa' ? 'USA' : 'International'}</dd></div>
      <div><dt>Claimed Position</dt><dd>{claimedPosition} · <strong>Not Verified</strong></dd></div>
      <div><dt>Current Outpost / claim</dt><dd>{currentOutpost} · <strong>Membership Not Verified</strong></dd></div>
      {profile.currentOutpost && <>
        <div><dt>Verified district</dt><dd>{profile.currentOutpost.district ?? 'Not Verified'}</dd></div>
        <div><dt>Verified region</dt><dd>{profile.currentOutpost.region ?? 'Not Verified'}</dd></div>
        <div><dt>Language overlay</dt><dd>{profile.currentOutpost.languageOverlay ?? 'Not Verified'}</dd></div>
        <div><dt>FCF territory</dt><dd>{profile.currentOutpost.fcfTerritory ?? 'Not Verified'}</dd></div>
        <div><dt>FCF activity status</dt><dd>{profile.currentOutpost.fcfActivityStatus}</dd></div>
      </>}
    </dl>
    <form className="account-panel form-stack" onSubmit={save}>
      <h2>Edit private profile</h2>
      <label htmlFor="account-name">Display Name</label>
      <input id="account-name" maxLength={80} value={draft.displayName} onChange={(event) => changeDraft({ displayName: event.target.value })} />
      <label htmlFor="account-position">Claimed Position</label>
      <select id="account-position" value={draft.claimedPosition} onChange={(event) => changeDraft({ claimedPosition: event.target.value, claimedPositionOther: '' })}>{claimedPositions.map((position) => <option key={position}>{position}</option>)}</select>
      {draft.claimedPosition === 'Other' && <><label htmlFor="account-other-position">Other position</label><input id="account-other-position" value={draft.claimedPositionOther} maxLength={80} onChange={(event) => changeDraft({ claimedPositionOther: event.target.value })} /></>}
      <fieldset className="form-stack">
        <legend>Current Outpost / private location claim</legend>
        <label><input type="radio" name="account-path" checked={draft.onboardingPath === 'usa'} onChange={() => changeDraft({ onboardingPath: 'usa', countryCode: '', internationalSubdivision: '', currentOutpostId: '', noCurrentOutpost: true })} /> USA</label>
        <label><input type="radio" name="account-path" checked={draft.onboardingPath === 'international'} onChange={() => changeDraft({ onboardingPath: 'international', usaJurisdictionId: '', currentOutpostId: '', noCurrentOutpost: true })} /> International</label>
        {draft.onboardingPath === 'usa' ? <>
          <label htmlFor="account-usa-location">State, District of Columbia, or populated territory</label>
          <select id="account-usa-location" value={draft.usaJurisdictionId.replace('us-', '').toUpperCase()} onChange={(event) => { changeDraft({ usaJurisdictionId: event.target.value ? `us-${event.target.value.toLowerCase()}` : '', currentOutpostId: '', noCurrentOutpost: true }); setMatches([]) }}><option value="">Choose one</option>{usJurisdictions.map((item) => <option key={item.abbreviation} value={item.abbreviation}>{item.name}</option>)}</select>
        </> : <>
          <label htmlFor="account-country">Country or territory</label>
          <select id="account-country" value={draft.countryCode} onChange={(event) => { changeDraft({ countryCode: event.target.value, currentOutpostId: '', noCurrentOutpost: true }); setMatches([]) }}><option value="">Choose one</option>{internationalCountries.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}</select>
          <label htmlFor="account-subdivision">State, province, territory, or locally named subdivision (optional)</label>
          <input id="account-subdivision" maxLength={100} value={draft.internationalSubdivision} onChange={(event) => changeDraft({ internationalSubdivision: event.target.value })} />
        </>}
        <div className="outpost-account-search">
          <label htmlFor="account-outpost-query">Outpost number, church, or city</label>
          <div><input id="account-outpost-query" maxLength={80} value={outpostQuery} onChange={(event) => setOutpostQuery(event.target.value)} /><button type="button" onClick={() => void search()}>Search verified listings</button></div>
        </div>
        {matches.length > 0 && <fieldset className="match-list"><legend>Select another verified listing deliberately</legend>{matches.map((match) => <label key={match.id}><input type="radio" name="account-outpost" checked={draft.currentOutpostId === match.id && !draft.noCurrentOutpost} onChange={() => changeDraft({ currentOutpostId: match.id, noCurrentOutpost: false, outpostClaim: '' })} /><span><strong>{match.title}</strong><small>{match.church} · {match.city}, {match.jurisdiction}{match.externalNumber ? ` · Outpost ${match.externalNumber}` : ''}</small></span></label>)}</fieldset>}
        <label className="check-row"><input type="checkbox" checked={draft.noCurrentOutpost} onChange={(event) => changeDraft({ noCurrentOutpost: event.target.checked, currentOutpostId: event.target.checked ? '' : draft.currentOutpostId })} /> Outpost not listed / No Current Outpost</label>
        {draft.noCurrentOutpost && <><label htmlFor="account-claim">Private outpost/location claim (optional)</label><input id="account-claim" value={draft.outpostClaim} maxLength={120} onChange={(event) => changeDraft({ outpostClaim: event.target.value })} /></>}
      </fieldset>
      <p className="field-note">Changing this claim grants no membership or permission and does not move editing access.</p>
      <button className="button primary">Save private profile</button>
    </form>
  </section>
}

function formatLifecycleTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(new Date(value))
}

function warningDeliveryMessage(state: OrdinaryLifecycleStatus['warningDelivery']) {
  if (state === 'accepted') return 'The renewal warning was sent to your verified sign-in email.'
  if (state === 'failed') return 'The warning could not be sent. The deletion clock has not started, and private support has been alerted.'
  if (state === 'pending') return 'The renewal warning is due and awaiting delivery.'
  return 'The renewal warning is not due yet.'
}
