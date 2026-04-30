<template>
  <v-container
    class="pa-0"
    fluid
  >
    <v-stepper
      v-model="step"
      class="bg-background"
      flat
    >
      <v-stepper-header class="bg-surface">
        <v-stepper-item
          value="type"
          :complete="!!datasetType"
          :editable="!!datasetType"
          :color="step === 'type' ? 'primary' : ''"
          :icon="mdiShape"
          :title="t('stepType')"
          :subtitle="datasetType ? t('type_' + datasetType) : undefined"
        />
        <template v-if="hasInitFromStep">
          <v-divider />
          <v-stepper-item
            value="init"
            :complete="initStepComplete"
            :editable="initStepComplete"
            :color="step === 'init' ? 'primary' : ''"
            :icon="mdiContentCopy"
            :title="t('stepInit')"
          />
        </template>
        <v-divider />
        <v-stepper-item
          value="params"
          :complete="paramsStepComplete"
          :editable="paramsValid"
          :color="step === 'params' ? 'primary' : ''"
          :icon="mdiCog"
          :title="t('stepParams')"
          :subtitle="paramsSubtitle"
        />
        <v-divider />
        <v-stepper-item
          value="action"
          :editable="paramsValid"
          :color="step === 'action' ? 'primary' : ''"
          :icon="mdiCheckAll"
          :title="t('stepAction')"
        />

        <df-agent-chat-action
          v-if="showAgentChat"
          action-id="help-create-dataset"
          :visible-prompt="t('helpCreatePrompt')"
          :hidden-context="createDatasetContext"
          :btn-props="{ text: t('helpCreatePrompt'), class: 'mr-4' }"
          :title="t('helpCreatePrompt')"
        />
      </v-stepper-header>

      <v-stepper-window>
        <!-- Step: Type selection -->
        <v-stepper-window-item value="type">
          <p class="text-body-large mb-4">
            {{ t('choseType') }}
          </p>
          <v-row density="comfortable">
            <v-col
              v-for="type of datasetTypes"
              :key="type"
              cols="12"
              sm="6"
            >
              <v-card
                class="h-100"
                :color="datasetType === type ? 'primary' : ''"
                @click="selectType(type)"
              >
                <v-card-title>
                  <span :class="datasetType !== type ? 'text-primary' : ''">
                    <v-icon
                      class="mr-2"
                      :icon="datasetTypeIcons[type]"
                    />
                    {{ t('type_' + type) }}
                  </span>
                </v-card-title>
                <v-card-text>
                  {{ t('type_desc_' + type) }}
                </v-card-text>
              </v-card>
            </v-col>
          </v-row>
        </v-stepper-window-item>

        <!-- Step: Init from (only for file/rest) -->
        <v-stepper-window-item
          v-if="hasInitFromStep"
          value="init"
        >
          <v-alert
            type="info"
            variant="outlined"
            density="compact"
            max-width="500"
            class="mb-4"
          >
            {{ t('optionalStep') }}
          </v-alert>

          <dataset-init-from
            v-model="initFrom"
            v-model:source-title="initFromSourceTitle"
            :allow-data="datasetType === 'file' || datasetType === 'rest'"
          />
        </v-stepper-window-item>

        <!-- Step: Type-specific parameters -->
        <v-stepper-window-item value="params">
          <!-- FILE params -->
          <template v-if="datasetType === 'file'">
            <p class="text-body-large mb-4">
              {{ t('loadMainFile') }}
            </p>
            <v-file-input
              v-model="fileInputValue"
              :label="t('selectFile')"
              variant="outlined"
              density="compact"
              hide-details
              style="max-width: 500px;"
              prepend-icon=""
              :prepend-inner-icon="mdiPaperclip"
              :disabled="initFromData"
              @update:model-value="onFileChange"
            />

            <v-file-input
              v-if="!initFromData && !isSimple"
              v-model="attachmentsInputValue"
              :label="t('selectAttachments')"
              variant="outlined"
              density="compact"
              hide-details
              accept=".zip"
              class="mt-4"
              style="max-width: 500px;"
              prepend-icon=""
              :prepend-inner-icon="mdiZipBox"
              clearable
            />

            <v-alert
              v-if="suggestArchive"
              type="info"
              variant="outlined"
              class="mt-2 mb-2"
            >
              {{ t('suggestArchive', { name: file?.name }) }}
            </v-alert>

            <v-text-field
              v-if="!initFromData"
              v-model="fileTitle"
              :label="t('title')"
              variant="outlined"
              density="compact"
              max-width="500"
              :rules="[val => (val && val.length > 3) || t('titleTooShort')]"
              class="mt-4"
            />

            <v-checkbox
              v-if="attachments && !initFromData"
              v-model="attachmentsAsImage"
              hide-details
              :label="t('attachmentsAsImage')"
            />

            <dataset-normalize-options
              v-if="isSpreadsheet"
              v-model="normalizeOptions"
            />

            <!-- Advanced options -->
            <div
              class="text-title-small mt-4 mb-2 d-flex align-center"
              style="cursor: pointer"
              @click="showAdvanced = !showAdvanced"
            >
              {{ t('advancedOptions') }}
              <v-icon
                class="ml-1"
                :icon="showAdvanced ? mdiChevronUp : mdiChevronDown"
              />
            </div>
            <template v-if="showAdvanced">
              <v-select
                v-model="escapeKeyAlgorithm"
                :label="t('escapeKeyAlgorithm')"
                :items="escapeKeyOptions"
                variant="outlined"
                density="compact"
                clearable
                :hint="t('escapeKeyAlgorithmHint')"
                persistent-hint
                style="max-width: 500px;"
                class="mb-4"
              />
              <v-combobox
                v-if="isTextFile"
                v-model="fileEncoding"
                :label="t('encoding')"
                :items="commonEncodings"
                variant="outlined"
                density="compact"
                clearable
                :hint="t('encodingHint')"
                persistent-hint
                style="max-width: 500px;"
              />
            </template>
          </template>

          <!-- REST params -->
          <template v-if="datasetType === 'rest'">
            <v-text-field
              v-model="restTitle"
              :label="t('title')"
              class="mt-2"
              variant="outlined"
              density="compact"
              max-width="500"
              hide-details="auto"
              :rules="[val => (val && val.length > 3) || t('titleTooShort')]"
            />
            <v-checkbox
              v-model="restHistory"
              hide-details
              :label="t('history')"
            />
            <v-checkbox
              v-if="session.state.user?.adminMode"
              v-model="restLineOwnership"
              hide-details
              :label="t('lineOwnership')"
            />
            <v-checkbox
              v-model="restAttachments"
              hide-details
              :label="t('attachments')"
            />
            <v-checkbox
              v-if="restAttachments"
              v-model="restAttachmentsAsImage"
              hide-details
              :label="t('attachmentsAsImage')"
            />
          </template>

          <!-- VIRTUAL params -->
          <template v-if="datasetType === 'virtual'">
            <v-text-field
              v-model="virtualTitle"
              :label="t('title')"
              class="mt-2"
              variant="outlined"
              density="compact"
              max-width="500"
              hide-details="auto"
              :rules="[val => (val && val.length > 3) || t('titleTooShort')]"
            />
            <dataset-select
              v-model="virtualChildren"
              :extra-params="{ queryable: true }"
              :label="t('children')"
              master-data="virtualDatasets"
              max-width="500"
              class="mt-4"
              multiple
            />

            <v-checkbox
              v-model="virtualFillSchema"
              hide-details
              :label="t('virtualDatasetFill')"
            />
            <v-checkbox
              v-model="virtualInitFromDesc"
              hide-details
              :label="t('virtualDatasetInitFromDesc')"
            />
            <v-checkbox
              v-model="virtualInitFromAttachments"
              hide-details
              :label="t('virtualDatasetInitFromAttachments')"
            />
          </template>

          <!-- META ONLY params -->
          <template v-if="datasetType === 'metaOnly'">
            <v-text-field
              v-model="metaOnlyTitle"
              :label="t('title')"
              class="mt-2"
              variant="outlined"
              density="compact"
              max-width="500"
              hide-details="auto"
              :rules="[val => (val && val.length > 3) || t('titleTooShort')]"
            />
          </template>
        </v-stepper-window-item>

        <!-- Step: Action / Confirmation -->
        <v-stepper-window-item value="action">
          <df-owner-pick v-model="owner" />

          <dataset-conflicts
            v-if="step === 'action' && owner"
            v-model="conflictsOk"
            :title="effectiveTitle"
            :filename="datasetType === 'file' && file ? file.name : undefined"
            :owner="owner"
          />

          <df-ui-notif-alert
            :notif="createAction.notif.value"
            class="mt-4 mb-4"
            :alert-props="{ maxWidth: 500 }"
          />

          <!-- Upload progress for file type -->
          <v-row
            v-if="createAction.loading.value && datasetType === 'file'"
            class="mx-0 my-3"
            align="center"
          >
            <v-progress-linear
              v-model="uploadPercent"
              color="primary"
              height="20"
              rounded
              style="max-width: 500px;"
            >
              <template v-if="uploadProgress.total && uploadPercent !== undefined">
                {{ Math.floor(uploadPercent) }}% {{ t('of') }} {{ formatBytes(uploadProgress.total, locale) }}
              </template>
            </v-progress-linear>
            <v-btn
              :icon="mdiCancel"
              color="warning"
              density="compact"
              variant="text"
              class="ml-2"
              :title="t('cancel')"
              @click="cancelUpload"
            />
          </v-row>
        </v-stepper-window-item>
      </v-stepper-window>

      <v-stepper-actions
        v-if="step !== 'type'"
        :prev-text="t('back')"
        :next-text="nextButtonText"
        class="justify-start ga-2"
        @click:prev="goToPrev"
      >
        <template #next>
          <v-btn
            color="primary"
            variant="flat"
            :disabled="isNextDisabled"
            :loading="step === 'action' && createAction.loading.value"
            @click="goToNext"
          >
            {{ nextButtonText }}
          </v-btn>
        </template>
      </v-stepper-actions>
    </v-stepper>

    <v-card
      v-if="step === 'params' && datasetType === 'file'"
      class="ma-4 mt-0"
    >
      <v-card-title>{{ t('formats') }}</v-card-title>
      <dataset-file-formats />
    </v-card>
  </v-container>
