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
          <v-spacer />
          <v-btn
            v-if="canThumbnail && canBeThumbnail(attachment)"
            :icon="mdiImage"
            variant="text"
            size="small"
            :title="type === 'dataset' ? t('thumbnailDataset') : t('thumbnailApplication')"
            @click="setAsThumbnail(attachment)"
          />
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

  <v-dialog
    v-model="showThumbnailDialog"
    max-width="500"
  >
    <v-card :title="t('thumbnailConfirmTitle')">
      <v-card-text>{{ t('thumbnailConfirmText') }}</v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          @click="showThumbnailDialog = false"
        >
          {{ t('cancel') }}
        </v-btn>
        <v-btn
          color="primary"
          variant="flat"
          @click="confirmSetThumbnail(thumbnailAttachment!)"
        >
          {{ t('thumbnailConfirm') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<i18n lang="yaml">
fr:
  noAttachment: Vous n'avez pas encore ajouté de pièces jointes.
  thumbnailDataset: Utiliser comme vignette du jeu de données
  thumbnailApplication: Utiliser comme vignette de l'application
  delete: Supprimer la pièce jointe
  deleteText: Souhaitez-vous confirmer la suppression ?
  cancel: Annuler
  confirmDelete: Supprimer
  saveSuccess: La pièce jointe a été enregistrée
  deleteSuccess: La pièce jointe a été supprimée
  deleteError: Erreur lors de la suppression de la pièce jointe
  thumbnailConfirmTitle: Remplacer la vignette
  thumbnailConfirmText: Une vignette est déjà définie. Souhaitez-vous la remplacer ?
  thumbnailConfirm: Remplacer
  thumbnailSuccess: La vignette a été mise à jour
  thumbnailError: Erreur lors de la mise à jour de la vignette
en:
  noAttachment: You have not added any attachments yet.
  thumbnailDataset: Use as dataset thumbnail
  thumbnailApplication: Use as application thumbnail
  delete: Delete attachment
  deleteText: Do you really want to delete this attachment?
  cancel: Cancel
  confirmDelete: Delete
  saveSuccess: Attachment has been saved
  deleteSuccess: Attachment has been deleted
  deleteError: Error while deleting the attachment
  thumbnailConfirmTitle: Replace thumbnail
  thumbnailConfirmText: A thumbnail is already set. Do you want to replace it?
  thumbnailConfirm: Replace
  thumbnailSuccess: Thumbnail has been updated
  thumbnailError: Error while updating the thumbnail
</i18n>

<script setup lang="ts">
import { mdiDelete, mdiImage } from '@mdi/js'

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
  currentImage?: string | null
  onPatch: (data: Record<string, unknown>) => Promise<void>
}>()

const { t, locale } = useI18n()
const { sendUiNotif } = useUiNotif()

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
  await props.onPatch({ attachments: newAttachments })
  sendUiNotif({ type: 'success', msg: t('saveSuccess') })
}

const showThumbnailDialog = ref(false)
const thumbnailAttachment = ref<AttachmentItem | null>(null)

const setAsThumbnail = (attachment: AttachmentItem) => {
  if (props.currentImage) {
    thumbnailAttachment.value = attachment
    showThumbnailDialog.value = true
  } else {
    confirmSetThumbnail(attachment)
  }
}

const confirmSetThumbnail = async (attachment: AttachmentItem) => {
  try {
    const imageUrl = attachment.url || `${window.location.origin}${props.uploadUrl}/${attachment.name}`
    await props.onPatch({ image: imageUrl })
    sendUiNotif({ type: 'success', msg: t('thumbnailSuccess') })
  } catch (error: any) {
    sendUiNotif({ type: 'error', msg: t('thumbnailError'), error })
  }
  showThumbnailDialog.value = false
  thumbnailAttachment.value = null
}

const showDeleteDialog = ref(false)
const deleteIndex = ref<number | null>(null)

const openDeleteConfirm = (i: number) => {
  deleteIndex.value = i
  showDeleteDialog.value = true
}

const doDelete = async () => {
  if (deleteIndex.value === null) return
  try {
    const attachment = props.attachments[deleteIndex.value]
    // Supprimer le fichier physique si c'est un fichier (pas une URL)
    if (attachment.name && (attachment.type === 'file' || !attachment.type)) {
      await $fetch(`${props.uploadUrl}/${attachment.name}`, { method: 'DELETE' })
    }
    const newAttachments = [...props.attachments]
    newAttachments.splice(deleteIndex.value, 1)
    await props.onPatch({ attachments: newAttachments })
    sendUiNotif({ type: 'success', msg: t('deleteSuccess') })
  } catch (error: any) {
    sendUiNotif({ type: 'error', msg: t('deleteError'), error })
  }
  showDeleteDialog.value = false
  deleteIndex.value = null
}
</script>
