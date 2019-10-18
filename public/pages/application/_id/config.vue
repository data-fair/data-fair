<template lang="html">
  <v-container fluid grid-list-lg>
    <no-ssr>
      <v-expansion-panel v-model="expansion" :popout="false" :value="1" expand>
        <v-expansion-panel-content>
          <div slot="header" style="font-weight:bold">
            Dernière configuration validée (lecture seule)
          </div>
          <v-card v-if="config && Object.keys(config).length">
            <v-card-text class="grey lighten-3">
              <v-layout row wrap>
                <v-flex xs12 sm6 md4>
                  <p v-if="prodBaseApp">
                    Version : {{ `${prodBaseApp.title} (${prodBaseApp.version})` }}
                  </p>
                  <v-form ref="prodConfigForm">
                    <v-jsonschema-form v-if="prodSchema" :schema="prodSchema" :model="configClone" :options="{disableAll: true, autoFoldObjects: can('writeConfig'), context: {owner: application.owner}, requiredMessage: 'Information obligatoire', noDataMessage: 'Aucune valeur correspondante', 'searchMessage': 'Recherchez...'}" @error="error => eventBus.$emit('notification', {error})" />
                  </v-form>
                </v-flex>
                <v-flex xs12 sm6 md8 class="pa-0">
                  <v-iframe v-if="showProdPreview && expansion[0]" :src="applicationLink + '?embed=true'" />
                </v-flex>
              </v-layout>
            </v-card-text>
          </v-card>
        </v-expansion-panel-content>
        <v-expansion-panel-content>
          <div slot="header" style="font-weight:bold">
            Brouillon (écriture)
          </div>
          <v-card>
            <v-card-text class="grey lighten-3">
              <v-layout row wrap>
                <v-flex xs12 sm6 md4>
                  <v-select
                    v-if="baseApps"
                    v-model="editUrl"
                    :items="baseApps"
                    :item-text="(baseApp => `${baseApp.title} (${baseApp.version})`)"
                    item-value="url"
                    label="Changer de version"
                  />
                  <v-form ref="configForm" v-model="formValid" @submit="validateDraft">
                    <!--{{ editConfig }}-->
                    <v-jsonschema-form v-if="draftSchema && editConfig" :schema="draftSchema" :model="editConfig" :options="{disableAll: !can('writeConfig'), autoFoldObjects: can('writeConfig'), context: {owner: application.owner}, requiredMessage: 'Information obligatoire', noDataMessage: 'Aucune valeur correspondante', 'searchMessage': 'Recherchez...'}" @error="error => eventBus.$emit('notification', {error})" />
                    <v-layout row class="mt-3">
                      <v-spacer />
                      <v-btn :disabled="hasModification || !hasDraft" color="warning" type="submit">
                        Valider
                      </v-btn>
                      <v-btn :disabled="!hasDraft" color="error" class="px-0" @click="showCancelDialog = true">
                        Annuler
                      </v-btn>
                    </v-layout>
                  </v-form>
                </v-flex>
                <v-flex xs12 sm6 md8 class="pa-0">
                  <v-iframe v-if="showDraftPreview && expansion[1]" :src="applicationLink + '?embed=true&draft=true'" />
                </v-flex>
              </v-layout>
            </v-card-text>
          </v-card>
        </v-expansion-panel-content>
      </v-expansion-panel>
    </no-ssr>

    <v-dialog v-model="showCancelDialog" max-width="500px">
      <v-card>
        <v-card-title primary-title>
          Effacer le brouillon
        </v-card-title>
        <v-card-text>
          <v-alert :value="true" type="error">
            Attention le brouillon sera perdu et l'application reviendra à son état validé précédent.
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn flat @click="showCancelDialog = false">
            Annuler
          </v-btn>
          <v-btn color="warning" @click="cancelDraft(); showCancelDialog = false;">
            Confirmer
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script>
import Vue from 'vue'
import debounce from 'debounce'
import { mapState, mapActions, mapGetters } from 'vuex'
import VJsonschemaForm from '@koumoul/vuetify-jsonschema-form/lib/index.vue'
import '@koumoul/vuetify-jsonschema-form/dist/main.css'
import 'iframe-resizer/js/iframeResizer'
import VIframe from '@koumoul/v-iframe'
import eventBus from '../../../event-bus.js'

if (process.browser) {
  const Swatches = require('vue-swatches').default
  Vue.component('swatches', Swatches)
  require('vue-swatches/dist/vue-swatches.min.css')
  const Draggable = require('vuedraggable')
  Vue.component('draggable', Draggable)
  const Sketch = require('vue-color').Sketch
  Vue.component('color-picker', Sketch)
}

