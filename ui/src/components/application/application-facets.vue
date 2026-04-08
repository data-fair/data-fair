<template>
  <div class="d-flex flex-column ga-3">
    <v-autocomplete
      v-if="ownerItems.length > 1"
      v-model="owner"
      :items="ownerItems"
      :label="t('owner')"
      density="compact"
      variant="outlined"
      hide-details
      clearable
      multiple
    />
    <v-autocomplete
      v-if="baseApplicationItems.length"
      v-model="baseApplication"
      :items="baseApplicationItems"
      :label="t('baseApplication')"
      density="compact"
      variant="outlined"
      hide-details
      clearable
      multiple
    />
    <v-autocomplete
      v-if="visibilityItems.length"
      v-model="visibility"
      :items="visibilityItems"
      :label="t('visibility')"
      density="compact"
      variant="outlined"
      hide-details
      clearable
      multiple
    />
    <v-autocomplete
      v-if="topicsItems.length"
      v-model="topics"
      :items="topicsItems"
      :label="t('topics')"
      density="compact"
      variant="outlined"
      hide-details
      clearable
      multiple
    />
    <v-autocomplete
      v-if="publicationSitesItems.length"
      v-model="publicationSites"
      :items="publicationSitesItems"
      :label="t('publicationSites')"
      density="compact"
      variant="outlined"
      hide-details
      clearable
      multiple
    />
    <v-autocomplete
      v-if="requestedPublicationSitesItems.length"
      v-model="requestedPublicationSites"
      :items="requestedPublicationSitesItems"
      :label="t('requestedPublicationSites')"
      density="compact"
      variant="outlined"
      hide-details
      clearable
      multiple
    />
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n()

const props = defineProps<{
  facets: Record<string, { count: number, value: any }[]>
}>()

const owner = defineModel<string[]>('owner', { default: () => [] })
const baseApplication = defineModel<string[]>('baseApplication', { default: () => [] })
const visibility = defineModel<string[]>('visibility', { default: () => [] })
const topics = defineModel<string[]>('topics', { default: () => [] })
const publicationSites = defineModel<string[]>('publicationSites', { default: () => [] })
const requestedPublicationSites = defineModel<string[]>('requestedPublicationSites', { default: () => [] })

const facetToItems = (key: string, labelFn?: (v: any) => string, valueFn?: (v: any) => string, filterFn?: (v: any) => boolean) => {
  return computed(() => {
    const values = props.facets[key]
    if (!values?.length) return []
    return values.filter(f => filterFn ? filterFn(f) : true).map(f => ({
      title: (labelFn ? labelFn(f) : f.value) + ` (${f.count})`,
      value: valueFn ? valueFn(f) : f.value,
    }))
  })
}

const ownerValueFn = (f: any) => `${f.value.type}:${f.value.id}:${f.value.department || '-'}`
const ownerItems = facetToItems('owner', (f) => f.value.departmentName || f.value.name || f.value.id, ownerValueFn)
const baseApplicationItems = facetToItems(
  'base-application',
  (f) => `${f.value?.title || ''} ${f.value?.version || ''}`.trim() || f.value,
  (f) => f.value?.url || f.value
)
const visibilityItems = facetToItems('visibility', (f) => t('visibilityValues.' + f.value))
const topicsItems = facetToItems('topics', (f) => f.value?.title || f.value, (f) => f.value?.id || f.value)
// Fetch publication sites for current account to resolve names
const session = useSession()
const publicationSitesById = ref<Record<string, any>>({})
const pubSitesPath = computed(() => {
  const a = session.account.value
  return a ? $apiPath + '/settings/' + a.type + '/' + a.id + '/publication-sites' : null
})
const pubSitesFetch = useFetch<any[]>(() => pubSitesPath.value)
watch(() => pubSitesFetch.data.value, (sites) => {
  if (!sites) return
  const map: Record<string, any> = {}
  for (const site of sites) map[`${site.type}:${site.id}`] = site
  publicationSitesById.value = map
})

const nonNullFilter = (f: any) => f.value !== null
const publicationSitesLabelFn = (f: any) => {
  const site = publicationSitesById.value[f.value]
  return site?.title || site?.url || f.value
}
const publicationSitesItems = facetToItems('publicationSites', publicationSitesLabelFn, undefined, nonNullFilter)
const requestedPublicationSitesItems = facetToItems('requestedPublicationSites', publicationSitesLabelFn, undefined, nonNullFilter)
</script>

<i18n lang="yaml">
fr:
  owner: Propriétaire
  baseApplication: Type d'application
  visibility: Visibilité
  topics: Thématiques
  publicationSites: Sites de publication
  requestedPublicationSites: Publications demandées
  visibilityValues:
    public: Public
    private: Privé
    protected: Protégé
en:
  owner: Owner
  baseApplication: Application type
  visibility: Visibility
  topics: Topics
  publicationSites: Publication sites
  requestedPublicationSites: Requested publications
  visibilityValues:
    public: Public
    private: Private
    protected: Protected
</i18n>
