<template>
  <v-container
    fluid
    class="pa-0"
  >
    <div class="d-flex align-center flex-wrap ga-2 mb-2">
      <h3
        v-if="editableProperties.length"
        class="text-headline-small"
      >
        {{ editableProperties.length.toLocaleString() }} {{ t('column', editableProperties.length) }}
      </h3>
      <v-btn
        v-if="dataset.isRest"
        color="primary"
        size="small"
        :icon="mdiPlus"
        @click="addPropertyDialog = true"
      />
      <v-text-field
        v-if="editableProperties.length > 10"
        v-model="searchQuery"
        :placeholder="t('search')"
        variant="outlined"
        density="compact"
        rounded
        style="max-width: 200px;"
        :append-inner-icon="mdiMagnify"
        hide-details
      />
      <df-agent-chat-action
        action-id="help-annotate-schema"
        :visible-prompt="t('helpAnnotateSchema')"
        :hidden-context="'Use the schema_annotator subagent to suggest titles and descriptions for the dataset columns.'"
        :btn-props="{ size: 'small' } as any"
        :title="t('helpAnnotateSchema')"
      />
      <df-agent-chat-action
        action-id="help-configure-properties"
        :visible-prompt="t('helpConfigureProperties')"
        :hidden-context="'The property_config_advisor subagent can help optimize column types and indexing capabilities. Ask the user what they need: type corrections, capability optimization for performance, or both.'"
        :btn-props="{ size: 'small' } as any"
        :title="t('helpConfigureProperties')"
      />
      <v-spacer />
    </div>

    <v-select
      v-if="editableProperties.length && dataset.isRest"
      :model-value="primaryKey ?? []"
      :label="t('primaryKey')"
      :disabled="!!dataset.count"
      :messages="dataset.count ? t('primaryKeyMsgData') : t('primaryKeyMsgNoData')"
      :items="primaryKeyItems"
      item-title="title"
      item-value="value"
      style="max-width: 500px;"
      multiple
      class="mb-3"
      @update:model-value="emit('update:primaryKey', $event)"
    />

    <p
      v-if="dataset.isRest"
      class="text-body-medium text-medium-emphasis mb-2"
    >
      {{ t('sortProperties') }}
    </p>

    <dataset-properties-slide
      v-if="filteredProperties.length"
      :model-value="filteredProperties"
      :dataset="dataset"
      :editable="true"
      :sortable="(dataset.isRest || !!dataset.file) && !searchQuery"
      @update:model-value="onSort"
      @remove="removeProperty"
    />

    <dataset-add-property-dialog
      v-model="addPropertyDialog"
      :schema="modelValue"
      @add="addProperty"
    />
  </v-container>
</template>

<i18n lang="yaml">
fr:
  column: colonne | colonnes
  search: Rechercher
  primaryKey: Cle primaire
  primaryKeyMsgData: La cle primaire ne peut pas etre modifiee une fois que des donnees ont ete inserees.
  primaryKeyMsgNoData: Optionnel. Utilisez une ou plusieurs colonnes du schema pour construire une cle primaire qui identifiera de maniere unique chaque ligne de la donnee.
  sortProperties: Vous pouvez changer l'ordre des colonnes par glisse-depose.
  helpAnnotateSchema: Aide-moi à annoter le schéma
  helpConfigureProperties: Optimiser les types et capacités
en:
  column: column | columns
  search: Search
  primaryKey: Primary key
  primaryKeyMsgData: The primary key cannot be changed once data has been inserted.
  primaryKeyMsgNoData: Optional. Use one or more columns of the schema to build a primary key that will uniquely identify each line of the data.
  sortProperties: You can sort the columns by drag and drop.
  helpAnnotateSchema: Help annotate schema
  helpConfigureProperties: Optimize types and capabilities
</i18n>

<script lang="ts" setup>
import {
  mdiMagnify,
  mdiPlus
} from '@mdi/js'
import { DfAgentChatAction } from '@data-fair/lib-vuetify-agents'

const props = defineProps<{
  modelValue: any[]
  dataset: any
  primaryKey?: string[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: any[]]
  'update:primaryKey': [value: string[]]
}>()

const { t } = useI18n({ useScope: 'local' })

const searchQuery = ref('')
const addPropertyDialog = ref(false)

const editableProperties = computed(() => {
  return props.modelValue.filter(p => !p['x-calculated'])
})

const filteredProperties = computed(() => {
  const filter = searchQuery.value?.toLowerCase()
  if (!filter) return editableProperties.value
  return editableProperties.value.filter(p => {
    const search = `${(p.title || '').toLowerCase()} ${(p['x-originalName'] || '').toLowerCase()} ${p.key.toLowerCase()}`
    return search.includes(filter)
  })
})

const primaryKeyItems = computed(() => {
  return editableProperties.value.map(p => ({
    title: p.title || p['x-originalName'] || p.key,
    value: p.key
  }))
})

function addProperty (property: any) {
  emit('update:modelValue', [...props.modelValue, property])
}

function removeProperty (key: string) {
  emit('update:modelValue', props.modelValue.filter(p => p.key !== key))
}

function onSort (sorted: any[]) {
  // Merge sorted editable properties with non-editable (calculated) ones
  const calculated = props.modelValue.filter(p => p['x-calculated'])
  const sortedKeys = sorted.map(s => s.key)
  const reordered = sortedKeys
    .map(key => props.modelValue.find(p => p.key === key))
    .filter(Boolean)
  emit('update:modelValue', [...reordered, ...calculated])
}
</script>