</template>

<script setup lang="ts">
import { mdiAllInclusive, mdiCancel, mdiCheckAll, mdiChevronDown, mdiChevronUp, mdiCog, mdiContentCopy, mdiFileUpload, mdiInformationVariant, mdiPaperclip, mdiPictureInPictureBottomRightOutline, mdiShape, mdiZipBox } from '@mdi/js'
import axios, { type CancelTokenSource } from 'axios'
import { formatBytes } from '@data-fair/lib-vue/format/bytes.js'
import { $apiPath } from '~/context'
import { DfAgentChatAction } from '@data-fair/lib-vuetify-agents'
import { useAgentDatasetCreationTools } from '~/composables/dataset/agent-creation-tools'
import { useShowAgentChat } from '~/composables/agent/use-show-chat'
import { type AccountKeys } from '@data-fair/lib-vue/session'
import { type ListedDataset } from '~/components/dataset/select/utils'

const { t, locale } = useI18n()
const router = useRouter()
const route = useRoute<'/new-dataset'>()
const session = useSessionAuthenticated()
const breadcrumbs = useBreadcrumbs()

const showAgentChat = useShowAgentChat()
const isSimple = computed(() => route.query.simple === 'true')

breadcrumbs.receive({
  breadcrumbs: isSimple.value
    ? [{ text: t('home'), to: '/' }, { text: t('newDataset') }]
    : [{ text: t('datasets'), to: '/datasets' }, { text: t('newDataset') }]
})

