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

const { readonlyCols, selectedCols, ownLines, loading } = defineProps({
  readonlyCols: { type: Array as PropType<string[] | null>, default: null },
  selectedCols: { type: Array as PropType<string[] | null>, default: null },
  ownLines: { type: Boolean, default: false },
  loading: { type: Boolean, default: false }
})

const model = defineModel<any>()

const emits = defineEmits<{ onFileUpload: [file: File] }>()

const { restDataset, jsonSchemaFetch } = useDatasetStore()

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
  })
  return schema
})

const vjsfOptions: VjsfOptions = {
  titleDepth: 4,
  density: 'comfortable',
  locale: 'fr',
  fetchBaseURL: $sitePath + '/data-fair/',
  updateOn: 'blur',
  initialValidation: 'always',
  removeAdditional: true
}
</script>
