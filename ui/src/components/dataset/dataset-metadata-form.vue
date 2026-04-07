<template>
  <v-row v-if="dataset">
    <!-- Left column: primary fields -->
    <v-col
      cols="12"
      md="6"
      lg="7"
    >
      <v-text-field
        v-model="dataset.title"
        :disabled="!can('writeDescription')"
        :label="t('title')"
        :base-color="fieldColor('title')"
        :color="fieldColor('title')"
        variant="outlined"
        density="compact"
        hide-details
        class="mb-4"
      />

      <div class="d-flex align-start gap-1 mb-4">
        <v-textarea
          v-model="dataset.summary"
          :disabled="!can('writeDescription')"
          :label="t('summary')"
          :base-color="fieldColor('summary')"
          :color="fieldColor('summary')"
          rows="3"
          variant="outlined"
          density="compact"
          hide-details
          class="flex-grow-1"
        />
        <df-agent-chat-action
          v-if="can('writeDescription')"
          action-id="summarize-dataset"
          :visible-prompt="t('summarizePrompt')"
          :hidden-context="summarizeContext"
          :btn-props="{ class: 'ml-1 mt-1' }"
          :title="t('summarizePrompt')"
        />
      </div>

      <div class="d-flex align-start gap-1 mb-3">
        <markdown-editor
          v-model="dataset.description"
          :disabled="!can('writeDescription')"
          :label="t('description')"
          :locale="locale"
          :csp-nonce="$cspNonce"
          class="flex-grow-1"
        />
        <df-agent-chat-action
          v-if="can('writeDescription')"
          action-id="describe-dataset"
          :visible-prompt="t('describePrompt')"
          :hidden-context="describeContext"
          :btn-props="{ class: 'ml-1 mt-1' }"
          :title="t('describePrompt')"
        />
      </div>
    </v-col>

    <!-- Right column: secondary metadata fields -->
    <v-col
      cols="12"
      md="6"
      lg="5"
    >
      <v-select
        v-model="dataset.license"
        :items="licensesFetch.data.value ?? []"
        :disabled="!can('writeDescription')"
        :base-color="fieldColor('license')"
        :color="fieldColor('license')"
        :label="t('licence')"
        item-title="title"
        item-value="href"
        class="mb-4"
        return-object
        hide-details
        clearable
      />

      <v-select
        v-if="topicsFetch.data.value?.length"
        v-model="dataset.topics"
        :items="topicsFetch.data.value ?? []"
        :disabled="!can('writeDescription')"
        :label="t('topics')"
        :base-color="fieldColor('topics')"
        :color="fieldColor('topics')"
        item-title="title"
        item-value="id"
        class="mb-4"
        chips
        multiple
        hide-details
        return-object
        closable-chips
      />

      <v-combobox
        v-model="dataset.keywords"
        :items="keywordsSuggestions"
        :disabled="!can('writeDescription')"
        :label="t('keywords')"
        :base-color="fieldColor('keywords')"
        :color="fieldColor('keywords')"
        :loading="loadingKeywords"
        class="mb-4"
        chips
        multiple
        hide-details
        closable-chips
        @update:search="fetchKeywordsFacets"
      />

      <v-text-field
        v-model="dataset.origin"
        :disabled="!can('writeDescription')"
        :label="t('origin')"
        :base-color="fieldColor('origin')"
        :color="fieldColor('origin')"
        class="mb-4"
        clearable
        hide-details
      />

      <v-text-field
        v-model="dataset.image"
        :disabled="!can('writeDescription')"
        :label="t('image')"
        :base-color="fieldColor('image')"
        :color="fieldColor('image')"
        class="mb-4"
        clearable
        hide-details
      />

      <!-- Conditional metadata fields based on owner settings -->

      <v-text-field
        v-if="datasetsMetadata?.creator?.active"
        v-model="dataset.creator"
        :rules="props.required.includes('creator') ? [(val: string) => !!val] : []"
        :disabled="!can('writeDescription')"
        :label="datasetsMetadata.creator.title || t('creator')"
        :base-color="fieldColor('creator')"
        :color="fieldColor('creator')"
        class="mb-4"
        clearable
        hide-details
      />

      <v-select
        v-if="datasetsMetadata?.frequency?.active"
        v-model="dataset.frequency"
        :items="frequencies"
        :disabled="!can('writeDescription')"
        :label="datasetsMetadata.frequency.title || t('frequency')"
        :base-color="fieldColor('frequency')"
        :color="fieldColor('frequency')"
        hide-details
        clearable
        class="mb-4"
      />

      <v-text-field
        v-if="datasetsMetadata?.spatial?.active"
        v-model="dataset.spatial"
        :disabled="!can('writeDescription')"
        :label="datasetsMetadata.spatial.title || t('spatial')"
        :base-color="fieldColor('spatial')"
        :color="fieldColor('spatial')"
        hide-details
        class="mb-4"
        clearable
      />

      <v-date-input
        v-if="datasetsMetadata?.temporal?.active"
        :model-value="temporalDateObjects"
        :label="datasetsMetadata.temporal.title || t('temporal')"
        :disabled="!can('writeDescription')"
        :base-color="fieldColor('temporal')"
        :color="fieldColor('temporal')"
        prepend-icon=""
        multiple="range"
        class="mb-4"
        hide-details
        clearable
        @update:model-value="setTemporalDates"
        @click:clear="dataset.temporal = null"
      />

      <v-date-input
        v-if="datasetsMetadata?.modified?.active"
        :model-value="dataset.modified ? dayjs(dataset.modified).toDate() : null"
        :label="datasetsMetadata.modified.title || t('modified')"
        :disabled="!can('writeDescription')"
        :base-color="fieldColor('modified')"
        :color="fieldColor('modified')"
        prepend-icon=""
        class="mb-4"
        hide-details
        clearable
        @update:model-value="v => { dataset.modified = v ? dayjs(v).format('YYYY-MM-DD') : null }"
        @click:clear="dataset.modified = null"
      />

      <v-checkbox
        v-if="dataset.schema?.some((prop: any) => prop['x-refersTo'] === 'http://schema.org/DigitalDocument')"
        v-model="dataset.attachmentsAsImage"
        :disabled="!can('writeDescriptionBreaking')"
        :label="t('attachmentsAsImage')"
        :base-color="fieldColor('attachmentsAsImage')"
        :color="fieldColor('attachmentsAsImage')"
        density="compact"
        hide-details
      />

      <template v-if="datasetsMetadata?.custom?.length">
        <v-text-field
          v-for="cm of datasetsMetadata.custom"
          :key="cm.key"
          :model-value="dataset.customMetadata?.[cm.key]"
          :disabled="!can('writeDescription')"
          :label="cm.title"
          :base-color="isCustomModified(cm.key) ? 'accent' : undefined"
          :color="isCustomModified(cm.key) ? 'accent' : undefined"
          class="mb-4"
          clearable
          hide-details
          @update:model-value="(v) => setCustomMetadata(cm.key, v)"
        />
      </template>

      <!-- Related datasets -->
      <v-autocomplete
        v-if="dataset.finalizedAt || dataset.isMetaOnly"
        v-model:search="relatedDatasetsSearch"
        :model-value="dataset.relatedDatasets ?? []"
        :disabled="!can('writeDescription')"
        :label="t('relatedDatasets')"
        :items="relatedDatasetsItems"
        :loading="relatedDatasetsFetch.loading.value"
        :base-color="fieldColor('relatedDatasets')"
        :color="fieldColor('relatedDatasets')"
        item-title="title"
        item-value="id"
        class="mb-4"
        hide-details
        multiple
        no-filter
        chips
        closable-chips
        clearable
        return-object
        @update:model-value="v => { dataset.relatedDatasets = v.map((d: any) => ({ id: d.id, title: d.title })) }"
      />
    </v-col>
  </v-row>
