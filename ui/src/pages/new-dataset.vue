<template>
  <v-container style="max-width: 800px;">
    <h1 class="text-h5 mb-6">
      {{ t('newDataset') }}
    </h1>

    <!-- Tab selector: File upload / Empty dataset -->
    <v-tabs
      v-model="tab"
      class="mb-6"
    >
      <v-tab value="file">
        <v-icon
          start
          icon="mdi-file-upload"
        />
        {{ t('tabFile') }}
      </v-tab>
      <v-tab value="rest">
        <v-icon
          start
          icon="mdi-all-inclusive"
        />
        {{ t('tabRest') }}
      </v-tab>
    </v-tabs>

    <!-- FILE UPLOAD -->
    <v-window v-model="tab">
      <v-window-item value="file">
        <v-stepper
          v-model="fileStep"
          flat
        >
          <v-stepper-header>
            <v-stepper-item
              :value="1"
              :complete="!!file"
              :title="t('stepSelectFile')"
            />
            <v-divider />
            <v-stepper-item
              :value="2"
              :complete="fileStep > 2"
              :title="t('stepReview')"
            />
            <v-divider />
            <v-stepper-item
              :value="3"
              :title="t('stepCreate')"
            />
          </v-stepper-header>

          <v-stepper-window>
            <!-- Step 1: Upload file -->
            <v-stepper-window-item :value="1">
              <div class="pa-4">
                <p class="text-body-1 mb-4">
                  {{ t('selectFileMsg') }}
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
                  @update:model-value="onFileChange"
                />
                <div class="mt-6">
                  <v-btn
                    color="primary"
                    :disabled="!file"
                    @click="fileStep = 2"
                  >
                    {{ t('continue') }}
                  </v-btn>
                </div>
              </div>
            </v-stepper-window-item>

            <!-- Step 2: Review -->
            <v-stepper-window-item :value="2">
              <div class="pa-4">
                <p class="text-body-1 mb-4">
                  {{ t('reviewMsg') }}
                </p>
                <v-list
                  v-if="file"
                  density="compact"
                  class="mb-4"
                  style="max-width: 500px;"
                >
                  <v-list-item>
                    <template #prepend>
                      <v-icon icon="mdi-file" />
                    </template>
                    <v-list-item-title>{{ file.name }}</v-list-item-title>
                    <v-list-item-subtitle>{{ formatBytes(file.size) }}</v-list-item-subtitle>
                  </v-list-item>
                </v-list>
                <div class="d-flex gap-2 mt-2">
                  <v-btn
                    variant="text"
                    @click="fileStep = 1"
                  >
                    {{ t('back') }}
                  </v-btn>
                  <v-btn
                    color="primary"
                    @click="fileStep = 3"
                  >
                    {{ t('continue') }}
                  </v-btn>
                </div>
              </div>
            </v-stepper-window-item>

            <!-- Step 3: Create -->
            <v-stepper-window-item :value="3">
              <div class="pa-4">
                <v-alert
                  v-if="createFileAction.error.value"
                  type="error"
                  class="mb-4"
                  style="max-width: 500px;"
                >
                  {{ createFileAction.error.value }}
                </v-alert>
                <p class="text-body-1 mb-4">
                  {{ t('confirmFileMsg') }}
                </p>
                <v-list
                  v-if="file"
                  density="compact"
                  class="mb-4"
                  style="max-width: 500px;"
                >
                  <v-list-item>
                    <template #prepend>
                      <v-icon icon="mdi-file" />
                    </template>
                    <v-list-item-title>{{ file.name }}</v-list-item-title>
                    <v-list-item-subtitle>{{ formatBytes(file.size) }}</v-list-item-subtitle>
                  </v-list-item>
                </v-list>
                <div class="d-flex gap-2 mt-2">
                  <v-btn
                    variant="text"
                    @click="fileStep = 2"
                  >
                    {{ t('back') }}
                  </v-btn>
                  <v-btn
                    color="primary"
                    :loading="createFileAction.loading.value"
                    :disabled="!file"
                    @click="createFileAction.execute()"
                  >
                    {{ t('import') }}
                  </v-btn>
                </div>
              </div>
            </v-stepper-window-item>
          </v-stepper-window>
        </v-stepper>
      </v-window-item>

      <!-- EMPTY/REST DATASET -->
      <v-window-item value="rest">
        <div class="pa-4">
          <p class="text-body-1 mb-4">
            {{ t('restDesc') }}
          </p>
          <v-text-field
            v-model="restTitle"
            :label="t('title')"
            variant="outlined"
            density="compact"
            style="max-width: 500px;"
            :rules="[val => (val && val.length > 3) || t('titleTooShort')]"
            class="mb-4"
          />
          <v-alert
            v-if="createRestAction.error.value"
            type="error"
            class="mb-4"
            style="max-width: 500px;"
          >
            {{ createRestAction.error.value }}
          </v-alert>
          <v-btn
            color="primary"
            :loading="createRestAction.loading.value"
            :disabled="!restTitle || restTitle.length <= 3"
            @click="createRestAction.execute()"
          >
            {{ t('createDataset') }}
          </v-btn>
        </div>
      </v-window-item>
    </v-window>
  </v-container>
