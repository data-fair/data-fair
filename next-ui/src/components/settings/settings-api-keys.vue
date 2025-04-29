<template>
  <v-menu
    v-model="createMenu"
    max-width="700px"
    :close-on-content-click="false"
  >
    <template #activator="{ props }">
      <v-btn
        v-bind="props"
        color="primary"
        class="mb-3"
      >
        {{ t('addApiKey') }}
      </v-btn>
    </template>
    <v-card
      data-iframe-height
      :title="t('addNewApiKey')"
    >
      <v-card-text>
        <v-form v-model="newApiKeyValid">
          <v-text-field
            v-model="newApiKey.title"
            :rules="[v => !!v || '']"
            :label="t('title')"
            hide-details
            required
          />
          <v-checkbox
            v-if="session.state.user.adminMode"
            v-model="newApiKey.adminMode"
            :label="t('superadminKey')"
            class="text-warning"
            density="comfortable"
            hide-details
          />
          <v-checkbox
            v-if="session.state.user.adminMode && newApiKey.adminMode"
            v-model="newApiKey.asAccount"
            :label="t('asAccountKey')"
            class="text-warning"
            density="comfortable"
            hide-details
          />
          <template v-if="filteredScopes.length > 1">
            <v-checkbox
              v-for="scope of filteredScopes"
              :key="scope"
              v-model="newApiKey.scopes"
              :label="t(scope)"
              :value="scope"
              :rules="[v => !!v.length || '']"
              density="comfortable"
              color="primary"
              hide-details
            />
          </template>
        </v-form>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          @click="createMenu = false"
        >
          {{ t('cancel') }}
        </v-btn>
        <v-btn
          color="primary"
          variant="elevated"
          :disabled="!newApiKeyValid"
          @click="addApiKey"
        >
          {{ t('add') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-menu>
  <v-row>
    <v-col
      v-for="(apiKey, rowIndex) in settings.apiKeys"
      :key="rowIndex"
      cols="12"
    >
      <v-card
        variant="outlined"
        tile
      >
        <v-card-title class="d-flex justify-space-between align-center">
          <h4 class="text-h6">
            {{ apiKey.title }}
          </h4>
          <settings-api-key-use-menu :api-key="apiKey" />
        </v-card-title>
        <v-card-text>
          <v-alert
            v-if="!!apiKey.clearKey"
            type="warning"
            class="mb-2"
            :text="t('newKeyAlert')"
          />
          <v-alert
            v-if="!!apiKey.adminMode"
            type="warning"
            class="mb-2"
            :text="t('superadminKeyAlert')"
          />
          <v-alert
            v-if="!!apiKey.asAccount"
            type="warning"
            class="mb-2"
            :text="t('asAccountKeyAlert')"
          />
          <p v-if="!!apiKey.clearKey">
            {{ t('secretKey') }} : <strong>{{ apiKey.clearKey }}</strong>
          </p>
          <p>{{ t('scope') }} : {{ apiKey.scopes?.map(s => t(s)).join(', ') }}</p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <confirm-menu
            yes-color="warning"
            :tooltip="t('deleteKey')"
            :text="t('deleteKeyDetails')"
            @confirm="removeApiKey(rowIndex)"
          />
        </v-card-actions>
      </v-card>
    </v-col>
  </v-row>
</template>

<i18n lang="yaml">
fr:
  addApiKey: Ajouter une clé d'API
  addNewApiKey: Ajout d'une nouvelle clé d'API
  title: Titre
  superadminKey: Clé de type super-administrateur
  asAccountKey: Clé permettant de travailler dans le contexte d'autres comptes (nécessaire pour configurer le service de traitements périodiques)
  cancel: Annuler
  add: Ajouter
  newKeyAlert: Cette clé secrète apparait en clair car vous venez de la créer. Notez là, elle ne sera pas lisible par la suite.
  superadminKeyAlert: Cette clé est de type super-administrateur
  asAccountKeyAlert: Cette clé permet de travailler dans le contexte d'autres comptes
  secretKey: Clé secrète
  scope: Portée
  deleteKey: Supprimer cette clé d'API
  deleteKeyDetails: Voulez vous vraiment supprimer cette clé d'API ? Si des programmes l'utilisent ils cesseront de fonctionner.
  datasets: Jeux de données
  applications: Applications
  stats: Récupération d'informations statistiques
en:
  addApiKey: Add an API key
  addNewApiKey: Add a new API key
  title: Title
  superadminKey: Super-admin key type
  asAccountKey: Key to work in the context of other accounts (required to configure periodic processings service)
  cancel: Cancel
  add: Add
  newKeyAlert: You can view this key because you just created it. Store it in a secure place, it won't be readable again on this platform.
  superadminKeyAlert: Super-admin key type
  asAccountKeyAlert: Key to work in the context of other accounts
  secretKey: Secret key
  scope: Scope
  deleteKey: Delete this API key
  deleteKeyDetails: Do you really want to delete this API key ? Softwares or scripts that use this key won't work anymore.
  datasets: Datasets
  applications: Applications
  stats: Stats
</i18n>

<script lang="ts" setup>
import type { Settings } from '#api/types'

const { settings, restrictedScopes } = defineProps<{
  settings: Settings
  restrictedScopes?: string[]
}>()

const emit = defineEmits<{
  (event: 'updated', settings: Settings): void
}>()
const { t } = useI18n()
const session = useSessionAuthenticated()

const newApiKey = ref<{
  title: string
  scopes: string[]
  adminMode?: boolean
  asAccount?: boolean
}>({
  title: '',
  scopes: []
})

const newApiKeyValid = ref(false)
const createMenu = ref(false)

const filteredScopes = computed(() => {
  if (!restrictedScopes || restrictedScopes.length === 0) return scopes
  return scopes.filter(s => restrictedScopes.includes(s))
})

onMounted(() => {
  if (filteredScopes.value.length === 1) {
    newApiKey.value.scopes.push(filteredScopes.value[0])
  }
})

const addApiKey = () => {
  const updatedSettings = { ...settings }
  updatedSettings.apiKeys?.push(newApiKey.value)
  createMenu.value = false
  newApiKey.value = {
    title: '',
    scopes: []
  }
  emit('updated', updatedSettings)
}

const removeApiKey = (rowIndex: number) => {
  const updatedSettings = { ...settings }
  updatedSettings.apiKeys?.splice(rowIndex, 1)
  emit('updated', updatedSettings)
}

const scopes = [
  'datasets',
  'applications',
  'stats'
]

</script>
