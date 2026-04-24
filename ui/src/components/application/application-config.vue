<template>
  <v-container
    v-if="application"
    class="pa-0"
    fluid
  >
    <v-row>
      <v-col
        cols="6"
        md="7"
        lg="8"
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
          ref="frame"
          :height="`${windowHeight - 48}px`"
          resize="no"
          :src="`${applicationLink}?d-frame=true&draft=true&primary=${theme.current.value.colors.primary}`"
          :reload="draftPreviewInc"
        />
      </v-col>

      <v-col
        cols="6"
        md="5"
        lg="4"
      >
        <v-defaults-provider :defaults="{ global: { hideDetails: 'auto' } }">
          <v-form
            v-if="draftSchema"
            v-model="formValid"
          >
            <template v-if="configDraftFetch.error.value">
              <v-alert
                :text="configDraftFetch.error.value"
                type="error"
                class="ma-2"
                variant="outlined"
              />
            </template>
            <v-sheet
              v-else-if="editConfig"
              class="pa-4"
              color="rgb(0,0,0,0)"
              style="overflow-y: auto; overflow-x: hidden; scrollbar-gutter: stable;"
              :max-height="windowHeight - 110"
            >
              <v-select
                v-if="availableVersions"
                :model-value="editUrl"
                :disabled="!canWriteConfig"
                :loading="!availableVersions"
                :label="t('changeVersion')"
                :items="availableVersions"
                :item-title="(baseApp => `${baseApp.title} (${baseApp.version})`)"
                item-value="url"
                class="mb-2"
                @update:model-value="patch({urlDraft: $event})"
              />

              <v-checkbox
                v-if="application.owner?.department"
                v-model="showFullOrg"
                :label="`Voir les sources de données de l'organisation ${application.owner.name} entière`"
              />
              <div
                v-if="canWriteConfig"
                class="d-flex justify-end mb-1"
              >
                <df-agent-chat-action
                  action-id="configure-application"
                  :visible-prompt="t('configurePrompt')"
                  :hidden-context="configureContext"
                  :title="t('configurePrompt')"
                />
              </div>
              <vjsf
                v-if="vjsfOptions"
                v-model="editConfig"
                :schema="draftSchema"
                :options="vjsfOptions"
                :data-title="t('appConfig')"
                prefix-name="appConfig_"
                :sub-agent="true"
                @update:model-value="saveDraft()"
              />
            </v-sheet>

            <div class="d-flex justify-center mt-3 ga-2">
              <confirm-menu
                :label="t('cancel')"
                :title="t('removeDraft')"
                :text="t('removeDraftWarning')"
                alert="warning"
                yes-color="warning"
                :btn-props="{ color: 'warning', variant: 'flat', disabled: !hasDraft }"
                @confirm="cancelDraft.execute()"
              />
              <v-btn
                v-if="editConfig"
                :disabled="hasModification || !hasDraft || !!application.errorMessageDraft"
                color="accent"
                @click="validateDraft.execute()"
              >
                {{ t('validate') }}
              </v-btn>
            </div>
          </v-form>
        </v-defaults-provider>
      </v-col>
    </v-row>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  changeVersion: Changer de version
  validate: Valider
  cancel: Annuler
  removeDraft: Effacer le brouillon
  removeDraftWarning: Attention ! Le brouillon sera perdu et l'application reviendra à son état validé précédent.
  appConfig: Configuration d'application
  configurePrompt: Aide-moi à configurer cette application
en:
  changeVersion: Change version
  validate: Validate
  cancel: Cancel
  removeDraft: Remove draft
  removeDraftWarning: Warning ! The draft will be lost and the application will get back to its previously validated state.
  appConfig: Application configuration
  configurePrompt: Help me configure this application
</i18n>

<script setup lang="ts">
import { useWindowSize } from '@vueuse/core'
import { useTheme } from 'vuetify'
import '@data-fair/frame/lib/d-frame.js'
import { DfAgentChatAction } from '@data-fair/lib-vuetify-agents'
import { type Options as VjsfOptions } from '@koumoul/vjsf'
import Vjsf from '@koumoul/vjsf/webmcp'
import { v2compat } from '@koumoul/vjsf/compat/v2'
import { clone } from '@json-layout/core'
import { type AppConfig } from '#api/types'
import { setProperty } from 'dot-prop'
import Debug from 'debug'

const debug = Debug('application-config')

const theme = useTheme()
const { sendUiNotif } = useUiNotif()
const { t } = useI18n()
const { height: windowHeight } = useWindowSize()

