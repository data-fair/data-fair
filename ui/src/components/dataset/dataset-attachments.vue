<template>
  <v-container fluid>
    <v-file-input
      v-if="can('postMetadataAttachment').value"
      v-model="file"
      :label="t('selectFile')"
      variant="outlined"
      density="compact"
      class="mb-2"
      :loading="uploading"
      @update:model-value="uploadFile"
    />
    <v-progress-linear
      v-if="uploading"
      :model-value="uploadProgress"
      class="mb-2"
    />
    <p
      v-if="!attachments.length"
      class="text-body-medium"
    >
      {{ t('noAttachment') }}
    </p>
    <v-row class="mt-2">
      <v-col
        v-for="(attachment, i) in attachments"
        :key="i"
        cols="12"
        md="6"
        lg="4"
      >
        <v-card variant="outlined">
          <v-card-title>
            <a
              :href="attachmentUrl(attachment)"
              download
            >{{ attachment.title || attachment.name }}</a>
          </v-card-title>
          <v-card-text v-if="attachment.type === 'file'">
            <div>{{ attachment.name }} ({{ ((attachment.size || 0) / 1000).toFixed(2) }} ko)</div>
            <div v-if="attachment.updatedAt">
              {{ new Date(attachment.updatedAt).toLocaleString() }}
            </div>
          </v-card-text>
          <v-card-text v-if="attachment.type === 'url'">
            <div>{{ attachment.url }}</div>
          </v-card-text>
          <v-card-actions v-if="can('writeData').value">
            <v-btn
              v-if="canBeThumbnail(attachment) && can('writeDescription').value"
              variant="text"
              @click="setAsThumbnail(attachment)"
            >
              {{ t('thumbnail') }}
            </v-btn>
            <v-spacer />
            <v-btn
              v-if="can('deleteMetadataAttachment').value"
              icon
              color="warning"
              :title="t('delete')"
              @click="confirmDelete = i"
            >
              <v-icon :icon="mdiDelete" />
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>

    <v-dialog
      :model-value="confirmDelete !== null"
      max-width="400"
      @update:model-value="confirmDelete = null"
    >
      <v-card>
        <v-card-text>{{ t('deleteText') }}</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            variant="text"
            @click="confirmDelete = null"
          >
            {{ t('cancel') }}
          </v-btn>
          <v-btn
            color="warning"
            @click="deleteAttachment()"
          >
            {{ t('confirm') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script lang="ts" setup>
import { mdiDelete } from '@mdi/js'
import useDatasetStore from '~/composables/dataset/store'

const messages = {
  fr: {
    selectFile: 'sélectionnez un fichier',
    noAttachment: 'Aucune pièce jointe chargée pour l\'instant.',
    thumbnail: 'utiliser comme vignette',
    delete: 'Supprimer la pièce jointe',
    deleteText: 'Souhaitez-vous confirmer la suppression ?',
    cancel: 'annuler',
    confirm: 'confirmer'
  },
  en: {
    selectFile: 'select a file',
    noAttachment: 'No attachment uploaded yet.',
    thumbnail: 'use as a thumbnail',
    delete: 'Delete attachment',
    deleteText: 'Do you really want to delete this attachment?',
    cancel: 'cancel',
    confirm: 'confirm'
  }
}

const { t } = useI18n({ messages })

const { dataset, patchDataset, resourceUrl, can } = useDatasetStore()

const file = ref<File[] | null>(null)
const uploading = ref(false)
const uploadProgress = ref(0)
const confirmDelete = ref<number | null>(null)

const attachments = computed(() => dataset.value?.attachments || [])

function attachmentUrl (attachment: any) {
  if (attachment.url) return attachment.url
  return `${resourceUrl.value}/metadata-attachments/${attachment.name}`
}

function canBeThumbnail (attachment: any) {
  if (attachment.type === 'file' && attachment.mimetype && attachment.mimetype.startsWith('image/')) return true
  if (attachment.type === 'url' && attachment.url) {
    const lowerUrl = attachment.url.toLowerCase()
    if (lowerUrl.endsWith('.png') || lowerUrl.endsWith('.jpeg') || lowerUrl.endsWith('.jpg') || lowerUrl.endsWith('.svg')) return true
  }
  return false
}

async function setAsThumbnail (attachment: any) {
  await patchDataset.execute({ image: attachmentUrl(attachment) })
}

async function uploadFile () {
  const selectedFile = Array.isArray(file.value) ? file.value[0] : file.value
  if (!selectedFile || !dataset.value) return
  uploading.value = true
  uploadProgress.value = 0
  try {
    const formData = new FormData()
    formData.append('attachment', selectedFile)
    await $fetch(`datasets/${dataset.value.id}/metadata-attachments`, {
      method: 'POST',
      body: formData
    })

    // Refresh the dataset to get updated attachments
    const updatedAttachments = [...attachments.value]
    const existingIndex = updatedAttachments.findIndex(a => a.type === 'file' && a.name === selectedFile.name)
    const newAttachment = {
      type: 'file' as const,
      name: selectedFile.name,
      title: selectedFile.name,
      size: selectedFile.size,
      mimetype: selectedFile.type,
      updatedAt: new Date(selectedFile.lastModified).toISOString()
    }
    if (existingIndex >= 0) {
      updatedAttachments[existingIndex] = newAttachment
    } else {
      updatedAttachments.push(newAttachment)
    }
    await patchDataset.execute({ attachments: updatedAttachments })
  } catch (error) {
    console.error('Error uploading attachment', error)
  }
  uploading.value = false
  uploadProgress.value = 0
  file.value = null
}

async function deleteAttachment () {
  if (confirmDelete.value === null || !dataset.value) return
  const i = confirmDelete.value
  const attachment = attachments.value[i]
  if (attachment.type === 'file' && attachment.name) {
    await $fetch(`datasets/${dataset.value.id}/metadata-attachments/${attachment.name}`, {
      method: 'DELETE'
    })
  }
  const updatedAttachments = [...attachments.value]
  updatedAttachments.splice(i, 1)
  await patchDataset.execute({ attachments: updatedAttachments })
  confirmDelete.value = null
}
</script>
