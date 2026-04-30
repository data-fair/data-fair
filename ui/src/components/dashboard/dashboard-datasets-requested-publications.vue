<template>
  <dashboard-svg-link
    :to="nbDatasets ? { path: '/datasets', query: { requestedPublicationSites: requestedPublicationSitesFilter } } : undefined"
    :title="t('requestedPublications', nbDatasets ?? 0)"
    :svg="checklistSvg"
    :color="nbDatasets ? 'primary' : 'grey'"
  />
</template>

<i18n lang="yaml">
fr:
  requestedPublications: Aucune publication à valider | 1 publication à valider | {n} publications à valider
en:
  requestedPublications: No requested publication | 1 requested publication | {n} requested publications
</i18n>

<script setup lang="ts">
import checklistSvg from '~/assets/svg/Checklist_Two Color.svg?raw'

const { t } = useI18n()
const { account } = useSessionAuthenticated()

const settingsPath = computed(() => {
  if (!account.value) return null
  return `${account.value.type}/${account.value.id}`
})

const publicationSitesFetch = useFetch<{ type: string, id: string }[]>(
  () => settingsPath.value ? `${$apiPath}/settings/${settingsPath.value}/publication-sites` : null
)

const publicationSitesFilter = computed(() => {
  return publicationSitesFetch.data.value?.map(p => `${p.type}:${p.id}`).join(',') ?? ''
})

const datasetsFetch = useFetch<{ count: number, facets: { requestedPublicationSites: { value: string }[] } }>(
  () => publicationSitesFilter.value ? `${$apiPath}/datasets?size=0&shared=false&requestedPublicationSites=${publicationSitesFilter.value}&facets=requestedPublicationSites` : null
)

const nbDatasets = computed(() => datasetsFetch.data.value?.count ?? null)

const requestedPublicationSitesFilter = computed(() => {
  return datasetsFetch.data.value?.facets?.requestedPublicationSites?.map(f => f.value).join(',') ?? ''
})
</script>