</template>

<i18n lang="yaml">
fr:
  title: Titre
  summary: Résumé
  summarizePrompt: Aide-moi à rédiger un résumé pour ce jeu de données
  description: Description
  describePrompt: Aide-moi à rédiger une description pour ce jeu de données
  licence: Licence
  topics: Thématiques
  origin: Provenance
  image: Adresse d'une image utilisée comme vignette
  keywords: Mots clés
  projection: Système de coordonnées
  creator: Producteur
  frequency: Fréquence de mise à jour
  freq_realtime: Temps réel
  freq_daily: Quotidienne
  freq_weekly: Hebdomadaire
  freq_monthly: Mensuelle
  freq_quarterly: Trimestrielle
  freq_yearly: Annuelle
  freq_irregular: Irrégulière
  spatial: Couverture spatiale
  temporal: Couverture temporelle
  modified: Date de modification de la source
  attachmentsAsImage: Afficher les pièces jointes comme des images
  relatedDatasets: Jeux de données liés
en:
  title: Title
  summary: Summary
  summarizePrompt: Help me write a summary for this dataset
  description: Description
  describePrompt: Help me write a description for this dataset
  licence: License
  topics: Topics
  origin: Origin
  image: URL of an image used as thumbnail
  keywords: Keywords
  projection: Coordinate reference system
  creator: Producer
  frequency: Update frequency
  freq_realtime: Real-time
  freq_daily: Daily
  freq_weekly: Weekly
  freq_monthly: Monthly
  freq_quarterly: Quarterly
  freq_yearly: Yearly
  freq_irregular: Irregular
  spatial: Spatial coverage
  temporal: Temporal coverage
  modified: Source modification date
  attachmentsAsImage: Display attachments as images
  relatedDatasets: Related datasets
</i18n>

