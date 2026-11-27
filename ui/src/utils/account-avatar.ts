/** An account reference as data-fair stores it in a line: `user:<id>`, `organization:<id>` or `organization:<id>:<department>`. */
const accountRefPattern = /^(user|organization):[^:\s]+(:[^:\s]+)?$/

export const isAccountRef = (value: unknown): value is string => typeof value === 'string' && accountRefPattern.test(value)

/**
 * The simple-directory avatar URL of an account reference, or undefined when the value is not one.
 *
 * A column of the account concept, or `_owner`, can hold any string (an edited or virtual column). A value
 * that is not an account reference has no avatar: building a URL from it anyway asks simple-directory for a
 * route that does not exist, answered 404 without an image (`avatars/1/avatar.png` for a value "1").
 */
export const accountAvatarUrl = (sdUrl: string, value: unknown): string | undefined => {
  if (!isAccountRef(value)) return
  return `${sdUrl}/api/avatars/${value.split(':').join('/')}/avatar.png`
}
