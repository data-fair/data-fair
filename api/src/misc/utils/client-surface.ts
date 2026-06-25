const SERVICE_CLIENTS = new Set(['mcp', 'agents'])

/**
 * Pure: determine the calling surface based on the only fields extracted from the request.
 * Intentionally import-free (so it never loads config) to stay testable in isolation in the
 * "unit" project. Request-context extraction is done by the caller (cf. permissions.middleware).
 */
export const clientSurface = (input: {
  explicit?: string
  referer?: string
  portalUrl?: string
  publicBaseUrl: string
}): string | undefined => {
  if (input.explicit && SERVICE_CLIENTS.has(input.explicit)) return input.explicit
  const ref = input.referer
  if (!ref) return undefined
  if (ref.includes('/data-fair/app/')) return 'application'
  if (input.portalUrl) {
    const base = input.portalUrl.replace(/\/$/, '')
    if (ref === base || ref.startsWith(base + '/')) return 'portal'
  }
  if (ref.includes('/data-fair/embed/')) return 'embed'
  if (ref.startsWith(input.publicBaseUrl + '/')) return 'backoffice'
  return undefined
}
