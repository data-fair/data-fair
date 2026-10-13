// Serve one UI build in the browser on the dev stack's own origin: build files come
// from disk, API and config requests go to the stack, so only the bundle differs.
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import type { BrowserContext } from 'playwright'

export type RouteDecision = { action: 'stack' } | { action: 'file', file: string } | { action: 'index' }

export function classifyRequest (pathname: string, isNavigation: boolean, hasFile: (rel: string) => boolean): RouteDecision {
  const rel = pathname.replace(/^\/data-fair\/?/, '')
  if (rel.startsWith('api/') || /-ui-config\.js$/.test(rel)) return { action: 'stack' }
  if (rel && hasFile(rel)) return { action: 'file', file: rel }
  if (isNavigation) return { action: 'index' }
  return { action: 'stack' }
}

// same values as the inject-site-context plugin of ui/vite.config.ts in development
export function renderIndex (rawHtml: string, uiConfigPath: string): string {
  const params: Record<string, string> = {
    SITE_PATH: '',
    UI_CONFIG_PATH: uiConfigPath,
    THEME_CSS_HASH: '',
    PUBLIC_SITE_INFO_HASH: '',
    CSP_NONCE: '',
    PRELOAD_LINKS: ''
  }
  return rawHtml.replace(/\{([A-Z_]+)\}/g, (match, key: string) => key in params ? params[key] : match)
}

export function extractUiConfigPath (html: string): string {
  const match = html.match(/\/data-fair(\/[a-f0-9]+-ui-config\.js)/)
  if (!match) throw new Error('could not find the ui-config script in the dev stack page')
  return match[1]
}

export async function installVariantRoutes (context: BrowserContext, opts: { origin: string, buildDir: string, uiConfigPath: string }): Promise<void> {
  const indexHtml = renderIndex(readFileSync(path.join(opts.buildDir, 'index.html'), 'utf8'), opts.uiConfigPath)
  const hasFile = (rel: string) => {
    const file = path.join(opts.buildDir, rel)
    return file.startsWith(opts.buildDir) && existsSync(file) && statSync(file).isFile()
  }
  await context.route(`${opts.origin}/data-fair/**`, async (route) => {
    const request = route.request()
    const decision = classifyRequest(new URL(request.url()).pathname, request.isNavigationRequest(), hasFile)
    if (decision.action === 'file') await route.fulfill({ path: path.join(opts.buildDir, decision.file) })
    else if (decision.action === 'index') await route.fulfill({ status: 200, contentType: 'text/html', body: indexHtml })
    else await route.continue()
  })
}
