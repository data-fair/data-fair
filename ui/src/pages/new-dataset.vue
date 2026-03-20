<template>
  <v-container style="max-width: 900px;">
    <h1 class="text-h5 mb-6">
      {{ t('newDataset') }}
    </h1>

    <!-- Step indicator -->
    <v-stepper
      v-model="step"
      flat
    >
      <v-stepper-header>
        <v-stepper-item
          :value="1"
          :complete="!!datasetType"
          :title="t('stepType')"
        />
        <template v-if="hasInitFromStep">
          <v-divider />
          <v-stepper-item
            :value="2"
            :complete="step > 2"
            :title="t('stepInit')"
          />
        </template>
        <v-divider />
        <v-stepper-item
          :value="paramsStep"
          :complete="step > paramsStep"
          :title="t('stepParams')"
        />
        <v-divider />
        <v-stepper-item
          :value="actionStep"
          :title="t('stepAction')"
        />
      </v-stepper-header>

      <v-stepper-window>
        <!-- Step 1: Type selection -->
        <v-stepper-window-item :value="1">
          <div class="pa-4">
            <p class="text-body-1 mb-4">
              {{ t('choseType') }}
            </p>
            <v-row dense>
              <v-col
                v-for="type of datasetTypes"
                :key="type"
                cols="12"
                sm="6"
              >
                <v-card
                  hover
                  variant="outlined"
                  class="h-100"
                  :color="datasetType === type ? 'primary' : undefined"
                  @click="selectType(type)"
                >
                  <v-card-title class="text-primary">
                    <v-icon
                      color="primary"
                      class="mr-2"
                    >
                      {{ datasetTypeIcons[type] }}
                    </v-icon>
                    {{ t('type_' + type) }}
                  </v-card-title>
                  <v-card-text>
                    {{ t('type_desc_' + type) }}
                  </v-card-text>
                </v-card>
              </v-col>
            </v-row>
          </div>
        </v-stepper-window-item>

        <!-- Step 2: Init from (only for file/rest) -->
        <v-stepper-window-item
          v-if="hasInitFromStep"
          :value="2"
        >
          <div class="pa-4">
            <v-alert
              type="info"
              variant="outlined"
              density="compact"
              style="max-width: 500px;"
              class="mb-4"
            >
              {{ t('optionalStep') }}
            </v-alert>

            <dataset-init-from
              v-model="initFrom"
              :allow-data="datasetType === 'file'"
            />

            <div class="d-flex gap-2 mt-4">
              <v-btn
                variant="text"
                @click="step = 1"
              >
                {{ t('back') }}
              </v-btn>
              <v-btn
                color="primary"
                @click="onInitFromNext"
              >
                {{ initFrom ? t('continue') : t('ignore') }}
              </v-btn>
            </div>
          </div>
        </v-stepper-window-item>

        <!-- Step: Type-specific parameters -->
        <v-stepper-window-item :value="paramsStep">
          <div class="pa-4">
            <!-- FILE params -->
            <template v-if="datasetType === 'file'">
              <p class="text-body-1 mb-4">
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
                prepend-inner-icon="mdi-paperclip"
                :disabled="initFromData"
                @update:model-value="onFileChange"
              />

              <v-file-input
                v-if="!initFromData"
                v-model="attachmentsInputValue"
                :label="t('selectAttachments')"
                variant="outlined"
                density="compact"
                hide-details
                accept=".zip"
                class="mt-4"
                style="max-width: 500px;"
                prepend-icon=""
                prepend-inner-icon="mdi-zip-box"
                clearable
              />

              <v-checkbox
                v-if="!initFromData && file"
                v-model="filenameTitle"
                hide-details
                :label="t('filenameTitle')"
                class="mt-2"
              />
              <v-text-field
                v-if="initFromData || !filenameTitle || !file"
                v-model="fileTitle"
                :label="t('title')"
                variant="outlined"
                density="compact"
                style="max-width: 500px;"
                :rules="[val => (val && val.length > 3) || t('titleTooShort')]"
                class="mt-4"
              />

              <v-checkbox
                v-if="attachments && !initFromData"
                v-model="attachmentsAsImage"
                hide-details
                :label="t('attachmentsAsImage')"
              />

              <!-- Advanced options -->
              <div
                class="text-subtitle-1 mt-5 mb-3 d-flex align-center"
                style="cursor: pointer"
                @click="showAdvanced = !showAdvanced"
              >
                {{ t('advancedOptions') }}
                <v-icon class="ml-1">
                  {{ showAdvanced ? 'mdi-chevron-up' : 'mdi-chevron-down' }}
                </v-icon>
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
                variant="outlined"
                density="compact"
                style="max-width: 500px;"
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
                variant="outlined"
                density="compact"
                style="max-width: 500px;"
                :rules="[val => (val && val.length > 3) || t('titleTooShort')]"
                class="mb-2"
              />
              <v-autocomplete
                v-model:search="childrenSearch"
                :model-value="null"
                :items="childrenItems"
                :loading="searchChildrenAction.loading.value"
                no-filter
                hide-no-data
                item-title="title"
                item-value="id"
                :label="t('children')"
                :placeholder="t('search')"
                variant="outlined"
                density="compact"
                return-object
                hide-details
                style="max-width: 500px;"
                @update:model-value="addVirtualChild"
              />

              <!-- Selected children chips -->
              <div
                v-if="virtualChildren.length"
                class="d-flex flex-wrap gap-1 mt-2"
              >
                <v-chip
                  v-for="(child, i) in virtualChildren"
                  :key="child.id"
                  closable
                  size="small"
                  @click:close="virtualChildren.splice(i, 1)"
                >
                  {{ child.title }}
                </v-chip>
              </div>

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
                variant="outlined"
                density="compact"
                style="max-width: 500px;"
                :rules="[val => (val && val.length > 3) || t('titleTooShort')]"
              />
            </template>

            <div class="d-flex gap-2 mt-4">
              <v-btn
                variant="text"
                @click="step = hasInitFromStep ? 2 : 1"
              >
                {{ t('back') }}
              </v-btn>
              <v-btn
                color="primary"
                :disabled="!paramsValid"
                @click="step = actionStep"
              >
                {{ t('continue') }}
              </v-btn>
            </div>
          </div>
        </v-stepper-window-item>

        <!-- Step: Action / Confirmation -->
        <v-stepper-window-item :value="actionStep">
          <div class="pa-4">
            <df-owner-pick
              v-model="owner"
              hide-single
            />

            <dataset-conflicts
              v-if="step === actionStep && owner"
              v-model="conflictsOk"
              :title="effectiveTitle"
              :filename="datasetType === 'file' && file ? file.name : undefined"
              :owner="owner"
            />

            <v-alert
              v-if="createError"
              type="error"
              class="mt-4 mb-4"
              style="max-width: 500px;"
            >
              {{ createError }}
            </v-alert>

            <!-- Upload progress for file type -->
            <v-row
              v-if="importing && datasetType === 'file'"
              class="mx-0 my-3"
              align="center"
            >
              <v-progress-linear
                v-model="uploadPercent"
                class="my-1"
                rounded
                height="28"
                color="primary"
                style="max-width: 500px;"
              >
                <template v-if="uploadProgress.total && uploadPercent !== undefined">
                  {{ Math.floor(uploadPercent) }}% {{ t('of') }} {{ formatBytes(uploadProgress.total, locale) }}
                </template>
              </v-progress-linear>
              <v-btn
                icon="mdi-cancel"
                color="warning"
                density="compact"
                variant="text"
                class="ml-2"
                :title="t('cancel')"
                @click="cancelUpload"
              />
            </v-row>

            <div class="d-flex gap-2 mt-4">
              <v-btn
                variant="text"
                :disabled="importing"
                @click="step = paramsStep"
              >
                {{ t('back') }}
              </v-btn>
              <v-btn
                color="primary"
                :loading="importing"
                :disabled="!canCreate"
                @click="create"
              >
                {{ datasetType === 'file' ? t('import') : t('createDataset') }}
              </v-btn>
            </div>
          </div>
        </v-stepper-window-item>
      </v-stepper-window>
    </v-stepper>
  </v-container>
