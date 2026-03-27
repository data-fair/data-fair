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
  </div>
</template>

<script lang="ts" setup>
const { t } = useI18n()

const props = defineProps<{
  facets: Record<string, { count: number, value: string, [key: string]: any }[]>
}>()

const owner = defineModel<string[]>('owner', { default: () => [] })
const baseApplication = defineModel<string[]>('baseApplication', { default: () => [] })
const visibility = defineModel<string[]>('visibility', { default: () => [] })
const topics = defineModel<string[]>('topics', { default: () => [] })
const publicationSites = defineModel<string[]>('publicationSites', { default: () => [] })
const requestedPublicationSites = defineModel<string[]>('requestedPublicationSites', { default: () => [] })

const facetToItems = (key: string, labelFn?: (v: any) => string, valueFn?: (v: any) => string) => {
  return computed(() => {
    const values = props.facets[key]
    if (!values?.length) return []
    return values.map(f => ({
      title: (labelFn ? labelFn(f) : f.value) + ` (${f.count})`,
      value: valueFn ? valueFn(f) : f.value,
    }))
  })
}

const ownerValueFn = (f: any) => `${f.value.type}:${f.value.id}:${f.value.department || '-'}`
const ownerItems = facetToItems('owner', (f) => f.value.departmentName || f.value.name || f.value.id, ownerValueFn)
const baseApplicationItems = facetToItems('base-application', (f) => f.title || f.value)
const visibilityItems = facetToItems('visibility', (f) => t('visibilityValues.' + f.value))
const topicsItems = facetToItems('topics', (f) => f.title || f.value)
const publicationSitesItems = facetToItems('publicationSites', (f) => f.title || f.value)
const requestedPublicationSitesItems = facetToItems('requestedPublicationSites', (f) => f.title || f.value)
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
