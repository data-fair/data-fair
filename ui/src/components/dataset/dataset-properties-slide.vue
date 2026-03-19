<template>
  <v-sheet
    class="properties-slide"
    color="transparent"
  >
    <draggable
      :model-value="modelValue"
      :disabled="!sortable"
      item-key="key"
      ghost-class="property-ghost"
      class="d-flex flex-wrap ga-1"
      @update:model-value="emit('update:modelValue', $event)"
    >
      <template #item="{ element }">
        <v-btn
          :key="element.key"
          style="text-transform: none;"
          class="px-2"
          size="small"
          :class="{ 'font-weight-bold': !!element['x-refersTo'] }"
          :color="activeKey === element.key ? 'primary' : 'default'"
          :variant="activeKey === element.key ? 'flat' : 'text'"
          :ripple="!sortable"
          @click="switchProperty(element.key)"
        >
          <v-icon
            size="small"
            start
          >
            {{ propTypeIcon(element) }}
          </v-icon>
          {{ element.title || element['x-originalName'] || element.key }}
        </v-btn>
      </template>
    </draggable>

    <div
      v-if="!activeKey"
      class="text-body-2 text-medium-emphasis mt-2"
    >
      {{ t('detailedInfo') }}
    </div>

    <v-sheet
      v-if="activeProp"
      color="transparent"
      class="mt-3"
    >
      <v-row>
        <!-- Left column: title, description -->
        <v-col
          cols="12"
          md="6"
          lg="7"
          order-md="1"
        >
          <v-text-field
            v-model="activeProp.title"
            :placeholder="activeProp['x-originalName'] || ' '"
            :label="t('label')"
            :disabled="!editable"
            variant="outlined"
            density="compact"
            hide-details
            class="mb-3"
            autofocus
          >
            <template #append>
              <help-tooltip>{{ t('labelHelp') }}</help-tooltip>
            </template>
          </v-text-field>

          <markdown-editor
            v-model="activeProp.description"
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
          order-md="2"
        >
          <!-- Action buttons row -->
          <div
            v-if="editable && !dataset.isVirtual"
            class="d-flex justify-end ga-1 mb-2"
          >
            <confirm-menu
              v-if="editable && dataset.isRest"
              :title="t('deletePropertyTitle')"
              :text="t('deletePropertyText')"
              :tooltip="t('deletePropertyTitle')"
              yes-color="warning"
              alert="error"
              @confirm="onRemoveProperty"
            />
            <dataset-property-capabilities
              :property="activeProp"
              :editable="editable && !dataset.isVirtual"
            />
            <dataset-property-transform
              v-if="dataset.file && !activeProp['x-calculated'] && !activeProp['x-extension']"
              :property="activeProp"
              :editable="editable"
            />
            <dataset-property-validation
              v-if="!activeProp['x-calculated'] && !activeProp['x-extension']"
              :property="activeProp"
              :editable="editable && !dataset.isVirtual"
            />
            <dataset-property-labels
              v-if="activeProp.type === 'string' && (!activeProp.format || activeProp.format === 'uri-reference') || activeProp.type === 'boolean'"
              :property="activeProp"
              :editable="editable && !dataset.isVirtual"
              :is-rest="dataset.isRest"
            />
          </div>

          <!-- Property info list -->
          <v-list
            density="compact"
            class="labels-list"
          >
            <v-list-item>
              <span class="text-medium-emphasis">{{ t('key') }}</span>&nbsp;
              {{ activeProp.key }}
            </v-list-item>
            <v-list-item>
              <span class="text-medium-emphasis">Type :</span>&nbsp;
              {{ propTypeTitle(activeProp) }}
              <template v-if="currentFileProp?.dateFormat">
                ({{ currentFileProp.dateFormat }})
              </template>
              <template v-if="currentFileProp?.dateTimeFormat">
                ({{ currentFileProp.dateTimeFormat }})
              </template>
            </v-list-item>
            <v-list-item v-if="activeProp['x-cardinality']">
              <span class="text-medium-emphasis">{{ t('distinctValues') }} : </span>&nbsp;
              {{ activeProp['x-cardinality'].toLocaleString() }}
              <help-tooltip>{{ t('distinctValuesHelp') }}</help-tooltip>
            </v-list-item>
            <v-list-item v-if="activeProp.enum">
              <span class="text-medium-emphasis">{{ t('values') }}</span>&nbsp;
              {{ activeProp.enum.join(' - ').substring(0, 100) }}
            </v-list-item>
          </v-list>

          <!-- Concept / vocabulary autocomplete -->
          <v-autocomplete
            v-model="activeProp['x-refersTo']"
            :items="filteredVocabularyItems"
            :disabled="!editable || dataset.isVirtual"
            :label="t('concept')"
            clearable
            hide-details
            class="mb-3"
            item-title="text"
            item-value="value"
          >
            <template #item="{ item, props: itemProps }">
              <v-list-item v-bind="itemProps">
                <v-list-item-subtitle v-if="item.raw.description">
                  {{ item.raw.description }}
                </v-list-item-subtitle>
              </v-list-item>
            </template>
            <template #append>
              <help-tooltip>{{ conceptHelp }}</help-tooltip>
            </template>
          </v-autocomplete>

          <!-- Separator select -->
          <v-select
            v-if="activeProp.type === 'string'"
            v-model="activeProp.separator"
            :items="[', ', '; ', ' - ', ' / ', ' | ']"
            :disabled="!editable || dataset.isVirtual"
            :label="t('sep')"
            hide-details
            class="mb-3"
            clearable
          >
            <template #append>
              <help-tooltip>{{ t('separatorHelp') }}</help-tooltip>
            </template>
          </v-select>

          <!-- Display format select -->
          <v-select
            v-if="showDisplayFormat"
            :model-value="activeProp['x-display'] || 'singleline'"
            :items="displayFormatItems"
            :label="t('xDisplay')"
            :disabled="!editable"
            hide-details
            @update:model-value="setDisplayFormat"
          >
            <template #append>
              <help-tooltip>{{ t('xDisplayHelp') }}</help-tooltip>
            </template>
          </v-select>
        </v-col>
      </v-row>
    </v-sheet>
  </v-sheet>
