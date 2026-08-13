import { useEffect, useRef, useState, type FormEvent } from 'react'
import { claimedPositions, validateOrdinaryProfileDraft, type ClaimedPosition, type OnboardingPath } from '../../shared/account'
import { listInternationalCountries } from '../../shared/countries'
import { usJurisdictions } from '../../shared/us-directory'
import {
  checkAdultEligibility,
  consumeLocalAuthPreview,
  createOrdinaryAccount,
  fetchOrdinaryAccountConfiguration,
  requestOrdinaryPasswordReset,
  resetOrdinaryPassword,
  searchOrdinaryOutposts,
  signInOrdinaryAccount,
  type OrdinaryAccountConfiguration,
  type OrdinaryOutpostMatch,
} from '../data/client'
import { OrdinaryAccountPage } from './OrdinaryAccountPage'

type AccountRoute = '/signup' | '/sign-in' | '/forgot-password' | '/reset-password' | '/account'

const internationalCountries = listInternationalCountries()

const sessionChanged = () => window.dispatchEvent(new Event('ranger-outpost:sessionchange'))

function AccountIntro({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="account-page wrap narrow"><p className="eyebrow">Private ordinary account</p><h1>{title}</h1>{children}</section>
}

function ErrorMessage({ message }: { message: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { if (message) ref.current?.focus() }, [message])
  return message ? <div ref={ref} tabIndex={-1} className="form-error" role="alert">{message}</div> : null
}

function Turnstile({ configuration, onToken }: { configuration: OrdinaryAccountConfiguration; onToken: (token: string) => void }) {
  const container = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!configuration.siteKey) return
    let cancelled = false
    const browser = window as unknown as { turnstile?: { render: (node: Element, options: Record<string, unknown>) => string; remove: (id: string) => void } }
    let widget = ''
    const render = () => {
      if (cancelled || !container.current || !browser.turnstile) return
      widget = browser.turnstile.render(container.current, {
        sitekey: configuration.siteKey,
        action: configuration.action,
        callback: onToken,
        'expired-callback': () => onToken(''),
        'error-callback': () => onToken(''),
      })
    }
    if (browser.turnstile) render()
    else {
      const script = document.createElement('script')
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.async = true
      script.onload = render
      document.head.append(script)
    }
    return () => {
      cancelled = true
      if (widget && browser.turnstile) browser.turnstile.remove(widget)
    }
  }, [configuration.action, configuration.siteKey, onToken])
  return configuration.siteKey ? <div ref={container} className="turnstile-challenge" aria-label="Human verification" /> : null
}

