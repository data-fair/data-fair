<!-- eslint-disable vue/no-mutating-props -- property is a reactive object from parent array, direct mutation is intentional -->
<template>
  <div
    v-if="!column"
    class="text-body-medium text-medium-emphasis"
  >
    {{ t('noColumnSelected') }}
  </div>

  <v-row v-if="column">
    <!-- Left column: title, description -->
    <v-col
      cols="12"
      md="6"
      lg="7"
    >
      <v-text-field
        v-model="column.title"
        :placeholder="column['x-originalName'] || ''"
        :label="t('label')"
        :disabled="!editable"
        variant="outlined"
        density="comfortable"
        class="mb-2"
        hide-details
        autofocus
      >
        <template #append>
          <help-tooltip :text="t('labelHelp')" />
        </template>
      </v-text-field>

      <markdown-editor
        v-model="column.description"
        :label="t('description')"
        :disabled="!editable"
        :easy-mde-options="{ minHeight: '150px' }"
        :locale="locale"
        :csp-nonce="$cspNonce"
      >
        <template #append>
          <help-tooltip>{{ t('descriptionHelp') }}</help-tooltip>
        </template>
      </markdown-editor>
    </v-col>

    <!-- Right column: actions, info, concept -->
    <v-col
      cols="12"
      md="6"
      lg="5"
      class="order-md-2"
    >
      <!-- Action buttons row -->
      <div
        v-if="editable && dataset && !dataset.isVirtual"
        class="d-flex justify-end ga-1 mb-2"
      >
        <confirm-menu
          v-if="editable && dataset && dataset.isRest"
          :title="t('deleteColumnTitle')"
          :text="t('deleteColumnText')"
          :tooltip="t('deleteColumnTitle')"
          :btn-props="{ color: 'warning', icon: true, variant: 'text', size: 'small' }"
          yes-color="warning"
          @confirm="onRemoveColumn"
        />
        <dataset-property-capabilities
          :property="column"
          :editable="editable && dataset && !dataset.isVirtual"
        />
        <dataset-property-transform
          v-if="dataset && dataset.file && !column['x-calculated'] && !column['x-extension']"
          :property="column"
          :editable="editable"
        />
        <dataset-property-validation
          v-if="!column['x-calculated'] && !column['x-extension']"
          :property="column"
          :editable="editable && dataset && !dataset.isVirtual"
        />
        <dataset-property-labels
          v-if="column.type === 'string' && (!column.format || column.format === 'uri-reference') || column.type === 'boolean'"
          :property="column"
          :editable="editable && dataset && !dataset.isVirtual"
          :is-rest="dataset && dataset.isRest"
        />
      </div>

      <!-- Column info -->
      <div class="text-body-medium mb-3">
        <div class="mb-1">
          <span class="text-medium-emphasis">{{ t('sourceKey') }}:</span>
          {{ column.key }}
        </div>
        <div class="mb-1">
          <span class="text-medium-emphasis">{{ t('type') }}:</span>
          {{ propTypeTitle(column) }}
          <template v-if="currentFileColumn?.dateFormat">
            ({{ currentFileColumn.dateFormat }})
          </template>
          <template v-if="currentFileColumn?.dateTimeFormat">
            ({{ currentFileColumn.dateTimeFormat }})
          </template>
        </div>
        <div
          v-if="column['x-cardinality']"
          class="mb-1 d-flex align-center"
        >
          <span class="text-medium-emphasis">{{ t('distinctValues') }}:</span>
          {{ column['x-cardinality'].toLocaleString() }}
          <help-tooltip small>
            {{ t('distinctValuesHelp') }}
          </help-tooltip>
        </div>
        <div
          v-if="column.enum"
          class="mb-1"
        >
          <span class="text-medium-emphasis">{{ t('values') }}:</span>
          {{ column.enum.join(' - ').substring(0, 100) }}
        </div>
      </div>

      <!-- Concept / vocabulary autocomplete -->
      <v-autocomplete
        v-if="column"
        :model-value="column['x-refersTo'] ?? undefined"
        :items="filteredVocabularyItems"
        :disabled="!(editable ?? false) || (dataset?.isVirtual ?? false)"
        :label="t('concept')"
        clearable
        hide-details
        class="mb-3"
        item-value="value"
        :menu-props="{ maxWidth: 500 }"
        :custom-filter="conceptFilter"
        @update:model-value="col => { if (col !== undefined && column) column['x-refersTo'] = col; else if (column) delete column['x-refersTo'] }"
      >
        <template #item="{ internalItem, props: itemProps }">
          <v-list-item v-bind="itemProps">
            <v-list-item-subtitle v-if="(internalItem.raw as VocabItem).description">
              {{ (internalItem.raw as VocabItem).description }}
            </v-list-item-subtitle>
          </v-list-item>
        </template>
        <template #append>
          <help-tooltip :text="conceptHelp" />
        </template>
      </v-autocomplete>

      <!-- Separator select -->
      <v-select
        v-if="column && column.type === 'string'"
        :model-value="(column as any).separator ?? undefined"
        :items="[', ', '; ', ' - ', ' / ', ' | ']"
        :disabled="!(editable ?? false) || (dataset?.isVirtual ?? false)"
        :label="t('sep')"
        hide-details
        class="mb-3"
        clearable
        @update:model-value="val => { if (column) (column as any).separator = val; }"
      >
        <template #append>
          <help-tooltip :text="t('separatorHelp')" />
        </template>
      </v-select>

      <!-- Display format select -->
      <v-select
        v-if="column && showDisplayFormat"
        v-model="displayFormat"
        :items="displayFormatItems"
        :label="t('xDisplay')"
        :disabled="!editable"
        hide-details
      >
        <template #append>
          <help-tooltip :text="t('xDisplayHelp')" />
        </template>
      </v-select>
    </v-col>
  </v-row>
