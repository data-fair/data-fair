type WatchKey = 'draft-error' | 'journal'

export const useApplicationWatch = (keys: WatchKey | WatchKey[]) => {
  const { id, application, journal } = useApplicationStore()
  if (!Array.isArray(keys)) keys = [keys]
  const ws = useWS('/data-fair/')

  if (keys.includes('draft-error')) {
    ws?.subscribe(`applications/${id}/draft-error`, (message) => {
      if (!application.value) return
      application.value.errorMessageDraft = message as string
    })
  }

  if (keys.includes('journal')) {
    ws?.subscribe(`applications/${id}/journal`, (event) => {
      if (!journal.value) return
      const journalEvent = event as any
      if (!journal.value.find((e: any) => e.date === journalEvent.date)) {
        journal.value.unshift(journalEvent)
      }
      if (journalEvent.type === 'error' && application.value) {
        application.value.errorMessage = journalEvent.data
        application.value.status = 'error'
      }
    })
  }
}
