<template>
  <vjsf
    v-model="model"
    :schema="editSchema"
    :options="vjsfOptions"
  />

  <template v-if="digitalDocumentField">
    <p v-t="'loadAttachment'" />
    <div class="mt-3 mb-3">
      <v-file-input
        :label="$t('selectFile')"
        variant="outlined"
        density="compact"
        clearable
        @click:clear="delete model[digitalDocumentField.key]"
        @update:model-value="file => emits('onFileUpload', file as File)"
      />
    </div>
    <v-progress-linear
      v-if="loading"
      indeterminate
    />
  </template>
</template>

<i18n lang="yaml">
  fr:
    loadAttachment: Chargez un fichier en pièce jointe.
    selectFile: sélectionnez un fichier
  en:
    loadAttachment: Load a file as an attachment
    selectFile: select a file
</i18n>

<script lang="ts" setup>
import Vjsf, { type Options as VjsfOptions } from '@koumoul/vjsf'
import { v2compat } from '@koumoul/vjsf/compat/v2'

const { readonlyCols, selectedCols, ownLines, extension, loading } = defineProps({
  readonlyCols: { type: Array as PropType<string[] | null>, default: null },
  selectedCols: { type: Array as PropType<string[] | null>, default: null },
  ownLines: { type: Boolean, default: false },
  extension: { type: Boolean, default: false },
  loading: { type: Boolean, default: false }
})

const model = defineModel<any>()

const emits = defineEmits<{ onFileUpload: [file: File] }>()

const { id, restDataset, jsonSchemaFetch } = useDatasetStore()

const digitalDocumentField = computed(() => {
  return restDataset.value?.schema.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')
})

const editSchema = computed(() => {
  const jsonSchema = jsonSchemaFetch.data.value
  if (!jsonSchema) return
  const schema = v2compat(jsonSchema)
  if (ownLines) {
    delete schema.properties._owner
    delete schema.properties._ownerName
  }
  Object.keys(schema.properties).forEach(key => {
    if (readonlyCols && readonlyCols.includes(key)) {
      schema.properties[key].readOnly = true
    }
    if (selectedCols && selectedCols.length && !selectedCols.includes(key)) {
      schema.properties[key].layout = schema.properties[key].layout ?? {}
      schema.properties[key].layout.comp = 'none'
    }
    if (schema.properties[key]['x-refersTo'] === 'http://schema.org/DigitalDocument') {
      schema.properties[key].layout = schema.properties[key].layout ?? {}
      schema.properties[key].layout.comp = 'none'
    }
    if (!extension && schema.properties[key]['x-extension']) {
      schema.properties[key].layout = schema.properties[key].layout ?? {}
      schema.properties[key].layout.comp = 'none'
    }
  })
  return schema
})

const extensionKeys = computed(() => {
  return Object.keys(editSchema.value.properties).filter(key => editSchema.value.properties[key]['x-extension'])
})

const vjsfOptions: VjsfOptions = {
  titleDepth: 4,
  density: 'comfortable',
  locale: 'fr',
  fetchBaseURL: $sitePath + '/data-fair/',
  initialValidation: 'always',
  removeAdditional: true
}

const simulateExtensionInputStr = computed(() => {
  if (!extension) return
  const input: any = {}
  for (const key of Object.keys(editSchema.value.properties)) {
    if (!extensionKeys.value.includes(key) && model.value[key] !== undefined && model.value[key] !== null) {
      input[key] = model.value[key]
    }
  }
  return JSON.stringify(input)
})

watch(simulateExtensionInputStr, () => {
  if (!simulateExtensionInputStr.value) return
  const input = JSON.parse(simulateExtensionInputStr.value)
  simulateExtension.execute(input)
})

const simulateExtension = useAsyncAction(async (body) => {
  const res = Object.keys(body).length && await $fetch<Record<string, any>>(`/datasets/${id}/_simulate-extension`, { method: 'POST', body })
  const newValue = { ...model.value }
  for (const key of extensionKeys.value) {
    if (res && res[key] !== undefined) newValue[key] = res[key]
    else delete newValue[key]
  }
  model.value = newValue
})
</script>
