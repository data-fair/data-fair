// trim the listed string fields of one object — an explicit whitelist, never a walk
export default <T extends object>(obj: T, ...keys: (keyof T & string)[]) => {
  for (const key of keys) {
    const value = obj[key]
    if (typeof value === 'string') (obj as Record<string, unknown>)[key] = value.trim()
  }
}
