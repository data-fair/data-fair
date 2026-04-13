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
      v-if="statusItems.length"
      v-model="status"
      :items="statusItems"
      :label="t('status')"
      density="compact"
      variant="outlined"
      hide-details
      clearable
      multiple
    />
    <v-autocomplete
      v-if="draftStatusItems.length"
      v-model="draftStatus"
      :items="draftStatusItems"
      :label="t('draftStatus')"
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
    <v-autocomplete
      v-if="servicesItems.length"
      v-model="services"
      :items="servicesItems"
      :label="t('services')"
      density="compact"
      variant="outlined"
      hide-details
      clearable
      multiple
    />
    <v-autocomplete
      v-if="conceptsItems.length"
      v-model="concepts"
      :items="conceptsItems"
      :label="t('concepts')"
      density="compact"
      variant="outlined"
      hide-details
      clearable
      multiple
    />
    <v-autocomplete
      v-model="type"
      :items="typeItems"
      :label="t('type')"
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
  showAll?: boolean
  account?: { type: string, id: string, department?: string } | null
}>()

const owner = defineModel<string[]>('owner', { default: () => [] })
const status = defineModel<string[]>('status', { default: () => [] })
const draftStatus = defineModel<string[]>('draftStatus', { default: () => [] })
const visibility = defineModel<string[]>('visibility', { default: () => [] })
const topics = defineModel<string[]>('topics', { default: () => [] })
const publicationSites = defineModel<string[]>('publicationSites', { default: () => [] })
const requestedPublicationSites = defineModel<string[]>('requestedPublicationSites', { default: () => [] })
const services = defineModel<string[]>('services', { default: () => [] })
const concepts = defineModel<string[]>('concepts', { default: () => [] })
const type = defineModel<string[]>('type', { default: () => [] })

const typeItems = computed(() => [
  { title: t('typeValues.file'), value: 'file' },
  { title: t('typeValues.rest'), value: 'rest' },
  { title: t('typeValues.virtual'), value: 'virtual' },
  { title: t('typeValues.metaOnly'), value: 'metaOnly' },
])

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

const ownerItems = computed(() => {
  const values = props.facets.owner
  if (!values?.length) return []

  if (!props.showAll && props.account) {
    // Mode normal : filtrer par org courante
    const orgFacets = values.filter(f =>
      f.value.type === props.account!.type && f.value.id === props.account!.id
    )
    return orgFacets.map(f => ({
      title: (f.value.department
        ? (f.value.departmentName || f.value.department)
        : t('noDepartment')) + ` (${f.count})`,
      value: `${f.value.type}:${f.value.id}:${f.value.department || '-'}`
    }))
  }

  // Mode super admin (showAll) : regrouper par org
  const byOrg = new Map<string, typeof values>()
  for (const f of values) {
    const key = `${f.value.type}:${f.value.id}`
    if (!byOrg.has(key)) byOrg.set(key, [])
    byOrg.get(key)!.push(f)
  }

  const items: { title: string, value: string }[] = []
  for (const [orgKey, orgFacets] of byOrg) {
    const orgName = orgFacets[0].value.name || orgFacets[0].value.id
    const hasDepartments = orgFacets.some(f => f.value.department)

    if (!hasDepartments) {
      const total = orgFacets.reduce((s, f) => s + f.count, 0)
      items.push({
        title: `${orgName} (${total})`,
        value: `${orgKey}:-`
      })
    } else {
      const total = orgFacets.reduce((s, f) => s + f.count, 0)
      items.push({
        title: `${orgName} (${total})`,
        value: `${orgKey}:*`
      })
      for (const f of orgFacets) {
        const label = f.value.department
          ? `${orgName} - ${f.value.departmentName || f.value.department}`
          : `${orgName} - ${t('noDepartment')}`
        items.push({
          title: `${label} (${f.count})`,
          value: `${f.value.type}:${f.value.id}:${f.value.department || '-'}`
        })
      }
    }
  }
  return items
})
const statusItems = facetToItems('status', (f) => t('statusValues.' + f.value))
const draftStatusItems = facetToItems('draftStatus', (f) => t('draftStatusValues.' + f.value))
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
const servicesItems = facetToItems('services', (f) => typeof f.value === 'string' ? f.value.replace('koumoul-', '').replace('-koumoul', '') : f.value)
const { vocabulary } = useStore()
const conceptsItems = facetToItems(
  'concepts',
  (f) => vocabulary.value[f.value]?.title || f.value,
  undefined,
  (f) => !!vocabulary.value[f.value]
)
</script>

<i18n lang="yaml">
fr:
  owner: Propriétaire
  noDepartment: Aucun département
  status: Statut
  draftStatus: Statut du brouillon
  visibility: Visibilité
  topics: Thématiques
  publicationSites: Sites de publication
  requestedPublicationSites: Publications demandées
  services: Enrichissement
  concepts: Concepts
  type: Type
  typeValues:
    file: Fichier
    rest: Éditable
    virtual: Virtuel
    metaOnly: Métadonnées
  statusValues:
    finalized: Finalisé
    error: Erreur
    draft: Brouillon
    indexed: Indexé
    loaded: Chargé
    analyzed: Analysé
    schematized: Schématisé
  draftStatusValues:
    created: Créé
    loaded: Chargé
    stored: Ajouté à l'espace de stockage
    normalized: Format normalisé
    analyzed: Analyse de la structure ok
    'validation-updated': Validation mise à jour
    validated: Validation ok
    extended: Extension ok
    indexed: Indexé
    finalized: Finalisé
    error: Erreur
  visibilityValues:
    public: Public
    private: Privé
    protected: Protégé
en:
  owner: Owner
  noDepartment: No department
  status: Status
  draftStatus: Draft status
  visibility: Visibility
  topics: Topics
  publicationSites: Publication sites
  requestedPublicationSites: Requested publications
  services: Extensions
  concepts: Concepts
  type: Type
  typeValues:
    file: File
    rest: Editable
    virtual: Virtual
    metaOnly: Metadata only
  statusValues:
    finalized: Finalized
    error: Error
    draft: Draft
    indexed: Indexed
    loaded: Loaded
    analyzed: Analyzed
    schematized: Schematized
  draftStatusValues:
    created: Created
    loaded: Loaded
    stored: Added to storage space
    normalized: Normalized format
    analyzed: Structure analysis ok
    'validation-updated': Validation updated
    validated: Validation ok
    extended: Extended
    indexed: Indexed
    finalized: Finalized
    error: Error
  visibilityValues:
    public: Public
    private: Private
    protected: Protected
</i18n>