function SignupPage({ navigate }: { navigate: (path: string) => void }) {
  const [configuration, setConfiguration] = useState<OrdinaryAccountConfiguration | null>(null)
  const [step, setStep] = useState(0)
  const [path, setPath] = useState<OnboardingPath>('usa')
  const [birthYear, setBirthYear] = useState('')
  const [attested, setAttested] = useState(false)
  const [challengeToken, setChallengeToken] = useState('')
  const [eligibilityToken, setEligibilityToken] = useState('')
  const [usaJurisdictionId, setUsaJurisdictionId] = useState('')
  const [countryCode, setCountryCode] = useState('')
  const [subdivision, setSubdivision] = useState('')
  const [outpostQuery, setOutpostQuery] = useState('')
  const [matches, setMatches] = useState<OrdinaryOutpostMatch[]>([])
  const [currentOutpostId, setCurrentOutpostId] = useState<string | null>(null)
  const [noCurrentOutpost, setNoCurrentOutpost] = useState(false)
  const [outpostClaim, setOutpostClaim] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [claimedPosition, setClaimedPosition] = useState<ClaimedPosition>('Parent/Guardian')
  const [claimedPositionOther, setClaimedPositionOther] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetchOrdinaryAccountConfiguration().then(({ data }) => setConfiguration(data)).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'Account configuration could not be loaded.')
    })
  }, [])

  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError('')
    try { await action() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Try again.') } finally { setBusy(false) }
  }

  const checkAge = (event: FormEvent) => {
    event.preventDefault()
    void run(async () => {
      try {
        const { data } = await checkAdultEligibility({ birthYear, attested, challengeToken: challengeToken || undefined })
        setEligibilityToken(data.token)
        setStep(3)
      } finally {
        setBirthYear('')
      }
    })
  }

  const search = (event: FormEvent) => {
    event.preventDefault()
    void run(async () => {
      const scope = path === 'usa' ? usaJurisdictionId : countryCode.trim().toUpperCase()
      if (!scope || !outpostQuery.trim()) throw new Error('Choose the location and enter an outpost number, church, or city.')
      const { data } = await searchOrdinaryOutposts(path, scope, outpostQuery)
      setMatches(data.items)
      if (!data.items.length) setNoCurrentOutpost(true)
    })
  }

  const continueFromLocation = () => {
    const scopeReady = path === 'usa' ? Boolean(usaJurisdictionId) : /^[A-Za-z]{2}$/.test(countryCode.trim())
    if (!scopeReady || (!currentOutpostId && !noCurrentOutpost)) {
      setError('Choose a location and explicitly select an Outpost or No Current Outpost.')
      return
    }
    setError(''); setStep(4)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void run(async () => {
      const profile = validateOrdinaryProfileDraft({
        displayName,
        onboardingPath: path,
        claimedPosition,
        claimedPositionOther,
        currentOutpostId: currentOutpostId ?? '',
        noCurrentOutpost,
        outpostClaim,
        usaJurisdictionId,
        countryCode,
        internationalSubdivision: subdivision,
      })
      await createOrdinaryAccount({ email, password, eligibilityToken, profile })
      setPassword(''); setEligibilityToken(''); setStep(5)
    })
  }

  const openLocalPreview = () => void run(async () => {
    const { data } = await consumeLocalAuthPreview('verification')
    const response = await fetch(data.url, { credentials: 'same-origin' })
    if (!response.ok) throw new Error('The local verification link is invalid or expired.')
    navigate('/sign-in?verified=true')
  })

  if (!configuration) return <AccountIntro title="Create an account"><ErrorMessage message={error} /><p>Loading private account setup…</p></AccountIntro>
  if (!configuration.signupEnabled) return <AccountIntro title="Create an account"><p>Account signup is not configured on this host. Public browsing remains available.</p></AccountIntro>

  return <AccountIntro title="Create an adult account">
    <p className="account-progress" aria-live="polite">Step {Math.min(step + 1, 6)} of 6</p>
    <ErrorMessage message={error} />
    {step === 0 && <div className="account-panel"><h2>Language and browser translation</h2><p>This site is currently written in English. In Chrome, open the browser menu and choose <strong>Translate</strong> to use Chrome’s page translation. The Hub does not store a language choice.</p><button className="button primary" onClick={() => setStep(1)}>Continue</button></div>}
    {step === 1 && <fieldset className="account-panel"><legend>Where is your Outpost connection?</legend><p>USA and International paths use different location structures.</p><label><input type="radio" name="path" checked={path === 'usa'} onChange={() => setPath('usa')} /> USA</label><label><input type="radio" name="path" checked={path === 'international'} onChange={() => setPath('international')} /> International</label><div className="account-actions"><button onClick={() => setStep(0)}>Back</button><button className="button primary" onClick={() => setStep(2)}>Continue</button></div></fieldset>}
    {step === 2 && <form className="account-panel form-stack" onSubmit={checkAge}><h2>Adult eligibility</h2><p>Ordinary accounts are currently for adults age 18 or older. This year-only check is not identity proof or official age verification.</p><label htmlFor="birth-year">Birth Year</label><input id="birth-year" inputMode="numeric" autoComplete="bday-year" pattern="[0-9]{4}" maxLength={4} value={birthYear} onChange={(event) => setBirthYear(event.target.value)} required /><label className="check-row"><input type="checkbox" checked={attested} onChange={(event) => setAttested(event.target.checked)} required /> I confirm I am at least 18. False information may cause access to be refused or removed.</label><Turnstile configuration={configuration} onToken={setChallengeToken} /><div className="account-actions"><button type="button" onClick={() => setStep(1)}>Back</button><button className="button primary" disabled={busy || Boolean(configuration.siteKey && !challengeToken)}>Check and continue</button></div></form>}
    {step === 3 && <div className="account-panel form-stack"><h2>{path === 'usa' ? 'USA Outpost and location' : 'International Outpost and location'}</h2>{path === 'usa' ? <><label htmlFor="usa-location">State, District of Columbia, or populated territory</label><select id="usa-location" value={usaJurisdictionId.replace('us-', '').toUpperCase()} onChange={(event) => { setUsaJurisdictionId(event.target.value ? `us-${event.target.value.toLowerCase()}` : ''); setMatches([]); setCurrentOutpostId(null) }} required><option value="">Choose one</option>{usJurisdictions.map((item) => <option key={item.abbreviation} value={item.abbreviation}>{item.name}</option>)}</select></> : <><label htmlFor="country-code">Country or territory</label><select id="country-code" value={countryCode} onChange={(event) => { setCountryCode(event.target.value); setMatches([]); setCurrentOutpostId(null) }} required><option value="">Choose one</option>{internationalCountries.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}</select><label htmlFor="subdivision">State, province, territory, or locally named subdivision (optional)</label><input id="subdivision" value={subdivision} maxLength={100} onChange={(event) => setSubdivision(event.target.value)} /></>}
      <form className="outpost-account-search" onSubmit={search}><label htmlFor="outpost-query">Outpost number, church, or city</label><div><input id="outpost-query" value={outpostQuery} maxLength={80} onChange={(event) => setOutpostQuery(event.target.value)} /><button disabled={busy}>Search verified listings</button></div></form>
      {matches.length > 0 && <fieldset className="match-list"><legend>Select the verified listing deliberately</legend>{matches.map((match) => <label key={match.id}><input type="radio" name="outpost" checked={currentOutpostId === match.id} onChange={() => { setCurrentOutpostId(match.id); setNoCurrentOutpost(false); setOutpostClaim('') }} /><span><strong>{match.title}</strong><small>{match.church} · {match.city}, {match.jurisdiction}{match.externalNumber ? ` · Outpost ${match.externalNumber}` : ''}</small></span></label>)}</fieldset>}
      <label className="check-row"><input type="checkbox" checked={noCurrentOutpost} onChange={(event) => { setNoCurrentOutpost(event.target.checked); if (event.target.checked) setCurrentOutpostId(null) }} /> Outpost not listed / No Current Outpost</label>{noCurrentOutpost && <><label htmlFor="outpost-claim">Private outpost association (optional; a bare number is not a unique listing)</label><input id="outpost-claim" value={outpostClaim} maxLength={120} onChange={(event) => setOutpostClaim(event.target.value)} /><a href="/add-your-outpost">Add a public Outpost proposal separately</a></>}
      <div className="account-actions"><button onClick={() => setStep(2)}>Back</button><button className="button primary" onClick={continueFromLocation}>Continue</button></div></div>}
    {step === 4 && <form className="account-panel form-stack" onSubmit={submit}><h2>Private account details</h2><label htmlFor="display-name">First or chosen Display Name</label><input id="display-name" autoComplete="given-name" maxLength={80} value={displayName} onChange={(event) => setDisplayName(event.target.value)} required /><label htmlFor="claimed-position">Claimed Position</label><select id="claimed-position" value={claimedPosition} onChange={(event) => setClaimedPosition(event.target.value as ClaimedPosition)}>{claimedPositions.map((position) => <option key={position}>{position}</option>)}</select>{claimedPosition === 'Other' && <><label htmlFor="other-position">Other position</label><input id="other-position" maxLength={80} value={claimedPositionOther} onChange={(event) => setClaimedPositionOther(event.target.value)} required /></>}<p className="field-note">A position claim is private and grants no membership, editing permission, or Operator authority.</p><label htmlFor="signup-email">Sign-in email</label><input id="signup-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /><label htmlFor="signup-password">New password for Ranger Outpost Hub</label><input id="signup-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} required /><p className="field-note">Use at least 8 characters. Password managers and pasted passwords are welcome.</p><div className="account-actions"><button type="button" onClick={() => setStep(3)}>Back</button><button className="button primary" disabled={busy}>Create account</button></div></form>}
    {step === 5 && <div className="account-panel"><h2>Verify your sign-in email</h2><p>Your profile remains pending until you use the verification link, then sign in. The link expires and does not grant membership or a verified position.</p>{configuration.localPreview && <button className="button primary" disabled={busy} onClick={openLocalPreview}>Open one-time local verification link</button>}<p><button className="link-button" onClick={() => navigate('/sign-in')}>Go to sign in</button></p></div>}
  </AccountIntro>
}

