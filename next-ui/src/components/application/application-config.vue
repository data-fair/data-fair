<template>
  <v-container
    v-if="application"
    :fluid="display.lgAndDown.value"
  >
    <v-row>
      <v-col
        cols="6"
        md="7"
        lg="8"
        class="pa-0"
      >
        <v-col>
          {{ iframeHeight }} - {{ configFetch.data.value }}
          <v-alert
            v-if="!!application.errorMessageDraft"
            type="error"
            border="start"
            variant="outlined"
          >
            <p
              class="mb-0"
              v-text="application.errorMessageDraft"
            />
          </v-alert>
          <v-sheet
            v-else
            light
            class="pa-2"
            border
            tile
            :style="`max-height:${windowHeight - 74}px;overflow-y:auto;`"
          >
            <d-frame
              v-if="showDraftPreview"
              :aspect-ratio="4/3"
              :src="applicationLink + '?embed=true&draft=true'"
            />
          </v-sheet>
        </v-col>
      </v-col>
      <v-col
        cols="6"
        md="5"
        lg="4"
        class="pa-0"
      >
        <v-form
          v-if="draftSchema && editConfig"
          ref="configForm"
          v-model="formValid"
          @submit="validateDraft"
        >
          <v-sheet
            light
            class="pa-2"
            :style="`max-height:${windowHeight - 110}px;overflow-y:auto;scrollbar-gutter: stable;`"
          >
            <v-select
              v-model="editUrl"
              :disabled="!can('writeConfig')"
              :loading="!availableVersions"
              :items="availableVersions"
              :item-title="(baseApp => `${baseApp.title} (${baseApp.version})`)"
              item-value="url"
              :label="$t('changeVersion')"
              @update:model-value="saveUrlDraft"
            />

            <v-checkbox
              v-if="application.owner?.department"
              v-model="showFullOrg"
              :label="`Voir les sources de données de l'organisation ${application.owner.name} entière`"
            />

            <lazy-v-jsf
              :key="`vjsf-${showFullOrg}`"
              v-model="editConfig"
              :schema="draftSchema"
              :options="vjsfOptions"
              @change="saveDraft"
            />
          </v-sheet>
          <v-row class="mt-3 ml-0 mr-3">
            <v-spacer />
            <v-btn
              v-t="'cancel'"
              :disabled="!hasDraft"
              color="warning"
              variant="flat"
              @click="showCancelDialog = true"
            />
            <v-btn
              v-t="'validate'"
              :disabled="hasModification || !hasDraft || !!application.errorMessageDraft"
              color="accent"
              class="ml-2"
              type="submit"
            />
            <v-spacer />
          </v-row>
        </v-form>
      </v-col>
    </v-row>

    <v-dialog
      v-model="showCancelDialog"
      max-width="500px"
    >
      <v-card border>
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
            variant="text"
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
  </v-container>
</template>

<i18n lang="yaml">
fr:
  changeVersion: Changer de version
  validate: Valider
  cancel: Annuler
  confirm: Confirmer
  removeDraft: Effacer le brouillon
  removeDraftWarning: Attention ! Le brouillon sera perdu et l'application reviendra à son état validé précédent.
en:
  changeVersion: Change version
  validate: Validate
  cancel: Cancel
  confirm: Confirm
  removeDraft: Remove draft
  removeDraftWarning: Warning ! The draft will be lost and the application will get back to its previously validated state.
</i18n>

<script lang="ts" setup>
import { useWindowSize } from '@vueuse/core'
import { useDisplay } from 'vuetify'
import '@data-fair/frame/lib/d-frame.js'
import { v2compat } from '@koumoul/vjsf/compat/v2'
import { clone } from '@json-layout/core'

const display = useDisplay()
const { sendUiNotif } = useUiNotif()

const { roDataset } = defineProps({
  roDataset: { type: Boolean, default: false }
})

const { id, application, applicationLink } = useApplicationStore()
const configFetch = useFetch<AppConfig>($apiPath + `/applications/${id}/configuration`, {})

const { height: windowHeight } = useWindowSize()
const iframeHeight = computed(() => Math.max(300, Math.min(windowHeight.value - 100, 450)))

const showForm = ref(false)
const showDraftPreview = ref(true)

const editUrl = ref<string>()
watch(() => application.value?.urlDraft, (url) => {
  editUrl.value = url || application.value?.url
})

const draftSchema = ref<any>()
const schemaFetch = useFetch<any>(() => editUrl.value + 'config-schema.json')
watch(schemaFetch.data, (schema) => {
  if (schema) {
    if (typeof schema !== 'object') {
      sendUiNotif({ type: 'error', msg: 'Schema fetched is not a valid JSON' })
    } else {
      draftSchema.value = completeSchema(clone(schema))
      showForm.value = true
    }
  }
})

const completeSchema = (schema: any) => {
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
    if (roDataset) {
      datasetsProp.readOnly = true
    }

    const fixFromUrl = (fromUrl: string) => {
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

  return v2compat(schema)
}

</script>

<!--<script>
import { mapState, mapActions, mapGetters } from 'vuex'
import { setProperty } from 'dot-prop'
import 'iframe-resizer/js/iframeResizer'
import VIframe from '@koumoul/v-iframe'
import eventBus from '~/event-bus'

export default {
  components: { VIframe },
  props: ['roDataset'],
  data () {
    return {
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
      expansion: [0],
      showFullOrg: false
    }
  },
  computed: {
    ...mapState('application', ['application', 'config', 'configDraft', 'prodBaseApp']),
    ...mapGetters('application', ['applicationLink', 'can', 'availableVersions']),
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
    vjsfOptions () {
      const owner = this.application.owner
      let ownerFilter = `${owner.type}:${owner.id}`
      if (owner.department && !this.showFullOrg) ownerFilter += ':' + owner.department
      const datasetFilter = `owner=${ownerFilter}`
      const remoteServiceFilter = `privateAccess=${ownerFilter}`
      return {
        disableAll: !this.can('writeConfig'),
        context: { owner, ownerFilter, datasetFilter, remoteServiceFilter, attachments: this.application.attachments },
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
        this.editConfig = setProperty({ ...this.editConfig }, msg.data.content.field, msg.data.content.value)
        this.saveDraft()
      }
    }
    window.addEventListener('message', this.postMessageHandler)
  },
  unmounted () {
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
        } else {
          this.completeSchema(this.draftSchema)
          // console.log(JSON.stringify(this.draftSchema, null, 1))
          this.showForm = true
        }
      } catch (error) {
        if (error.response && error.response.status === 404) {
          console.error(`Schema not found at ${draftSchemaUrl}`)
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
-->
<style lang="css">
</style>
