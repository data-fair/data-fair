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
        :title="t('labels')"
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
          id="labels"
          class="mb-2"
          :text="t('tutorialLabels')"
          persistent
        />

        <v-defaults-provider :defaults="{ global: { hideDetails: 'auto' } }">
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
  value: Valeur
  label: Libellé
en:
  labels: Labels for values
  tutorialLabels: Enter some labels associated to values present in the data to improve the display in applications.
  value: Value
  label: Label
</i18n>

<script setup lang="ts">
/* eslint-disable vue/no-mutating-props */
import type { SchemaProperty } from '#api/types'
import { mdiClose, mdiTagTextOutline } from '@mdi/js'
import Vjsf, { type Options as VjsfOptions } from '@koumoul/vjsf'

const { t } = useI18n()

const props = defineProps<{
  property: SchemaProperty
  editable?: boolean
}>()

const dialog = ref(false)
const editLabels = ref<Array<{ value: string, label: string }> | null>(null)

const schema = computed(() => {
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

const vjsfOptions = computed<VjsfOptions>(() => ({
  density: 'comfortable',
  disableAll: !props.editable
}))

watch(dialog, (show) => {
  if (show) {
    const labels = props.property['x-labels'] || {}
    editLabels.value = Object.keys(labels)
      .map(key => ({ value: key, label: labels[key] as string }))
  } else {
    editLabels.value = null
  }
})

function apply () {
  if (!editLabels.value) return
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