// ---- Types ----
type DatasetType = 'file' | 'rest' | 'virtual' | 'metaOnly'

interface InitFrom {
  dataset: string
  parts: string[]
}

// ---- Constants ----
const allDatasetTypes: DatasetType[] = ['file', 'rest', 'virtual', 'metaOnly']
const datasetTypes = computed(() => isSimple.value ? allDatasetTypes.filter(dt => dt !== 'virtual') : allDatasetTypes)
const datasetTypeIcons: Record<DatasetType, string> = {
  file: mdiFileUpload,
  rest: mdiAllInclusive,
  virtual: mdiPictureInPictureBottomRightOutline,
  metaOnly: mdiInformationVariant
}

const commonEncodings = ['UTF-8', 'ISO-8859-1', 'Windows-1252', 'ISO-8859-15', 'US-ASCII']

const escapeKeyOptions = [
  { title: 'Slug strict', value: 'slug' },
  { title: 'Slug custom (compat-ods)', value: 'compat-ods' }
]

// ---- Step management ----
type StepName = 'type' | 'init' | 'params' | 'action'
const step = ref<StepName>('type')
const datasetType = ref<DatasetType | null>(null)

const hasInitFromStep = computed(() => datasetType.value === 'file' || datasetType.value === 'rest')
const initStepComplete = computed(() => step.value === 'params' || step.value === 'action')
const paramsStepComplete = computed(() => step.value === 'action')