</template>

<i18n lang="yaml">
fr:
  detailedInfo: Cliquez sur un nom de colonne pour afficher ses informations detaillees.
  key: "Cle dans la source : "
  label: Libelle
  labelHelp: Libelle court de la colonne utilise dans toutes les applications de donnees, la cle sera utilisee si vous laissez cette information vide.
  description: Description
  descriptionHelp: Un contenu markdown ou HTML qui sera utilise pour decrire cette colonne aux utilisateurs des applications de donnees et de la documentation d'API.
  distinctValues: Nombre de valeurs distinctes
  distinctValuesHelp: approximatif dans le cas de donnees volumineuses
  values: "Valeurs : "
  sep: Separateur
  separatorHelp: Ne renseigner que pour les colonnes multivaluees. Ce caractere sera utilise pour separer les valeurs.
  concept: Concept
  conceptHelp: Les concepts des colonnes ameliorent le traitement de la donnee et son utilisation dans une application.
  xDisplay: Format
  xDisplayHelp: Si vous choisissez "texte formatte" la colonne pourra contenir du markdown ou du HTML simple et les applications en tiendront compte.
  singleline: texte
  textarea: texte long
  markdown: texte formatte
  deletePropertyTitle: Supprimer la colonne
  deletePropertyText: Souhaitez vous supprimer cette colonne ? Attention la donnee sera effacee et definitivement perdue !
en:
  detailedInfo: Click on a column title to display its detailed information.
  key: "Key in the source: "
  label: Label
  labelHelp: Short label of the column used in all data applications, the key will be used if you leave this empty.
  description: Description
  descriptionHelp: A markdown or HTML content that will be used to describe this column to the users of data applications and API documentations.
  distinctValues: Number of distinct values
  distinctValuesHelp: approximative in the case of a large dataset
  values: "Values: "
  sep: Separator
  separatorHelp: Only provide for multi-values columns. This character will be used to separate the values.
  concept: Concept
  conceptHelp: The concepts improve data processing and usage in an application.
  xDisplay: Format
  xDisplayHelp: If you chose "formatted text" the column will be able to contain markdown or HTML content that will be displayed as such by applications.
  singleline: text
  textarea: long text
  markdown: formatted text
  deletePropertyTitle: Delete the column
  deletePropertyText: Do you want to delete this column? Warning, data will be definitively erased!
