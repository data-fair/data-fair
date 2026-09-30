<template>
  <dataset-select
    v-model="initFromDataset"
    :label="t('initFromDataset')"
    :extra-params="{ select: '' }"
    master-data="standardSchema"
    class="mt-2"
  />

  <div v-if="initFromDataset && modelValue">
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

    <!-- a fragment has neither its own attachments nor a description of its own to inherit: it is described by its parent -->
    <v-checkbox
      v-if="initFromDataset.attachments?.length && !fragment"
      :model-value="modelValue.parts.includes('metadataAttachments')"
      :label="t('initFromAttachments')"
      density="comfortable"
      hide-details
      @update:model-value="togglePart('metadataAttachments')"
    />

    <!-- like class-implied operations in the permission dialog: "copy all" ticks and locks every item -->
    <v-select
      v-if="availableMetadata.length && !fragment"
      v-model="metadataModel"
      :items="metadataItems"
      :label="t('initFromMetadata')"
      multiple
      chips
      clearable
      variant="outlined"
      density="compact"
      max-width="800"
      class="mt-2"
    >
      <!-- custom chip: a locked item's chip must stay closable, closing it leaves "copy all" -->
      <template #chip="{ item }">
        <v-chip
          :text="item.title"
          size="small"
          closable
          @click:close="metadataModel = metadataModel.filter(p => p !== item.value)"
        />
      </template>
      <template #prepend-item>
        <v-list-item
          :title="t('initFromAllMetadata')"
          :disabled="!copyableMetadata.length"
          role="option"
          :aria-selected="copyAllMetadata"
          @click="setCopyAllMetadata(!copyAllMetadata)"
        >
          <template #prepend>
            <v-checkbox-btn
              :model-value="copyAllMetadata"
              :ripple="false"
              tabindex="-1"
              aria-hidden="true"
              @click.prevent
            />
          </template>
        </v-list-item>
        <v-divider />
      </template>
    </v-select>
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
  // preselected source, e.g. the virtual parent of a new fragment
  initialDataset?: any
  // the new dataset is a fragment: only the structure (schema, extensions) is worth copying
  fragment?: boolean
}>()

const modelValue = defineModel<InitFrom | null>({ default: null })
const sourceTitle = defineModel<string | null>('sourceTitle', { default: null })

const { t } = useI18n()
const { account } = useSessionAuthenticated()

const allowData = computed(() => props.allowData ?? true)
const owner = computed(() => props.owner ?? account.value)

const initFromDataset = ref<any>(props.initialDataset ?? null)

const metadataParts = ['summary', 'description', 'license', 'origin', 'image', 'topics', 'keywords', 'searchTerms', 'spatial', 'temporal', 'frequency', 'creator', 'modified', 'customMetadata', 'relatedDatasets']

const isEmpty = (value: any) => value == null || value === '' || (typeof value === 'object' && !Object.keys(value).length)

const availableMetadata = computed(() => {
  const ds = initFromDataset.value
  if (!ds) return []
  return metadataParts.filter(part => !isEmpty(ds[part]))
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
const copyAllMetadata = ref(false)

const metadataItems = computed(() => availableMetadata.value.map(part => ({
  value: part,
  title: t('metadata.' + part),
  props: {
    disabled: copyAllMetadata.value || !isCopyable(part),
    subtitle: isCopyable(part) ? undefined : t('notCopyable.' + part)
  }
})))

const metadataModel = computed({
  get: () => availableMetadata.value.filter(part => modelValue.value?.parts.includes(part)),
  set (selected: string[] | null) {
    if (!modelValue.value) return
    selected ??= []
    if (selected.length < copyableMetadata.value.length) copyAllMetadata.value = false
    modelValue.value = { ...modelValue.value, parts: [...modelValue.value.parts.filter(p => !metadataParts.includes(p)), ...selected] }
  }
})

const setCopyAllMetadata = (value: boolean) => {
  copyAllMetadata.value = value
  metadataModel.value = value ? copyableMetadata.value : []
}

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
    copyAllMetadata.value = !!dataset.isMetaOnly
  } else {
    modelValue.value = null
    sourceTitle.value = null
  }
}, { immediate: !!props.initialDataset })

// topics / custom metadata selected by default can turn out not copyable once the owner settings are loaded
watch(copyableMetadata, (copyable) => {
  if (copyAllMetadata.value) metadataModel.value = copyable
  else metadataModel.value = metadataModel.value.filter(p => copyable.includes(p))
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
</script>

<i18n lang="yaml">
fr:
  initFromDataset: Utiliser un jeu de données existant comme modèle
  initFromData: Copier la donnée
  initFromExtensions: Copier les extensions
  initFromAttachments: Copier les pièces jointes
  initFromAllMetadata: Copier toutes les métadonnées
  initFromMetadata: Métadonnées à copier
  metadata:
    summary: Résumé
    description: Description
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
    relatedDatasets: Jeux de données liés
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
  initFromAllMetadata: Copy all metadata
  initFromMetadata: Metadata to copy
  metadata:
    summary: Summary
    description: Description
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
    relatedDatasets: Related datasets
  notCopyable:
    topics: None of these topics exist in your account
    customMetadata: None of these custom metadata exist in your account
  sourceHasNoData: The selected dataset contains no rows, copying data is not possible.
  sourceNotFinalized: The selected dataset is not finalized, copying data is not possible.
</i18n>
