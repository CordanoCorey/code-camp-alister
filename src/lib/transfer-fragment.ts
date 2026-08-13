import { parseTransferTokenFragment } from '../../shared/operator-lifecycle'

export function consumeTransferTokenFragment(
  location: Pick<Location, 'pathname' | 'search' | 'hash'>,
  replace: (url: string) => void,
) {
  const token = parseTransferTokenFragment(location.hash)
  if (location.hash.startsWith('#') && new URLSearchParams(location.hash.slice(1)).has('transfer')) {
    replace(`${location.pathname}${location.search}`)
  }
  return token
}

export function createTransferTokenCapture() {
  let captured = false
  let token: string | null = null
  return (
    location: Pick<Location, 'pathname' | 'search' | 'hash'>,
    replace: (url: string) => void,
  ) => {
    if (!captured) {
      captured = true
      token = consumeTransferTokenFragment(location, replace)
    }
    return token
  }
}

export const captureInitialTransferToken = createTransferTokenCapture()
