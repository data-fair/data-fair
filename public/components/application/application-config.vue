<template lang="html">
  <v-container fluid>
    <no-ssr>
      <v-row>
        <v-col
          cols="12"
          sm="6"
          md="7"
          xl="8"
          class="pa-0"
          style="position:relative;"
        >
          <v-col
            style="position:sticky;top:50px;"
            class="pr-0"
          >
            <v-alert
              v-if="!!application.errorMessageDraft"
              type="error"
              border="left"
              outlined
            >
              <p
                class="mb-0"
                v-html="application.errorMessageDraft"
              />
            </v-alert>
            <v-card
              v-else
              light
              class="pa-0"
              outlined
              tile
              fixed
              :style="`max-height:${windowHeight - 74}px;overflow-y:auto;`"
            >
              <v-iframe
                v-if="showDraftPreview"
                :src="applicationLink + '?embed=true&draft=true'"
              />
            </v-card>
          </v-col>
        </v-col>
        <v-col
          cols="12"
          sm="6"
          md="5"
          xl="4"
        >
          <v-select
            v-model="editUrl"
            :disabled="!can('writeConfig')"
            :loading="!availableVersions"
            :items="availableVersions"
            :item-text="(baseApp => `${baseApp.title} (${baseApp.version})`)"
            item-value="url"
            :label="$t('changeVersion')"
            @change="saveUrlDraft"
          />
          <v-form
            v-if="draftSchema && editConfig"
            ref="configForm"
            v-model="formValid"
            @submit="validateDraft"
          >
            <lazy-v-jsf
              v-model="editConfig"
              :schema="draftSchema"
              :options="vjsfOptions"
              @change="saveDraft"
            />
            <v-row class="mt-3 mb-0">
              <v-spacer />
              <v-btn
                v-t="'cancel'"
                :disabled="!hasDraft"
                color="warning"
                depressed
                @click="showCancelDialog = true"
              />
              <v-btn
                v-t="'validate'"
                :disabled="hasModification || !hasDraft || !!application.errorMessageDraft"
                color="accent"
                class="ml-2 mr-3"
                type="submit"
              />
            </v-row>
          </v-form>
        </v-col>
      </v-row>

      <v-dialog
        v-model="showCancelDialog"
        max-width="500px"
      >
        <v-card outlined>
          <v-card-title
            v-t="'removeDraft'"
            primary-title
          />
          <v-card-text>
            <v-alert
              v-t="'removeDraftWarning'"
              :value="true"
              type="error"
            />
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn
              v-t="'cancel'"
              text
              @click="showCancelDialog = false"
            />
            <v-btn
              v-t="'confirm'"
              color="warning"
              @click="cancelDraft(); showCancelDialog = false;"
            />
          </v-card-actions>
        </v-card>
      </v-dialog>
    </no-ssr>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  validatedError: Erreur dans la <b>version validée</b>
  changeVersion: Changer de version
  validate: Valider
  cancel: Annuler
  confirm: Confirmer
  removeDraft: Effacer le brouillon
  removeDraftWarning: Attention ! Le brouillon sera perdu et l'application reviendra à son état validé précédent.
en:
  validatedError: Error in the <b>validated version</b>
  changeVersion: Change version
  validate: Validate
  cancel: Cancel
  confirm: Confirm
  removeDraft: Remove draft
  removeDraftWarning: Warning ! The draft will be lost and the application will get back to its previously validated state.
</i18n>

<script>
import { mapState, mapActions, mapGetters } from 'vuex'
import dotProp from 'dot-prop'
import 'iframe-resizer/js/iframeResizer'
import VIframe from '@koumoul/v-iframe'
import eventBus from '~/event-bus'

