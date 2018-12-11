<template>
  <v-stepper v-model="currentStep">
    <v-stepper-header>
      <v-stepper-step :complete="!!file" step="1" editable>Sélection du fichier</v-stepper-step>
      <v-divider/>
      <v-stepper-step :complete="currentStep > 2 && !!attachment" step="2" editable>Pièces jointes</v-stepper-step>
      <v-divider/>
      <v-stepper-step :complete="currentStep > 3" step="3" editable>Choix du propriétaire</v-stepper-step>
      <v-divider/>
      <v-stepper-step step="4">Effectuer l'action</v-stepper-step>
    </v-stepper-header>

    <v-stepper-items>
      <v-stepper-content step="1">
        <p>Chargez un fichier de données principal.</p>
        <p>La liste des formats supportés est accessible dans <nuxt-link :to="localePath({name: 'user-guide-id', params: {id: 'dataset'}})" target="_blank">la documentation</nuxt-link>.</p>
        <div class="mt-3 mb-3"><input type="file" @change="onFileUpload"></div>
        <v-btn :disabled="!file" color="primary" @click.native="currentStep = 2">Continuer</v-btn>
        <v-btn flat @click.native="$emit('cancel')">Annuler</v-btn>
      </v-stepper-content>
      <v-stepper-content step="2">
        <p>Optionnellement vous pouvez charger une archive zip contenant des fichiers à utiliser comme pièces à joindre aux lignes du fichier principal.</p>
        <p>Le fichier principal doit avoir un champ qui contient les chemins des pièces jointes dans l'archive.</p>
        <div class="mt-3 mb-3"><input type="file" @change="onAttachmentUpload"></div>
        <v-btn color="primary" @click.native="currentStep = 3">Continuer</v-btn>
        <v-btn flat @click.native="$emit('cancel')">Annuler</v-btn>
      </v-stepper-content>
      <v-stepper-content step="3">
        <owner-pick v-model="owner"/>
        <v-btn :disabled="!owner" color="primary" @click.native="currentStep = 4">Continuer</v-btn>
        <v-btn flat @click.native="$emit('cancel')">Annuler</v-btn>
      </v-stepper-content>
      <v-stepper-content step="4">
        <v-radio-group v-model="action" class="mt-3 mb-3">
          <v-radio v-for="a in actions" :label="a.title" :value="a" :key="a.id"/>
        </v-radio-group>
        <v-progress-linear v-model="uploadProgress"/>
        <v-btn :disabled="!action || importing" color="primary" @click.native="importData()">Lancer l'import</v-btn>
        <v-btn flat @click.native="$emit('cancel')">Annuler</v-btn>
      </v-stepper-content>
    </v-stepper-items>
  </v-stepper>
</template>

<script>
import { mapState } from 'vuex'
import eventBus from '../event-bus'
import OwnerPick from './OwnerPick.vue'

export default {
  components: { OwnerPick },
  data: () => ({
    file: null,
    attachment: null,
    currentStep: null,
    owner: null,
    uploadProgress: 0,
    actions: [],
    action: null,
    importing: false
  }),
  computed: {
    ...mapState('session', ['user']),
    ...mapState(['env'])
  },
  watch: {
    async currentStep() {
      if (this.currentStep === 4) {
        const datasets = await this.$axios.$get('api/v1/datasets', {
          params: {
            owner: this.owner.type + ':' + this.owner.id,
            'filename': this.file.name
          }
        })
        this.actions = [{ type: 'create', title: 'Créer un nouveau jeu de données' }, ...datasets.results.map(d => ({
          type: 'update',
          id: d.id,
          title: 'Mettre à jour les données du jeu ' + d.title
        }))]
        this.action = this.actions[0]
      }
    }
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
        headers: { 'x-organizationId': 'user' },
        onUploadProgress: (e) => {
          if (e.lengthComputable) {
            this.uploadProgress = (e.loaded / e.total) * 100
          }
        }
      }
      const formData = new FormData()
      formData.append('dataset', this.file)
      if (this.attachment) formData.append('attachments', this.attachment)

      if (this.owner.type === 'organization') {
        options.headers = { 'x-organizationId': this.owner.id }
        if (this.owner.role) options.headers['x-organizationRole'] = this.owner.role
      }

      this.importing = true
      try {
        let dataset
        if (this.action.type === 'create') {
          dataset = await this.$axios.$post('api/v1/datasets', formData, options)
        } else {
          dataset = await this.$axios.$post('api/v1/datasets/' + this.action.id, formData, options)
        }
        this.$router.push({ path: `/dataset/${dataset.id}/description` })
      } catch (error) {
        const status = error.response && error.response.status
        if (status === 413) {
          eventBus.$emit('notification', { type: 'error', msg: `Le fichier est trop volumineux pour être importé` })
        } else if (status === 429) {
          eventBus.$emit('notification', { type: 'error', msg: `Le propriétaire sélectionné n'a pas assez d'espace disponible pour ce fichier` })
        } else {
          eventBus.$emit('notification', { error, msg: `Erreur pendant l'import du fichier:` })
        }
        this.importing = false
      }
    }
  }
}
</script>
