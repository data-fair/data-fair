<template lang="html">
  <v-form
    v-if="editSchema && patch"
  >
    <tutorial-alert
      id="edit-multiple-lines"
      :text="t('warning')"
      persistent
    />
    <vjsf
      v-model="patch"
      :schema="editSchema"
      :options="vjsfOptions"
    >
      <template
        v-for="prop in homogeneity?.heterogenousProperties"
        #[`${prop}-before`]="slotProps"
      >
        <v-alert
          v-if="patch[prop] === null || patch[prop] === undefined"
          :key="`null-${prop}`"
          color="info"
          density="compact"
          variant="text"
          class="py-1 px-2 mb-1"
        >
          "{{ slotProps.node.layout.label || prop }}" contient {{ homogeneity?.propertyValues[prop].length.toLocaleString() }} valeurs différentes
        </v-alert>
        <v-alert
          v-else
          :key="`overwrite-${prop}`"
          color="warning"
          density="compact"
          variant="text"
          class="py-1 px-2 mb-1"
        >
          {{ homogeneity?.propertyValues[prop].length.toLocaleString() }} valeurs différentes de "{{ slotProps.node.layout.label || prop }}" seront écrasées
        </v-alert>
      </template>
    </vjsf>
  </v-form>
</template>

<i18n lang="yaml">
fr:
  warning: En mode édition de lignes multiples les valeurs sont visibles uniquement si elles sont égales dans toutes les lignes sélectionnées. Les propriétés dont les valeurs sont hétérogènes sont vides, si vous les laissez vides elles ne seront pas modifiées à l'enregistrement.
en:
</i18n>

<script lang="ts" setup>
import { type ExtendedResult } from '~/composables/dataset-lines'
import Vjsf, { type Options as VjsfOptions } from '@koumoul/vjsf'
import VjsfMarkdown from '@koumoul/vjsf-markdown'
import { v2compat } from '@koumoul/vjsf/compat/v2'

const { results, selectedCols } = defineProps({
  results: { type: Object as () => ExtendedResult[], required: true },
  selectedCols: { type: Array as () => string[], required: true }
})

const patch = defineModel<Record<string, string>>()

const { jsonSchemaFetch } = useDatasetStore()
const { t } = useI18n()

const vjsfOptions: VjsfOptions = {
  titleDepth: 4,
  density: 'comfortable',
  locale: 'fr',
  fetchBaseURL: $sitePath + '/data-fair/',
  initialValidation: 'always',
  removeAdditional: true,
  plugins: [VjsfMarkdown]
}

const homogeneity = computed(() => {
  const jsonSchema = jsonSchemaFetch.data.value
  if (!jsonSchema) return
  const homogenousProperties = []
  const heterogenousProperties = []
  const propertyValues: Record<string, any[]> = {}
  for (const key of Object.keys(jsonSchema.properties)) {
    const values: any[] = []
    for (const result of results) {
      if (!values.includes(result.raw[key])) values.push(result.raw[key])
    }
    if (values.length <= 1) homogenousProperties.push(key)
    else heterogenousProperties.push(key)
    propertyValues[key] = values
  }
  return { homogenousProperties, heterogenousProperties, propertyValues }
})

const editSchema = computed(() => {
  const jsonSchema = jsonSchemaFetch.data.value
  if (!jsonSchema) return
  const schema = v2compat(jsonSchema)
  Object.keys(schema.properties).forEach(key => {
    if (selectedCols.length && !selectedCols.includes(key)) {
      schema.properties[key].readOnly = true
    }
    if (!homogeneity.value?.homogenousProperties.includes(key)) {
      schema.properties[key].layout = schema.properties[key].layout || {}
      schema.properties[key].layout.slots = { before: { name: `${key}-before` } }
      if (['string', 'number', 'integer'].includes(schema.properties[key].type) && !schema.properties[key].format && !schema.properties[key].layout?.comp) {
        schema.properties[key].layout.props = schema.properties[key].layout.props || {}
        schema.properties[key].layout.props.variant = 'filled'
      } else {
        // schema.properties[key].readOnly = true
      }
    }
    if (schema.properties[key]['x-refersTo'] === 'http://schema.org/DigitalDocument') {
      delete schema.properties[key]
    }
  })
  return schema
})

const initPatch = () => {
  if (!homogeneity.value) return
  const homogeneousContent: Record<string, any> = {}
  for (const prop of homogeneity.value?.homogenousProperties) {
    homogeneousContent[prop] = results[0].raw[prop]
  }
  patch.value = homogeneousContent
}
watch(homogeneity, initPatch)
watch(editSchema, initPatch)
watch(() => results, initPatch, { immediate: true })

</script>

<style lang="css">
.vjsf-property.heterogenous {
  border: 1px solid grey;
  padding: 4px !important;
  margin-top: 4px !important;
  margin-bottom: 4px !important;
  border-radius: 4px;
}
</style>
