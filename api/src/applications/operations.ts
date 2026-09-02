import type { Application } from '#types'
import type { DefaultTreeAdapterMap } from 'parse5'
import escapeHtml from 'escape-html'

type ApplicationWithExposedUrl = Application & { exposedUrl: string }

export const setUniqueRefs = (application: Application): void => {
  if (application.slug) {
    application._uniqueRefs = [application.id]
    if (application.slug !== application.id) application._uniqueRefs.push(application.slug)
  }
}

export const buildManifest = (application: ApplicationWithExposedUrl, baseApp: { id: string }, publicBaseUrl: string): Record<string, any> => {
  return {
    name: application.title,
    short_name: application.title,
    description: application.description,
    start_url: new URL(application.exposedUrl).pathname + '/',
    scope: new URL(application.exposedUrl).pathname + '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#1e88e5',
    lang: 'fr',
    icons: ['64x64', '120x120', '144x144', '152x152', '192x192', '384x384', '512x512'].map(sizes => {
      const iconUrl = new URL(publicBaseUrl + '/api/v1/base-applications/' + encodeURIComponent(baseApp.id) + '/icon')
      const [width, height] = sizes.split('x')
      iconUrl.searchParams.set('width', width)
      iconUrl.searchParams.set('height', height)
      return {
        sizes,
        type: 'image/png',
        src: iconUrl.href
      }
    })
  }
}

export const buildLoginHtml = (loginHtml: string, opts: { siteUrl: string, application: Application, applicationId: string, error?: string }): string => {
  const authUrl = new URL(`${opts.siteUrl}/simple-directory/api/auth/password`)
  authUrl.searchParams.set('redirect', `${opts.siteUrl}/data-fair/app/${opts.applicationId}`)
  if (opts.application.owner.type === 'organization') {
    authUrl.searchParams.set('org', opts.application.owner.id)
  }
  const logoUrl = new URL(`${opts.siteUrl}/simple-directory/api/avatars/${opts.application.owner.type}/${opts.application.owner.id}/avatar.png`)
  return loginHtml
    .replace('{ERROR}', opts.error ? `<p style="color:red">${escapeHtml(opts.error)}</p>` : '')
    .replace('{AUTH_ROUTE}', authUrl.href)
    .replace('{LOGO}', logoUrl.href)
}

// The placeholder base applications declare as `window.APPLICATION=%APPLICATION%;`, which the
// proxy fills with the application being served.
const applicationPlaceholder = '%APPLICATION%'

/**
 * Substitutes the application JSON into the `window.APPLICATION` script of a parsed base
 * application document, and returns the number of substitutions made.
 *
 * The walk deliberately targets text inside `script` elements instead of running on the raw
 * HTML string, because neither string form is correct:
 *
 * - a non-global `replace` substitutes the *first* occurrence anywhere in the document, so an
 *   application that names the placeholder before that script — `app-calendar` 1.3.0 mentions
 *   it in a comment above the script — consumes the only substitution and leaves the real
 *   script with a literal `%APPLICATION%`. That is a syntax error, `window.APPLICATION` stays
 *   undefined, and the application never receives its configuration;
 * - making that regex global would be worse: the JSON would then also land inside comments and
 *   text, where a `-->` in any user-provided string (an application title, a dataset label)
 *   closes the comment early and turns the rest of the JSON into markup.
 *
 * Substituting on script text only keeps the injection in the single context the contract
 * defines, and leaves every other mention of the placeholder alone.
 */
export const injectApplicationGlobal = (node: DefaultTreeAdapterMap['node'], applicationJson: string): number => {
  let substituted = 0
  if ('tagName' in node && node.tagName === 'script') {
    // script is a raw text element: its content is text children only, never nested markup
    for (const child of node.childNodes) {
      // parse5 types the children as Element | TextNode; only a text node carries a value,
      // and `nodeName` cannot narrow the union because Element declares it as a plain string
      if (!('value' in child)) continue
      if (!child.value.includes(applicationPlaceholder)) continue
      child.value = child.value.replaceAll(applicationPlaceholder, applicationJson)
      substituted++
    }
    return substituted
  }
  if ('childNodes' in node) {
    for (const child of node.childNodes) substituted += injectApplicationGlobal(child, applicationJson)
  }
  return substituted
}
