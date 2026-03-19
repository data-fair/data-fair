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
        <v-icon>mdi-tag-text-outline</v-icon>
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
          <v-icon>mdi-close</v-icon>
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

<script lang="ts" setup>
/* eslint-disable vue/no-mutating-props */
import Vjsf, { type Options as VjsfOptions } from '@koumoul/vjsf'

const { t } = useI18n({ useScope: 'local' })

const props = defineProps<{
  property: any
  editable?: boolean
}>()

const dialog = ref(false)
const editLabels = ref<Array<{ value: string, label: string }> | null>(null)

const schema = computed(() => {
  const value: any = { type: 'string', title: 'valeur', 'x-cols': 6, 'x-class': 'pr-2' }
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
        label: { type: 'string', title: 'libellé', 'x-cols': 6 }
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
    editLabels.value = Object.keys(props.property['x-labels'] || {})
      .map(key => ({ value: key, label: props.property['x-labels'][key] }))
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