</template>

<script lang="ts" setup>
import axios, { type CancelTokenSource } from 'axios'
import { formatBytes } from '@data-fair/lib-vue/format/bytes.js'
import { withQuery } from 'ufo'

const { t, locale } = useI18n()
const router = useRouter()
const session = useSessionAuthenticated()
const { account } = session

// ---- Types ----
type DatasetType = 'file' | 'rest' | 'virtual' | 'metaOnly'

interface InitFrom {
  dataset: string
  parts: string[]
}

// ---- Constants ----
const datasetTypes: DatasetType[] = ['file', 'rest', 'virtual', 'metaOnly']
const datasetTypeIcons: Record<DatasetType, string> = {
  file: 'mdi-file-upload',
  rest: 'mdi-all-inclusive',
  virtual: 'mdi-picture-in-picture-bottom-right-outline',
  metaOnly: 'mdi-information-variant'
}

const commonEncodings = ['UTF-8', 'ISO-8859-1', 'Windows-1252', 'ISO-8859-15', 'US-ASCII']

const escapeKeyOptions = [
  { title: 'Slug strict', value: 'slug' },
  { title: 'Slug custom (compat-ods)', value: 'compat-ods' }
]

// ---- Step management ----
const step = ref(1)
const datasetType = ref<DatasetType | null>(null)

const hasInitFromStep = computed(() => datasetType.value === 'file' || datasetType.value === 'rest')
const paramsStep = computed(() => hasInitFromStep.value ? 3 : 2)
const actionStep = computed(() => hasInitFromStep.value ? 4 : 3)

function selectType (type: DatasetType) {
  datasetType.value = type
  nextTick(() => {
    if (type === 'file' || type === 'rest') {
      step.value = 2
    } else {
      step.value = paramsStep.value
    }
  })
}

