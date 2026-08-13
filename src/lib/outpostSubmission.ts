import {
  validateDirectorySubmission,
  type DirectorySubmissionErrors,
  type DirectorySubmissionInput,
} from '../../shared/us-directory'

export type OutpostSubmission = DirectorySubmissionInput
export type SubmissionErrors = DirectorySubmissionErrors

export const validateOutpostSubmission = validateDirectorySubmission

function supplied(value: string | null) {
  return value?.trim() || 'Not provided'
}

export function formatOutpostSubmission(values: OutpostSubmission) {
  const subject = `Directory ${values.submissionType === 'correction' ? 'correction' : 'submission'}: ${values.church.trim()} — ${values.city.trim()}, ${values.jurisdiction}`
  const body = [
    'ADD YOUR OUTPOST — PRIVATE DIRECTORY PROPOSAL',
    '',
    `Proposal type: ${values.submissionType === 'correction' ? 'Correction' : 'New listing'}`,
    `Existing Hub Outpost ID: ${supplied(values.targetOutpostId)}`,
    `Church or outpost name: ${values.church.trim()}`,
    `Outpost number: ${supplied(values.outpostNumber)}`,
    `Campus suffix: ${supplied(values.campusSuffix)}`,
    `Public street address: ${supplied(values.streetAddress)}`,
    `City: ${values.city.trim()}`,
    `State or U.S. territory: ${values.jurisdiction}`,
    `ZIP: ${supplied(values.postalCode)}`,
    `District: ${supplied(values.district)}`,
    `Language overlay: ${supplied(values.languageOverlay)}`,
    `Program Groups: ${values.programs.join(', ') || 'Not provided'}`,
    `Meeting information: ${supplied(values.meeting)}`,
    `Public church contact or source URL: ${values.sourceUrl.trim()}`,
    `FCF activity: ${values.fcfActivityStatus === 'not-verified' ? 'Not verified' : values.fcfActivityStatus === 'yes' ? 'Yes' : 'No'}`,
    `Private reply email: ${values.replyEmail.trim()}`,
    `Notes: ${supplied(values.notes)}`,
    '',
    'I confirm this proposal contains no youth/member roster or personal leader contact details.',
    'I understand that this is a proposal to the independent Ranger Outpost Hub directory. It is not an official charter, registration, or automatic publication request.',
  ].join('\n')
  return { subject, body, copyText: `Subject: ${subject}\n\n${body}` }
}

export function submissionMailto(recipient: string, subject: string, body: string) {
  return `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
