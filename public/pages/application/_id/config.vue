<template lang="html">
  <v-container fluid grid-list-lg>
    <no-ssr>
      <v-layout row wrap>
        <v-flex xs12 md4>
          <h2 class="title my-4" >Configuration</h2>
          <iframe v-if="showConfigIframe" :src="applicationLink + '/config?embed=true'" :height="Math.min(height - 100, 600)" width="100%"/>
          <v-form v-if="showForm" ref="configForm" v-model="formValid" @submit="submit">
            <v-jsonschema-form :schema="schema" :model="editConfig" :options="{disableAll: !can('writeConfig'), autoFoldObjects: can('writeConfig'), context: {owner: application.owner}, requiredMessage: 'Information obligatoire', noDataMessage: 'Aucune valeur correspondante', 'searchMessage': 'Recherchez...'}" @error="error => eventBus.$emit('notification', {error})" />
            <v-layout row>
              <v-spacer/>
              <v-btn :disabled="!hasModification" color="primary" type="submit">Enregistrer</v-btn>
              <v-btn :disabled="hasModification || !hasDraft" color="warning" @click="validateDraft">Valider le brouillon</v-btn>
            </v-layout>
          </v-form>
        </v-flex>
        <v-flex xs12 md8>
          <h2 class="title my-4" >
            Aperçu
            <!-- Only useful in development
            <v-btn flat icon color="primary" @click="refreshPreview">
              <v-icon>refresh</v-icon>
            </v-btn>-->
          </h2>
          <v-card v-if="showPreview">
            <iframe v-if="config" :src="applicationLink + '?embed=true&draft=true'" :height="Math.min(height - 100, 600)" width="100%"/>
          </v-card>
        </v-flex>
      </v-layout>
    </no-ssr>
  </v-container>
</template>

<script>
import Vue from 'vue'
import { mapState, mapActions, mapGetters } from 'vuex'
import VJsonschemaForm from '@koumoul/vuetify-jsonschema-form'
import '@koumoul/vuetify-jsonschema-form/dist/main.css'
import eventBus from '../../../event-bus.js'

if (process.browser) {
  const Swatches = require('vue-swatches').default
  Vue.component('swatches', Swatches)
  require('vue-swatches/dist/vue-swatches.min.css')
  const Draggable = require('vuedraggable')
  Vue.component('draggable', Draggable)
}

export default {
  components: { VJsonschemaForm },
  data() {
    return {
      showConfigIframe: false,
      showForm: false,
      showPreview: true,
      schema: null,
      formValid: false,
      editConfig: null,
      eventBus
    }
  },
  computed: {
    ...mapState('application', ['application', 'config', 'configDraft']),
    ...mapGetters('application', ['applicationLink', 'can']),
    height() {
      return window.innerHeight
    },
    hasModification() {
      return JSON.stringify(this.editConfig) !== JSON.stringify(this.configDraft)
    },
    hasDraft() {
      return JSON.stringify(this.config) !== JSON.stringify(this.configDraft)
    }
  },
  watch: {
    configDraft() {
      this.refreshPreview()
    }
  },
  async created() {
    // Only try the deprecated iframe mode, if config schema is not found
    const schemaUrl = this.application.url + '/config-schema.json'
    try {
      this.schema = await this.$axios.$get(schemaUrl)
      if (typeof this.schema !== 'object') {
        console.error(`Schema fetched at ${schemaUrl} is not a valid JSON`)
        this.showConfigIframe = true
      } else {
        this.editConfig = JSON.parse(JSON.stringify(await this.readConfigDraft()))
        await this.readConfig()
        this.showForm = true
      }
    } catch (error) {
      if (error.response && error.response.status === 404) {
        console.error(`Schema not found at ${schemaUrl}`)
        this.showConfigIframe = true
      } else {
        eventBus.$emit('notification', { error })
      }
    }
  },
  methods: {
    ...mapActions('application', ['patch', 'readConfig', 'writeConfig', 'readConfigDraft', 'writeConfigDraft']),
    refreshPreview() {
      this.showPreview = false
      setTimeout(() => { this.showPreview = true }, 1)
    },
    submit(e) {
      e.preventDefault()
      this.$refs.configForm.validate()
      if (!this.formValid) return
      this.writeConfigDraft(this.editConfig)
    },
    validateDraft() {
      this.writeConfig(this.configDraft)
    }
  }
}
</script>

<style lang="css">
</style>
