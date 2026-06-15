import type { Application } from '#types'
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
