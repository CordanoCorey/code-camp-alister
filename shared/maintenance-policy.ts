export const sourceMonitorPolicy = {
  intervals: [21_600, 43_200, 86_400, 259_200, 604_800],
  responseCaps: [65_536, 131_072, 262_144],
  redirectCounts: [0, 1],
} as const

export function maintenanceJobPolicy(jobKey: string) {
  return {
    batchSizes: jobKey === 'source-monitoring' ? [4, 8, 16] : [10, 25, 50],
    intervals: jobKey === 'source-monitoring' ? [1800]
      : jobKey === 'maintenance-history-retention' ? [86400]
        : jobKey === 'ordinary-account-lifecycle' ? [1800, 3600, 21600]
          : [1800, 3600, 21600, 86400],
  }
}

const credentialParameter = /(^|[-_])(access|auth|authorization|credential|jwt|key|password|secret|sig|signature|token)([-_]|$)|^x-amz-/i

function isIpLiteral(hostname: string) {
  return hostname.includes(':') || /^\d+(?:\.\d+){0,3}$/.test(hostname)
}

export type SourceTargetPolicyFailure =
  | 'invalid-url' | 'not-https' | 'credentials' | 'nonstandard-port' | 'fragment'
  | 'private-hostname' | 'cross-host' | 'secret-query'

export class SourceTargetPolicyError extends Error {
  readonly failure: SourceTargetPolicyFailure

  constructor(failure: SourceTargetPolicyFailure) {
    super(failure)
    this.failure = failure
  }
}

export function validateSourceTarget(value: string, expectedHostname?: string) {
  let url: URL
  try { url = new URL(value) } catch { throw new SourceTargetPolicyError('invalid-url') }
  if (url.protocol !== 'https:') throw new SourceTargetPolicyError('not-https')
  if (url.username || url.password) throw new SourceTargetPolicyError('credentials')
  if (url.port) throw new SourceTargetPolicyError('nonstandard-port')
  if (url.hash) throw new SourceTargetPolicyError('fragment')
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
  if (!hostname || hostname === 'localhost' || isIpLiteral(hostname)
    || hostname.endsWith('.localhost') || hostname.endsWith('.local')
    || hostname.endsWith('.internal') || hostname.endsWith('.lan') || hostname.endsWith('.home')) {
    throw new SourceTargetPolicyError('private-hostname')
  }
  if (expectedHostname !== undefined && hostname !== expectedHostname) {
    throw new SourceTargetPolicyError('cross-host')
  }
  for (const [name, parameter] of url.searchParams) {
    if (credentialParameter.test(name) || parameter.length > 200) {
      throw new SourceTargetPolicyError('secret-query')
    }
  }
  url.hostname = hostname
  return { url, exactUrl: url.toString(), canonicalHostname: hostname }
}
