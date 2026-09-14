export type ConfigRef = { id?: string, href?: string } | null | undefined

/**
 * Ids of the datasets/applications referenced by an application configuration.
 * Config refs only require `href`, `id` is optional: the href tail equals the referenced
 * resource's own id, so a href-only ref still resolves to the right resource.
 */
export const configRefIds = (items?: ConfigRef[]): string[] =>
  (items ?? []).map(item => item?.id || item?.href?.split('/').pop()).filter(Boolean) as string[]
