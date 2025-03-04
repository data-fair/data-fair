type WatchKey = 'draft-error'

export const useApplicationWatch = (keys: WatchKey | WatchKey[]) => {
  const { id, application } = useApplicationStore()
  if (!Array.isArray(keys)) keys = [keys]
  const ws = useWS($wsUrl)
  if (keys.includes('draft-error')) {
    ws?.subscribe(`applications/${id}/draft-error`, (message) => {
      if (!application.value) return
      application.value.errorMessageDraft = message as string
    })
  }
}
