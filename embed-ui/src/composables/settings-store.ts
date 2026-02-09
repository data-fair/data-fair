import type { Settings } from '#api/types'

export const useSettingsStore = (type: string, id: MaybeRefOrGetter<string>) => {
  const settingsFetch = useFetch<Settings>(() => $apiPath + '/settings/' + type + '/' + toValue(id))
  const settings = ref<Settings>()
  watch(settingsFetch.data, () => {
    if (settingsFetch.data.value) settings.value = settingsFetch.data.value
  })

  const patch = useAsyncAction(async (patch: Partial<Settings>) => {
    const updatedSettings = await $fetch<Settings>('/settings/' + type + '/' + toValue(id), {
      method: 'PATCH',
      body: patch
    })
    settings.value = updatedSettings
  }, {
    error: 'Erreur pendant la mise à jour des paramètres',
    success: 'Les paramètres ont été mis à jour'
  })

  return { settings, patch }
}
