<template lang="html">
  <v-dialog
    v-model="dialog"
    max-width="600px"
    @input="onToggle"
  >
    <template #activator="{attrs, on}">
      <v-btn
        v-if="index === -1"
        color="primary"
        fab
        small
        :title="$t('addAttachment')"
        v-bind="attrs"
        v-on="on"
      >
        <v-icon>mdi-plus</v-icon>
      </v-btn>
      <v-btn
        v-else
        color="primary"
        icon
        :title="$t('editAttachment')"
        v-bind="attrs"
        v-on="on"
      >
        <v-icon>mdi-pencil</v-icon>
      </v-btn>
    </template>
    <v-card
      outlined
    >
      <v-card-title primary-title>
        {{ index === -1 ? $t('addAttachment') : $t('editAttachment') }}
      </v-card-title>
      <v-form
        v-if="dialog"
        ref="form"
        v-model="formValid"
      >
        <v-card-text>
          <lazy-v-jsf
            v-model="editValue"
            :schema="schema"
            :options="vjsfOptions"
          />
          <template v-if="editValue && editValue.type === 'file'">
            <v-alert
              v-if="duplicateName"
              type="warning"
              outlined
              dense
            >
              {{ $t('attachmentNameWarning', {name: editValue.name}) }}
            </v-alert>
            <div class="mt-3 mb-3">
              <v-file-input
                v-model="file"
                :label="$t('selectFile')"
                :placeholder="editValue && editValue.name"
                :persistent-placeholder="!!(editValue && editValue.name)"
                outlined
                dense
                @change="setFileInfo"
              />
            </div>
            <v-progress-linear
              v-if="uploadProgress"
              v-model="uploadProgress"
            />
          </template>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            v-t="'cancel'"
            text
            @click="dialog = false"
          />
          <v-btn
            v-t="'save'"
            color="primary"
            :loading="saving"
            :disabled="!formValid || duplicateName || (editValue.type === 'file' && !editValue.name)"
            @click="save"
          />
        </v-card-actions>
      </v-form>
    </v-card>
  </v-dialog>
</template>

<i18n lang="yaml">
fr:
  addAttachment: Ajouter une pièce jointe
  editAttachment: Modifier la pièce jointe
  selectFile: sélectionnez un fichier
  attachmentNameWarning: "Il existe déjà une pièce jointe avec le nom de fichier \"{name}\"."
en:
  addAttachment: Add an attachment
  editAttachment: Edit the attachment
  selectFile: select a file
  attachmentNameWarning: "There is already an attachment with file name \"{name}\"."
</i18n>

<script>
import { mapState, mapActions } from 'vuex'
import eventBus from '~/event-bus'
const datasetSchema = require('~/../contract/dataset.js')

export default {
  props: ['value', 'index'],
  data: () => ({
    vjsfOptions: {
      easyMDEOptions: { minHeight: '100px' }
    },
    dialog: false,
    file: null,
    saving: false,
    uploadProgress: 0,
    formValid: false,
    editValue: null
  }),
  computed: {
    ...mapState('dataset', ['dataset', 'lineUploadProgress']),
    schema () {
      return datasetSchema.properties.attachments.items
    },
    duplicateName () {
      if (this.editValue.type !== 'file' || !this.editValue.name) return false
      return !!(this.dataset.attachments || []).find((a, i) => i !== this.index && a.type === 'file' && a.name === this.editValue.name)
    }
  },
  methods: {
    ...mapActions('dataset', ['patchAndApplyRemoteChange']),
    onToggle () {
      this.editValue = { ...this.value }
      if (!this.editValue.type) this.$set(this.editValue, 'type', 'file')
      this.file = null
      this.uploadProgress = 0
    },
    setFileInfo () {
      if (this.file) {
        this.$set(this.editValue, 'name', this.file.name)
        this.$set(this.editValue, 'size', this.file.size)
        this.$set(this.editValue, 'mimetype', this.file.type)
        this.$set(this.editValue, 'updatedAt', new Date(this.file.lastModified).toISOString())
        if (!this.editValue.title) this.$set(this.editValue, 'title', this.file.name)
      } else {
        if (this.value.name) {
          this.$set(this.editValue, 'name', this.value.name)
          this.$set(this.editValue, 'size', this.value.size)
          this.$set(this.editValue, 'mimetype', this.value.mimetype)
          this.$set(this.editValue, 'updatedAt', this.value.updatedAt)
        } else {
          this.$delete(this.editValue, 'name')
          this.$delete(this.editValue, 'size')
          this.$delete(this.editValue, 'mimetype')
          this.$delete(this.editValue, 'updatedAt')
        }
      }
    },
    async save () {
      this.saving = true
      try {
        if (this.editValue.type === 'file' && this.file) {
          const options = {
            onUploadProgress: (e) => {
              if (e.lengthComputable) {
                this.uploadProgress = (e.loaded / e.total) * 100
              }
            }
          }
          const formData = new FormData()
          formData.append('attachment', this.file)
          await this.$axios.$post('api/v1/datasets/' + this.dataset.id + '/metadata-attachments', formData, options)
        }

        if (this.value.type === 'file' && this.value.name && (this.editValue.type === 'url' || this.editValue.name !== this.value.name)) {
          await this.$axios.$delete('api/v1/datasets/' + this.dataset.id + '/metadata-attachments/' + this.value.name)
        }

        const attachments = this.dataset.attachments || []
        if (this.index === -1) attachments.push(this.editValue)
        else attachments[this.index] = this.editValue
        await this.patchAndApplyRemoteChange({ attachments })
        this.dialog = false
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
      this.saving = false
    }
  }
}
</script>

<style lang="css" scoped>
</style>