function selectType (type: DatasetType) {
  datasetType.value = type
  nextTick(() => {
    if (type === 'file' || type === 'rest') {
      step.value = 'init'
    } else {
      step.value = 'params'
    }
  })
}

const isNextDisabled = computed(() => {
  if (step.value === 'init') return false
  if (step.value === 'params') return !paramsValid.value
  if (step.value === 'action') return !canCreate.value
  return false
})

const nextButtonText = computed(() => {
  if (step.value === 'init') return initFrom.value ? t('continue') : t('ignore')
  if (step.value === 'action') return datasetType.value === 'file' ? t('import') : t('createDataset')
  return t('continue')
})

function goToPrev () {
  if (step.value === 'init') step.value = 'type'
  else if (step.value === 'params') step.value = hasInitFromStep.value ? 'init' : 'type'
  else if (step.value === 'action') step.value = 'params'
}

function goToNext () {
  if (step.value === 'init') {
    onInitFromNext()
  } else if (step.value === 'params') {
    step.value = 'action'
  } else if (step.value === 'action') {
    createAction.execute()
  }
}

// ---- Init from ----
const initFrom = ref<InitFrom | null>(null)
const initFromSourceTitle = ref<string | null>(null)
const initFromData = computed(() => initFrom.value?.parts?.includes('data') ?? false)

function onInitFromNext () {
  if (initFromSourceTitle.value) {
    if (datasetType.value === 'file' && (!fileTitle.value || fileTitle.value === lastAutoFilledTitle.value)) {
      fileTitle.value = initFromSourceTitle.value
      lastAutoFilledTitle.value = initFromSourceTitle.value
    } else if (datasetType.value === 'rest' && !restTitle.value) {
      restTitle.value = initFromSourceTitle.value
    }
  }
  step.value = 'params'
}

// ---- File params ----
const fileInputValue = ref<File[]>([])
const file = ref<File | null>(null)
const attachmentsInputValue = ref<File[]>([])
const attachments = computed(() => attachmentsInputValue.value?.[0] ?? null)
const fileTitle = ref('')
const lastAutoFilledTitle = ref('')
const attachmentsAsImage = ref(false)
const showAdvanced = ref(false)
const escapeKeyAlgorithm = ref<string | null>(null)
const fileEncoding = ref<string | null>(null)

const isTextFile = computed(() => {
  if (!file.value) return false
  const name = file.value.name.toLowerCase()
  return name.endsWith('.csv') || name.endsWith('.tsv') || name.endsWith('.txt')
})

const isSpreadsheet = computed(() => {
  if (!file.value) return false
  const name = file.value.name.toLowerCase()
  return name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.ods') || name.endsWith('.fods')
})

const suggestArchive = computed(() => {
  if (!file.value) return false
  return file.value.size > 50_000_000 && /\.(csv|tsv|txt|geojson)$/i.test(file.value.name)
})

const normalizeOptions = ref<Record<string, any>>({})

function fileNameWithoutExt (name: string) {
  return name.replace(/\.[^/.]+$/, '')
}

function onFileChange (val: File | File[]) {
  if (Array.isArray(val)) {
    file.value = val[0] ?? null
  } else {
    file.value = val ?? null
  }
  if (file.value) {
    const title = fileNameWithoutExt(file.value.name)
    if (!fileTitle.value || fileTitle.value === lastAutoFilledTitle.value) {
      fileTitle.value = title
    }
    lastAutoFilledTitle.value = title
  }
}

// ---- REST params ----
const restTitle = ref('')
const restHistory = ref(false)
const restLineOwnership = ref(false)
const restAttachments = ref(false)
const restAttachmentsAsImage = ref(false)

// ---- Virtual params ----
const virtualTitle = ref('')
const virtualChildren = ref<ListedDataset[]>([])
const virtualFillSchema = ref(false)
const virtualInitFromDesc = ref(false)
const virtualInitFromAttachments = ref(false)

// ---- Meta only params ----
const metaOnlyTitle = ref('')

// ---- Owner ----
const owner = ref<AccountKeys | null>(null)

// ---- Conflicts ----
const conflictsOk = ref(false)

