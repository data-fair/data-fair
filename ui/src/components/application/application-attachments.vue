<template>
  <v-container fluid>
    <application-attachment-dialog
      v-if="can('postAttachment')"
      :value="{}"
      :index="-1"
      @saved="applicationFetch.refresh()"
    />
    <v-row
      v-if="attachments.length"
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
          <v-card-title class="text-body-1 font-weight-bold">
            <a
              :href="attachmentUrl(attachment)"
              download
            >{{ attachment.title || attachment.name }}</a>
          </v-card-title>
          <v-card-text>
            <div>{{ attachment.name }} ({{ formatSize(attachment.size) }})</div>
            <div v-if="attachment.updatedAt">
              {{ formatDate(attachment.updatedAt) }}
            </div>
          </v-card-text>
          <v-card-text v-if="attachment.type === 'url' && attachment.url">
            <span>{{ attachment.url }}</span>
          </v-card-text>
          <v-card-actions>
            <v-btn
              v-if="canBeThumbnail(attachment) && can('writeDescription')"
              variant="text"
              size="small"
              @click="setAsThumbnail(attachment)"
            >
              {{ t('thumbnail') }}
            </v-btn>
            <v-spacer />
            <application-attachment-dialog
              v-if="can('postAttachment')"
              :value="attachment"
              :index="i"
              @saved="applicationFetch.refresh()"
            />
            <v-btn
              v-if="can('deleteAttachment')"
              :icon="mdiDelete"
              variant="text"
              size="small"
              color="warning"
              :title="t('delete')"
              @click="confirmDelete(i)"
            />
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>
    <p
      v-else
      class="mt-2 text-body-2"
    >
      {{ t('noAttachment') }}
    </p>

    <v-dialog
      v-model="showDeleteDialog"
      max-width="500"
    >
      <v-card>
        <v-card-title>{{ t('delete') }}</v-card-title>
        <v-card-text>{{ t('deleteText') }}</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            variant="text"
            @click="showDeleteDialog = false"
          >
            {{ t('cancel') }}
          </v-btn>
          <v-btn
            color="warning"
            @click="deleteAttachment"
          >
            {{ t('confirmDelete') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  noAttachment: Aucune pièce jointe chargée pour l'instant.
  thumbnail: Utiliser comme vignette
  delete: Supprimer la pièce jointe
  deleteText: Souhaitez-vous confirmer la suppression ?
  cancel: Annuler
  confirmDelete: Supprimer
en:
  noAttachment: No attachment uploaded yet.
  thumbnail: Use as a thumbnail
  delete: Delete attachment
  deleteText: Do you really want to delete this attachment?
  cancel: Cancel
  confirmDelete: Delete
</i18n>

<script lang="ts" setup>
import { mdiDelete } from '@mdi/js'
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

const { t, locale } = useI18n()
const { application, applicationFetch, can, patch } = useApplicationStore()

const attachments = computed(() => (application.value?.attachments ?? []) as Attachment[])

const attachmentUrl = (attachment: Attachment) => {
  if (attachment.url) return attachment.url
  return `${$apiPath}/applications/${application.value!.id}/attachments/${attachment.name}`
}

const canBeThumbnail = (attachment: Attachment) => {
  if (attachment.mimetype?.startsWith('image/')) return true
  if (attachment.type === 'url' && attachment.url) {
    const lowerUrl = attachment.url.toLowerCase()
    return lowerUrl.endsWith('.png') || lowerUrl.endsWith('.jpeg') || lowerUrl.endsWith('.jpg') || lowerUrl.endsWith('.svg')
  }
  return false
}

const setAsThumbnail = async (attachment: Attachment) => {
  await patch({ image: attachmentUrl(attachment) })
}

const formatSize = (size?: number) => {
  if (!size) return '0 ko'
  return (size / 1000).toFixed(2) + ' ko'
}

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString(locale.value, { dateStyle: 'medium' })
}

const showDeleteDialog = ref(false)
const deleteIndex = ref(-1)

const confirmDelete = (i: number) => {
  deleteIndex.value = i
  showDeleteDialog.value = true
}

const deleteAttachment = async () => {
  if (!application.value) return
  const attachment = attachments.value[deleteIndex.value]
  if (attachment?.name) {
    await $fetch(`/applications/${application.value.id}/attachments/${attachment.name}`, { method: 'DELETE' })
  }
  const newAttachments = [...attachments.value]
  newAttachments.splice(deleteIndex.value, 1)
  await patch({ attachments: newAttachments as Application['attachments'] })
  showDeleteDialog.value = false
}
</script>
