<template lang="html">
  <v-container fluid grid-list-lg>
    <no-ssr>
      <v-layout row wrap>
        <v-flex xs12 sm4>
          <h2 class="title my-4" >Configuration</h2>
          <iframe v-if="showConfigIframe" :src="applicationLink + '/config?embed=true'" :height="Math.max(height, 1000)" width="100%"/>
          <v-form v-if="showForm" v-model="formValid">
            <v-jsonschema-form :schema="schema" :model="editConfig" :options="{disableAll: !can('writeConfig')}" @error="error => eventBus.$emit('notification', {error})" />
            <v-layout row>
              <v-spacer/>
              <v-btn color="primary" @click="writeConfig(editConfig)">Enregistrer</v-btn>
            </v-layout>
          </v-form>
        </v-flex>
        <v-flex xs12 md8>
          <h2 class="title my-4" >
            Aperçu
            <v-btn flat icon color="primary" @click="refreshPreview">
              <v-icon>refresh</v-icon>
            </v-btn>
          </h2>
          <v-card v-if="showPreview">
            <iframe :src="applicationLink + '?embed=true'" :height="Math.min(height - 100, 500)" width="100%"/>
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
    ...mapState('application', ['application', 'config']),
    ...mapGetters('application', ['applicationLink', 'can']),
    height() {
      return window.innerHeight
    }
  },
  watch: {
    config() {
      this.refreshPreview()
    }
  },
  async created() {
    // Only try the deprecated iframe mode, if config schema is not found
    try {
      this.schema = await this.$axios.$get(this.applicationLink + '/config-schema.json')
      if (typeof this.schema !== 'object') {
        console.error(`Schema fetched at ${this.applicationLink}/config-schema.json is not a valid JSON`)
        this.showConfigIframe = true
      } else {
        this.editConfig = { ...await this.readConfig() }
        this.showForm = true
      }
    } catch (error) {
      if (error.response && error.response.status === 404) {
        console.error(`Schema not found at ${this.applicationLink}/config-schema.json`)
        this.showConfigIframe = true
      } else {
        eventBus.$emit('notification', { error })
      }
    }
  },
  methods: {
    ...mapActions('application', ['patch', 'readConfig', 'writeConfig']),
    refreshPreview() {
      this.showPreview = false
      setTimeout(() => { this.showPreview = true }, 1)
    }
  }
}
</script>

<style lang="css">
</style>