export default {
  components: { VJsonschemaForm, VIframe },
  data() {
    return {
      showConfigIframe: false,
      showForm: false,
      prodBaseApp: null,
      showDraftPreview: true,
      showProdPreview: true,
      draftSchema: null,
      prodSchema: null,
      formValid: false,
      editConfig: null,
      editUrl: null,
      eventBus,
      showCancelDialog: false,
      baseApps: null,
      expansion: [false, true]
    }
  },
  computed: {
    ...mapState('application', ['application', 'config', 'configDraft']),
    ...mapGetters('application', ['applicationLink', 'can']),
    height() {
      return window.innerHeight
    },
    hasModification() {
      return JSON.stringify(this.editConfig) !== JSON.stringify(this.configDraft) || this.editUrl !== this.application.urlDraft
    },
    hasDraft() {
      return JSON.stringify(this.config) !== JSON.stringify(this.configDraft) || (this.application.urlDraft && this.application.urlDraft !== this.application.url)
    },
    configClone() {
      return JSON.parse(JSON.stringify(this.config))
    },
    iframeHeight() {
      return Math.max(300, Math.min(this.height - 100, 450))
    }
  },
  watch: {
    configDraft() {
      this.refreshDraftPreview()
    },
    config() {
      this.refreshProdPreview()
    },
    editConfig: {
      handler: debounce(function() {
        this.saveDraft()
      }, 200),
      deep: true
    },
    editUrl() {
      this.saveDraft()
    },
    async 'application.urlDraft'() {
      await this.fetchSchemas()
      this.refreshDraftPreview()
    }
  },
  async created() {
    this.fetchSchemas()
    this.fetchConfigs()
    this.fetchBaseApps()
  },
  methods: {
    ...mapActions('application', ['readConfig', 'writeConfig', 'readConfigDraft', 'writeConfigDraft', 'patchAndCommit']),
    async fetchBaseApps() {
      // get base apps that share the same application name (meaning different version of same app)
      try {
        this.prodBaseApp = await this.$axios.$get(`api/v1/applications/${this.application.id}/base-application`)
      } catch (error) {
        return eventBus.$emit('notification', { error })
      }
      const privateAccess = `${this.application.owner.type}:${this.application.owner.id}`
      this.baseApps = (await this.$axios.$get('api/v1/base-applications', {
        params: {
          privateAccess,
          size: 10000,
          applicationName: this.prodBaseApp.applicationName
        }
      })).results
      if (!this.baseApps.find(b => b.url === this.prodBaseApp.url)) {
        this.baseApps = [this.prodBaseApp].concat(this.baseApps)
      }
    },
    async fetchConfigs() {
      this.editUrl = this.application.urlDraft || this.application.url
      this.editConfig = JSON.parse(JSON.stringify(await this.readConfigDraft()))
      await this.readConfig()
    },
    async fetchSchemas() {
      this.draftSchema = null
      this.prodSchema = null

      // Only try the deprecated iframe mode, if config schema is not found
      const draftSchemaUrl = (this.application.urlDraft || this.application.url) + 'config-schema.json'
      try {
        this.draftSchema = await this.$axios.$get(draftSchemaUrl)
        if (typeof this.draftSchema !== 'object') {
          console.error(`Schema fetched at ${draftSchemaUrl} is not a valid JSON`)
          this.showConfigIframe = true
        } else {
          this.showForm = true
        }
      } catch (error) {
        if (error.response && error.response.status === 404) {
          console.error(`Schema not found at ${draftSchemaUrl}`)
          this.showConfigIframe = true
        } else {
          eventBus.$emit('notification', { error })
        }
      }
      this.prodSchema = await this.$axios.$get(this.application.url + 'config-schema.json')
    },
    refreshDraftPreview() {
      this.showDraftPreview = false
      setTimeout(() => { this.showDraftPreview = true }, 1)
    },
    refreshProdPreview() {
      this.showProdPreview = false
      setTimeout(() => { this.showProdPreview = true }, 1)
    },
    saveDraft(e) {
      this.patchAndCommit({ urlDraft: this.editUrl, silent: true })
      this.$refs.configForm && this.$refs.configForm.validate()
      if (!this.formValid) return
      this.writeConfigDraft(this.editConfig)
    },
    validateDraft(e) {
      e.preventDefault()
      this.patchAndCommit({ url: this.application.urlDraft })
      this.writeConfig(this.configDraft)
    },
    async cancelDraft() {
      this.patchAndCommit({ urlDraft: this.application.url, silent: true })
      await this.writeConfigDraft(this.config)
      this.fetchConfigs()
    }
  }
}
</script>

<style lang="css">
</style>