<script setup lang="ts">
import { withQuery } from 'ufo'
import { MarkdownEditor } from '@koumoul/vjsf-markdown'
import { DfAgentChatAction } from '@data-fair/lib-vuetify-agents'
import { VDateInput } from 'vuetify/labs/VDateInput'
import equal from 'fast-deep-equal'
import { useDatasetsMetadata } from '~/composables/dataset/use-metadata'
const dataset = defineModel<any>({ required: true })

const { t, locale } = useI18n()
const { dayjs } = useLocaleDayjs()

const can = (op: string) => dataset.value?.userPermissions?.includes(op) ?? false

const props = withDefaults(defineProps<{
  required?: string[]
  serverData?: any
}>(), { required: () => [] })

const owner = computed(() => dataset.value?.owner)
const licensesFetch = useFetch<any[]>(() => owner.value ? `${$apiPath}/settings/${owner.value.type}/${owner.value.id}/licenses` : null)
const topicsFetch = useFetch<any[]>(() => owner.value ? `${$apiPath}/settings/${owner.value.type}/${owner.value.id}/topics` : null)

const { datasetsMetadata } = useDatasetsMetadata(owner)

// --- Modified field detection ---

const fieldColor = (field: string): string | undefined => {
  if (!props.serverData) return undefined
  const current = dataset.value?.[field]
  const original = props.serverData?.[field]
  return !equal(current, original) ? 'accent' : undefined
}

const isCustomModified = (key: string): boolean => {
  if (!props.serverData) return false
  return dataset.value?.customMetadata?.[key] !== props.serverData?.customMetadata?.[key]
}

// --- Frequencies ---

const frequencyKeys = ['realtime', 'daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'irregular'] as const
const frequencies = computed(() => frequencyKeys.map(k => ({ title: t(`freq_${k}`), value: k })))

// --- Temporal coverage (VDateInput multiple="range") ---

const temporalDateObjects = computed(() => {
  if (!dataset.value?.temporal) return []
  return [dataset.value.temporal.start, dataset.value.temporal.end]
    .filter(Boolean)
    .map((d: string) => dayjs(d).toDate())
})

const setTemporalDates = (dates: Date[]) => {
  if (!dates?.length) { dataset.value.temporal = null; return }
  const sorted = dates.map(d => dayjs(d).format('YYYY-MM-DD')).sort()
  dataset.value.temporal = { start: sorted[0], end: sorted[sorted.length - 1] }
}

// --- Custom metadata ---

const setCustomMetadata = (key: string, value: any) => {
  if (!dataset.value.customMetadata) dataset.value.customMetadata = {}
  if (value) dataset.value.customMetadata[key] = value
  else delete dataset.value.customMetadata[key]
}

// --- AI summarize ---

const summarizeContext = computed(() => {
  return 'Use the dataset_summarizer subagent to produce a summary for this dataset. Once you receive the summary, present it to the user and ask for their approval before applying it. If approved, use the set_dataset_summary tool to set it. If the user wants changes, adjust accordingly.'
})

const describeContext = computed(() => {
  return 'The user wants help writing a description for this dataset. The description field supports markdown and should be more detailed than the summary. Ask the user what aspects they want to emphasize or if they have any specific requirements before using the dataset_description_writer subagent. Once you receive the description, present it to the user and ask for their approval before applying it. If approved, use the set_dataset_description tool to set it. If the user wants changes, adjust accordingly.'
})

// --- Keywords facets (suggestions from other datasets) ---

const keywordsSuggestions = ref<string[]>([])
const loadingKeywords = ref(false)
let keywordsFetched = false

const fetchKeywordsFacets = async (search: string) => {
  if (keywordsFetched || !search || !dataset.value?.owner) return
  loadingKeywords.value = true
  try {
    const response = await $fetch<any>(`${$apiPath}/datasets`, {
      query: { size: 0, facets: 'keywords', owner: `${dataset.value.owner.type}:${dataset.value.owner.id}` }
    })
    keywordsSuggestions.value = (response?.facets?.keywords ?? []).map((f: any) => f.value)
    keywordsFetched = true
  } catch (e) {
    console.error('Failed to fetch keywords facets', e)
  }
  loadingKeywords.value = false
}

// --- Related datasets autocomplete (search-as-you-type) ---

const relatedDatasetsSearch = ref('')

const relatedDatasetsUrl = computed(() => {
  if (!dataset.value?.owner) return null
  const query: Record<string, any> = {
    owner: `${dataset.value.owner.type}:${dataset.value.owner.id}`,
    size: 20
  }
  if (relatedDatasetsSearch.value) query.q = relatedDatasetsSearch.value
  return withQuery(`${$apiPath}/datasets`, query)
})

const relatedDatasetsFetch = useFetch<{ results: { id: string, title: string }[] }>(relatedDatasetsUrl)

const relatedDatasetsItems = computed(() =>
  (relatedDatasetsFetch.data.value?.results ?? []).filter((d: any) => d.id !== dataset.value?.id)
)
</script>
