// A dataset PATCH replaces the whole extensions array, so refreshing one extension
// must send all the others unchanged, otherwise they are removed along with their columns.
// An extension added in the form but not saved yet is not in the server list: it is appended.
export const refreshExtensionPatch = (extensions: any[], refreshed: any) => {
  const isRefreshed = (e: any) => e.type === 'remoteService' && e.remoteService === refreshed.remoteService && e.action === refreshed.action
  const patched = extensions.map(e => isRefreshed(e) ? { ...refreshed, needsUpdate: true } : e)
  if (!extensions.some(isRefreshed)) patched.push({ ...refreshed, needsUpdate: true })
  return { extensions: patched }
}
