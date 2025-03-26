<template>
  <v-container
    v-if="application"
    :fluid="display.lgAndDown.value"
    :class="display.lgAndDown.value ? 'pa-0' : ''"
  >
    <v-row :class="display.lgAndDown.value ? 'ma-0' : ''">
      <v-col
        cols="6"
        md="7"
        lg="8"
        class="pa-0"
      >
        <v-alert
          v-if="!!application.errorMessageDraft"
          type="error"
          border="start"
          variant="outlined"
          :text="typeof application.errorMessageDraft === 'string' ? application.errorMessageDraft : application.errorMessageDraft.message"
          class="ma-4"
        />
        <d-frame
          v-else
          height="100vh"
          resize="no"
          :src="applicationLink + '?embed=true&draft=true'"
          :reload="reloadDraftPreview"
        />
      </v-col>
      <v-col
        cols="6"
        md="5"
        lg="4"
        class="pa-0"
      >
        <v-form
          v-if="draftSchema && editConfig"
          v-model="formValid"
        >
          <v-sheet
            class="pa-4"
            color="rgb(0,0,0,0)"
            style="overflow-y: auto; overflow-x:hidden;"
            :max-height="windowHeight - 60"
          >
            <v-select
              v-if="availableVersions"
              :model-value="editUrl"
              :disabled="!canWriteConfig"
              :loading="!availableVersions"
              :items="availableVersions"
              :item-title="(baseApp => `${baseApp.title} (${baseApp.version})`)"
              item-value="url"
              :label="t('changeVersion')"
              @update:model-value="patch({urlDraft: $event})"
            />

            <v-checkbox
              v-if="application.owner?.department"
              v-model="showFullOrg"
              :label="`Voir les sources de données de l'organisation ${application.owner.name} entière`"
            />
            <vjsf
              v-if="vjsfOptions"
              v-model="editConfig"
              :schema="draftSchema"
              :options="vjsfOptions"
              @update:model-value="saveDraft()"
            />
          </v-sheet>

          <v-row class="mt-3 ml-0 mr-3">
            <v-spacer />
            <v-dialog max-width="500">
              <template #activator="{ props }">
                <v-btn
                  :disabled="!hasDraft"
                  color="warning"
                  variant="flat"
                  v-bind="props"
                >
                  {{ t('cancel') }}
                </v-btn>
              </template>
              <template #default="{ isActive }">
                <v-card>
                  <v-card-title
                    :title="t('removeDraft')"
                    primary-title
                  />
                  <v-card-text>
                    <v-alert
                      :title="t('removeDraftWarning')"
                      type="warning"
                    />
                  </v-card-text>
                  <v-card-actions>
                    <v-spacer />
                    <v-btn
                      @click="isActive.value = false"
                    >
                      {{ t('cancel') }}
                    </v-btn>
                    <v-btn
                      variant="elevated"
                      color="warning"
                      @click="cancelDraft(); isActive.value = false;"
                    >
                      {{ t('confirm') }}
                    </v-btn>
                  </v-card-actions>
                </v-card>
              </template>
            </v-dialog>

            <v-btn
              :disabled="hasModification || !hasDraft || !!application.errorMessageDraft"
              color="accent"
              class="ml-2"
              @click="validateDraft"
            >
              {{ t('validate') }}
            </v-btn>
            <v-spacer />
          </v-row>
        </v-form>
      </v-col>
    </v-row>
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
import Vjsf, { type Options as VjsfOptions } from '@koumoul/vjsf'
import { v2compat } from '@koumoul/vjsf/compat/v2'
import { clone } from '@json-layout/core'
import { type AppConfig } from '#api/types'
import { VForm } from 'vuetify/components'

const display = useDisplay()
const { sendUiNotif } = useUiNotif()
const { t } = useI18n()

const { roDataset } = defineProps({
  roDataset: { type: Boolean, default: false }
})

