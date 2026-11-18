<!-- eslint-disable vue/no-mutating-props -- property is a reactive object from parent array, direct mutation is intentional -->
<template>
  <v-dialog
    v-model="dialog"
    max-width="800"
  >
    <template #activator="{ props: activatorProps }">
      <v-btn
        v-bind="activatorProps"
        :title="t('labels')"
        :icon="mdiTagTextOutline"
        variant="text"
        size="small"
      />
    </template>

    <v-card v-if="dialog">
      <v-toolbar
        :title="trLocale ? `${t('labels')} (${trLocale.toUpperCase()})` : t('labels')"
        density="compact"
        flat
      >
        <v-spacer />
        <v-btn
          :icon="mdiClose"
          @click="dialog = false"
        />
      </v-toolbar>

      <v-card-text>
        <df-tutorial-alert
          :id="readonly ? 'labels-readonly' : 'labels'"
          class="mb-2"
          :text="readonly ? t(derivedFrom === 'virtual' ? 'readonlyVirtual' : 'readonlyExtension') : t('tutorialLabels')"
          persistent
        />

        <v-data-table
          v-if="readonly"
          :headers="readonlyHeaders"
          :items="readonlyItems"
          :items-per-page="-1"
          density="compact"
          class="border rounded"
          hide-default-footer
        >
          <template #item.value="{ item }">
            <code>{{ item.value }}</code>
          </template>
        </v-data-table>

        <v-defaults-provider
          v-else
          :defaults="{ global: { hideDetails: 'auto' } }"
        >
          <v-form>
            <vjsf
              v-if="editLabels"
              v-model="editLabels"
              :schema="schema"
              :options="vjsfOptions"
              @update:model-value="apply"
            />
          </v-form>
        </v-defaults-provider>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<i18n lang="yaml">
fr:
  labels: Libellés des valeurs
  tutorialLabels: Saisissez des libellés associés à des valeurs présentes dans la donnée pour améliorer la présentation dans les applications.
  readonlyVirtual: "Lecture seule : ces libellés viennent des jeux enfants, modifiez-les sur ces jeux. Si plusieurs enfants définissent la même valeur, le libellé du premier de la liste l'emporte."
  readonlyExtension: "Lecture seule : ces libellés viennent de l'enrichissement."
  value: Valeur
  label: Libellé
en:
  labels: Labels for values
  tutorialLabels: Enter some labels associated to values present in the data to improve the display in applications.
  readonlyVirtual: "Read-only view: these labels come from the child datasets, edit them there. If several children define the same value, the label of the first one in the list prevails."
  readonlyExtension: "Read-only view: these labels come from the extension."
  value: Value
  label: Label
</i18n>

<script setup lang="ts">
/* eslint-disable vue/no-mutating-props */
import type { SchemaProperty } from '#api/types'
import { mdiClose, mdiTagTextOutline } from '@mdi/js'
import Vjsf, { type Options as VjsfOptions } from '@koumoul/vjsf'
import { useMetadataI18n } from '~/composables/dataset/metadata-i18n'

const { t, locale } = useI18n()

const props = defineProps<{
  property: SchemaProperty
  editable?: boolean
  derivedFrom?: 'virtual' | 'extension'
}>()

const dialog = ref(false)
const editLabels = ref<Array<{ value: string, label: string, source?: string }> | null>(null)

const readonly = computed(() => !props.editable)

const readonlyItems = computed(() => Object.entries(props.property['x-labels'] ?? {}).map(([value, label]) => ({ value, label })))

const readonlyHeaders = computed(() => [
  { key: 'value', title: t('value'), sortable: false },
  { key: 'label', title: t('label'), sortable: false }
])

// MOCKUP i18n: outside the default locale, the values are fixed and only their labels are translated
const i18n = useMetadataI18n()
const trLocale = computed(() => i18n && !i18n.isDefault.value ? i18n.editLocale.value : null)

const schema = computed(() => {
  if (trLocale.value) {
    return {
      type: 'array',
      layout: { listEditMode: 'inline', listActions: [] },
      title: `${t('labels')} (${trLocale.value.toUpperCase()})`,
      items: {
        type: 'object',
        properties: {
          value: { type: 'string', title: t('value'), readOnly: true, layout: { cols: { sm: 4 } } },
          source: { type: 'string', title: t('label'), readOnly: true, layout: { cols: { sm: 4 } } },
          label: { type: 'string', title: `${t('label')} (${trLocale.value.toUpperCase()})`, layout: { cols: { sm: 4 } } }
        }
      }
    }
  }
  const value: Record<string, unknown> = { type: 'string', title: t('value'), layout: { cols: { sm: 6 } } }
  if (props.property.type === 'boolean') value.enum = ['true', 'false']
  if (props.property.enum) value.examples = props.property.enum
  return {
    type: 'array',
    layout: { listEditMode: 'inline', messages: { addItem: 'Associer un libellé à une valeur' } },
    title: t('labels'),
    items: {
      type: 'object',
      required: ['value'],
      properties: {
        value,
        label: { type: 'string', title: t('label'), layout: { cols: { sm: 6 } } }
      }
    }
  }
})

const vjsfOptions = computed<VjsfOptions>(() => ({ density: 'comfortable', locale: locale.value, xI18n: true }))

watch(dialog, (show) => {
  if (show && trLocale.value) {
    const labels = props.property['x-labels'] || {}
    const translated: Record<string, string> = (props.property as any)['x-i18n-x-labels']?.[trLocale.value] ?? {}
    editLabels.value = Object.keys(labels).map(key => ({ value: key, source: labels[key] as string, label: translated[key] ?? '' }))
  } else if (show) {
    const labels = props.property['x-labels'] || {}
    editLabels.value = Object.keys(labels)
      .map(key => ({ value: key, label: labels[key] as string }))
  } else {
    editLabels.value = null
  }
})

function apply () {
  if (!editLabels.value) return
  if (trLocale.value) {
    const translated = Object.fromEntries(editLabels.value.filter(item => item.label).map(item => [item.value, item.label]))
    const all: Record<string, any> = { ...(props.property as any)['x-i18n-x-labels'] }
    if (Object.keys(translated).length) all[trLocale.value] = translated
    else delete all[trLocale.value]
    if (Object.keys(all).length) (props.property as any)['x-i18n-x-labels'] = all
    else delete (props.property as any)['x-i18n-x-labels']
    return
  }
  const labels = editLabels.value
    .filter(item => !!item.value)
    .reduce((a: Record<string, string>, item) => { a[item.value] = item.label || ''; return a }, {})
  if (Object.keys(labels).length) {
    props.property['x-labels'] = labels
  } else {
    delete props.property['x-labels']
  }
}
</script>
