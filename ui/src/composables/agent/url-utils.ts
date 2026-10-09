// Pure helpers for turning agent-facing links into absolute application URLs and
// back into router paths. Kept free of Vue/router/window so they can be unit-tested.
//
// Why this exists: the agent chat renders prose in the agents iframe and the iframe
// resolves clicked links against its own URL, so links must be full absolute URLs
// (origin + history base + path) to survive the round-trip to the host SPA. The agent
// is therefore handed ready-made absolute URLs (list_pages, the host-reported location, and
// the `page` field of dataset/application tools); `navigate` accepts those same absolute
// URLs (or a bare path) and reduces them back to a base-less router path for router.push.

/** Strip a trailing slash from a router history base: '/data-fair/' -> '/data-fair', '/' -> ''. */
const normalizeBase = (base: string): string => (base.endsWith('/') ? base.slice(0, -1) : base)

/**
 * Build an absolute application URL from a router path. The path may be a template
 * still containing placeholders (e.g. `/dataset/{id}`), so no URL parsing is done here.
 */
export function toAbsoluteUrl (origin: string, base: string, path: string): string {
  return origin + normalizeBase(base) + (path.startsWith('/') ? path : '/' + path)
}

/**
 * Reduce any link the agent produced — a full URL, a base-prefixed path, or a bare
 * router path — to a base-less router path plus any embedded query string. Robust to a
 * wrong/hallucinated origin: only the pathname (and query) of the input is used.
 */
export function toRoutePath (origin: string, base: string, input: string): { path: string, query?: string } {
  const parsed = new URL(input, origin)
  const baseNoTrailing = normalizeBase(base)
  let pathname = parsed.pathname
  if (baseNoTrailing && (pathname === baseNoTrailing || pathname.startsWith(baseNoTrailing + '/'))) {
    pathname = pathname.slice(baseNoTrailing.length) || '/'
  }
  return { path: pathname, query: parsed.search ? parsed.search.slice(1) : undefined }
}

/** Most suggestions a failed navigation offers; a menu, not a dump of the route table. */
const MAX_ROUTE_SUGGESTIONS = 12

/**
 * Route templates worth offering when a path did not resolve.
 *
 * The agent invents plausible sub-pages — a judged simulation caught it pushing
 * `/dataset/{id}/edit-schema`, which does not exist (schema editing lives on the
 * dataset page itself). Before `navigate` refused unresolvable paths, that landed
 * the person on a blank page and silently dropped every tool the real page
 * registers, after which the assistant had nothing to go on and started asking
 * the person to describe their own screen.
 *
 * So the refusal has to say what DOES exist: the sibling pages under the same
 * first segment, params rendered as `{id}` to match the templating `list_pages`
 * already hands the model. When the first segment matches nothing at all, the
 * mistake is bigger than a wrong sub-page, so it falls back to the static
 * top-level pages instead of every parameterised route in the app.
 */
export function suggestRoutes (routePaths: string[], attemptedPath: string): string[] {
  const template = (p: string) => p.replace(/:([A-Za-z0-9_]+)\??/g, '{$1}')
  const firstSegment = attemptedPath.split('/').filter(Boolean)[0]

  const siblings = firstSegment
    ? routePaths.filter(p => p === '/' + firstSegment || p.startsWith('/' + firstSegment + '/'))
    : []

  const chosen = siblings.length
    ? siblings
    // Nothing under that segment: offer the pages that need no id to reach.
    : routePaths.filter(p => !p.includes(':') && p !== '/')

  return [...new Set(chosen.map(template))].sort().slice(0, MAX_ROUTE_SUGGESTIONS)
}
