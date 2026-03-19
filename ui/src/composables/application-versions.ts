import useApplicationStore from './application-store'
import { compare as compareVersions, validate as validateVersion } from 'compare-versions'

export const useApplicationVersions = () => {
  const { baseAppFetch, baseAppsFetch } = useApplicationStore()
  if (!baseAppFetch.initialized.value) baseAppFetch.refresh()
  if (!baseAppsFetch.initialized.value) baseAppsFetch.refresh()

  const availableVersions = computed(() => {
    const baseApps = baseAppsFetch.data.value?.results
    const baseApp = baseAppFetch.data.value
    if (!baseApps) return null
    if (!baseApp) return null
    let versions = [...baseApps]
    versions = versions.filter(a => validateVersion(a.version))
    versions.sort((a1, a2) => compareVersions(a2.version, a1.version, '<') ? 1 : -1)
    if (validateVersion(baseApp.version)) {
      versions = versions.filter(a => compareVersions(a.version, baseApp.version, '>'))
    }
    if (!versions.find(b => b.url === baseAppFetch.data.value?.url)) {
      versions.push(baseApp)
    }
    return versions
  })

  return { availableVersions }
}

export default useApplicationVersions
