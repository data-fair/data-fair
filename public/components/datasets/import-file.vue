<template>
  <v-stepper v-model="currentStep">
    <v-stepper-header>
      <v-stepper-step
        :complete="!!file"
        step="1"
        editable
      >
        Sélection du fichier
      </v-stepper-step>
      <v-divider />
      <v-stepper-step
        :complete="currentStep > 2 && !!attachment"
        step="2"
        editable
      >
        Pièces jointes
      </v-stepper-step>
      <v-divider />
      <v-stepper-step step="3">
        Effectuer l'action
      </v-stepper-step>
    </v-stepper-header>

    <v-stepper-items>
      <v-stepper-content step="1">
        <v-sheet min-height="200">
          <p>Chargez un fichier de données principal.</p>
          <p>
            La liste des formats supportés est accessible dans <nuxt-link
              :to="localePath({name: 'user-guide-id', params: {id: 'dataset'}})"
              target="_blank"
            >
              la documentation
            </nuxt-link>.
          </p>
          <div class="mt-3 mb-3">
            <input
              type="file"
              @change="onFileUpload"
            >
          </div>
          <div
            v-if="file"
            class="mt-3 mb-3"
          >
            <v-text-field
              v-model="title"
              name="title"
              label="Titre du jeu de données"
              placeholder="Laissez vide pour utiliser le nom de fichier"
            />
          </div>
        </v-sheet>
        <v-btn
          :disabled="!file"
          color="primary"
          @click.native="currentStep = 2"
        >
          Continuer
        </v-btn>
        <v-btn text @click.native="$emit('cancel')">
          Annuler
        </v-btn>
      </v-stepper-content>
      <v-stepper-content step="2">
        <v-sheet min-height="200">
          <p>Optionnellement vous pouvez charger une archive zip contenant des fichiers à utiliser comme pièces à joindre aux lignes du fichier principal.</p>
          <p>Le fichier principal doit avoir un champ qui contient les chemins des pièces jointes dans l'archive.</p>
          <div class="mt-3 mb-3">
            <input
              type="file"
              @change="onAttachmentUpload"
            >
            <v-checkbox
              v-if="attachment"
              v-model="attachmentsAsImage"
              hide-details
              :label="`Traiter les pièces jointes comme des images`"
            />
          </div>
        </v-sheet>
        <v-btn color="primary" @click.native="currentStep = 3">
          Continuer
        </v-btn>
        <v-btn text @click.native="$emit('cancel')">
          Annuler
        </v-btn>
      </v-stepper-content>
      <v-stepper-content step="3">
        <v-sheet min-height="200">
          <v-radio-group
            v-model="action"
            class="mt-3 mb-3"
            hide-details
          >
            <v-radio
              v-for="a in actions"
              :key="a.id"
              :label="a.title"
              :value="a"
            />
          </v-radio-group>
          <v-progress-linear
            v-if="importing"
            v-model="uploadProgress"
            class="mb-2"
          />
        </v-sheet>
        <v-btn
          :disabled="!action || importing"
          color="primary"
          @click.native="importData()"
        >
          Lancer l'import
        </v-btn>
        <v-btn text @click.native="$emit('cancel')">
          Annuler
        </v-btn>
      </v-stepper-content>
    </v-stepper-items>
  </v-stepper>
</template>

<script>
  import { mapState, mapGetters } from 'vuex'
  import eventBus from '~/event-bus'

  export default {
    data: () => ({
      file: null,
      attachment: null,
      attachmentsAsImage: false,
      currentStep: null,
      uploadProgress: 0,
      actions: [],
      action: null,
      importing: false,
      title: '',
    }),
    computed: {
      ...mapState('session', ['user']),
      ...mapGetters('session', ['activeAccount']),
      ...mapState(['env']),
      cleanTitle() {
        const trimmed = this.title.trim()
        return trimmed.length > 3 ? trimmed : null
      },
    },
    watch: {
      async currentStep() {
        if (this.currentStep === 3) {
          let existingDatasets
          if (this.cleanTitle) {
            existingDatasets = { results: [] }
          } else {
            existingDatasets = await this.$axios.$get('api/v1/datasets', { params: { filename: this.file.name, owner: `${this.activeAccount.type}:${this.activeAccount.id}` } })
          }
          this.actions = [{ type: 'create', title: 'Créer un nouveau jeu de données' }, ...existingDatasets.results.map(d => ({
            type: 'update',
            id: d.id,
            title: 'Mettre à jour les données du jeu ' + d.title,
          }))]
          this.action = this.actions[0]
        }
      },
    },
    methods: {
      onFileUpload(e) {
        this.file = e.target.files[0]
      },
      onAttachmentUpload(e) {
        this.attachment = e.target.files[0]
      },
      async importData() {
        const options = {
          onUploadProgress: (e) => {
            if (e.lengthComputable) {
              this.uploadProgress = (e.loaded / e.total) * 100
            }
          },
        }
        const formData = new FormData()

        formData.append('dataset', this.file)
        if (this.attachment) {
          formData.append('attachments', this.attachment)
          if (this.attachmentsAsImage) formData.append('attachmentsAsImage', true)
        }
        if (this.cleanTitle) formData.append('title', this.cleanTitle)
        this.importing = true
        try {
          let dataset
          if (this.action.type === 'create') {
            dataset = await this.$axios.$post('api/v1/datasets', formData, options)
          } else {
            dataset = await this.$axios.$post('api/v1/datasets/' + this.action.id, formData, options)
          }
          this.$router.push({ path: `/dataset/${dataset.id}` })
        } catch (error) {
          const status = error.response && error.response.status
          if (status === 413) {
            eventBus.$emit('notification', { type: 'error', msg: 'Le fichier est trop volumineux pour être importé' })
          } else if (status === 429) {
            eventBus.$emit('notification', { type: 'error', msg: 'Vous n\'avez pas assez d\'espace disponible pour ce fichier' })
          } else {
            eventBus.$emit('notification', { error, msg: 'Erreur pendant l\'import du fichier :' })
          }
          this.importing = false
        }
      },
    },
  }
</script>