// ---- Computed helpers ----
const effectiveTitle = computed(() => {
  if (datasetType.value === 'file') {
    return fileTitle.value || undefined
  }
  if (datasetType.value === 'rest') return restTitle.value || undefined
  if (datasetType.value === 'virtual') return virtualTitle.value || undefined
  if (datasetType.value === 'metaOnly') return metaOnlyTitle.value || undefined
  return undefined
})

const paramsSubtitle = computed(() => {
  if (datasetType.value === 'file' && file.value) {
    return file.value.name.length > 30 ? file.value.name.slice(0, 27) + '...' : file.value.name
  }
  return undefined
})

const paramsValid = computed(() => {
  if (datasetType.value === 'file') {
    return initFromData.value || !!file.value
  }
  if (datasetType.value === 'rest') {
    return restTitle.value.length > 3
  }
  if (datasetType.value === 'virtual') {
    return virtualTitle.value.length > 3 && virtualChildren.value.length > 0
  }
  if (datasetType.value === 'metaOnly') {
    return metaOnlyTitle.value.length > 3
  }
  return false
})

const canCreate = computed(() => {
  return !createAction.loading.value && conflictsOk.value && !!owner.value
})

// ---- Agent tools ----
useAgentDatasetCreationTools(locale, {
  step,
  datasetType,
  hasInitFromStep,
  paramsValid,
  restTitle,
  restHistory,
  restAttachments,
  restAttachmentsAsImage,
  virtualTitle,
  metaOnlyTitle,
  fileTitle
})

const createDatasetContext = computed(() => {
  const lines = [
    'Help the user create a new dataset.',
    'Start by asking what kind of data they have and what they want to do with it.',
    '',
    'Based on their answer, recommend the right dataset type:',
    '- "file" for uploading CSV, Excel, GeoJSON, or other file formats',
    '- "rest" (Editable) for data that will be entered manually through forms, or via API',
    '- "virtual" for creating a combined view over existing datasets',
    '- "metaOnly" for a metadata-only record with no actual data',
    '',
    'Use select_dataset_type to set the type, then set_dataset_title and other configuration tools (set_rest_options, skip_init_from_step, advance_to_confirmation) to fill in the wizard steps.',
    '',
    'For "file" type datasets, you cannot upload the file — the user will do that manually. Focus on helping them choose the right type and set a title.',
    '',
    'Do NOT create the dataset — the user will review and click the create/import button themselves.'
  ]
  return lines.join('\n')
})

// ---- Upload progress ----
const uploadProgress = ref<{ loaded: number, total?: number }>({ loaded: 0 })
const uploadPercent = computed(() => {
  if (!uploadProgress.value.total) return 0
  return (uploadProgress.value.loaded / uploadProgress.value.total) * 100
})
let cancelSource: CancelTokenSource | null = null

function cancelUpload () {
  cancelSource?.cancel(t('cancelled'))
}

// ---- Create ----
const createAction = useAsyncAction(async () => {
  try {
    if (datasetType.value === 'file') {
      await createFileDataset()
    } else if (datasetType.value === 'rest') {
      await createRestDataset()
    } else if (datasetType.value === 'virtual') {
      await createVirtualDataset()
    } else if (datasetType.value === 'metaOnly') {
      await createMetaOnlyDataset()
    }
  } catch (error: any) {
    if (error.response?.status === 413) throw new Error(t('fileTooLarge'))
    throw error
  }
}, { catch: 'all' })

async function createFileDataset () {
  cancelSource = axios.CancelToken.source()
  const formData = new FormData()

  if (!initFromData.value && file.value) {
    formData.append('dataset', file.value)
    if (attachments.value) {
      formData.append('attachments', attachments.value)
    }
  }

  if (isTextFile.value && fileEncoding.value) {
    formData.append('dataset_encoding', fileEncoding.value)
  }

  for (const [key, val] of Object.entries(normalizeOptions.value)) {
    if (val !== undefined) formData.append(key, String(val))
  }

  const body: Record<string, any> = {}
  if (initFrom.value) {
    body.initFrom = initFrom.value
  }
  body.title = fileTitle.value
  if (attachments.value && attachmentsAsImage.value) {
    body.attachmentsAsImage = true
  }
  if (escapeKeyAlgorithm.value) {
    body.analysis = { escapeKeyAlgorithm: escapeKeyAlgorithm.value }
  }
  if (owner.value) {
    body.owner = owner.value
  }

  formData.append('body', JSON.stringify(body))

  const params: Record<string, string> = {}
  if (initFrom.value?.parts?.includes('schema') || (file.value && file.value.size > 100000)) {
    params.draft = 'true'
  }

  const res = await axios.post(
    `${$apiPath}/datasets`,
    formData,
    {
      params,
      cancelToken: cancelSource.token,
      onUploadProgress: (e) => {
        if (e.lengthComputable) {
          uploadProgress.value = { loaded: e.loaded, total: e.total }
        }
      }
    }
  )

  const dataset = res.data
  if (dataset.error) throw new Error(dataset.error)
  router.push(`/dataset/${dataset.id}`)
}

