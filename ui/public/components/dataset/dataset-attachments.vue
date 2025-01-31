<template lang="html">
  <v-container fluid>
    <dataset-attachment-dialog
      v-if="can('postMetadataAttachment')"
      :value="{}"
      :index="-1"
    />
    <v-row class="mt-2">
      <v-col
        v-for="(attachment, i) in dataset.attachments"
        :key="i"
        cols="12"
        md="6"
        lg="4"
      >
        <v-card
          tile
          outlined
        >
          <v-card-title primary-title>
            <a
              :href="attachment.url || resourceUrl + '/metadata-attachments/' + attachment.name"
              download
            >{{ attachment.title }}</a>
          </v-card-title>
          <v-card-text v-if="attachment.type === 'file'">
            <span>{{ attachment.name }} ({{ (attachment.size / 1000).toFixed(2) }} ko)</span>
            <span>{{ attachment.updatedAt | moment("lll") }}</span>
          </v-card-text>
          <v-card-text v-if="attachment.type === 'url'">
            <span>{{ attachment.url }}</span>
          </v-card-text>
          <v-card-actions v-if="can('writeData')">
            <v-btn
              v-if="canBeThumbnail(attachment) && can('writeDescription')"
              v-t="'thumbnail'"
              text
              @click="patchAndCommit({'image': attachment.url || resourceUrl + '/metadata-attachments/' + attachment.name})"
            />
            <v-spacer />
            <dataset-attachment-dialog
              v-if="can('postMetadataAttachment')"
              :value="attachment"
              :index="i"
            />
            <confirm-menu
              v-if="can('deleteMetadataAttachment')"
              yes-color="warning"
              :text="$t('deleteText')"
              :tooltip="$t('delete')"
              @confirm="deleteAttachment(i)"
            />
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  message: Charger un fichier pour créer/modifier une pièce jointe. Le nom de fichier est l'identifiant de la pièce jointe.
  selectFile: sélectionnez un fichier
  load: Charger
  noAttachment: Aucune pièce jointe chargée pour l'instant.
  thumbnail: utiliser comme vignette
  delete: Supprimer la pièce jointe
  deleteText: Souhaitez-vous confirmer la suppression ?
en:
  message: Load a file to create/update an attachment. The file name is used as identifier of the attachment.
  selectFile: select a file
  load: Load
  noAttachment: No attachment uploaded yet.
  thumbnail: use as a thumbnail
  delete: Delete attachment
  deleteText: Do you really want to delete this attachment ?
</i18n>

<script>
import { mapGetters, mapState, mapActions } from 'vuex'

export default {
  data: () => ({
    file: null,
    uploading: false,
    uploadProgress: 0
  }),
  computed: {
    ...mapGetters('dataset', ['can', 'resourceUrl']),
    ...mapState('dataset', ['dataset']),
    canBeThumbnail () {
      return (attachment) => {
        if (attachment.type === 'file' && attachment.mimetype && attachment.mimetype.startsWith('image/')) return true
        if (attachment.type === 'url' && attachment.url) {
          const lowerUrl = attachment.url.toLowerCase()
          if (lowerUrl.endsWith('.png') || lowerUrl.endsWith('.jpeg') || lowerUrl.endsWith('.jpg') || lowerUrl.endsWith('.svg')) return true
        }
        return false
      }
    }
  },
  methods: {
    ...mapActions('dataset', ['patchAndCommit']),
    async deleteAttachment (i) {
      const attachment = this.dataset.attachments[i]
      if (attachment.type === 'file' && attachment.name) {
        await this.$axios.$delete('api/v1/datasets/' + this.dataset.id + '/metadata-attachments/' + attachment.name)
      }
      const attachments = [...this.dataset.attachments]
      attachments.splice(i, 1)
      await this.patchAndCommit({ attachments })
    }
  }
}
</script>

<style lang="css">
</style>
