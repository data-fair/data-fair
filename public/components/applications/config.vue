<template lang="html">
  <v-container fluid class="pa-0">
    <v-alert
      v-if="!!application.errorMessage"
      type="error"
      border="left"
    >
      <p>Erreur dans la <b>version validée</b></p>
      <p class="mb-0" v-html="application.errorMessage" />
    </v-alert>
    <no-ssr>
      <v-row>
        <v-col
          cols="12"
          sm="6"
          md="4"
        >
          <v-alert
            v-if="!!application.errorMessageDraft"
            type="warning"
            border="left"
            outlined
          >
            <p class="mb-0" v-html="application.errorMessageDraft" />
          </v-alert>
          <v-select
            v-model="editUrl"
            :loading="!baseApps"
            :items="baseApps"
            :item-text="(baseApp => `${baseApp.title} (${baseApp.version})`)"
            item-value="url"
            label="Changer de version"
          />
          <v-form
            v-if="draftSchema && editConfig"
            ref="configForm"
            v-model="formValid"
            @submit="validateDraft"
          >
            <!--{{ editConfig }}-->
            <v-jsf
              v-model="editConfig"
              :schema="draftSchema"
              :options="vjsfOptions"
              @error="error => eventBus.$emit('notification', {error})"
            />
            <v-row class="mt-3">
              <v-spacer />
              <v-btn
                :disabled="hasModification || !hasDraft || !!application.errorMessageDraft"
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
          <v-card
            class="pa-2"
            outlined
            :style="!!application.errorMessageDraft ? `border-color: ${$vuetify.theme.themes.light.warning};` : ''"
          >
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
    </no-ssr>
  </v-container>
</template>

<script>
  import debounce from 'debounce'
  import { mapState, mapActions, mapGetters } from 'vuex'
  import VJsf from '@koumoul/vjsf/lib/VJsf.js'
  import '@koumoul/vjsf/lib/deps/third-party.js'
  import '@koumoul/vjsf/dist/main.css'
  import 'iframe-resizer/js/iframeResizer'
  import VIframe from '@koumoul/v-iframe'
  import eventBus from '~/event-bus'

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
        // (JSON.stringify(this.config) !== JSON.stringify(this.configDraft) || (this.application.urlDraft && this.application.urlDraft !== this.application.url)
        return this.application.status === 'configured-draft'
      },
      configClone() {
        return JSON.parse(JSON.stringify(this.config))
      },
      iframeHeight() {
        return Math.max(300, Math.min(this.height - 100, 450))
      },
      vjsfOptions() {
        return {
          disableAll: !this.can('writeConfig'),
          context: { owner: this.application.owner },
          locale: 'fr',
          rootDisplay: 'expansion-panels',
          // rootDisplay: 'tabs',
          expansionPanelsProps: {
            value: 0,
            hover: true,
          },
          dialogProps: {
            maxWidth: 500,
            overlayOpacity: 0, // better when inside an iframe
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
        this.saveUrlDraft()
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
      ...mapActions('application', ['readConfig', 'writeConfig', 'readConfigDraft', 'writeConfigDraft', 'cancelConfigDraft', 'patchAndCommit']),
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
      },
      // make at least 1 dataset required
      // this should be done by each application, but for easier compatibility we do it globally here
      completeSchema(schema) {
        let datasetsProp
        if (schema.definitions && schema.definitions.datasets) {
          datasetsProp = schema.definitions.datasets
        } else if (schema.properties && schema.properties.datasets) {
          datasetsProp = schema.properties && schema.properties.datasets
        } else if (schema.allOf) {
          const datasetsAllOf = schema.allOf.find(a => a.properties && a.properties.datasets)
          if (datasetsAllOf) datasetsProp = datasetsAllOf.properties.datasets
        }
        if (!datasetsProp) {
          console.error('dit not find a "datasets" property in schema')
        } else {
          datasetsProp.minItems = 1
        }
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
            this.completeSchema(this.draftSchema)
            // console.log(JSON.stringify(this.draftSchema, null, 1))
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
      async fetchStatus() {
        const application = await this.$axios.$get(`api/v1/applications/${this.application.id}`)
        this.$store.commit('application/patch', { status: application.status, errorMessage: application.errorMessage, errorMessageDraft: application.errorMessageDraft })
      },
      saveUrlDraft() {
        this.patchAndCommit({ urlDraft: this.editUrl, silent: true })
      },
      async saveDraft(e) {
        if (JSON.stringify(this.editConfig) === JSON.stringify(this.application.configurationDraft)) return
        this.$refs.configForm && this.$refs.configForm.validate()
        if (!this.formValid) return
        await this.writeConfigDraft(this.editConfig)
        await this.fetchStatus()
        // errors in draft app should be pushed by websocket, but to be extra safe we check after 5 seconds
        await new Promise(resolve => setTimeout(resolve, 5000))
        await this.fetchStatus()
      },
      async validateDraft(e) {
        e.preventDefault()
        this.patchAndCommit({ url: this.application.urlDraft })
        await this.writeConfig(this.configDraft)
        this.fetchStatus()
      },
      async cancelDraft() {
        this.patchAndCommit({ urlDraft: this.application.url, silent: true })
        await this.cancelConfigDraft()
        await this.fetchConfigs()
        this.refreshDraftConfig()
        this.fetchStatus()
      },
    },
  }
</script>

<style lang="css">
</style>
