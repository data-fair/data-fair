<template>
  <vjsf
    v-if="editConstraints"
    v-model="editConstraints"
    :schema="schema"
    :options="vjsfOptions"
    @update:model-value="apply"
  />
</template>

<script setup lang="ts">
import type { Dataset, SchemaProperty } from '#api/types'
import Vjsf, { type Options as VjsfOptions } from '@koumoul/vjsf'
import datasetContractSchema from '~/../../api/types/dataset/schema.js'
import equal from 'fast-deep-equal'

type Constraints = NonNullable<Dataset['constraints']>

const props = defineProps<{
  modelValue: Constraints | undefined
  datasetSchema: SchemaProperty[]
  editable?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [Constraints] }>()

const editConstraints = ref<{ constraints: Constraints } | null>({ constraints: props.modelValue ? [...props.modelValue] : [] })

watch(() => props.modelValue, (v) => {
  // skip rebuilding the vjsf model when the parent is just echoing back the value
  // this component last emitted (e.g. after writing it into an edit buffer) -
  // otherwise vjsf re-renders mid-edit and can lose focus/close an open menu
  if (editConstraints.value && equal(v ?? [], editConstraints.value.constraints ?? [])) return
  editConstraints.value = { constraints: v ? [...v] : [] }
})

// eligible columns: real stored columns with the values capability
const eligibleKeys = computed(() =>
  (props.datasetSchema || [])
    .filter(p => !p['x-calculated'] && !p['x-extension'] && p['x-capabilities']?.values !== false && p['x-refersTo'] !== 'https://purl.org/geojson/vocab#geometry' && p.type !== 'object' && !p.separator)
    .map(p => p.key)
)

// the dateCoherence constraint applies to the columns carrying the startDate/endDate
// concepts; only offer it when both are present on non-derived columns (mirrors
// checkConstraints), or when an existing dateCoherence constraint must stay editable
const hasDateCoherenceConcepts = computed(() => {
  const eligible = (props.datasetSchema || []).filter(p => !p['x-calculated'] && !p['x-extension'])
  return eligible.some(p => p['x-refersTo'] === 'https://schema.org/startDate') &&
    eligible.some(p => p['x-refersTo'] === 'https://schema.org/endDate')
})

// build a self-contained schema for the constraints array, injecting the
// eligible column keys as the enum of the columns multi-select
const schema = computed(() => {
  const constraintsSchema = JSON.parse(JSON.stringify(
    (datasetContractSchema as any).properties.constraints
  ))
  const uniqueBranch = constraintsSchema.items.oneOf[0]
  const columnsSchema = uniqueBranch.properties.properties
  columnsSchema.items.enum = eligibleKeys.value
  // hide the read-only preview of the item fields in the list, the itemTitle line
  // is enough (the "if" must be on the visible case: normalization drops the "if"
  // of a comp:none case)
  const hiddenInSummary = { switch: [{ if: '!summary' }, { comp: 'none' }] }
  columnsSchema.layout = hiddenInSummary
  const offerDateCoherence = hasDateCoherenceConcepts.value ||
    (editConstraints.value?.constraints ?? []).some((c: any) => c.type === 'dateCoherence')
  if (!offerDateCoherence) {
    // single offered type: flatten so that no type selector is rendered
    // (the "type" const is auto-filled by vjsf)
    constraintsSchema.items = { ...constraintsSchema.items, ...uniqueBranch }
    delete constraintsSchema.items.oneOf
  }
  // compact list rendering: one line per constraint, edition in a small menu
  constraintsSchema.layout = {
    title: '', // redundant with the tab name
    listEditMode: 'menu',
    listActions: ['add', 'edit', 'delete'],
    itemTitle: "item.type === 'dateCoherence' ? 'Cohérence des dates (début ≤ fin)' : ('Unicité : ' + (item.properties || []).join(', '))"
  }
  return { type: 'object', properties: { constraints: constraintsSchema } }
})

const vjsfOptions = computed<VjsfOptions>(() => ({ disableAll: !props.editable, density: 'compact' }))

function apply () {
  emit('update:modelValue', editConstraints.value?.constraints ?? [])
}
</script>
