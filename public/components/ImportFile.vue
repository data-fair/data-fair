<template>
  <v-stepper v-model="currentStep">
    <v-stepper-header>
      <v-stepper-step step="1" :complete="!!file" editable>Sélection du fichier</v-stepper-step>
      <v-divider/>
      <v-stepper-step step="2" :complete="currentStep > 2">Choix du propriétaire</v-stepper-step>
      <v-divider/>
      <v-stepper-step step="3">Effectuer l'action</v-stepper-step>
    </v-stepper-header>

    <v-stepper-items>
      <v-stepper-content step="1">
        <div class="mt-3 mb-3"><input type="file" @change="onFileUpload"></div>
        <v-btn color="primary" :disabled="!file" @click.native="currentStep = 2">Continuer</v-btn>
        <v-btn flat @click.native="$emit('cancel')">Annuler</v-btn>
      </v-stepper-content>
      <v-stepper-content step="2">
        <v-radio-group v-model="owner" class="mt-3 mb-3">
          <v-radio :label="key === 'user' ? 'Vous-même' : user.organizations.find(o => o.id === owners[key].id).name" :value="key" v-for="key in Object.keys(owners)" :key="key"/>
        </v-radio-group>
        <v-btn color="primary" :disabled="!owner" @click.native="currentStep = 3">Continuer</v-btn>
        <v-btn flat @click.native="$emit('cancel')">Annuler</v-btn>
      </v-stepper-content>
      <v-stepper-content step="3">
        <v-radio-group v-model="action" class="mt-3 mb-3">
          <v-radio :label="a.title" :value="a" v-for="a in actions" :key="a.id"/>
        </v-radio-group>
        <v-progress-linear v-model="uploadProgress"/>
        <v-btn color="primary" @click.native="importData()">Lancer l'import</v-btn>
        <v-btn flat @click.native="$emit('cancel')">Annuler</v-btn>
      </v-stepper-content>
    </v-stepper-items>
  </v-stepper>
</template>

<script>
import {mapState} from 'vuex'
import eventBus from '../event-bus'

export default {
  data: () => ({
    file: null,
    currentStep: null,
    owner: 'user',
    uploadProgress: 0,
    actions: [],
    action: null
  }),
  computed: {
    ...mapState(['user', 'env']),
    owners() {
      return {
        user: {type: 'user', id: this.user.id, name: this.user.name},
        ...this.user.organizations.reduce((a, o) => {
          a['orga' + o.id] = {type: 'organization', id: o.id, name: o.name}
          return a
        }, {})
      }
    }
  },
  watch: {
    async currentStep() {
      if (this.currentStep === 3) {
        const datasets = await this.$axios.$get('api/v1/datasets', {
          params: {
            'owner-type': this.owners[this.owner].type,
            'owner-id': this.owners[this.owner].id,
            'filename': this.file.name
          }
        })
        this.actions = [{type: 'create', title: 'Créer un nouveau jeu de données'}, ...datasets.results.map(d => ({
          type: 'update',
          id: d.id,
          title: 'Mettre à jour les données du jeu ' + d.title
        }))]
      }
    }
  },
  methods: {
    onFileUpload(e) {
      this.file = e.target.files[0]
    },
    async importData() {
      const options = {
        onUploadProgress: (e) => {
          if (e.lengthComputable) {
            this.uploadProgress = (e.loaded / e.total) * 100
          }
        }
      }
      const formData = new FormData()
      formData.append('file', this.file)

      if (this.owners[this.owner].type === 'organization') {
        options.headers = {
          'x-organizationId': this.owners[this.owner].id
        }
      }

      try {
        let dataset
        if (this.action.type === 'create') {
          dataset = await this.$axios.$post('api/v1/datasets', formData, options)
        } else {
          dataset = await this.$axios.$post('api/v1/datasets/' + this.action.id, formData, options)
        }
        this.$router.push({path: `/dataset/${dataset.id}/description`})
      } catch (error) {
        const status = error.response && error.response.status
        const msg = (error.response && error.response.data) || 'Erreur inconnue'
        if (status === 413) {
          eventBus.$emit('notification', {type: 'error', msg: `Le fichier est trop volumineux pour être importé`})
        } else if (status === 429) {
          eventBus.$emit('notification', {type: 'error', msg: `Le propriétaire sélectionné n'a pas assez d'espace disponible pour ce fichier`})
        } else {
          eventBus.$emit('notification', {type: 'error', msg: `Erreur pendant l'import du fichier: ${msg}`})
        }
      }
    }
  }
}
</script>