</template>

<i18n lang="yaml">
fr:
  noColumnSelected: Cliquez sur un nom de colonne pour afficher ses informations détaillées.
  sourceKey: Clé source
  type: Type
  label: Libellé
  labelHelp: Libellé court de la colonne utilisé dans toutes les applications de données, la clé sera utilisée si vous laissez cette information vide.
  description: Description
  descriptionHelp: Un contenu markdown ou HTML qui sera utilisé pour décrire cette colonne aux utilisateurs des applications de données et de la documentation d'API.
  distinctValues: Nombre de valeurs distinctes
  distinctValuesHelp: Approximatif dans le cas de données volumineuses
  values: Valeurs
  sep: Séparateur
  separatorHelp: Ne renseigner que pour les colonnes multivaluées. Ce caractère sera utilisé pour séparer les valeurs.
  concept: Concept
  conceptHelp: Les concepts des colonnes améliorent le traitement de la donnée et son utilisation dans une application.
  xDisplay: Format
  xDisplayHelp: Si vous choisissez « texte formaté » la colonne pourra contenir du markdown ou du HTML simple et les applications en tiendront compte.
  singleline: texte
  textarea: texte long
  markdown: texte formaté
  deleteColumnTitle: Supprimer la colonne
  deleteColumnText: Souhaitez-vous supprimer cette colonne ? Attention, la donnée sera effacée et définitivement perdue !
  privateVocabulary: Vocabulaire privé
en:
  noColumnSelected: Click on a column title to display its detailed information.
  sourceKey: Source key
  type: Type
  label: Label
  labelHelp: Short label of the column used in all data applications, the key will be used if you leave this empty.
  description: Description
  descriptionHelp: A markdown or HTML content that will be used to describe this column to the users of data applications and API documentations.
  distinctValues: Number of distinct values
  distinctValuesHelp: Approximative in the case of a large dataset
  values: Values
  sep: Separator
  separatorHelp: Only provide for multi-values columns. This character will be used to separate the values.
  concept: Concept
  conceptHelp: The concepts improve data processing and usage in an application.
  xDisplay: Format
  xDisplayHelp: If you chose "formatted text" the column will be able to contain markdown or HTML content that will be displayed as such by applications.
  singleline: text
  textarea: long text
  markdown: formatted text
  deleteColumnTitle: Delete the column
  deleteColumnText: Do you want to delete this column? Warning, data will be permanently erased!
  privateVocabulary: Private vocabulary
</i18n>

<script setup lang="ts">
/* eslint-disable vue/no-mutating-props */
import type { SchemaProperty } from '#api/types'
import { MarkdownEditor } from '@koumoul/vjsf-markdown'
import { propTypeTitle } from '~/utils/dataset'
import { useDatasetStore } from '~/composables/dataset/dataset-store'
import useStore from '~/composables/use-store'

const { t, locale } = useI18n()
const { dataset } = useDatasetStore()
const { vocabulary, vocabularyArray } = useStore()

