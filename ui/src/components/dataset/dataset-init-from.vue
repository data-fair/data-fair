<template>
  <dataset-select
    v-model="initFromDataset"
    :label="t('initFromDataset')"
    :extra-params="{ select: '' }"
    master-data="standardSchema"
    class="mt-2"
  />

  <div
    v-if="initFromDataset && modelValue"
    class="ml-2"
  >
    <div
      v-if="allowData && !initFromDataset.isMetaOnly"
      class="d-flex align-center"
    >
      <v-checkbox
        :model-value="modelValue.parts.includes('data')"
        :disabled="!!noDataReason"
        :label="t('initFromData')"
        density="comfortable"
        hide-details
        @update:model-value="togglePart('data')"
      >
        <template
          v-if="noDataReason"
          #append
        >
          <span class="text-warning font-italic">
            {{ t(noDataReason) }}
          </span>
        </template>
      </v-checkbox>
    </div>

    <v-checkbox
      v-if="initFromDataset.extensions?.length"
      :model-value="modelValue.parts.includes('extensions')"
      :label="t('initFromExtensions')"
      density="comfortable"
      hide-details
      @update:model-value="togglePart('extensions')"
    />

    <v-checkbox
      v-if="initFromDataset.attachments?.length"
      :model-value="modelValue.parts.includes('metadataAttachments')"
      :label="t('initFromAttachments')"
      density="comfortable"
      hide-details
      @update:model-value="togglePart('metadataAttachments')"
    />

    <template v-if="availableMetadata.length">
      <v-checkbox
        :model-value="!!copyableMetadata.length && selectedMetadata.length === copyableMetadata.length"
        :indeterminate="!!selectedMetadata.length && selectedMetadata.length < copyableMetadata.length"
        :disabled="!copyableMetadata.length"
        :label="t('initFromMetadata')"
        color="primary"
        density="comfortable"
        hide-details
        @update:model-value="toggleAllMetadata"
      />
      <div class="ml-8">
        <v-checkbox
          v-for="part of availableMetadata"
          :key="part"
          :model-value="modelValue.parts.includes(part)"
          :disabled="!isCopyable(part)"
          :label="t('metadata.' + part)"
          density="compact"
          hide-details
          @update:model-value="togglePart(part)"
        >
          <template
            v-if="!isCopyable(part)"
            #append
          >
            <span class="text-warning font-italic">
              {{ t('notCopyable.' + part) }}
            </span>
          </template>
        </v-checkbox>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { AccountKeys } from '@data-fair/lib-vue/session'

interface InitFrom {
  dataset: string
  parts: string[]
}

const props = defineProps<{
  allowData?: boolean
  owner?: AccountKeys | null
}>()

const modelValue = defineModel<InitFrom | null>({ default: null })
const sourceTitle = defineModel<string | null>('sourceTitle', { default: null })

const { t } = useI18n()
const { account } = useSessionAuthenticated()

const allowData = computed(() => props.allowData ?? true)
const owner = computed(() => props.owner ?? account.value)

const initFromDataset = ref<any>(null)

// 'description' covers both summary and description
const metadataParts = ['description', 'license', 'origin', 'image', 'topics', 'keywords', 'searchTerms', 'spatial', 'temporal', 'frequency', 'creator', 'modified', 'customMetadata']

const isEmpty = (value: any) => value == null || value === '' || (typeof value === 'object' && !Object.keys(value).length)

const availableMetadata = computed(() => {
  const ds = initFromDataset.value
  if (!ds) return []
  return metadataParts.filter(part => part === 'description' ? !isEmpty(ds.summary) || !isEmpty(ds.description) : !isEmpty(ds[part]))
})

// topics and custom metadata keys are defined by each account, from another account only the known ones are copied
const otherAccount = computed(() => {
  const ds = initFromDataset.value
  return !!ds && (ds.owner.type !== owner.value.type || ds.owner.id !== owner.value.id)
})
const ownerSettingsUrl = computed(() => otherAccount.value ? `${$apiPath}/settings/${owner.value.type}/${owner.value.id}` : null)
const ownerTopicsFetch = useFetch<{ id: string }[]>(() => ownerSettingsUrl.value && `${ownerSettingsUrl.value}/topics`)
const ownerDatasetsMetadataFetch = useFetch<{ custom?: { key: string }[] }>(() => ownerSettingsUrl.value && `${ownerSettingsUrl.value}/datasets-metadata`)

