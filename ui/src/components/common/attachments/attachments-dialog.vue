<template>
  <v-dialog
    v-model="showDialog"
    max-width="500"
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
      <v-card-text v-if="showDialog">
        <v-text-field
          v-model="editTitle"
          :label="t('title')"
          variant="outlined"
          density="compact"
          hide-details
          class="mb-3"
        />

        <v-radio-group
          v-if="type === 'dataset'"
          v-model="editType"
          inline
          hide-details
          class="mb-3"
        >
          <v-radio
            :label="t('typeFile')"
            value="file"
          />
          <v-radio
            :label="t('typeUrl')"
            value="url"
          />
        </v-radio-group>

        <template v-if="type === 'application' || editType === 'file'">
          <v-file-input
            v-model="file"
            :label="t('selectFile')"
            :placeholder="editName"
            :persistent-placeholder="!!editName"
            variant="outlined"
            density="compact"
            hide-details
            class="mb-3"
            @update:model-value="setFileInfo"
          />
          <v-alert
            v-if="duplicateName"
            type="warning"
            variant="outlined"
            density="compact"
            class="mb-3"
          >
            {{ t('attachmentNameWarning', { name: editName }) }}
          </v-alert>
          <v-progress-linear
            v-if="uploadProgress > 0"
            :model-value="uploadProgress"
            class="mb-3"
          />
        </template>

        <v-text-field
          v-if="type === 'dataset' && editType === 'url'"
          v-model="editUrl"
          :label="t('url')"
          variant="outlined"
          density="compact"
          hide-details
          class="mb-3"
        />

        <v-textarea
          v-if="type === 'dataset'"
          v-model="editDescription"
          :label="t('description')"
          variant="outlined"
          density="compact"
          rows="2"
          auto-grow
          hide-details
          class="mb-3"
        />

        <v-checkbox
          v-if="type === 'dataset'"
          v-model="editIncludeInCatalog"
          :label="t('includeInCatalog')"
          density="compact"
          hide-details
        />
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
  typeFile: Fichier
  typeUrl: Lien (URL)
  selectFile: Sélectionnez un fichier
  url: URL
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
  typeFile: File
  typeUrl: URL link
  selectFile: Select a file
  url: URL
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

interface AttachmentItem {
  title?: string
  name?: string
  size?: number
  mimetype?: string
  updatedAt?: string
  url?: string
  type?: 'file' | 'url' | 'remoteFile'
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
const file = ref<File[] | null>(null)
const uploadProgress = ref(0)
const editTitle = ref('')
const editType = ref<'file' | 'url'>('file')
const editName = ref('')
const editSize = ref(0)
const editMimetype = ref('')
const editUpdatedAt = ref('')
const editUrl = ref('')
const editDescription = ref('')
const editIncludeInCatalog = ref(false)

const onToggle = () => {
  editTitle.value = props.attachment.title || ''
  editType.value = (props.attachment.type === 'url') ? 'url' : 'file'
  editName.value = props.attachment.name || ''
  editSize.value = props.attachment.size || 0
  editMimetype.value = props.attachment.mimetype || ''
  editUpdatedAt.value = props.attachment.updatedAt || ''
  editUrl.value = props.attachment.url || ''
  editDescription.value = props.attachment.description || ''
  editIncludeInCatalog.value = props.attachment.includeInCatalogPublications ?? false
  file.value = null
  uploadProgress.value = 0
}

const setFileInfo = () => {
  const f = file.value?.[0]
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
  return true
})

const save = async () => {
  saving.value = true
  try {
    const needsUpload = (props.type === 'application' || editType.value === 'file') && !!file.value?.[0]
    if (needsUpload) {
      const formData = new FormData()
      formData.append('attachment', file.value![0])
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
    // Si changement de type file to url, supprimer l'ancien fichier
    const isTypeChange = props.type === 'dataset' && props.attachment.type === 'file' && editType.value === 'url' && props.attachment.name
    if (isFileRename || isTypeChange) {
      await $fetch(`${props.uploadUrl}/${props.attachment.name}`, { method: 'DELETE' })
    }

    const updated: AttachmentItem = {
      title: editTitle.value || editName.value,
      ...(props.type === 'application' || editType.value === 'file'
        ? {
            type: 'file' as const,
            name: editName.value,
            size: editSize.value,
            mimetype: editMimetype.value,
            updatedAt: editUpdatedAt.value,
          }
        : {
            type: 'url' as const,
            url: editUrl.value,
          }),
      ...(props.type === 'dataset' && {
        description: editDescription.value || undefined,
        includeInCatalogPublications: editIncludeInCatalog.value || undefined,
      }),
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
