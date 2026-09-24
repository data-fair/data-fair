<template>
  <vjsf
    v-model="model"
    :schema="editSchema"
    :options="vjsfOptions"
    :sub-agent="subAgent"
    :prefix-name="prefixName"
    :data-title="dataTitle"
  />

  <template v-if="digitalDocumentField && digitalDocumentField['x-display'] !== 'text-field'">
    <p>
      {{ t('loadAttachment') }}
    </p>
    <div class="mt-3 mb-3">
      <v-file-input
        :label="t('selectFile')"
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
    selectFile: Sélectionnez un fichier
  en:
    loadAttachment: Load a file as an attachment
    selectFile: Select a file
</i18n>

<script setup lang="ts">
import { emitAgentEvent } from '@data-fair/lib-vue-agents'
import useDatasetEdition from '~/components/dataset/table/use-dataset-edition'
import Vjsf from '@koumoul/vjsf/webmcp'
import { type Options as VjsfOptions } from '@koumoul/vjsf'
import VjsfMarkdown from '@koumoul/vjsf-markdown'
import { v2compat } from '@koumoul/vjsf/compat/v2'

const { readonlyCols, selectedCols, ownLines, extension, loading, roPrimaryKey, subAgent, prefixName, dataTitle } = defineProps({
  readonlyCols: { type: Array as PropType<string[] | null>, default: null },
  selectedCols: { type: Array as PropType<string[] | null>, default: null },
  ownLines: { type: Boolean, default: false },
  extension: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  roPrimaryKey: { type: Boolean, default: false },
  subAgent: { type: Boolean, default: false },
  prefixName: { type: String, default: undefined },
  dataTitle: { type: String, default: undefined }
})

const model = defineModel<any>()

const emits = defineEmits<{ onFileUpload: [file: File] }>()

const { t } = useI18n()

const { id, restDataset, jsonSchemaFetch } = useDatasetStore()

// The dialog reports itself from here, not from the watcher that flips the
// dialog flag, because this is the moment the claim is true: the form exists and
// its editLine_form subagent registers with it.
//
// It also has to be this late. An event emitted while the opening tool is still
// executing is drained into that tool's own result, and the wait its result tells
// the model to declare then has nothing pending and blocks for its whole window.
// That is precisely what happened: `open_edit_line_dialog` awaits a fetch of the
// row before the dialog flag flips, so its event landed in the wait and the turn
// continued; `open_add_line_dialog` flips the flag synchronously, so its event
// went into the tool result and the turn stalled on an empty form until the
// person described the screen — the one thing that persona refuses to do.
// Mounting this component is after the drain by construction: it is loaded with
// defineAsyncComponent.
if (subAgent) {
  const { lineDialog } = useDatasetEdition()
  onMounted(() => {
    emitAgentEvent('dataset-line-dialog-opened', { id, mode: lineDialog.value?.mode })
  })
}

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
    if (typeof schema.properties[key].layout === 'string') schema.properties[key].layout = { comp: schema.properties[key].layout }
    if (readonlyCols && readonlyCols.includes(key)) {
      schema.properties[key].readOnly = true
    }
    if (roPrimaryKey && restDataset.value?.primaryKey?.includes(key)) {
      schema.properties[key].readOnly = true
    }
    if (selectedCols && selectedCols.length && !selectedCols.includes(key)) {
      schema.properties[key].layout = schema.properties[key].layout ?? {}
      schema.properties[key].layout.comp = 'none'
    }
    if (schema.properties[key]['x-refersTo'] === 'http://schema.org/DigitalDocument' && schema.properties[key].layout?.comp !== 'text-field') {
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
  removeAdditional: true,
  plugins: [VjsfMarkdown]
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
  if (!simulateExtensionInputStr.value || !extensionKeys.value.length) return
  const input = JSON.parse(simulateExtensionInputStr.value)
  simulateExtension.execute(input)
})

const simulateExtension = useAsyncAction(async (body) => {
  const res = Object.keys(body).length && await $fetch<Record<string, any>>(`/datasets/${id}/_simulate-extension`, { method: 'POST', body, params: { arrays: true } })
  const newValue = { ...model.value }
  for (const key of extensionKeys.value) {
    if (res && res[key] !== undefined) newValue[key] = res[key]
    else delete newValue[key]
  }
  model.value = newValue
})
</script>