</i18n>

<script lang="ts" setup>
import { MarkdownEditor } from '@koumoul/vjsf-markdown'
import draggable from 'vuedraggable'
import { propTypeTitle, propTypeIcon } from '~/utils/dataset'
import useStore from '~/composables/use-store'

const { t, locale } = useI18n({ useScope: 'local' })
const { vocabulary, vocabularyArray } = useStore()

const props = defineProps<{
  modelValue: any[]
  dataset: any
  editable?: boolean
  sortable?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: any[]]
  remove: [key: string]
}>()

const activeKey = ref<string | null>(null)

const activeProp = computed(() => {
  if (!activeKey.value) return null
  return props.modelValue.find(p => p.key === activeKey.value) ?? null
})

const currentFileProp = computed(() => {
  if (!activeProp.value || !props.dataset.file?.schema) return null
  return props.dataset.file.schema.find((p: any) => p.key === activeProp.value!.key)
})

const vocabularyItems = computed(() => {
  const vocabArray = vocabularyArray.data.value ?? []
  const items: Array<{ text: string, value: string, description: string, type: string, format?: string, header?: boolean }> = []
  let lastTag = ''
  for (const term of vocabArray) {
    if (term.tag !== lastTag) {
      items.push({ text: term.tag, value: term.tag, description: '', type: '', header: true })
      lastTag = term.tag
    }
    for (const id of term.identifiers) {
      items.push({
        text: term.title,
        value: id,
        description: term.description,
        type: term.type,
        format: term.format
      })
    }
  }
  return items
})

const filteredVocabularyItems = computed(() => {
  if (!activeProp.value) return []
  const prop = activeProp.value
  return vocabularyItems.value.filter(item => {
    if (item.header) return true
    // exclude concepts already used by other properties
    if (props.modelValue.find(pr => pr['x-refersTo'] === item.value && pr.key !== prop.key)) return false
    // accept different type if the concept's type is String
    if (prop.type === 'integer' && item.type === 'number') return true
    if (prop.type !== item.type && item.type !== 'string') return false
    if (item.format === 'date-time' && prop.format !== 'date-time' && prop.format !== 'date') return false
    return true
  })
})

const conceptHelp = computed(() => {
  if (activeProp.value?.['x-refersTo']) {
    const vocab = vocabulary.value[activeProp.value['x-refersTo']]
    if (vocab?.description) return vocab.description
  }
  return t('conceptHelp')
})

const showDisplayFormat = computed(() => {
  if (!activeProp.value) return false
  const prop = activeProp.value
  return prop.type === 'string' &&
    !prop.format &&
    prop['x-refersTo'] !== 'http://schema.org/description' &&
    prop['x-refersTo'] !== 'http://schema.org/DigitalDocument'
})

const displayFormatItems = computed(() => [
  { value: 'singleline', title: t('singleline') },
  { value: 'textarea', title: t('textarea') },
  { value: 'markdown', title: t('markdown') }
])

function switchProperty (key: string) {
  if (activeKey.value === key) {
    activeKey.value = null
  } else {
    activeKey.value = null
    nextTick(() => {
      activeKey.value = key
    })
  }
}

function setDisplayFormat (value: string) {
  if (!activeProp.value) return
  if (value === 'singleline') {
    delete activeProp.value['x-display']
  } else {
    activeProp.value['x-display'] = value
  }
}

function onRemoveProperty () {
  if (!activeProp.value) return
  emit('remove', activeProp.value.key)
  activeKey.value = null
}

watch(() => props.modelValue.length, () => {
  activeKey.value = null
})
</script>

<style>
.properties-slide .property-ghost {
  opacity: 0.5;
  background-color: rgb(var(--v-theme-primary), 0.2) !important;
}

.properties-slide .labels-list .v-list-item {
  min-height: 30px;
}
</style>
