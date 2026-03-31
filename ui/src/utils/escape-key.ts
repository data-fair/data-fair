import slugify from 'slugify'

export const escapeKey = (key: string): string => {
  return slugify(key, { lower: true, strict: true, replacement: '_' })
}