// ---- Init from ----
const initFrom = ref<InitFrom | null>(null)
const initFromData = computed(() => initFrom.value?.parts?.includes('data') ?? false)

function onInitFromNext () {
  if (datasetType.value === 'file' && initFromData.value) {
    // Skip file selection, go straight to params but file not needed
    step.value = paramsStep.value
  } else {
    step.value = paramsStep.value
  }
}

// ---- File params ----
const fileInputValue = ref<File[]>([])
const file = ref<File | null>(null)
const attachmentsInputValue = ref<File[]>([])
const attachments = computed(() => attachmentsInputValue.value?.[0] ?? null)
const filenameTitle = ref(true)
const fileTitle = ref('')
const attachmentsAsImage = ref(false)
const showAdvanced = ref(false)
const escapeKeyAlgorithm = ref<string | null>(null)
const fileEncoding = ref<string | null>(null)

const isTextFile = computed(() => {
  if (!file.value) return false
  const name = file.value.name.toLowerCase()
  return name.endsWith('.csv') || name.endsWith('.tsv') || name.endsWith('.txt')
})

function onFileChange (val: File | File[]) {
  if (Array.isArray(val)) {
    file.value = val[0] ?? null
  } else {
    file.value = val ?? null
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
const virtualChildren = ref<Array<{ id: string, title: string }>>([])
const virtualFillSchema = ref(false)
const virtualInitFromDesc = ref(false)
const virtualInitFromAttachments = ref(false)
const childrenSearch = ref('')
const childrenDatasets = ref<any[]>([])

const childrenItems = computed(() => {
  return childrenDatasets.value.filter(
    (d: any) => !virtualChildren.value.find(c => c.id === d.id)
  )
})

const searchChildrenAction = useAsyncAction(async () => {
  if (!account.value) return
  const select = 'id,title,schema,status,attachmentsAsImage'
  const datasetsRes = await $fetch<{ results: any[] }>(withQuery(`${$apiPath}/datasets`, {
    q: childrenSearch.value,
    size: 20,
    select,
    owner: `${account.value.type}:${account.value.id}`,
    queryable: true
  }))
  childrenDatasets.value = datasetsRes.results
})

watch(childrenSearch, () => searchChildrenAction.execute())

function addVirtualChild (child: any) {
  if (!child?.id) return
  virtualChildren.value.push({ id: child.id, title: child.title })
  childrenSearch.value = ''
}

// ---- Meta only params ----
const metaOnlyTitle = ref('')

// ---- Owner ----
const owner = ref(account.value ? { type: account.value.type, id: account.value.id, ...(account.value.department ? { department: account.value.department } : {}) } : null)

// ---- Conflicts ----
const conflictsOk = ref(false)

// ---- Computed helpers ----
const effectiveTitle = computed(() => {
  if (datasetType.value === 'file') {
    if (filenameTitle.value && file.value) return undefined
    return fileTitle.value || undefined
  }
  if (datasetType.value === 'rest') return restTitle.value || undefined
  if (datasetType.value === 'virtual') return virtualTitle.value || undefined
  if (datasetType.value === 'metaOnly') return metaOnlyTitle.value || undefined
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
  return !importing.value && conflictsOk.value && !!owner.value
})

// ---- Upload progress ----
const importing = ref(false)
const createError = ref<string | null>(null)
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
async function create () {
  createError.value = null
  importing.value = true

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
    const status = error.response?.status
    if (status === 413) {
      createError.value = t('fileTooLarge')
    } else {
      createError.value = error.response?.data?.message || error.message || t('creationError')
    }
    importing.value = false
  }
}

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

  const body: Record<string, any> = {}
  if (initFrom.value) {
    body.initFrom = initFrom.value
  }
  if (!filenameTitle.value || !file.value || initFromData.value) {
    body.title = fileTitle.value
  }
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
  if (virtualFillSchema.value) {
    for (const child of virtualChildren.value) {
      const schema = await $fetch<any[]>(`${$apiPath}/datasets/${child.id}/schema`)
      for (const property of schema) {
        if (!body.schema.find((p: any) => p.key === property.key)) {
          body.schema.push(property)
        }
      }
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
  newDataset: Créer un jeu de données
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
  filenameTitle: Utiliser le nom du fichier pour construire le titre du jeu de données
  attachmentsAsImage: Traiter les pièces jointes comme des images
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
  search: Rechercher
  virtualDatasetFill: Initialiser le schéma avec toutes les colonnes des jeux enfants
  virtualDatasetInitFromDesc: Copier la description du 1er jeu enfant
  virtualDatasetInitFromAttachments: Copier les pièces jointes du 1er jeu enfant
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
en:
  newDataset: Create a dataset
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
  filenameTitle: Use the file name to create the title of the dataset
  attachmentsAsImage: Process the attachments as images
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
  search: Search
  virtualDatasetFill: Initialize the schema with all columns from children
  virtualDatasetInitFromDesc: Copy the description of the first child
  virtualDatasetInitFromAttachments: Copy the attachments of the first child
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
</i18n>