export default {
  components: { VIframe },
  props: ['roDataset'],
  data () {
    return {
      showConfigIframe: false,
      showForm: false,
      showDraftPreview: true,
      showProdPreview: true,
      showDraftConfig: true,
      draftSchema: null,
      formValid: false,
      editConfig: null,
      editUrl: null,
      eventBus,
      showCancelDialog: false,
      expansion: [0]
    }
  },
  computed: {
    ...mapState('application', ['application', 'config', 'configDraft', 'prodBaseApp']),
    ...mapGetters('application', ['applicationLink', 'can', 'availableVersions']),
    height () {
      return window.innerHeight
    },
    hasModification () {
      if (JSON.stringify(this.editConfig) !== JSON.stringify(this.configDraft)) return true
      if (this.application.urlDraft) {
        return this.editUrl !== this.application.urlDraft
      }
      return false
    },
    hasDraft () {
      // (JSON.stringify(this.config) !== JSON.stringify(this.configDraft) || (this.application.urlDraft && this.application.urlDraft !== this.application.url)
      return this.application.status === 'configured-draft'
    },
    configClone () {
      return JSON.parse(JSON.stringify(this.config))
    },
    iframeHeight () {
      return Math.max(300, Math.min(this.height - 100, 450))
    },
    vjsfOptions () {
      const owner = this.application.owner
      let ownerFilter = `${owner.type}:${owner.id}`
      if (owner.department) ownerFilter += ':' + owner.department
      const datasetFilter = `owner=${ownerFilter}`
      const remoteServiceFilter = `privateAccess=${ownerFilter}`
      return {
        disableAll: !this.can('writeConfig'),
        context: { owner, ownerFilter, datasetFilter, remoteServiceFilter },
        locale: 'fr',
        rootDisplay: 'expansion-panels',
        // rootDisplay: 'tabs',
        expansionPanelsProps: {
          value: 0,
          hover: true
        },
        dialogProps: {
          maxWidth: 500,
          overlayOpacity: 0 // better when inside an iframe
        },
        arrayItemCardProps: { outlined: true, tile: true },
        dialogCardProps: { outlined: true }
      }
    }
  },
  watch: {
    configDraft () {
      this.refreshDraftPreview()
    },
    config () {
      this.refreshProdPreview()
    }
  },
  async created () {
    await this.fetchConfigs()
    await this.fetchSchema()
    this.postMessageHandler = msg => {
      if (msg.data.type === 'set-config') {
        this.editConfig = dotProp.set({ ...this.editConfig }, msg.data.content.field, msg.data.content.value)
        this.saveDraft()
      }
    }
    window.addEventListener('message', this.postMessageHandler)
  },
  destroyed () {
    window.removeEventListener('message', this.postMessageHandler)
  },
  methods: {
    ...mapActions('application', ['readConfig', 'writeConfig', 'readConfigDraft', 'writeConfigDraft', 'cancelConfigDraft', 'patchAndCommit', 'fetchProdBaseApp']),
    async fetchConfigs () {
      this.editUrl = this.application.urlDraft || this.application.url
      this.editConfig = JSON.parse(JSON.stringify(await this.readConfigDraft()))
    },
    // make at least 1 dataset required
    // this should be done by each application, but for easier compatibility we do it globally here
    completeSchema (schema) {
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
        if (this.roDataset) {
          datasetsProp.readOnly = true
        }

        const fixFromUrl = (fromUrl) => {
          return fromUrl.replace('owner={context.owner.type}:{context.owner.id}', '{context.datasetFilter}')
        }
        // manage retro-compatibility of use of "context.owner" to "context.datasetsFilter"
        if (datasetsProp['x-fromUrl']) datasetsProp['x-fromUrl'] = fixFromUrl(datasetsProp['x-fromUrl'])
        if (datasetsProp.items['x-fromUrl']) datasetsProp.items['x-fromUrl'] = fixFromUrl(datasetsProp.items['x-fromUrl'])
        if (Array.isArray(datasetsProp.items)) {
          for (const item of datasetsProp.items) {
            if (item['x-fromUrl']) item['x-fromUrl'] = fixFromUrl(item['x-fromUrl'])
          }
        }
      }
    },
    async fetchSchema () {
      this.draftSchema = null

      // Only try the deprecated iframe mode, if config schema is not found
      const draftSchemaUrl = this.editUrl + 'config-schema.json'
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
    },
    refreshDraftConfig () {
      this.showDraftConfig = false
      setTimeout(() => { this.showDraftConfig = true }, 1)
    },
    refreshDraftPreview () {
      this.showDraftPreview = false
      setTimeout(() => { this.showDraftPreview = true }, 1)
    },
    refreshProdPreview () {
      this.showProdPreview = false
      setTimeout(() => { this.showProdPreview = true }, 1)
    },
    async fetchStatus () {
      const application = await this.$axios.$get(`api/v1/applications/${this.application.id}`)
      this.$store.commit('application/patch', { status: application.status, errorMessage: application.errorMessage, errorMessageDraft: application.errorMessageDraft })
    },
    async saveDraft () {
      if (!this.can('writeConfig')) return
      if (this.$refs.configForm && !this.$refs.configForm.validate()) return
      await this.writeConfigDraft(this.editConfig)
      await this.fetchStatus()
      // errors in draft app should be pushed by websocket, but to be extra safe we check after 5 seconds
      await new Promise(resolve => setTimeout(resolve, 5000))
      await this.fetchStatus()
    },
    async saveUrlDraft (e) {
      if (!this.can('writeConfig')) return
      this.patchAndCommit({ urlDraft: this.editUrl, silent: true })
      await this.fetchStatus()
      await this.fetchSchema()
      this.refreshDraftPreview()
      // errors in draft app should be pushed by websocket, but to be extra safe we check after 5 seconds
      await new Promise(resolve => setTimeout(resolve, 5000))
      await this.fetchStatus()
    },
    async validateDraft (e) {
      e.preventDefault()
      if (!this.can('writeConfig')) return
      this.patchAndCommit({ url: this.application.urlDraft })
      await this.writeConfig(this.configDraft)
      this.fetchStatus()
      this.fetchProdBaseApp()
    },
    async cancelDraft () {
      if (!this.can('writeConfig')) return
      this.patchAndCommit({ urlDraft: this.application.url, silent: true })
      await this.cancelConfigDraft()
      await this.fetchConfigs()
      this.refreshDraftConfig()
      this.fetchStatus()
    }
  }
}
</script>

<style lang="css">
</style>