function SignInPage({ navigate }: { navigate: (path: string) => void }) {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [local, setLocal] = useState(false)
  useEffect(() => { fetchOrdinaryAccountConfiguration().then(({ data }) => setLocal(data.localPreview)).catch(() => undefined) }, [])
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(''); try { await signInOrdinaryAccount(email, password); setPassword(''); sessionChanged(); navigate('/account') } catch (reason) { setError(reason instanceof Error ? reason.message : 'Sign-in failed.') } finally { setBusy(false) } }
  const localVerification = async () => { setError(''); try { const { data } = await consumeLocalAuthPreview('verification'); const response = await fetch(data.url, { credentials: 'same-origin' }); if (!response.ok) throw new Error('The local verification link is invalid or expired.'); navigate('/sign-in?verified=true') } catch (reason) { setError(reason instanceof Error ? reason.message : 'No local verification preview is ready.') } }
  return <AccountIntro title="Sign in"><p>{new URLSearchParams(window.location.search).get('verified') === 'true' ? 'Email verified. Sign in to open your private Account.' : 'Use your verified Ranger Outpost Hub email and password.'}</p><ErrorMessage message={error} /><form className="account-panel form-stack" onSubmit={submit}><label htmlFor="signin-email">Email</label><input id="signin-email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /><label htmlFor="signin-password">Password</label><input id="signin-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /><button className="button primary" disabled={busy}>Sign in</button></form>{local && error && <p><button onClick={() => void localVerification()}>Open latest one-time local verification link</button></p>}<p><button className="link-button" onClick={() => navigate('/forgot-password')}>Forgot password?</button> · <button className="link-button" onClick={() => navigate('/signup')}>Create an adult account</button></p></AccountIntro>
}