async function createRestDataset () {
  const body: Record<string, any> = {
    isRest: true,
    title: restTitle.value,
    rest: {
      history: restHistory.value,
      lineOwnership: restLineOwnership.value
    },
    schema: [] as any[]
  }

  if (initFrom.value) {
    body.initFrom = initFrom.value
  }
  if (restAttachments.value) {
    body.schema.push({
      key: 'attachmentPath',
      type: 'string',
      title: t('attachment'),
      'x-refersTo': 'http://schema.org/DigitalDocument'
    })
    if (restAttachmentsAsImage.value) {
      body.attachmentsAsImage = true
    }
  }
  if (owner.value) {
    body.owner = owner.value
  }

  const params: Record<string, string> = {}
  if (initFrom.value?.parts?.includes('schema')) {
    params.draft = 'true'
  }

  const dataset = await $fetch<any>(`${$apiPath}/datasets`, {
    method: 'POST',
    body,
    query: params
  })
  router.push(`/dataset/${dataset.id}`)
}

async function createVirtualDataset () {
  const body: Record<string, any> = {
    isVirtual: true,
    title: virtualTitle.value,
    virtual: {
      children: virtualChildren.value.map(c => c.id)
    },
    schema: [] as any[]
  }

  if (owner.value) {
    body.owner = owner.value
  }

  // Fill schema from children if requested
  if (virtualFillSchema.value && virtualChildren.value.length) {
    const { results: childDatasets } = await $fetch<{ results: any[] }>(`${$apiPath}/datasets`, {
      query: {
        id: virtualChildren.value.map(c => c.id).join(','),
        select: 'id,schema,attachmentsAsImage'
      }
    })
    let allChildrenHaveAttachmentsAsImage = true
    for (const child of virtualChildren.value) {
      const childDataset = childDatasets.find(d => d.id === child.id)
      if (!childDataset?.attachmentsAsImage) allChildrenHaveAttachmentsAsImage = false
      const schema = childDataset?.schema || []
      for (const property of schema) {
        if (!body.schema.find((p: any) => p.key === property.key)) {
          body.schema.push(property)
        }
      }
    }
    if (allChildrenHaveAttachmentsAsImage) {
      body.attachmentsAsImage = true
    }
  }

  // Init from first child description/attachments
  if (virtualInitFromDesc.value || virtualInitFromAttachments.value) {
    const parts: string[] = []
    if (virtualInitFromDesc.value) parts.push('description')
    if (virtualInitFromAttachments.value) parts.push('metadataAttachments')
    body.initFrom = { dataset: virtualChildren.value[0]?.id, parts }
  }

  const dataset = await $fetch<any>(`${$apiPath}/datasets`, {
    method: 'POST',
    body
  })
  router.push(`/dataset/${dataset.id}`)
}

async function createMetaOnlyDataset () {
  const body: Record<string, any> = {
    isMetaOnly: true,
    title: metaOnlyTitle.value
  }

  if (owner.value) {
    body.owner = owner.value
  }

  const dataset = await $fetch<any>(`${$apiPath}/datasets`, {
    method: 'POST',
    body
  })
  router.push(`/dataset/${dataset.id}`)
}
</script>

