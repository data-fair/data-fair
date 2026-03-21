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
    <v-select
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
    <v-select
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
    <v-select
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
    <v-select
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
    <v-select
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
    <v-select
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
    <v-select
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
    <v-select
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
  </div>
</template>

<script lang="ts" setup>
const { t } = useI18n()

const props = defineProps<{
  facets: Record<string, { count: number, value: string, [key: string]: any }[]>
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

const facetToItems = (key: string, labelFn?: (v: any) => string) => {
  return computed(() => {
    const values = props.facets[key]
    if (!values?.length) return []
    return values.map(f => ({
      title: (labelFn ? labelFn(f) : f.value) + ` (${f.count})`,
      value: f.value,
    }))
  })
}

const ownerItems = facetToItems('owner', (f) => f.departmentName || f.name || f.value)
const statusItems = facetToItems('status', (f) => t('statusValues.' + f.value))
const draftStatusItems = facetToItems('draftStatus', (f) => t('draftStatusValues.' + f.value))
const visibilityItems = facetToItems('visibility', (f) => t('visibilityValues.' + f.value))
const topicsItems = facetToItems('topics', (f) => f.title || f.value)
const publicationSitesItems = facetToItems('publicationSites', (f) => f.title || f.value)
const requestedPublicationSitesItems = facetToItems('requestedPublicationSites', (f) => f.title || f.value)
const servicesItems = facetToItems('services')
const conceptsItems = facetToItems('concepts', (f) => f.title || f.value)
</script>

<i18n lang="yaml">
fr:
  owner: Propriétaire
  status: Statut
  draftStatus: Statut du brouillon
  visibility: Visibilité
  topics: Thématiques
  publicationSites: Sites de publication
  requestedPublicationSites: Publications demandées
  services: Services
  concepts: Concepts
  statusValues:
    finalized: Finalisé
    error: Erreur
    draft: Brouillon
    indexed: Indexé
    loaded: Chargé
    analyzed: Analysé
    schematized: Schématisé
  draftStatusValues:
    waiting: En attente
    validationNeeded: Validation nécessaire
  visibilityValues:
    public: Public
    private: Privé
    protected: Protégé
en:
  owner: Owner
  status: Status
  draftStatus: Draft status
  visibility: Visibility
  topics: Topics
  publicationSites: Publication sites
  requestedPublicationSites: Requested publications
  services: Services
  concepts: Concepts
  statusValues:
    finalized: Finalized
    error: Error
    draft: Draft
    indexed: Indexed
    loaded: Loaded
    analyzed: Analyzed
    schematized: Schematized
  draftStatusValues:
    waiting: Waiting
    validationNeeded: Validation needed
  visibilityValues:
    public: Public
    private: Private
    protected: Protected
</i18n>
