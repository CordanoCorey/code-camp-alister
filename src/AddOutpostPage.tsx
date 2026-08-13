import { useEffect, useRef, useState, type FormEvent } from 'react'
import { programGroups } from '../shared/domain'
import { deriveUsDirectoryGeography, type FcfActivityStatus } from '../shared/us-directory'
import { fetchPublicIntakeConfiguration, submitOutpostProposal, type PublicIntakeConfiguration } from './data/client'
import { jurisdictions } from './data/jurisdictions'
import {
  formatOutpostSubmission,
  submissionMailto,
  validateOutpostSubmission,
  type OutpostSubmission,
  type SubmissionErrors,
} from './lib/outpostSubmission'

declare global {
  interface Window {
    turnstile?: {
      render(container: HTMLElement, options: Record<string, unknown>): string
      reset(widgetId: string): void
    }
  }
}

const emptySubmission: OutpostSubmission = {
  submissionType: 'new-listing', targetOutpostId: null, church: '', outpostNumber: null,
  campusSuffix: null, streetAddress: null, city: '', jurisdiction: '', postalCode: null,
  district: null, languageOverlay: null, programs: [], meeting: null, sourceUrl: '',
  fcfActivityStatus: 'not-verified', replyEmail: '', notes: null, privacyConfirmed: false,
}

const configuredSupportEmail = import.meta.env.VITE_PUBLIC_SUPPORT_EMAIL?.trim() ?? ''
const hasConfiguredRecipient = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(configuredSupportEmail)

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <span className="field-error" id={id}>{message}</span> : null
}

function TurnstileChallenge({ configuration, onToken }: {
  configuration: PublicIntakeConfiguration
  onToken: (token: string) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!configuration.siteKey || !configuration.action || !container.current) return
    let cancelled = false
    const render = () => {
      if (cancelled || !container.current || !window.turnstile) return
      container.current.replaceChildren()
      window.turnstile.render(container.current, {
        sitekey: configuration.siteKey,
        action: configuration.action,
        callback: (token: string) => onToken(token),
        'expired-callback': () => onToken(''),
        'error-callback': () => onToken(''),
      })
    }
    if (window.turnstile) render()
    else {
      const script = document.createElement('script')
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.async = true
      script.defer = true
      script.addEventListener('load', render, { once: true })
      document.head.append(script)
    }
    return () => { cancelled = true }
  }, [configuration.action, configuration.siteKey, onToken])
  return <div className="turnstile-challenge" ref={container} aria-label="Human verification" />
}