const props = defineProps<{
  column: SchemaProperty | null
  allColumns: SchemaProperty[]
  editable?: boolean
}>()

const emit = defineEmits<{
  remove: [key: string]
}>()

const currentFileColumn = computed(() => {
  if (!props.column || !dataset.value?.file?.schema) return null
  const col = props.column
  return dataset.value.file.schema.find((c: any) => c.key === col.key)
})

type VocabSubheader = { type: 'subheader', title: string }
type VocabItem = { title: string, value: string, description: string, termType: string, format?: string }

const vocabularyItems = computed(() => {
  const vocabArray = vocabularyArray.data.value ?? []
  const items: Array<VocabSubheader | VocabItem> = []

  const makeItem = (term: any): VocabItem => ({
    title: term.title,
    value: term.identifiers[0],
    description: term.description,
    termType: term.type,
    format: term.format
  })

  const privateTerms = vocabArray.filter((t: any) => t.private)
  const publicTerms = vocabArray.filter((t: any) => !t.private)

  // Private terms first
  const privateUntagged = privateTerms.filter((t: any) => !t.tag)
  const privateTags = [...new Set(privateTerms.filter((t: any) => t.tag).map((t: any) => t.tag as string))]
  if (privateUntagged.length) {
    items.push({ type: 'subheader', title: t('privateVocabulary') })
    privateUntagged.forEach((term: any) => items.push(makeItem(term)))
  }
  privateTags.forEach(tag => {
    items.push({ type: 'subheader', title: tag })
    privateTerms.filter((t: any) => t.tag === tag).forEach((term: any) => items.push(makeItem(term)))
  })

  // Public terms: untagged first (no subheader, legacy behavior), then by tag
  publicTerms.filter((t: any) => !t.tag).forEach((term: any) => items.push(makeItem(term)))
  const publicTags = [...new Set(publicTerms.filter((t: any) => t.tag).map((t: any) => t.tag as string))]
  publicTags.forEach(tag => {
    items.push({ type: 'subheader', title: tag })
    publicTerms.filter((t: any) => t.tag === tag).forEach((term: any) => items.push(makeItem(term)))
  })

  return items
})

const filteredVocabularyItems = computed(() => {
  if (!props.column) return []
  const col = props.column

  const filtered = vocabularyItems.value.filter(item => {
    if (!('value' in item)) return true // subheaders are kept in first pass
    // exclude concepts already used by other columns
    if (props.allColumns.find(c => c['x-refersTo'] === item.value && c.key !== col.key)) return false
    // accept different type if the concept's type is String
    if (col.type === 'integer' && item.termType === 'number') return true
    if (col.type !== item.termType && item.termType !== 'string') return false
    if (item.format === 'date-time' && col.format !== 'date-time' && col.format !== 'date') return false
    return true
  })

  // Remove subheaders that have no items following them
  return filtered.filter((item, i) => {
    if ('value' in item) return true
    const next = filtered[i + 1]
    return next !== undefined && !('type' in next && next.type === 'subheader')
  })
})

const conceptHelp = computed(() => {
  if (props.column?.['x-refersTo']) {
    const vocab = vocabulary.value[props.column['x-refersTo']]
    if (vocab?.description) return vocab.description
  }
  return t('conceptHelp')
})

const showDisplayFormat = computed(() => {
  if (!props.column) return false
  const col = props.column
  return col.type === 'string' &&
    !col.format &&
    col['x-refersTo'] !== 'http://schema.org/description' &&
    col['x-refersTo'] !== 'http://schema.org/DigitalDocument'
})

const displayFormatItems = computed(() => [
  { value: 'singleline', title: t('singleline') },
  { value: 'textarea', title: t('textarea') },
  { value: 'markdown', title: t('markdown') }
])

const displayFormat = computed({
  get: () => props.column?.['x-display'] ?? 'singleline',
  set: (value: string) => {
    if (!props.column) return
    if (value === 'singleline') {
      delete props.column['x-display']
    } else {
      props.column['x-display'] = value
    }
  }
})

function conceptFilter (_itemText: string, queryText: string, item: any) {
  if (item.raw.type === 'subheader') return true
  const search = queryText.toLowerCase()
  const title = (item.raw.title ?? '').toLowerCase()
  const description = (item.raw.description ?? '').toLowerCase()
  return title.includes(search) || description.includes(search)
}

function onRemoveColumn () {
  if (!props.column) return
  emit('remove', props.column.key)
}
</script>
