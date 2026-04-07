<template>
  <attachments-dialog
    v-if="canAdd"
    :type="type"
    :attachment="{}"
    :index="-1"
    :existing-attachments="attachments"
    :upload-url="uploadUrl"
    @save="(att) => handleSave(att, -1)"
  />

  <p
    v-if="!attachments.length"
    class="mt-4 text-body-medium"
  >
    {{ t('noAttachment') }}
  </p>

  <v-row
    v-else
    class="mt-2"
  >
    <v-col
      v-for="(attachment, i) in attachments"
      :key="i"
      cols="12"
      md="6"
      lg="4"
    >
      <v-card variant="outlined">
        <v-card-title class="text-body-large font-weight-bold">
          <a
            :href="attachmentUrl(attachment)"
            download
          >
            {{ attachment.title || attachment.name }}
          </a>
        </v-card-title>

        <v-card-text v-if="attachment.type === 'file' || !attachment.type">
          <div v-if="attachment.name">
            {{ attachment.name }} ({{ formatSize(attachment.size) }})
          </div>
          <div v-if="attachment.updatedAt">
            {{ formatDate(attachment.updatedAt) }}
          </div>
        </v-card-text>

        <v-card-text v-if="attachment.type === 'url' && attachment.url">
          <div>{{ attachment.url }}</div>
        </v-card-text>

        <v-card-text v-if="type === 'dataset' && attachment.description">
          <div>{{ attachment.description }}</div>
        </v-card-text>

        <v-card-actions>
          <v-btn
            v-if="canThumbnail && canBeThumbnail(attachment)"
            variant="text"
            size="small"
            @click="setAsThumbnail(attachment)"
          >
            {{ t('thumbnail') }}
          </v-btn>
          <v-spacer />
          <attachments-dialog
            v-if="canEdit"
            :type="type"
            :attachment="attachment"
            :index="i"
            :existing-attachments="attachments"
            :upload-url="uploadUrl"
            @save="(att) => handleSave(att, i)"
          />
          <v-btn
            v-if="canDelete"
            :icon="mdiDelete"
            variant="text"
            size="small"
            color="warning"
            :title="t('delete')"
            @click="openDeleteConfirm(i)"
          />
        </v-card-actions>
      </v-card>
    </v-col>
  </v-row>

  <v-dialog
    v-model="showDeleteDialog"
    max-width="500"
  >
    <v-card :title="t('delete')">
      <v-card-text>{{ t('deleteText') }}</v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          @click="showDeleteDialog = false"
        >
          {{ t('cancel') }}
        </v-btn>
        <v-btn
          color="warning"
          variant="flat"
          @click="doDelete"
        >
          {{ t('confirmDelete') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<i18n lang="yaml">
fr:
  noAttachment: Vous n'avez pas encore ajouté de pièces jointes.
  thumbnail: Utiliser comme vignette
  delete: Supprimer la pièce jointe
  deleteText: Souhaitez-vous confirmer la suppression ?
  cancel: Annuler
  confirmDelete: Supprimer
en:
  noAttachment: You have not added any attachments yet.
  thumbnail: Use as thumbnail
  delete: Delete attachment
  deleteText: Do you really want to delete this attachment?
  cancel: Cancel
  confirmDelete: Delete
</i18n>

<script setup lang="ts">
import { mdiDelete } from '@mdi/js'

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
  attachments: AttachmentItem[]
  uploadUrl: string
  canAdd: boolean
  canEdit: boolean
  canDelete: boolean
  canThumbnail: boolean
}>()

const emit = defineEmits<{
  patch: [data: Record<string, unknown>]
}>()

const { t, locale } = useI18n()

const attachmentUrl = (attachment: AttachmentItem) => {
  return attachment.url || `${props.uploadUrl}/${attachment.name}`
}

const canBeThumbnail = (attachment: AttachmentItem) => {
  if (attachment.type === 'file' || !attachment.type) {
    return !!attachment.mimetype?.startsWith('image/')
  }
  if (attachment.type === 'url' && attachment.url) {
    const lower = attachment.url.toLowerCase()
    return lower.endsWith('.png') || lower.endsWith('.jpeg') || lower.endsWith('.jpg') || lower.endsWith('.svg')
  }
  return false
}

const formatSize = (size?: number) => {
  if (!size) return '0 ko'
  return (size / 1000).toFixed(2) + ' ko'
}

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString(locale.value, { dateStyle: 'medium' })
}

const handleSave = async (updatedAttachment: AttachmentItem, index: number) => {
  const newAttachments = [...props.attachments]
  if (index === -1) newAttachments.push(updatedAttachment)
  else newAttachments[index] = updatedAttachment
  emit('patch', { attachments: newAttachments })
}

const setAsThumbnail = (attachment: AttachmentItem) => {
  emit('patch', { image: attachmentUrl(attachment) })
}

const showDeleteDialog = ref(false)
const deleteIndex = ref<number | null>(null)

const openDeleteConfirm = (i: number) => {
  deleteIndex.value = i
  showDeleteDialog.value = true
}

const doDelete = async () => {
  if (deleteIndex.value === null) return
  const attachment = props.attachments[deleteIndex.value]
  // Supprimer le fichier physique si c'est un fichier (pas une URL)
  if (attachment.name && (attachment.type === 'file' || !attachment.type)) {
    await $fetch(`${props.uploadUrl}/${attachment.name}`, { method: 'DELETE' })
  }
  const newAttachments = [...props.attachments]
  newAttachments.splice(deleteIndex.value, 1)
  emit('patch', { attachments: newAttachments })
  showDeleteDialog.value = false
  deleteIndex.value = null
}
</script>
