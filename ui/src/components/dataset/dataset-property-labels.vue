<!-- eslint-disable vue/no-mutating-props -- property is a reactive object from parent array, direct mutation is intentional -->
<template>
  <v-dialog
    v-model="dialog"
    max-width="800px"
  >
    <template #activator="{ props: activatorProps }">
      <v-btn
        v-bind="activatorProps"
        icon
        size="small"
        variant="flat"
        :title="t('labels')"
      >
        <v-icon :icon="mdiTagTextOutline" />
      </v-btn>
    </template>
    <v-card v-if="dialog">
      <v-toolbar
        density="compact"
        flat
      >
        <v-toolbar-title>{{ t('labels') }}</v-toolbar-title>
        <v-spacer />
        <v-btn
          icon
          @click="dialog = false"
        >
          <v-icon :icon="mdiClose" />
        </v-btn>
      </v-toolbar>
      <v-card-text class="px-3">
        <v-alert
          type="info"
          variant="tonal"
          class="mb-4"
        >
          {{ t('tutorialLabels') }}
        </v-alert>

        <v-form>
          <vjsf
            v-if="editLabels"
            v-model="editLabels"
            :schema="schema"
            :options="vjsfOptions"
            @update:model-value="apply"
          />
        </v-form>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<i18n lang="yaml">
fr:
  labels: Libellés
  tutorialLabels: Saisissez des libellés associés à des valeurs présentes dans la donnée pour améliorer la présentation dans les applications.
en:
  labels: Labels
  tutorialLabels: Enter some labels associated to values present in the data to improve the display in applications.
</i18n>

<script setup lang="ts">
/* eslint-disable vue/no-mutating-props */
import { mdiClose, mdiTagTextOutline } from '@mdi/js'
import Vjsf, { type Options as VjsfOptions } from '@koumoul/vjsf'
import type { SchemaProperty } from '#api/types'

const { t } = useI18n({ useScope: 'local' })

const props = defineProps<{
  property: SchemaProperty
  editable?: boolean
}>()

const dialog = ref(false)
const editLabels = ref<Array<{ value: string, label: string }> | null>(null)

const schema = computed(() => {
  const value: Record<string, unknown> = { type: 'string', title: 'Valeur', layout: { cols: 6, class: 'pr-2' } }
  if (props.property.type === 'boolean') value.enum = ['true', 'false']
  if (props.property.enum) value.examples = props.property.enum
  return {
    type: 'array',
    title: ' ',
    items: {
      type: 'object',
      required: ['value'],
      properties: {
        value,
        label: { type: 'string', title: 'Libellé', layout: { cols: 6 } }
      }
    }
  }
})

const vjsfOptions = computed<VjsfOptions>(() => ({
  disableAll: !props.editable,
  editMode: 'inline'
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