function ForgotPasswordPage({ navigate }: { navigate: (path: string) => void }) {
  const [email, setEmail] = useState(''); const [sent, setSent] = useState(false); const [local, setLocal] = useState(false); const [error, setError] = useState('')
  useEffect(() => { fetchOrdinaryAccountConfiguration().then(({ data }) => setLocal(data.localPreview)).catch(() => undefined) }, [])
  const submit = async (event: FormEvent) => { event.preventDefault(); setError(''); try { await requestOrdinaryPasswordReset(email); setSent(true) } catch { setSent(true) } }
  const preview = async () => { setError(''); try { const { data } = await consumeLocalAuthPreview('password-reset'); const response = await fetch(data.url, { credentials: 'same-origin' }); if (!response.ok) throw new Error('The local recovery link is invalid or expired.'); const target = new URL(response.url); navigate(`${target.pathname}${target.search}`) } catch (reason) { setError(reason instanceof Error ? reason.message : 'No local recovery preview is ready.') } }
  return <AccountIntro title="Reset your password"><p>Enter an email. The response is the same whether or not an account exists.</p><ErrorMessage message={error} /><form className="account-panel form-stack" onSubmit={submit}><label htmlFor="recovery-email">Email</label><input id="recovery-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /><button className="button primary">Send recovery link</button></form>{sent && <div className="account-panel" role="status"><p>If an eligible account exists, a recovery link has been prepared.</p>{local && <button onClick={preview}>Open one-time local recovery link</button>}</div>}</AccountIntro>
}

function ResetPasswordPage({ navigate }: { navigate: (path: string) => void }) {
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token') ?? '')
  const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [done, setDone] = useState(false)
  useEffect(() => { if (token) window.history.replaceState({}, '', '/reset-password') }, [token])
  const submit = async (event: FormEvent) => { event.preventDefault(); setError(''); try { await resetOrdinaryPassword(token, password); setPassword(''); setDone(true) } catch (reason) { setError(reason instanceof Error ? reason.message : 'The link is invalid or expired.') } }
  return <AccountIntro title="Choose a new password"><ErrorMessage message={error} />{!token ? <p>This recovery link is invalid or expired. Request a fresh link.</p> : done ? <div className="account-panel"><p>Password updated and existing sessions revoked.</p><button className="button primary" onClick={() => navigate('/sign-in')}>Sign in</button></div> : <form className="account-panel form-stack" onSubmit={submit}><label htmlFor="reset-password">New password for Ranger Outpost Hub</label><input id="reset-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} required /><button className="button primary">Update password</button></form>}</AccountIntro>
}

export function AccountPages({ route, navigate }: { route: AccountRoute; navigate: (path: string) => void }) {
  if (route === '/signup') return <SignupPage navigate={navigate} />
  if (route === '/sign-in') return <SignInPage navigate={navigate} />
  if (route === '/forgot-password') return <ForgotPasswordPage navigate={navigate} />
  if (route === '/reset-password') return <ResetPasswordPage navigate={navigate} />
  return <OrdinaryAccountPage navigate={navigate} />
}