</template>

<script lang="ts" setup>
const { t } = useI18n()
const router = useRouter()

// Tab: 'file' or 'rest'
const tab = ref<'file' | 'rest'>('file')

// File upload state
const fileStep = ref(1)
const fileInputValue = ref<File[]>([])
const file = ref<File | null>(null)

function onFileChange (val: File | File[]) {
  if (Array.isArray(val)) {
    file.value = val[0] ?? null
  } else {
    file.value = val ?? null
  }
  if (file.value) {
    fileStep.value = 2
  }
}

const createFileAction = useAsyncAction(async () => {
  if (!file.value) return
  const formData = new FormData()
  formData.append('dataset', file.value)
  const dataset = await $fetch('datasets', { method: 'POST', body: formData })
  router.push(`/dataset/${(dataset as any).id}`)
})

// REST dataset state
const restTitle = ref('')

const createRestAction = useAsyncAction(async () => {
  const dataset = await $fetch('datasets', { method: 'POST', body: { isRest: true, title: restTitle.value } })
  router.push(`/dataset/${(dataset as any).id}`)
})
</script>

<i18n lang="yaml">
fr:
  newDataset: Créer un jeu de données
  tabFile: Fichier
  tabRest: Jeu de données vide
  stepSelectFile: Sélection du fichier
  stepReview: Vérification
  stepCreate: Création
  selectFileMsg: Sélectionnez un fichier de données à importer.
  selectFile: Sélectionnez ou glissez/déposez un fichier
  reviewMsg: Vérifiez les informations du fichier sélectionné.
  confirmFileMsg: Confirmez l'import du fichier pour créer le jeu de données.
  continue: Continuer
  back: Retour
  import: Lancer l'import
  restDesc: Créez un jeu de données vide dont le contenu peut être saisi directement via un formulaire ou l'API.
  title: Titre du jeu de données
  titleTooShort: Le titre doit contenir au moins 4 caractères
  createDataset: Créer le jeu de données
en:
  newDataset: Create a dataset
  tabFile: File
  tabRest: Empty dataset
  stepSelectFile: File selection
  stepReview: Review
  stepCreate: Create
  selectFileMsg: Select a data file to import.
  selectFile: Select or drag and drop a file
  reviewMsg: Review the selected file information.
  confirmFileMsg: Confirm file import to create the dataset.
  continue: Continue
  back: Back
  import: Proceed with import
  restDesc: Create an empty dataset whose content can be entered directly via a form or the API.
  title: Dataset title
  titleTooShort: Title must be at least 4 characters
  createDataset: Create dataset
</i18n>
