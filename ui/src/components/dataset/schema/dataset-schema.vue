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

  <p
    v-if="dataset?.isRest"
    class="text-body-medium mb-2"
  >
    {{ t('sortProperties') }}
  </p>

  <dataset-columns-list
    v-if="filteredColumns.length"
    :columns="filteredColumns"
    :sortable="(dataset?.isRest || !!dataset?.file) && !searchQuery"
    :active-column-key="activeColumnKey"
    class="mb-4"
    @update:model-value="onSort"
    @update:active-column-key="activeColumnKey = $event"
  />

  <dataset-column-editor
    :column="activeColumn"
    :all-columns="props.modelValue"
    :dataset="dataset"
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
  sortProperties: Vous pouvez changer l'ordre des colonnes par glisser-déposer.
en:
  column: column | columns
  search: Search
  primaryKey: Primary key
  primaryKeyMsgData: The primary key cannot be changed once data has been inserted.
  primaryKeyMsgNoData: Optional. Use one or more columns of the schema to build a primary key that will uniquely identify each line of the data.
  sortProperties: You can sort the columns by drag and drop.
</i18n>

<script setup lang="ts">
import { mdiMagnify } from '@mdi/js'
import type { SchemaProperty } from '#api/types'
import { useDatasetStore } from '~/composables/dataset/store'

const props = defineProps<{
  modelValue: SchemaProperty[]
  primaryKey?: string[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: SchemaProperty[]]
  'update:primaryKey': [value: string[]]
}>()

const { t } = useI18n({ useScope: 'local' })

const { dataset } = useDatasetStore()

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
