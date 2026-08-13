export function preferredScrollBehavior(reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches): ScrollBehavior {
  return reducedMotion ? 'auto' : 'smooth'
}