const isCopyable = (part: string) => {
  if (!otherAccount.value) return true
  const ds = initFromDataset.value
  if (part === 'topics') return ds.topics.some((topic: { id: string }) => ownerTopicsFetch.data.value?.some(t => t.id === topic.id))
  if (part === 'customMetadata') return Object.keys(ds.customMetadata).some(key => ownerDatasetsMetadataFetch.data.value?.custom?.some(c => c.key === key))
  return true
}

const copyableMetadata = computed(() => availableMetadata.value.filter(isCopyable))
const selectedMetadata = computed(() => copyableMetadata.value.filter(part => modelValue.value?.parts.includes(part)))

const noDataReason = computed(() => {
  const ds = initFromDataset.value
  if (!ds || !allowData.value || ds.file) return null
  if (!ds.finalizedAt) return 'sourceNotFinalized'
  // REST/virtual sources with no rows can't produce a usable data file
  if (!ds.count) return 'sourceHasNoData'
  return null
})

watch(initFromDataset, (dataset) => {
  if (dataset) {
    // a metadata-only dataset is a draft sheet waiting for its data: copy all its metadata by default
    modelValue.value = { dataset: dataset.id, parts: dataset.isMetaOnly ? [...availableMetadata.value, ...(dataset.attachments?.length ? ['metadataAttachments'] : [])] : ['schema'] }
    sourceTitle.value = dataset.title ?? null
  } else {
    modelValue.value = null
    sourceTitle.value = null
  }
})

// topics / custom metadata selected by default can turn out not copyable once the owner settings are loaded
watch(copyableMetadata, (copyable) => {
  if (!modelValue.value) return
  const parts = modelValue.value.parts.filter(p => !metadataParts.includes(p) || copyable.includes(p))
  if (parts.length !== modelValue.value.parts.length) modelValue.value = { ...modelValue.value, parts }
})

watch(noDataReason, (reason) => {
  if (reason && modelValue.value?.parts.includes('data')) {
    modelValue.value = { ...modelValue.value, parts: modelValue.value.parts.filter(p => p !== 'data') }
  }
})

const togglePart = (part: string) => {
  if (!modelValue.value) return
  const parts = modelValue.value.parts
  modelValue.value = { ...modelValue.value, parts: parts.includes(part) ? parts.filter(p => p !== part) : [...parts, part] }
}

// a partial selection selects all
const toggleAllMetadata = () => {
  if (!modelValue.value) return
  const allSelected = selectedMetadata.value.length === copyableMetadata.value.length
  const parts = modelValue.value.parts.filter(p => !metadataParts.includes(p))
  modelValue.value = { ...modelValue.value, parts: allSelected ? parts : [...parts, ...copyableMetadata.value] }
}
</script>

<i18n lang="yaml">
fr:
  initFromDataset: Utiliser un jeu de données existant comme modèle
  initFromData: Copier la donnée
  initFromExtensions: Copier les extensions
  initFromAttachments: Copier les pièces jointes
  initFromMetadata: Copier les métadonnées
  metadata:
    description: Résumé et description
    license: Licence
    origin: Provenance
    image: Image
    topics: Thématiques
    keywords: Mots-clés
    searchTerms: Termes de recherche
    spatial: Couverture géographique
    temporal: Couverture temporelle
    frequency: Fréquence de mise à jour
    creator: Producteur
    modified: Date de modification de la source
    customMetadata: Métadonnées spécifiques
  notCopyable:
    topics: Aucune de ces thématiques n'existe dans votre compte
    customMetadata: Aucune de ces métadonnées spécifiques n'existe dans votre compte
  sourceHasNoData: Le jeu de données sélectionné ne contient aucune ligne, la copie des données n'est pas possible.
  sourceNotFinalized: Le jeu de données sélectionné n'est pas finalisé, la copie des données n'est pas possible.
en:
  initFromDataset: Use an existing dataset as a model
  initFromData: Copy data
  initFromExtensions: Copy extensions
  initFromAttachments: Copy attachments
  initFromMetadata: Copy metadata
  metadata:
    description: Summary and description
    license: License
    origin: Origin
    image: Image
    topics: Topics
    keywords: Keywords
    searchTerms: Search terms
    spatial: Geographic coverage
    temporal: Temporal coverage
    frequency: Update frequency
    creator: Producer
    modified: Date of modification of the source
    customMetadata: Custom metadata
  notCopyable:
    topics: None of these topics exist in your account
    customMetadata: None of these custom metadata exist in your account
  sourceHasNoData: The selected dataset contains no rows, copying data is not possible.
  sourceNotFinalized: The selected dataset is not finalized, copying data is not possible.
</i18n>
