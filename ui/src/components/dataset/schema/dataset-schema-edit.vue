<template>
  <div class="d-flex align-center flex-wrap ga-2 mb-2">
    <h3
      v-if="editableColumns.length"
      class="text-headline-small"
    >
      {{ editableColumns.length.toLocaleString() }} {{ t('column', editableColumns.length) }}
    </h3>
    <dataset-add-column-dialog
      v-if="dataset?.isRest"
      :schema="modelValue"
      @add="addColumn"
    />
    <v-text-field
      v-if="editableColumns.length > 10"
      v-model="searchQuery"
      :placeholder="t('search')"
      :append-inner-icon="mdiMagnify"
      variant="outlined"
      density="compact"
      max-width="200"
      hide-details
      rounded
    />
    <df-agent-chat-action
      action-id="help-annotate-schema"
      :visible-prompt="t('helpAnnotateSchema')"
      :hidden-context="'Use the schema_annotator subagent to suggest titles and descriptions for the dataset columns.'"
      :title="t('helpAnnotateSchema')"
    />
    <df-agent-chat-action
      action-id="help-configure-properties"
      :visible-prompt="t('helpConfigureProperties')"
      :hidden-context="'The property_config_advisor subagent can help optimize column types and indexing capabilities. Ask the user what they need: type corrections, capability optimization for performance, or both.'"
      :title="t('helpConfigureProperties')"
    />
  </div>

  <v-select
    v-if="editableColumns.length && dataset?.isRest"
    :model-value="primaryKey ?? []"
    :label="t('primaryKey')"
    :disabled="!!dataset?.count"
    :messages="dataset?.count ? t('primaryKeyMsgData') : t('primaryKeyMsgNoData')"
    :items="primaryKeyItems"
    item-title="title"
    item-value="value"
    max-width="500"
    multiple
    class="mb-4"
    @update:model-value="emit('update:primaryKey', $event)"
  />

  <v-select
    v-if="showProjection"
    :model-value="projection"
    :label="t('projection')"
    :items="projectionsFetch.data.value ?? []"
    item-title="title"
    item-value="code"
    return-object
    max-width="500"
    class="mb-4"
    clearable
    :loading="projectionsFetch.loading.value"
    :disabled="!can('writeDescriptionBreaking')"
    @update:model-value="emit('update:projection', $event)"
  />

  <p
    v-if="dataset?.isRest"
    class="text-body-medium mb-2"
  >
    {{ t('sortProperties') }}
  </p>

  <dataset-columns-list
    v-if="filteredColumns.length"
    :columns="filteredColumns"
    :original-schema="props.originalSchema"
    :sortable="(dataset?.isRest || !!dataset?.file) && !searchQuery"
    :active-column-key="activeColumnKey"
    class="mb-4"
    @update:model-value="onSort"
    @update:active-column-key="activeColumnKey = $event"
  />

  <dataset-column-editor
    :column="activeColumn"
    :all-columns="props.modelValue"
    :editable="true"
    @remove="removeColumn"
  />
</template>

<i18n lang="yaml">
fr:
  column: colonne | colonnes
  search: Rechercher
  primaryKey: Cle primaire
  primaryKeyMsgData: La cle primaire ne peut pas être modifiée une fois que des données ont été insérées.
  primaryKeyMsgNoData: Optionnel. Utilisez une ou plusieurs colonnes du schema pour construire une cle primaire qui identifiera de manière unique chaque ligne de la donnée.
  projection: Projection cartographique
  sortProperties: Vous pouvez changer l'ordre des colonnes par glisser-déposer.
  helpAnnotateSchema: Aide-moi à annoter le schéma
  helpConfigureProperties: Optimiser les types et capacités
en:
  column: column | columns
  search: Search
  primaryKey: Primary key
  primaryKeyMsgData: The primary key cannot be changed once data has been inserted.
  primaryKeyMsgNoData: Optional. Use one or more columns of the schema to build a primary key that will uniquely identify each line of the data.
  projection: Map projection
  sortProperties: You can sort the columns by drag and drop.
  helpAnnotateSchema: Help annotate schema
  helpConfigureProperties: Optimize types and capabilities
</i18n>

<script setup lang="ts">
import { mdiMagnify } from '@mdi/js'
import { DfAgentChatAction } from '@data-fair/lib-vuetify-agents'
import type { SchemaProperty } from '#api/types'
import { useDatasetStore } from '~/composables/dataset/store'

const coordXUri = 'http://data.ign.fr/def/geometrie#coordX'
const coordYUri = 'http://data.ign.fr/def/geometrie#coordY'
const projectGeomUri = 'http://data.ign.fr/def/geometrie#Geometry'

const props = defineProps<{
  modelValue: SchemaProperty[]
  originalSchema?: SchemaProperty[]
  primaryKey?: string[]
  projection?: { title?: string, code?: string } | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: SchemaProperty[]]
  'update:primaryKey': [value: string[]]
  'update:projection': [value: { title?: string, code?: string } | null]
}>()

const { t } = useI18n({ useScope: 'local' })

const { dataset } = useDatasetStore()

const can = (op: string) => dataset.value?.userPermissions?.includes(op) ?? false

const showProjection = computed(() => {
  const schema = props.modelValue
  return !!(schema && (
    (schema.find(p => p['x-refersTo'] === coordXUri) && schema.find(p => p['x-refersTo'] === coordYUri)) ||
    schema.find(p => p['x-refersTo'] === projectGeomUri)
  ))
})

const projectionsFetch = useFetch<{ title: string, code: string }[]>(() => showProjection.value ? `${$apiPath}/projections` : null)

const searchQuery = ref('')
const activeColumnKey = ref<string | null>(null)

const editableColumns = computed(() => {
  return props.modelValue.filter(p => !p['x-calculated'])
})

const filteredColumns = computed(() => {
  const filter = searchQuery.value?.toLowerCase()
  if (!filter) return editableColumns.value
  return editableColumns.value.filter(p => {
    const search = `${(p.title || '').toLowerCase()} ${(p['x-originalName'] || '').toLowerCase()} ${p.key.toLowerCase()}`
    return search.includes(filter)
  })
})

const primaryKeyItems = computed(() => {
  return editableColumns.value.map(p => ({
    title: p.title || p['x-originalName'] || p.key,
    value: p.key
  }))
})

const activeColumn = computed(() => {
  if (!activeColumnKey.value) return null
  return props.modelValue.find(c => c.key === activeColumnKey.value) ?? null
})

function addColumn (column: SchemaProperty) {
  emit('update:modelValue', [...props.modelValue, column])
}

function removeColumn (key: string) {
  emit('update:modelValue', props.modelValue.filter(p => p.key !== key))
}

function onSort (sorted: SchemaProperty[]) {
  // Merge sorted editable columns with non-editable (calculated) ones
  const calculated = props.modelValue.filter(p => p['x-calculated'])
  const sortedKeys = sorted.map(s => s.key)
  const reordered = sortedKeys
    .map(key => props.modelValue.find(p => p.key === key))
    .filter((col): col is SchemaProperty => col !== undefined)
  emit('update:modelValue', [...reordered, ...calculated])
}

watch(() => props.modelValue.length, () => {
  activeColumnKey.value = null
})
</script>
