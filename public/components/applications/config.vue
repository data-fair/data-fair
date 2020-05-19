<template lang="html">
  <v-container fluid>
    <no-ssr>
      <v-row>
        <v-col
          cols="12"
          sm="6"
          md="4"
        >
          <v-select
            v-if="baseApps"
            v-model="editUrl"
            :items="baseApps"
            :item-text="(baseApp => `${baseApp.title} (${baseApp.version})`)"
            item-value="url"
            label="Changer de version"
          />
          <v-form
            ref="configForm"
            v-model="formValid"
            @submit="validateDraft"
          >
            <!--{{ editConfig }}-->
            <v-jsf
              v-if="draftSchema && editConfig && showProdPreview"
              v-model="editConfig"
              :schema="draftSchema"
              :options="{...vjsfOptions, disableAll: !can('writeConfig')}"
              @error="error => eventBus.$emit('notification', {error})"
            />
            <v-row class="mt-3">
              <v-spacer />
              <v-btn
                :disabled="hasModification || !hasDraft"
                color="accent"
                type="submit"
              >
                Valider
              </v-btn>
              <v-btn
                :disabled="!hasDraft"
                color="warning"
                class="ml-2 mr-3"
                @click="showCancelDialog = true"
              >
                Annuler
              </v-btn>
            </v-row>
          </v-form>
        </v-col>
        <v-col
          cols="12"
          sm="6"
          md="8"
          class="pl-0"
        >
          <v-card class="pa-2" outlined>
            <v-iframe v-if="showDraftPreview" :src="applicationLink + '?embed=true&draft=true'" />
          </v-card>
        </v-col>
      </v-row>

      <!--<v-expansion-panels
        v-model="expansion"
        multiple
        flat
        mandatory
      >
        <v-expansion-panel
          v-if="configClone"
          :popout="false"
          :value="1"
          expand
        >
          <v-expansion-panel-header>
            Dernière configuration validée (lecture seule)
          </v-expansion-panel-header>
          <v-expansion-panel-content>
            <v-card v-if="config && Object.keys(config).length">
              <v-card-text class="grey lighten-3">
                <v-row>
                  <v-col
                    cols="12"
                    sm="6"
                    md="4"
                  >
                    <p v-if="prodBaseApp">
                      Version : {{ `${prodBaseApp.title} (${prodBaseApp.version})` }}
                    </p>
                    <v-form ref="prodConfigForm">
                      <v-jsf
                        v-if="prodSchema"
                        v-model="configClone"
                        :schema="prodSchema"
                        :options="vjsfOptions"
                        @error="error => eventBus.$emit('notification', {error})"
                      />
                    </v-form>
                  </v-col>
                  <v-col
                    cols="12"
                    sm="6"
                    md="8"
                    class="pa-0"
                  >
                    <v-iframe
                      v-if="showProdPreview && expansion[0]"
                      :src="applicationLink + '?embed=true'"
                    />
                  </v-col>
                </v-row>
              </v-card-text>
            </v-card>
          </v-expansion-panel-content>
        </v-expansion-panel>
        <v-expansion-panel>
          <v-expansion-panel-header>
            Brouillon (écriture)
          </v-expansion-panel-header>
          <v-expansion-panel-content>
            <v-card>
              <v-card-text class="grey lighten-3" />
            </v-card>
          </v-expansion-panel-content>
        </v-expansion-panel>
      </v-expansion-panels>
    -->
    </no-ssr>

    <v-dialog
      v-model="showCancelDialog"
      max-width="500px"
    >
      <v-card>
        <v-card-title primary-title>
          Effacer le brouillon
        </v-card-title>
        <v-card-text>
          <v-alert
            :value="true"
            type="error"
          >
            Attention le brouillon sera perdu et l'application reviendra à son état validé précédent.
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="showCancelDialog = false">
            Annuler
          </v-btn>
          <v-btn
            color="warning"
            @click="cancelDraft(); showCancelDialog = false;"
          >
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
  import VJsf from '@koumoul/vjsf/lib/VJsf.js'
  import '@koumoul/vjsf/dist/main.css'
  import 'iframe-resizer/js/iframeResizer'
  import VIframe from '@koumoul/v-iframe'
  import eventBus from '~/event-bus'

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
    components: { VJsf, VIframe },
    data() {
      return {
        showConfigIframe: false,
        showForm: false,
        prodBaseApp: null,
        showDraftPreview: true,
        showProdPreview: true,
        showDraftConfig: true,
        draftSchema: null,
        prodSchema: null,
        formValid: false,
        editConfig: null,
        editUrl: null,
        eventBus,
        showCancelDialog: false,
        baseApps: null,
        expansion: [0],
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
      },
      vjsfOptions() {
        return {
          disableAll: true,
          context: { owner: this.application.owner },
          locale: 'fr',
          rootDisplay: 'expansion-panels',
          // rootDisplay: 'tabs',
          expansionPanelsProps: {
            tile: true,
            mandatory: true,
          },
        }
      },
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
        deep: true,
      },
      editUrl() {
        this.saveDraft()
      },
      async 'application.urlDraft'() {
        await this.fetchSchemas()
        this.refreshDraftPreview()
      },
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
            applicationName: this.prodBaseApp.applicationName,
          },
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
      refreshDraftConfig() {
        this.showDraftConfig = false
        setTimeout(() => { this.showDraftConfig = true }, 1)
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
        await this.fetchConfigs()
        this.refreshDraftConfig()
      },
    },
  }
</script>

<style lang="css">
</style>
