<template>
  <v-dialog
    v-model="showDialog"
    max-width="600"
    @update:model-value="onToggle"
  >
    <template #activator="{ props: activatorProps }">
      <v-btn
        v-if="index === -1"
        color="primary"
        :icon="mdiPlus"
        size="small"
        :title="t('addAttachment')"
        v-bind="activatorProps"
      />
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
    <v-card>
      <v-toolbar
        density="compact"
        flat
      >
        <v-toolbar-title>{{ index === -1 ? t('addAttachment') : t('editAttachment') }}</v-toolbar-title>
        <v-spacer />
        <v-btn
          :icon="mdiClose"
          @click="showDialog = false"
        />
      </v-toolbar>
      <v-card-text v-if="showDialog">
        <v-text-field
          v-model="editTitle"
          :label="t('title')"
          variant="outlined"
          density="compact"
          hide-details
          class="mb-3"
        />
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
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          variant="text"
          @click="showDialog = false"
        >
          {{ t('cancel') }}
        </v-btn>
        <v-btn
          color="primary"
          :loading="saving"
          :disabled="!editName || duplicateName"
          @click="save"
        >
          {{ t('save') }}
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
  selectFile: Sélectionnez un fichier
  attachmentNameWarning: "Il existe déjà une pièce jointe avec le nom de fichier \"{name}\"."
  cancel: Annuler
  save: Enregistrer
  fileTooLarge: Le fichier est trop volumineux pour être importé
  noSpace: Le propriétaire n'a pas assez d'espace disponible pour ce fichier
  uploadError: Erreur pendant l'import du fichier
en:
  addAttachment: Add an attachment
  editAttachment: Edit the attachment
  title: Title
  selectFile: Select a file
  attachmentNameWarning: "There is already an attachment with file name \"{name}\"."
  cancel: Cancel
  save: Save
  fileTooLarge: The file is too large to be uploaded
  noSpace: The owner does not have enough space for this file
  uploadError: Error while uploading the file
</i18n>

<script lang="ts" setup>
import { mdiClose, mdiPencil, mdiPlus } from '@mdi/js'
import type { Application } from '#api/types'
import useApplicationStore from '~/composables/application-store'

interface Attachment {
  name: string
  title?: string
  size?: number
  mimetype?: string
  updatedAt?: string
  url?: string
  type?: string
}

const props = defineProps<{
  value: Partial<Attachment>
  index: number
}>()

const emit = defineEmits<{
  saved: []
}>()

const { t } = useI18n()
const { sendUiNotif } = useUiNotif()
const { application, patch } = useApplicationStore()

const showDialog = ref(false)
const file = ref<File[] | null>(null)
const saving = ref(false)
const uploadProgress = ref(0)
const editName = ref('')
const editTitle = ref('')
const editSize = ref(0)
const editMimetype = ref('')
const editUpdatedAt = ref('')

const onToggle = () => {
  editName.value = props.value.name || ''
  editTitle.value = props.value.title || ''
  editSize.value = props.value.size || 0
  editMimetype.value = props.value.mimetype || ''
  editUpdatedAt.value = props.value.updatedAt || ''
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
  } else if (props.value.name) {
    editName.value = props.value.name
    editSize.value = props.value.size || 0
    editMimetype.value = props.value.mimetype || ''
    editUpdatedAt.value = props.value.updatedAt || ''
  }
}

const duplicateName = computed(() => {
  if (!editName.value) return false
  return !!(application.value?.attachments || []).find((a: Attachment, i: number) => i !== props.index && a.name === editName.value)
})

const save = async () => {
  if (!application.value) return
  saving.value = true
  try {
    const f = file.value?.[0]
    if (f) {
      const formData = new FormData()
      formData.append('attachment', f)
      const xhr = new XMLHttpRequest()
      await new Promise<void>((resolve, reject) => {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            uploadProgress.value = (e.loaded / e.total) * 100
          }
        })
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve()
          else reject(new Error(`HTTP ${xhr.status}`))
        })
        xhr.addEventListener('error', () => reject(new Error('upload failed')))
        xhr.open('POST', `${$apiPath}/applications/${application.value!.id}/attachments`)
        xhr.withCredentials = true
        xhr.send(formData)
      })
    }

    if (props.value.name && editName.value !== props.value.name) {
      await $fetch(`/applications/${application.value.id}/attachments/${props.value.name}`, { method: 'DELETE' })
    }

    const attachment: Attachment = {
      name: editName.value,
      title: editTitle.value || editName.value,
      size: editSize.value,
      mimetype: editMimetype.value,
      updatedAt: editUpdatedAt.value
    }

    const attachments = [...(application.value.attachments || [])] as Attachment[]
    if (props.index === -1) attachments.push(attachment)
    else attachments[props.index] = attachment
    await patch({ attachments: attachments as Application['attachments'] })
    showDialog.value = false
    emit('saved')
  } catch (error: any) {
    const status = error?.response?.status || error?.statusCode
    if (status === 413) {
      sendUiNotif({ type: 'error', msg: t('fileTooLarge') })
    } else if (status === 429) {
      sendUiNotif({ type: 'error', msg: t('noSpace') })
    } else {
      sendUiNotif({ type: 'error', msg: t('uploadError') })
    }
  }
  saving.value = false
}
</script>
