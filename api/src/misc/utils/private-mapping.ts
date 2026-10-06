/**
 * Map a URL of our own public infrastructure to its private equivalent, as configured by
 * applicationsPrivateMapping / remoteServicesPrivateMapping ([publicPrefix, privatePrefix]).
 * Returns undefined if the mapping is empty or the URL does not match the public prefix: the URL must
 * then be requested as is, with the public (SSRF protected) agents. A mapped URL is requested with the
 * private agents.
 * This is a parsed comparison (same origin, path inside the prefix path) and not a string replace:
 * https://koumoul.com/s@169.254.169.254/ must not become http://taxman-cache@169.254.169.254/.
 */
export const applyPrivateMapping = (url: string, mapping: string[] | undefined): string | undefined => {
  if (!mapping?.[0] || !mapping[1]) return
  let target: URL, from: URL, to: URL
  try {
    target = new URL(url)
    from = new URL(mapping[0])
    to = new URL(mapping[1])
  } catch {
    return
  }
  if (target.origin !== from.origin) return
  const fromPath = from.pathname.replace(/\/$/, '')
  if (target.pathname !== fromPath && !target.pathname.startsWith(fromPath + '/')) return
  return to.origin + to.pathname.replace(/\/$/, '') + target.pathname.slice(fromPath.length) + target.search
}