const { roDataset } = defineProps({
  roDataset: { type: Boolean, default: false }
})

const { application, applicationLink, patch, canWriteConfig, configFetch, configDraftFetch, configDraft, writeConfig, writeConfigDraft, cancelConfigDraft, baseAppDraft } = useApplicationStore()
const { availableVersions } = useApplicationVersions()
useApplicationWatch('draft-error')

if (!configFetch.initialized.value) configFetch.refresh()
if (!configDraftFetch.initialized.value) configDraftFetch.refresh()

const configureContext = computed(() => {
  const baseApp = baseAppDraft.value
  const lines = [
    'Use the subagent tool appConfig_form to help the user configure the current application.',
    'Start the session by asking the user what they want to achieve.',
  ]
  if (baseApp?.title) lines.push(`The application model is "${baseApp.title}".`)
  if (baseApp?.description) lines.push(`Application model description: ${baseApp.description}`)
  if (baseApp?.category) lines.push(`Category: ${baseApp.category}`)
  if (application.value?.title) lines.push(`The application title is "${application.value.title}".`)
  return lines.join(' ')
})

const editUrl = computed(() => application.value?.urlDraft || application.value?.url)
const editConfig = ref<AppConfig | null>(null)
watch(configDraft, (config) => {
  debug('update editConfig from stored draft', toRaw(editConfig.value) === toRaw(config))
  editConfig.value = config
})
// return true if some local changes were not yet synced with the server
const hasModification = computed(() => {
  if (toRaw(configDraft.value) !== toRaw(editConfig.value)) return true // shallow comparison is ok as vjsf returns immutable objects
  if (application.value?.urlDraft && editUrl.value !== application.value.urlDraft) return true
  return false
})
const hasDraft = computed(() => application.value?.status === 'configured-draft')

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
  debug('complete schema for vjsf')
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
  if (baseAppDraft.value?.meta?.['df:vjsf'] === '3') {
    return schema
  } else {
    return v2compat(schema)
  }
}

const draftPreviewInc = ref(0)
const formValid = ref(false)
const showFullOrg = ref(false)
const frame = useTemplateRef('frame')

const vjsfOptions = computed<VjsfOptions | null>(() => {
  if (!application.value) return null
  const owner = application.value.owner
  let ownerFilter = `${owner.type}:${owner.id}`
  if (owner.department && !showFullOrg.value) ownerFilter += ':' + owner.department
  const datasetFilter = `owner=${ownerFilter}`
  const remoteServiceFilter = `privateAccess=${ownerFilter}`
  debug('compute vjsf options')
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

// TODO: editUrl is not saved yet as urlDraft ?
const saveDraft = async () => {
  if (!canWriteConfig.value || !formValid.value || !editConfig.value) return
  if (toRaw(configDraft.value) === toRaw(editConfig.value)) return
  const wasInError = !!application.value?.errorMessageDraft
  await writeConfigDraft(editConfig.value)
  if (baseAppDraft.value?.meta?.['df:sync-config'] === 'true') {
    debug('send set-config message to app', editConfig.value)
    // @ts-ignore
    frame.value?.postMessageToChild({ type: 'set-config', content: toRaw(editConfig.value) })
  } else if (!wasInError) {
    debug('force draft preview refresh')
    draftPreviewInc.value++
  }
}

const onMessage = async (msg: any) => {
  // @ts-ignore
  if (frame.value?.iframeElement?.contentWindow === msg.source && msg.data.type === 'set-config') {
    debug('received set-config message from app', msg.data)
    editConfig.value = setProperty(JSON.parse(JSON.stringify(toRaw(editConfig.value))), msg.data.content.field, msg.data.content.value)
    saveDraft()
  }
}
window.addEventListener('message', onMessage)
onUnmounted(() => window.removeEventListener('message', onMessage))

const cancelDraft = useAsyncAction(async () => {
  if (!canWriteConfig.value) return
  if (!application.value?.url) {
    throw new Error('échec de l\'annulation du brouillon')
  }
  await patch({ urlDraft: application.value?.url })
  await cancelConfigDraft()
  draftPreviewInc.value++
})

const validateDraft = useAsyncAction(async () => {
  if (!canWriteConfig.value || !configDraft.value) return
  if (application.value?.urlDraft) {
    await patch({ url: application.value?.urlDraft, urlDraft: '' })
  }
  await writeConfig(configDraft.value)
  draftPreviewInc.value++
})

</script>

<style lang="css">
</style>
