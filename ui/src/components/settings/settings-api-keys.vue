<template>
  <v-btn
    v-if="!createToggle"
    :prepend-icon="mdiPlus"
    class="mb-2"
    color="primary"
    density="comfortable"
    variant="flat"
    @click="createToggle = true"
  >
    {{ t('addApiKey') }}
  </v-btn>
  <df-tutorial-alert
    id="api-key-use"
    :text="t('apiKeyUseDetails')"
    persistent
    :initial="false"
  />
  <v-slide-y-transition v-if="createToggle">
    <v-card
      :title="t('addNewApiKey')"
      class="mb-2"
    >
      <v-card-text>
        <v-form v-model="newApiKeyValid">
          <v-text-field
            v-model="newApiKey.title"
            :rules="[v => !!v?.trim() || t('required')]"
            :label="t('title')"
            density="comfortable"
            hide-details="auto"
            required
          />
          <v-checkbox
            v-if="session.state.user.adminMode"
            v-model="newApiKey.adminMode"
            :label="t('superadminKey')"
            color="admin"
            class="text-admin"
            density="comfortable"
            hide-details
          />
          <v-checkbox
            v-if="session.state.user.adminMode && newApiKey.adminMode"
            v-model="newApiKey.asAccount"
            :label="t('asAccountKey')"
            color="admin"
            class="text-admin"
            density="comfortable"
            hide-details
          />
          <df-tutorial-alert
            id="api-key-scope"
            :text="t('scopeMsg')"
            persistent
            initial
          />
          <v-select
            v-if="filteredScopes.length > 1"
            v-model="newApiKey.scopes"
            :label="t('scope')"
            :items="filteredScopes"
            :item-title="t"
            :item-value="v => v"
            :item-props="v => (v.startsWith('datasets-') && newApiKey.scopes.includes('datasets')) ? {disabled: true} : {}"
            density="comfortable"
            multiple
          />

          <v-date-input
            v-model="expireDate"
            :label="t('expireAt')"
            :rules="[v => !!v || '']"
            :min="new Date()"
            :max="new Date(maxDate)"
            density="comfortable"
            required
          />
        </v-form>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn @click="createToggle = false">
          {{ t('cancel') }}
        </v-btn>
        <v-btn
          :disabled="!newApiKeyValid"
          color="primary"
          variant="flat"
          @click="addApiKey"
        >
          {{ t('add') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-slide-y-transition>

  <v-row>
    <v-col
      v-for="(apiKey, rowIndex) in apiKeys"
      :key="rowIndex"
      lg="4"
      md="6"
      sm="12"
    >
      <v-card
        variant="outlined"
        rounded="0"
      >
        <v-card-title>
          <h4 class="text-title-large">
            {{ apiKey.title }}
          </h4>
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
          <p
            v-if="!!apiKey.clearKey"
            class="mb-4"
          >
            {{ t('secretKey') }} : <strong>{{ apiKey.clearKey }}</strong>
          </p>
          <p
            v-if="apiKey.scopes?.length"
            class="mb-4"
          >
            {{ t('scope') }} : {{ apiKey.scopes?.map(s => t(s)).join(', ') }}
          </p>
          <df-tutorial-alert
            id="api-key-email"
            :text="t('emailMsg')"
            persistent
            :initial="false"
          />
          <p
            v-if="apiKey.email"
            class="mb-4"
          >
            {{ t('email') }} : {{ apiKey.email }}
          </p>
          <p
            v-if="apiKey.expireAt"
            class="mb-4"
          >
            {{ t('expireAt') }} : {{ dayjs(new Date(apiKey.expireAt)).format('l') }}
          </p>
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
  apiKeyUseDetails: Vous pouvez vous référer aux documentations d'API et utiliser cette clé en passant sa valeur dans le header "x-apiKey".
  addApiKey: Ajouter une clé d'API
  addNewApiKey: Ajout d'une nouvelle clé d'API
  title: Titre
  required: Champ requis
  superadminKey: Clé de type super-administrateur
  asAccountKey: Clé permettant de travailler dans le contexte d'autres comptes (nécessaire pour configurer le service de traitements périodiques)
  cancel: Annuler
  add: Ajouter
  newKeyAlert: Cette clé secrète apparaît en clair car vous venez de la créer. Copiez-la car elle ne sera plus lisible par la suite.
  superadminKeyAlert: Cette clé est de type super-administrateur
  asAccountKeyAlert: Cette clé permet de travailler dans le contexte d'autres comptes
  secretKey: Clé secrète
  scope: Portée
  scopeMsg: En attribuant des portées à cette clé d'API, celle-ci pourra effectuer les opérations sélectionnées sur l'ensemble des ressources accessibles aux administrateurs du compte. Sans portée définie, la clé ne bénéficiera que des permissions explicitement associées à son identifiant (pseudo adresse mail).
  email: Email
  emailMsg: Ce pseudo email peut être utilisé pour affecter des permissions fines à cette clé d'API.
  expireAt: Date d'expiration
  deleteKey: Supprimer cette clé d'API
  deleteKeyDetails: Voulez-vous vraiment supprimer cette clé d'API ? Si des programmes l'utilisent ils cesseront de fonctionner.
  datasets: Jeux de données - toutes opérations
  datasets-read: Jeux de données - lecture
  datasets-write: Jeux de données - écriture
  datasets-admin: Jeux de données - administration
  applications: Applications
  catalogs: Connecteurs aux catalogues
  stats: Récupération d'informations statistiques
en:
  apiKeyUseDetails: You can refer to the API documentation and use this key by passing its value in the "x-apiKey" header.
  addApiKey: Add an API key
  addNewApiKey: Add a new API key
  title: Title
  required: Required field
  superadminKey: Super-admin key type
  asAccountKey: Key to work in the context of other accounts (required to configure periodic processings service)
  cancel: Cancel
  add: Add
  newKeyAlert: You can view this key because you just created it. Copy it, it won't be readable again on this platform.
  superadminKeyAlert: Super-admin key type
  asAccountKeyAlert: Key to work in the context of other accounts
  secretKey: Secret key
  scope: Scope
  scopeMsg: The scope of this API key defines the operations it can perform on all resources accessible to account administrators. Without a defined scope, the key will only have permissions explicitly associated with its identifier (pseudo email address).
  email: Email
  emailMsg: This pseudo email address can be used to assign fine-grained permissions to this API key.
  expireAt: Expiration date
  deleteKey: Delete this API key
  deleteKeyDetails: Do you really want to delete this API key ? Softwares or scripts that use this key won't work anymore.
  datasets: Datasets - all operations
  datasets-read: Datasets - read
  datasets-write: Datasets - write
  datasets-admin: Datasets - admin
  applications: Applications
  catalogs: Catalogs
  stats: Stats
</i18n>

<script setup lang="ts">
import type { Settings } from '#api/types'
import { mdiPlus } from '@mdi/js'
import { VDateInput } from 'vuetify/labs/VDateInput'

const { restrictedScopes } = defineProps<{
  restrictedScopes?: string[]
}>()

const apiKeys = defineModel<Settings['apiKeys']>()

const { t } = useI18n()
const session = useSessionAuthenticated()
const { dayjs } = useLocaleDayjs()

const maxDate = dayjs().add($uiConfig.apiKeysMaxDuration, 'day').format('YYYY-MM-DD')

const expireDate = computed({
  get: () => newApiKey.value.expireAt ? new Date(newApiKey.value.expireAt) : null,
  set: (v) => {
    newApiKey.value.expireAt = v ? dayjs(v).format('YYYY-MM-DD') : ''
  }
})

const createNewApiKey = () => ({
  title: '',
  scopes: [],
  expireAt: maxDate
})

const newApiKey = ref<{
  title: string
  scopes: string[]
  expireAt: string
  adminMode?: boolean
  asAccount?: boolean
}>(createNewApiKey())

const newApiKeyValid = ref(false)
const createToggle = ref(false)

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
  apiKeys.value = [...(apiKeys.value ?? []), {
    ...newApiKey.value,
    title: newApiKey.value.title.trim()
  }]
  createToggle.value = false
  newApiKey.value = createNewApiKey()
}

const removeApiKey = (rowIndex: number) => {
  const newApiKeys = [...apiKeys.value ?? []]
  newApiKeys!.splice(rowIndex, 1)
  apiKeys.value = newApiKeys
}

const scopes = [
  'datasets',
  'datasets-read',
  'datasets-write',
  'datasets-admin',
  'applications',
  'stats'
]

watch(() => newApiKey.value.scopes, () => {
  if (newApiKey.value.scopes.includes('datasets') && newApiKey.value.scopes.some(s => s.startsWith('datasets-'))) {
    newApiKey.value.scopes = newApiKey.value.scopes.filter(s => !s.startsWith('datasets-'))
  }
})

</script>
