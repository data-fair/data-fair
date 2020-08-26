<template lang="html">
  <v-container fluid>
    <template v-if="can('writeData')">
      <p>Charger un fichier pour créer/modifier une pièce jointe. Le nom de fichier est l'identifiant de la pièce jointe.</p>
      <input
        type="file"
        @change="onFileUpload"
      >
      <v-btn
        :disabled="!file || uploading"
        color="primary"
        @click="confirmUpload()"
      >
        Charger
      </v-btn>
      <v-progress-linear
        v-if="uploading"
        v-model="uploadProgress"
      />
    </template>
    <p v-else-if="!dataset.attachments || dataset.attachments.length === 0">
      Aucune pièce jointe chargée pour l'instant.
    </p>
    <v-container class="pa-0 mt-2" fluid>
      <v-row>
        <v-col
          v-for="(attachment, i) in dataset.attachments"
          :key="i"
          cols="12"
          md="6"
          lg="4"
        >
          <v-card>
            <v-card-title primary-title>
              <a :href="resourceUrl + '/metadata-attachments/' + attachment.name">{{ attachment.name }} ({{ (attachment.size / 1000).toFixed(2) }} ko)</a>
            </v-card-title>
            <v-card-text>
              <span>{{ attachment.updatedAt | moment("DD/MM/YYYY, HH:mm") }}</span>
            </v-card-text>
            <v-card-actions v-if="can('writeData')">
              <v-spacer />
              <v-btn
                icon
                color="warning"
                @click="deleteAttachment(attachment)"
              >
                <v-icon>mdi-delete</v-icon>
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-col>
      </v-row>
    </v-container>
  </v-container>
</template>

<script>
  import { mapGetters, mapState, mapActions } from 'vuex'
  import eventBus from '~/event-bus'

  export default {
    data: () => ({
      file: null,
      uploading: false,
      uploadProgress: 0,
    }),
    computed: {
      ...mapGetters('dataset', ['can', 'resourceUrl']),
      ...mapState('dataset', ['dataset']),
    },
    methods: {
      ...mapActions('dataset', ['patchAndCommit']),
      onFileUpload(e) {
        this.file = e.target.files[0]
      },
      async confirmUpload() {
        const options = {
          onUploadProgress: (e) => {
            if (e.lengthComputable) {
              this.uploadProgress = (e.loaded / e.total) * 100
            }
          },
        }
        const formData = new FormData()
        formData.append('attachment', this.file)

        this.uploading = true
        try {
          const newAttachment = await this.$axios.$post('api/v1/datasets/' + this.dataset.id + '/metadata-attachments', formData, options)
          const attachments = this.dataset.attachments || []
          const existingAttachment = attachments.find(a => a.name === newAttachment.name)
          if (existingAttachment) {
            Object.assign(existingAttachment, newAttachment)
          } else {
            attachments.push(newAttachment)
          }
          await this.patchAndCommit({ attachments })
        } catch (error) {
          const status = error.response && error.response.status
          if (status === 413) {
            eventBus.$emit('notification', { type: 'error', msg: 'Le fichier est trop volumineux pour être importé' })
          } else if (status === 429) {
            eventBus.$emit('notification', { type: 'error', msg: 'Le propriétaire n\'a pas assez d\'espace disponible pour ce fichier' })
          } else {
            eventBus.$emit('notification', { error, msg: 'Erreur pendant l\'import du fichier:' })
          }
        }
        this.uploading = false
      },
      async deleteAttachment(attachment) {
        await this.$axios.$delete('api/v1/datasets/' + this.dataset.id + '/metadata-attachments/' + attachment.name)
        const attachments = (this.dataset.attachments || []).filter(a => a.name !== attachment.name)
        await this.patchAndCommit({ attachments })
      },
    },
  }
</script>

<style lang="css">
</style>