const { application, applicationLink, patch, canWriteConfig, configFetch, configDraftFetch, configDraft, writeConfig, writeConfigDraft, cancelConfigDraft } = useApplicationStore()
const { availableVersions } = useApplicationVersions()
useApplicationWatch('draft-error')

if (!configFetch.initialized.value) configFetch.refresh()
if (!configDraftFetch.initialized.value) configDraftFetch.refresh()

const editUrl = computed(() => application.value?.urlDraft || application.value?.url)
const editConfig = ref<AppConfig | null>(null)
watch(configDraft, (config) => { editConfig.value = config })
// return true if some local changes were not yet synced with the server
const hasModification = computed(() => {
  if (configDraft.value !== editConfig.value) return true // shallom comparison is ok as vjsf returns immutable objects
  if (application.value?.urlDraft && editUrl.value !== application.value.urlDraft) return true
  return false
})
const hasDraft = computed(() => application.value?.status === 'configured-draft')

const { height: windowHeight } = useWindowSize()

const showForm = ref(false)
const draftSchema = ref<any>()
const schemaUrl = computed(() => editUrl.value && (editUrl.value + 'config-schema.json'))
const schemaFetch = useFetch<any>(schemaUrl)
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
    const datasetsAllOf = schema.allOf.find((a: any) => a.properties && a.properties.datasets)
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
  if (!schema.layout?.comp) schema.layout = 'expansion-panels'
  return v2compat(schema)
}

const reloadDraftPreview = ref(0)
const formValid = ref(false)
const showFullOrg = ref(false)

const vjsfOptions = computed<VjsfOptions | null>(() => {
  if (!application.value) return null
  const owner = application.value.owner
  let ownerFilter = `${owner.type}:${owner.id}`
  if (owner.department && !showFullOrg.value) ownerFilter += ':' + owner.department
  const datasetFilter = `owner=${ownerFilter}`
  const remoteServiceFilter = `privateAccess=${ownerFilter}`
  return {
    titleDepth: 4,
    density: 'comfortable',
    locale: 'fr',
    fetchBaseURL: $sitePath + '/data-fair/',
    context: { owner: application.value?.owner, ownerFilter, datasetFilter, remoteServiceFilter, attachments: application.value?.attachments },
    readOnly: !canWriteConfig.value,
    updateOn: 'blur',
    initialValidation: 'always',
  }
})

const saveDraft = async () => {
  if (!canWriteConfig.value || !formValid.value || !editConfig.value) return
  await writeConfigDraft(editConfig.value)
  reloadDraftPreview.value++
}

const cancelDraft = async () => {
  if (!canWriteConfig.value) return
  await patch({ urlDraft: application.value?.url })
  await cancelConfigDraft()
  reloadDraftPreview.value++
}

const validateDraft = async () => {
  if (!canWriteConfig.value || !configDraft.value) return
  await patch({ url: application.value?.urlDraft, urlDraft: '' })
  await writeConfig(configDraft.value)
  reloadDraftPreview.value++
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
    vjsfOptions () {
      const owner = this.application.owner
      let ownerFilter = `${owner.type}:${owner.id}`
      if (owner.department && !this.showFullOrg) ownerFilter += ':' + owner.department
      const datasetFilter = `owner=${ownerFilter}`
      const remoteServiceFilter = `privateAccess=${ownerFilter}`
      return {
        disableAll: !this.canWriteConfig,
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
    async fetchStatus () {
      const application = await this.$axios.$get(`api/v1/applications/${this.application.id}`)
      this.$store.commit('application/patch', { status: application.status, errorMessage: application.errorMessage, errorMessageDraft: application.errorMessageDraft })
    },
    async validateDraft (e) {
      e.preventDefault()
      if (!this.canWriteConfig) return
      this.patchAndCommit({ url: this.application.urlDraft })
      await this.writeConfig(this.configDraft)
      this.fetchStatus()
      this.fetchProdBaseApp()
    },
    async cancelDraft () {
      if (!this.canWriteConfig) return
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
