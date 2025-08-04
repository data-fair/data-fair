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
          ref="frame"
          height="100vh"
          resize="no"
          :src="applicationLink + '?embed=true&draft=true'"
          :reload="draftPreviewInc"
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
                      @click="cancelDraft.execute(); isActive.value = false;"
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
              @click="validateDraft.execute()"
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
import { setProperty } from 'dot-prop'
import Debug from 'debug'
// import { diff } from 'deep-object-diff'

const debug = Debug('application-config')

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

const baseAppDraft = computed(() => {
  if (!application.value) return null
  return (application.value.baseAppDraft && Object.keys(application.value.baseAppDraft).length)
    ? application.value.baseAppDraft
    : application.value.baseApp
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
  // debug('save draft', diff(configDraft.value ?? {}, editConfig.value))
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
    console.error('try to cancel draft but application.url is not defined')
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
