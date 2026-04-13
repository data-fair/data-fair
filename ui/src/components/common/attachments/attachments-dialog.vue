<template>
  <v-dialog
    v-model="showDialog"
    max-width="800"
    @update:model-value="onToggle"
  >
    <template #activator="{ props: activatorProps }">
      <v-btn
        v-if="index === -1"
        variant="flat"
        color="primary"
        :prepend-icon="mdiPlus"
        v-bind="activatorProps"
      >
        {{ t('addAttachment') }}
      </v-btn>
      <v-btn
        v-else
        color="primary"
        :icon="mdiPencil"
        variant="text"
        size="small"
        :title="t('editAttachment')"
        v-bind="activatorProps"
      />
    </template>

    <v-card :title="index === -1 ? t('addAttachment') : t('editAttachment')">
      <v-card-text>
        <v-text-field
          v-model="editTitle"
          :label="t('title')"
          variant="outlined"
          density="compact"
          class="mb-2"
          hide-details
        />

        <markdown-editor
          v-if="type === 'dataset'"
          v-model="editDescription"
          :label="t('description')"
          :easy-mde-options="{ minHeight: '60px', maxHeight: '120px' }"
          hide-details
        />

        <v-checkbox
          v-if="type === 'dataset'"
          v-model="editIncludeInCatalog"
          :label="t('includeInCatalog')"
          density="compact"
          class="mb-2"
          hide-details
        />

        <v-select
          v-if="type === 'dataset'"
          v-model="editType"
          :items="typeItems"
          :label="t('type')"
          variant="outlined"
          density="compact"
          class="mb-4"
          hide-details
        />

        <template v-if="type === 'application' || editType === 'file'">
          <v-file-input
            v-model="file"
            :label="t('selectFile')"
            :placeholder="editName"
            :persistent-placeholder="!!editName"
            variant="outlined"
            density="compact"
            class="mb-4"
            hide-details
            @update:model-value="setFileInfo"
          />
          <v-alert
            v-if="duplicateName"
            type="warning"
            variant="outlined"
            density="compact"
            class="mb-4"
          >
            {{ t('attachmentNameWarning', { name: editName }) }}
          </v-alert>
          <v-progress-linear
            v-if="uploadProgress > 0"
            :model-value="uploadProgress"
            class="mb-4"
          />
        </template>

        <v-text-field
          v-if="type === 'dataset' && editType === 'url'"
          v-model="editUrl"
          :label="t('url')"
          variant="outlined"
          density="compact"
          class="mb-4"
          hide-details
        />

        <template v-if="type === 'dataset' && editType === 'remoteFile'">
          <v-text-field
            v-model="editName"
            :label="t('fileName')"
            variant="outlined"
            density="compact"
            class="mb-4"
            hide-details
          >
            <template #append>
              <help-tooltip :text="t('fileNameHelp')" />
            </template>
          </v-text-field>
          <v-text-field
            v-model="editTargetUrl"
            :label="t('targetUrl')"
            variant="outlined"
            density="compact"
            hide-details
          >
            <template #append>
              <help-tooltip :text="t('targetUrlHelp')" />
            </template>
          </v-text-field>
        </template>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn @click="showDialog = false">
          {{ t('cancel') }}
        </v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :loading="saving"
          :disabled="!isValid"
          @click="save"
        >
          {{ index === -1 ? t('add') : t('save') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<i18n lang="yaml">
fr:
  addAttachment: Ajouter une pièce jointe
  editAttachment: Modifier la pièce jointe
  title: Titre
  type: Type
  typeFile: Fichier
  typeUrl: Lien
  typeRemoteFile: Fichier récupéré depuis une URL
  selectFile: Sélectionnez un fichier
  url: URL
  fileName: Nom du fichier
  fileNameHelp: Ce nom doit contenir l'extension qui doit correspondre au format du fichier téléchargé.
  targetUrl: URL de téléchargement
  targetUrlHelp: Cette URL n'est pas consultable après écriture. Elle est utilisée pour télécharger le fichier depuis un service distant et peut contenir un secret. Vous pouvez la laisser vide quand vous modifiez les autres informations, mais vous devez la renseigner de nouveau si vous changez le nom de fichier.
  description: Description
  includeInCatalog: Inclure dans les publications sur catalogue
  attachmentNameWarning: "Il existe déjà une pièce jointe avec le nom de fichier \"{name}\"."
  cancel: Annuler
  add: Ajouter
  save: Enregistrer
  fileTooLarge: Le fichier est trop volumineux pour être importé
  noSpace: Le propriétaire n'a pas assez d'espace disponible pour ce fichier
  uploadError: Erreur pendant l'import du fichier
en:
  addAttachment: Add an attachment
  editAttachment: Edit the attachment
  title: Title
  type: Type
  typeFile: File
  typeUrl: Link
  typeRemoteFile: File fetched from a URL
  selectFile: Select a file
  url: URL
  fileName: File name
  fileNameHelp: This name must include the extension matching the format of the downloaded file.
  targetUrl: Download URL
  targetUrlHelp: This URL is not readable after writing. It is used to download the file from a remote service and may contain a secret. You can leave it empty when editing other fields, but you must fill it again if you change the file name.
  description: Description
  includeInCatalog: Include in catalog publications
  attachmentNameWarning: "There is already an attachment with file name \"{name}\"."
  cancel: Cancel
  add: Add
  save: Save
  fileTooLarge: The file is too large to be uploaded
  noSpace: The owner does not have enough space for this file
  uploadError: Error while uploading the file
</i18n>

<script setup lang="ts">
import { mdiPencil, mdiPlus } from '@mdi/js'
import { MarkdownEditor } from '@koumoul/vjsf-markdown'

interface AttachmentItem {
  title?: string
  name?: string
  size?: number
  mimetype?: string
  updatedAt?: string
  url?: string
  type?: 'file' | 'url' | 'remoteFile'
  targetUrl?: string
  description?: string
  includeInCatalogPublications?: boolean
}

const props = defineProps<{
  type: 'application' | 'dataset'
  attachment: Partial<AttachmentItem>
  index: number
  existingAttachments: AttachmentItem[]
  uploadUrl: string
}>()

const emit = defineEmits<{
  save: [attachment: AttachmentItem]
}>()

const { t } = useI18n()
const { sendUiNotif } = useUiNotif()

const showDialog = ref(false)
const saving = ref(false)
const file = ref<File | File[] | null>(null)
const uploadProgress = ref(0)
const editTitle = ref('')
const editType = ref<'file' | 'url' | 'remoteFile'>('file')
const editName = ref('')
const editSize = ref(0)
const editMimetype = ref('')
const editUpdatedAt = ref('')
const editUrl = ref('')
const editTargetUrl = ref('')
const editDescription = ref('')
const editIncludeInCatalog = ref(false)

const typeItems = [
  { title: t('typeFile'), value: 'file' },
  { title: t('typeUrl'), value: 'url' },
  { title: t('typeRemoteFile'), value: 'remoteFile' },
]

const onToggle = () => {
  editTitle.value = props.attachment.title || ''
  editType.value = (props.attachment.type === 'url' ? 'url' : props.attachment.type === 'remoteFile' ? 'remoteFile' : 'file')
  editName.value = props.attachment.name || ''
  editSize.value = props.attachment.size || 0
  editMimetype.value = props.attachment.mimetype || ''
  editUpdatedAt.value = props.attachment.updatedAt || ''
  editUrl.value = props.attachment.url || ''
  editTargetUrl.value = props.attachment.targetUrl || ''
  editDescription.value = props.attachment.description || ''
  editIncludeInCatalog.value = props.attachment.includeInCatalogPublications ?? false
  file.value = null
  uploadProgress.value = 0
}

const setFileInfo = () => {
  const f = Array.isArray(file.value) ? file.value[0] : file.value
  if (f) {
    editName.value = f.name
    editSize.value = f.size
    editMimetype.value = f.type
    editUpdatedAt.value = new Date(f.lastModified).toISOString()
    if (!editTitle.value) editTitle.value = f.name
  } else if (props.attachment.name) {
    editName.value = props.attachment.name
    editSize.value = props.attachment.size || 0
    editMimetype.value = props.attachment.mimetype || ''
    editUpdatedAt.value = props.attachment.updatedAt || ''
  }
}

const duplicateName = computed(() => {
  if (!editName.value) return false
  return !!props.existingAttachments.find((a, i) => i !== props.index && a.name === editName.value)
})

const isValid = computed(() => {
  if (!editTitle.value.trim()) return false
  if (props.type === 'application' || editType.value === 'file') {
    return !!editName.value && !duplicateName.value
  }
  if (editType.value === 'url') return !!editUrl.value.trim()
  if (editType.value === 'remoteFile') return !!editName.value.trim()
  return true
})

const save = async () => {
  saving.value = true
  try {
    const selectedFile = Array.isArray(file.value) ? file.value[0] : file.value
    const needsUpload = (props.type === 'application' || editType.value === 'file') && !!selectedFile
    if (needsUpload) {
      const formData = new FormData()
      formData.append('attachment', selectedFile!)
      const xhr = new XMLHttpRequest()
      await new Promise<void>((resolve, reject) => {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) uploadProgress.value = (e.loaded / e.total) * 100
        })
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve()
          else reject(new Error(`HTTP ${xhr.status}`))
        })
        xhr.addEventListener('error', () => reject(new Error('upload failed')))
        xhr.open('POST', props.uploadUrl)
        xhr.withCredentials = true
        xhr.send(formData)
      })
    }

    // Si renommage d'un fichier (le fichier est remplacé), supprimer l'ancien
    const isFileRename = props.attachment.name && editName.value !== props.attachment.name && needsUpload
    // Si changement de type file to url/remoteFile, supprimer l'ancien fichier
    const isTypeChange = props.type === 'dataset' && props.attachment.type === 'file' && (editType.value === 'url' || editType.value === 'remoteFile') && props.attachment.name
    if (isFileRename || isTypeChange) {
      await $fetch(`${props.uploadUrl}/${props.attachment.name}`, { method: 'DELETE' })
    }

    let updated: AttachmentItem
    if (props.type === 'application' || editType.value === 'file') {
      updated = {
        title: editTitle.value || editName.value,
        type: 'file' as const,
        name: editName.value,
        size: editSize.value,
        mimetype: editMimetype.value,
        updatedAt: editUpdatedAt.value,
      }
    } else if (editType.value === 'url') {
      updated = {
        title: editTitle.value,
        type: 'url' as const,
        url: editUrl.value,
      }
    } else {
      updated = {
        title: editTitle.value,
        type: 'remoteFile' as const,
        name: editName.value,
        ...(editTargetUrl.value ? { targetUrl: editTargetUrl.value } : {}),
      }
    }
    if (props.type === 'dataset') {
      updated.description = editDescription.value || undefined
      updated.includeInCatalogPublications = editIncludeInCatalog.value || undefined
    }

    emit('save', updated)
    showDialog.value = false
  } catch (error: any) {
    const status = error?.response?.status || error?.statusCode
    if (status === 413) sendUiNotif({ type: 'error', msg: t('fileTooLarge') })
    else if (status === 429) sendUiNotif({ type: 'error', msg: t('noSpace') })
    else sendUiNotif({ type: 'error', msg: t('uploadError') })
  }
  saving.value = false
  uploadProgress.value = 0
}
</script>
