<template>
  <v-card
    variant="outlined"
    class="mt-4"
  >
    <v-card-title>{{ t('title') }}</v-card-title>
    <v-card-text>
      <vjsf
        v-if="editConstraints"
        v-model="editConstraints"
        :schema="schema"
        :options="vjsfOptions"
        @update:model-value="apply"
      />
    </v-card-text>
  </v-card>
</template>

<i18n lang="yaml">
fr:
  title: Contraintes d'unicité
en:
  title: Unicity constraints
</i18n>

<script setup lang="ts">
import type { Dataset, SchemaProperty } from '#api/types'
import Vjsf, { type Options as VjsfOptions } from '@koumoul/vjsf'
import datasetContractSchema from '~/../../api/types/dataset/schema.js'

type Constraints = NonNullable<Dataset['constraints']>

const props = defineProps<{
  modelValue: Constraints | undefined
  datasetSchema: SchemaProperty[]
  editable?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [Constraints] }>()

const { t } = useI18n()

const editConstraints = ref<{ constraints: Constraints } | null>({ constraints: props.modelValue ? [...props.modelValue] : [] })

watch(() => props.modelValue, (v) => {
  editConstraints.value = { constraints: v ? [...v] : [] }
})

// eligible columns: real stored columns with the values capability
const eligibleKeys = computed(() =>
  (props.datasetSchema || [])
    .filter(p => !p['x-calculated'] && !p['x-extension'] && p['x-capabilities']?.values !== false && p['x-refersTo'] !== 'https://purl.org/geojson/vocab#geometry' && p.type !== 'object')
    .map(p => p.key)
)

// build a self-contained schema for the constraints array, injecting the
// eligible column keys as the enum of the columns multi-select
const schema = computed(() => {
  const constraintsSchema = JSON.parse(JSON.stringify(
    (datasetContractSchema as any).properties.constraints
  ))
  const columnsSchema = constraintsSchema.items.oneOf[0].properties.properties
  columnsSchema.items.enum = eligibleKeys.value
  return { type: 'object', properties: { constraints: constraintsSchema } }
})

const vjsfOptions = computed<VjsfOptions>(() => ({ disableAll: !props.editable, density: 'compact' }))

function apply () {
  emit('update:modelValue', editConstraints.value?.constraints ?? [])
}
</script>
