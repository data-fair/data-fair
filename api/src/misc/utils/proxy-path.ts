import path from 'node:path'

// join the decoded path segments of a proxied request under the target's base path.
// Returns null when a segment could leave the base path (dot segments, decoded separators).
export const joinProxyPath = (basePath: string, segments: string[]): string | null => {
  for (const segment of segments) {
    if (segment === '.' || segment === '..' || segment.includes('/') || segment.includes('\\') || segment.includes('\0')) return null
  }
  const joined = path.posix.join(basePath || '/', ...segments)
  const base = path.posix.join(basePath || '/', '/')
  if (joined !== base && !joined.startsWith(base) && joined + '/' !== base) return null
  return joined
}