<i18n lang="yaml">
fr:
  home: Accueil
  datasets: Jeux de données
  newDataset: Créer un jeu de données
  helpCreatePrompt: Aidez-moi à créer un jeu de données
  choseType: Choisissez le type de jeu de données que vous souhaitez créer.
  stepType: Type de jeu de données
  stepInit: Initialisation
  stepParams: Paramètres
  stepAction: Confirmation
  type_file: Fichier
  type_desc_file: Chargez un fichier parmi les nombreux formats supportés.
  type_rest: Éditable
  type_desc_rest: Créez un jeu de données dont le contenu sera saisissable directement avec un formulaire en ligne.
  type_virtual: Virtuel
  type_desc_virtual: Créez une vue virtuelle réduite sur un ou plusieurs jeux de données.
  type_metaOnly: Métadonnées seules
  type_desc_metaOnly: "Créez un pseudo jeu de données sans données locales, uniquement les autres informations (description, pièces jointes, etc)."
  optionalStep: Cette étape est optionnelle.
  loadMainFile: Chargez un fichier de données principal.
  selectFile: Sélectionnez ou glissez/déposez un fichier
  selectAttachments: Pièces jointes (archive zip, optionnel)
  title: Titre du jeu de données
  titleTooShort: Le titre doit contenir au moins 4 caractères
  attachmentsAsImage: Traiter les pièces jointes comme des images
  formats: Formats supportés
  advancedOptions: Paramètres avancés
  escapeKeyAlgorithm: Algorithme de normalisation des clés
  escapeKeyAlgorithmHint: Paramètre utile uniquement pour une gestion avancée de la rétro-compatibilité d'API.
  encoding: Encodage du fichier
  encodingHint: Laissez vide pour utiliser un algorithme de détection automatique de l'encodage.
  history: Conserver un historique complet des révisions des lignes du jeu de données
  lineOwnership: Permet de donner la propriété d'une ligne à des utilisateurs (scénarios collaboratifs)
  attachments: Accepter des pièces jointes
  attachment: Document numérique attaché
  children: Jeux enfants
  virtualDatasetFill: Initialiser le schéma avec toutes les colonnes des jeux enfants
  virtualDatasetInitFromDesc: Copier la description du 1er jeu enfant
  virtualDatasetInitFromAttachments: Copier les pièces jointes du 1er jeu enfant
  completed: complétés
  continue: Continuer
  ignore: Ignorer
  back: Retour
  import: Lancer l'import
  createDataset: Créer le jeu de données
  of: de
  cancel: Annuler
  cancelled: Chargement annulé par l'utilisateur
  fileTooLarge: Le fichier est trop volumineux pour être importé
  creationError: "Erreur pendant la création du jeu de données"
  suggestArchive: Le fichier "{name}" est volumineux. Pensez à le compresser en .gz ou .zip avant l'envoi pour réduire le temps de transfert.
en:
  home: Home
  datasets: Datasets
  newDataset: Create a dataset
  helpCreatePrompt: Help me create a dataset
  choseType: Choose the type of dataset you wish to create.
  stepType: Dataset type
  stepInit: Initialization
  stepParams: Parameters
  stepAction: Confirmation
  type_file: File
  type_desc_file: Load a file among the many supported formats.
  type_rest: Editable
  type_desc_rest: Create a dataset whose content will be writable directly through a form.
  type_virtual: Virtual
  type_desc_virtual: Create a restricted virtual view over one or more datasets.
  type_metaOnly: Metadata only
  type_desc_metaOnly: Create a pseudo dataset without any local data, only other information (description, attachments, etc).
  optionalStep: This step is optional.
  loadMainFile: Load the main data file.
  selectFile: Select or drag and drop a file
  selectAttachments: Attachments (zip archive, optional)
  title: Dataset title
  titleTooShort: Title must be at least 4 characters
  attachmentsAsImage: Process the attachments as images
  formats: Supported formats
  advancedOptions: Advanced options
  escapeKeyAlgorithm: Key normalization algorithm
  escapeKeyAlgorithmHint: Only useful for advanced API backward-compatibility management.
  encoding: File encoding
  encodingHint: Leave empty to use automatic encoding detection.
  history: Keep a full history of the revisions of the lines of the dataset
  lineOwnership: Accept giving ownership of lines to users (collaborative use-cases)
  attachments: Accept attachments
  attachment: Attachment
  children: Children datasets
  virtualDatasetFill: Initialize the schema with all columns from children
  virtualDatasetInitFromDesc: Copy the description of the first child
  virtualDatasetInitFromAttachments: Copy the attachments of the first child
  completed: completed
  continue: Continue
  ignore: Ignore
  back: Back
  import: Proceed with import
  createDataset: Create the dataset
  of: of
  cancel: Cancel
  cancelled: Loading cancelled by user
  fileTooLarge: The file is too large to be imported
  creationError: "Error while creating the dataset"
  suggestArchive: The file "{name}" is large. Consider compressing it to .gz or .zip before uploading to reduce transfer time.
</i18n>
