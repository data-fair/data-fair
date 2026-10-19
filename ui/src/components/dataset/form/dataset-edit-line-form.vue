<template>
  <vjsf
    v-model="model"
    :schema="editSchema"
    :options="vjsfOptions"
    :sub-agent="subAgent"
    :prefix-name="prefixName"
    :data-title="dataTitle"
  />

  <v-text-field
    v-if="showOwner"
    :model-value="model._owner"
    :label="t('owner')"
    :hint="t('ownerHint')"
    :rules="[v => !v || ownerPattern.test(v) || t('ownerHint')]"
    :readonly="roPrimaryKey && restDataset?.primaryKey?.includes('_owner')"
    persistent-hint
    clearable
    class="mb-4"
    @update:model-value="v => model = { ...model, _owner: v }"
  >
    <template
      v-if="ownerAvatar"
      #prepend-inner
    >
      <v-avatar
        :image="ownerAvatar"
        size="24"
      />
    </template>
  </v-text-field>

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
    owner: Propriétaire de ligne
    ownerHint: "Identifiant du compte, par exemple user:abc ou organization:xyz:departement"
  en:
    loadAttachment: Load a file as an attachment
    selectFile: Select a file
    owner: Line owner
    ownerHint: "Account identifier, for example user:abc or organization:xyz:department"
</i18n>

<script setup lang="ts">
import { emitAgentEvent } from '@data-fair/lib-vue-agents'
import useDatasetEdition from '~/components/dataset/table/use-dataset-edition'
import Vjsf from '@koumoul/vjsf/webmcp'
import { type Options as VjsfOptions } from '@koumoul/vjsf'
import VjsfMarkdown from '@koumoul/vjsf-markdown'
import { v2compat } from '@koumoul/vjsf/compat/v2'

const { readonlyCols, selectedCols, extension, loading, roPrimaryKey, subAgent, prefixName, dataTitle, owner } = defineProps({
  readonlyCols: { type: Array as PropType<string[] | null>, default: null },
  // let the user set the line owner (free account id), only meaningful on the standard /lines routes
  owner: { type: Boolean, default: false },
  selectedCols: { type: Array as PropType<string[] | null>, default: null },
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
// dialog flag, because this is the moment the form exists. It is context, not a
// wake-up signal: the openers wait for this form's editLine_form subagent before
// returning, so the event of a dialog the assistant opened lands in the opener's
// own result. It was once the thing the assistant waited on, which only worked
// when the event happened to arrive after that result — never for the add
// dialog, whose form is bundled with it rather than loaded asynchronously.
if (subAgent) {
  const { lineDialog } = useDatasetEdition()
  onMounted(() => {
    emitAgentEvent('dataset-line-dialog-opened', { id, mode: lineDialog.value?.mode })
  })
}

const showOwner = computed(() => owner && !!restDataset.value?.rest?.lineOwnership)
const ownerPattern = /^(user|organization):[^:\s]+(:[^:\s]+)?$/
const ownerAvatar = computed(() => {
  const owner = model.value?._owner
  if (!owner || !ownerPattern.test(owner)) return
  return `${$sdUrl}/api/avatars/${owner.split(':').join('/')}/avatar.png`
})

const digitalDocumentField = computed(() => {
  return restDataset.value?.schema.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')
})

const editSchema = computed(() => {
  const jsonSchema = jsonSchemaFetch.data.value
  // the dialog can open before the schema is fetched
  if (!jsonSchema) return { type: 'object', properties: {} }
  const schema = v2compat(jsonSchema)
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
  // declared but hidden so that removeAdditional keeps it, the field is rendered after the vjsf form
  if (showOwner.value) schema.properties._owner = { type: ['string', 'null'], layout: { comp: 'none' } }
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