export function AddOutpostPage() {
  const [values, setValues] = useState(emptySubmission)
  const [errors, setErrors] = useState<SubmissionErrors>({})
  const [prepared, setPrepared] = useState<ReturnType<typeof formatOutpostSubmission> | null>(null)
  const [copyNotice, setCopyNotice] = useState('')
  const [configuration, setConfiguration] = useState<PublicIntakeConfiguration>({ enabled: false })
  const [challengeToken, setChallengeToken] = useState('')
  const [honeypot, setHoneypot] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submissionStatus, setSubmissionStatus] = useState('')
  const errorSummaryRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true
    fetchPublicIntakeConfiguration()
      .then(({ data }) => { if (active) setConfiguration(data) })
      .catch(() => { if (active) setConfiguration({ enabled: false }) })
    return () => { active = false }
  }, [])

  const update = <Field extends keyof OutpostSubmission>(field: Field, value: OutpostSubmission[Field]) => {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
    setPrepared(null)
    setCopyNotice('')
    setSubmissionStatus('')
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const nextErrors = validateOutpostSubmission(values)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      setPrepared(null)
      window.setTimeout(() => errorSummaryRef.current?.focus(), 0)
      return
    }
    const fallback = formatOutpostSubmission(values)
    setPrepared(fallback)
    if (!configuration.enabled || !configuration.timingToken || (configuration.siteKey && !challengeToken)) {
      setSubmissionStatus(configuration.enabled && configuration.siteKey
        ? 'Complete the human-verification check to save online. The email/copy proposal is prepared below.'
        : 'The proposal was prepared but was not saved. Use the email or copy option below.')
      return
    }
    setSubmitting(true)
    try {
      const { data } = await submitOutpostProposal({
        proposal: values,
        challengeToken,
        timingToken: configuration.timingToken,
        website: honeypot,
      })
      setSubmissionStatus(`Proposal saved privately. Reference ${data.referenceCode}. It is not published yet.`)
      setPrepared(null)
      setValues(emptySubmission)
      setChallengeToken('')
    } catch (errorValue) {
      setSubmissionStatus(`${errorValue instanceof Error ? errorValue.message : 'The proposal was not saved.'} The email/copy proposal is prepared below.`)
    } finally {
      setSubmitting(false)
    }
  }

  const copy = async () => {
    if (!prepared) return
    try {
      await navigator.clipboard.writeText(prepared.copyText)
      setCopyNotice('Proposal copied. Paste it into an email and supply the recipient if needed.')
    } catch {
      setCopyNotice('Select the prepared proposal below and copy it manually.')
    }
  }

  const derived = values.jurisdiction ? deriveUsDirectoryGeography(values.jurisdiction) : null
  const districts = configuration.districts ?? []
  const languageOverlays = configuration.languageOverlays ?? []

  return (
    <>
      <section className="page-intro">
        <div className="wrap narrow">
          <p className="eyebrow">Independent directory proposal</p>
          <h1>Add Your Outpost</h1>
          <p>
            Propose a new listing or correction for the Operator to verify. A proposal is private,
            is not an official Royal Rangers charter, and never publishes automatically.
          </p>
        </div>
      </section>
      <section className="wrap submission-layout">
        <div className="submission-note">
          <strong>Public organizational facts only</strong>
          <p>
            Do not include youth or member information, rosters, or a leader&apos;s personal contact
            details. Reply email and notes stay private and are scrubbed after disposition or retention review.
          </p>
        </div>
        <form className="submission-form" noValidate onSubmit={submit}>
          {Object.keys(errors).length > 0 && (
            <div ref={errorSummaryRef} className="alert error" role="alert" tabIndex={-1}>
              Check the highlighted fields. Nothing has been saved or prepared yet.
            </div>
          )}
          {submissionStatus && <p className="alert" role="status">{submissionStatus}</p>}
          <label className="submission-trap" aria-hidden="true">
            Website<input tabIndex={-1} autoComplete="off" value={honeypot} onChange={(event) => setHoneypot(event.target.value)} />
          </label>
          <fieldset>
            <legend>What are you proposing?</legend>
            <div className="choice-row">
              <label><input type="radio" name="submission-type" checked={values.submissionType === 'new-listing'} onChange={() => update('submissionType', 'new-listing')} />New listing</label>
              <label><input type="radio" name="submission-type" checked={values.submissionType === 'correction'} onChange={() => update('submissionType', 'correction')} />Correction</label>
            </div>
          </fieldset>
          {values.submissionType === 'correction' && (
            <label htmlFor="submission-target">
              Existing Hub Outpost ID <span aria-hidden="true">*</span>
              <input id="submission-target" value={values.targetOutpostId ?? ''} onChange={(event) => update('targetOutpostId', event.target.value || null)} aria-invalid={Boolean(errors.targetOutpostId)} aria-describedby={errors.targetOutpostId ? 'submission-target-error' : 'submission-target-help'} />
              <span className="field-help" id="submission-target-help">Copy the stable Hub Outpost ID from the existing listing. A number alone is not enough.</span>
              <FieldError id="submission-target-error" message={errors.targetOutpostId} />
            </label>
          )}
          <div className="form-grid">
            <label className="full" htmlFor="submission-church">
              Church or outpost name <span aria-hidden="true">*</span>
              <input id="submission-church" value={values.church} maxLength={160} aria-invalid={Boolean(errors.church)} aria-describedby={errors.church ? 'submission-church-error' : undefined} onChange={(event) => update('church', event.target.value)} />
              <FieldError id="submission-church-error" message={errors.church} />
            </label>
            <label htmlFor="submission-number">Outpost number, if known<input id="submission-number" value={values.outpostNumber ?? ''} maxLength={40} onChange={(event) => update('outpostNumber', event.target.value || null)} /></label>
            <label htmlFor="submission-campus">Campus suffix, if known<input id="submission-campus" value={values.campusSuffix ?? ''} maxLength={80} onChange={(event) => update('campusSuffix', event.target.value || null)} /></label>
            <label className="full" htmlFor="submission-street">Public church street address<input id="submission-street" value={values.streetAddress ?? ''} maxLength={200} onChange={(event) => update('streetAddress', event.target.value || null)} /></label>
            <label htmlFor="submission-city">City <span aria-hidden="true">*</span><input id="submission-city" value={values.city} maxLength={100} aria-invalid={Boolean(errors.city)} aria-describedby={errors.city ? 'submission-city-error' : undefined} onChange={(event) => update('city', event.target.value)} /><FieldError id="submission-city-error" message={errors.city} /></label>
            <label htmlFor="submission-postal">ZIP<input id="submission-postal" inputMode="numeric" value={values.postalCode ?? ''} maxLength={20} onChange={(event) => update('postalCode', event.target.value || null)} /></label>
            <label className="full" htmlFor="submission-jurisdiction">
              State or U.S. territory <span aria-hidden="true">*</span>
              <select id="submission-jurisdiction" value={values.jurisdiction} aria-invalid={Boolean(errors.jurisdiction)} aria-describedby={errors.jurisdiction ? 'submission-jurisdiction-error' : undefined} onChange={(event) => update('jurisdiction', event.target.value)}>
                <option value="">Choose a state or U.S. territory</option>
                {jurisdictions.map((place) => <option key={place.abbreviation} value={place.name}>{place.name}</option>)}
              </select>
              <FieldError id="submission-jurisdiction-error" message={errors.jurisdiction} />
            </label>
            <label htmlFor="submission-district">District, if verified<input id="submission-district" list="directory-districts" value={values.district ?? ''} maxLength={160} onChange={(event) => update('district', event.target.value || null)} /><datalist id="directory-districts">{districts.map((name) => <option key={name} value={name} />)}</datalist></label>
            <label htmlFor="submission-language">Language district, if verified<input id="submission-language" list="directory-language-overlays" value={values.languageOverlay ?? ''} maxLength={160} onChange={(event) => update('languageOverlay', event.target.value || null)} /><datalist id="directory-language-overlays">{languageOverlays.map((name) => <option key={name} value={name} />)}</datalist></label>
          </div>
          {derived && (
            <p className="derived-geography">
              Maintained geographic mapping: {derived.region ?? 'Region not auto-filled'}; {derived.fcfTerritory ?? 'FCF Territory not auto-filled'}.
              FCF Territory does not establish local FCF activity, and no district or language overlay is inferred.
            </p>
          )}
          <fieldset className="program-choices">
            <legend>Program Groups</legend>
            <p>Select groups named by the linked public source. Leave blank if not verified.</p>
            <div>{programGroups.map((program) => <label key={program}><input type="checkbox" checked={values.programs.includes(program)} onChange={(event) => update('programs', event.target.checked ? [...values.programs, program] : values.programs.filter((value) => value !== program))} />{program}</label>)}</div>
          </fieldset>
          <label htmlFor="submission-meeting">Public meeting information<textarea id="submission-meeting" maxLength={500} value={values.meeting ?? ''} onChange={(event) => update('meeting', event.target.value || null)} /></label>
          <label htmlFor="submission-source">Public church contact or source URL <span aria-hidden="true">*</span><input id="submission-source" type="url" inputMode="url" placeholder="https://church.example/rangers" value={values.sourceUrl} maxLength={500} aria-invalid={Boolean(errors.sourceUrl)} aria-describedby={errors.sourceUrl ? 'submission-source-error' : undefined} onChange={(event) => update('sourceUrl', event.target.value)} /><FieldError id="submission-source-error" message={errors.sourceUrl} /></label>
          <label htmlFor="submission-fcf">Active FCF<select id="submission-fcf" value={values.fcfActivityStatus} onChange={(event) => update('fcfActivityStatus', event.target.value as FcfActivityStatus)}><option value="not-verified">Not verified</option><option value="yes">Yes — explicitly supported by source</option><option value="no">No — explicitly supported by source</option></select><span className="field-help">Choose Yes or No only when the source explicitly establishes local Outpost activity.</span></label>
          <label htmlFor="submission-email">Private reply email <span aria-hidden="true">*</span><input id="submission-email" type="email" inputMode="email" value={values.replyEmail} maxLength={254} aria-invalid={Boolean(errors.replyEmail)} aria-describedby={errors.replyEmail ? 'submission-email-error' : 'submission-email-help'} onChange={(event) => update('replyEmail', event.target.value)} /><span className="field-help" id="submission-email-help">Used only to review or ask about this proposal; never shown publicly.</span><FieldError id="submission-email-error" message={errors.replyEmail} /></label>
          <label htmlFor="submission-notes">Optional private notes<textarea id="submission-notes" maxLength={1000} value={values.notes ?? ''} onChange={(event) => update('notes', event.target.value || null)} /></label>
          <label className="confirmation" htmlFor="submission-confirmation"><input id="submission-confirmation" type="checkbox" checked={values.privacyConfirmed} aria-invalid={Boolean(errors.privacyConfirmed)} aria-describedby={errors.privacyConfirmed ? 'submission-confirmation-error' : undefined} onChange={(event) => update('privacyConfirmed', event.target.checked)} />I confirm this proposal contains no youth/member roster or personal leader contact details.</label>
          <FieldError id="submission-confirmation-error" message={errors.privacyConfirmed} />
          {configuration.enabled && configuration.siteKey && <TurnstileChallenge configuration={configuration} onToken={setChallengeToken} />}
          <button className="button primary" type="submit" disabled={submitting}>{submitting ? 'Saving privately…' : configuration.enabled ? 'Submit private proposal' : 'Prepare email submission'}</button>
          <p className="privacy-note">Proposals do not charter or publish an Outpost. Terminal reply email and notes are scrubbed; unresolved proposals enter Operator retention review after six months.</p>
        </form>

        {prepared && (
          <section className="prepared-submission" aria-labelledby="prepared-heading">
            <p className="eyebrow">Prepared, not saved</p>
            <h2 id="prepared-heading">Your fallback proposal is ready</h2>
            <p>{hasConfiguredRecipient ? 'Open the draft in your email app, review it, and send it.' : 'Copy the proposal and supply the Ranger Outpost Hub support address in your email app.'}</p>
            <textarea readOnly value={prepared.copyText} aria-label="Prepared outpost proposal" />
            <div className="prepared-actions">
              {hasConfiguredRecipient && <a className="button primary" href={submissionMailto(configuredSupportEmail, prepared.subject, prepared.body)}>Open email draft</a>}
              <button className="button secondary" type="button" onClick={copy}>Copy proposal</button>
            </div>
            {copyNotice && <p role="status">{copyNotice}</p>}
          </section>
        )}
      </section>
    </>
  )
}
