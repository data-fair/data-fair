<template>
  <v-btn
    v-if="!inlineForm || !createToggle"
    :prepend-icon="mdiPlus"
    class="mb-2"
    color="primary"
    density="comfortable"
    variant="flat"
    :disabled="saving"
    @click="createToggle = true"
  >
    {{ t('addApiKey') }}
  </v-btn>

  <!-- New API Key Form -->
  <component
    :is="inlineForm ? 'div' : VDialog"
    v-bind="inlineForm ? {} : { modelValue: createToggle, maxWidth: 600, persistent: saving, 'onUpdate:modelValue': (v: boolean) => createToggle = v }"
  >
    <v-card
      v-if="createToggle"
      :title="t('addNewApiKey')"
      :class="{ 'mb-2': inlineForm }"
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
        <v-btn
          :disabled="saving"
          @click="createToggle = false"
        >
          {{ t('cancel') }}
        </v-btn>
        <v-btn
          :disabled="!newApiKeyValid"
          :loading="saving"
          color="primary"
          variant="flat"
          @click="addApiKey"
        >
          {{ t('add') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </component>

  <!-- the secret of a key is readable only in the response of the save that created it, kept for the page lifetime -->
  <v-alert
    v-for="apiKey in newKeys"
    :key="apiKey.id"
    type="warning"
    variant="outlined"
    class="mb-2"
    :title="t('newKeyTitle', { title: apiKey.title })"
  >
    <p class="mb-2">
      {{ t('newKeyAlert') }}
    </p>
    <div class="d-flex align-center flex-wrap ga-2">
      <code class="text-break">{{ clearKeys[apiKey.id!] }}</code>
      <v-btn
        :prepend-icon="copied === clearKeys[apiKey.id!] ? mdiCheck : mdiContentCopy"
        density="comfortable"
        variant="text"
        @click="copy(clearKeys[apiKey.id!])"
      >
        {{ copied === clearKeys[apiKey.id!] ? t('copied') : t('copySecret') }}
      </v-btn>
    </div>
  </v-alert>

  <!-- Helper text about API key usage -->
  <df-tutorial-alert
    id="api-key-use"
    :text="t('apiKeyUseDetails') + ' ' + t('emailMsg')"
    :initial="false"
    persistent
  />

  <v-data-table
    v-if="apiKeys?.length"
    :headers="headers"
    :items="apiKeys"
    :items-per-page="-1"
    :mobile-breakpoint="'sm'"
    density="comfortable"
    hide-default-footer
    class="border rounded"
  >
    <template #item.title="{ item }">
      <div class="py-2">
        <div>{{ item.title }}</div>
        <div
          v-if="item.adminMode || item.asAccount"
          class="text-body-small text-error"
        >
          <v-icon
            :icon="mdiAlert"
            size="small"
          />
          {{ [item.adminMode && t('superadminShort'), item.asAccount && t('asAccountShort')].filter(Boolean).join(' · ') }}
        </div>
        <div class="d-flex flex-wrap ga-1 mt-1">
          <v-chip
            v-for="scope of item.scopes"
            :key="scope"
            size="small"
          >
            {{ te('scopeShort.' + scope) ? t('scopeShort.' + scope) : scope }}
          </v-chip>
          <span
            v-if="!item.scopes?.length"
            class="text-body-small text-medium-emphasis"
          >
            {{ t('noScope') }}
          </span>
        </div>
      </div>
    </template>

    <template #item.email="{ item }">
      <div
        v-if="item.email"
        class="d-flex align-center ga-1 py-2"
      >
        <code class="api-key-email text-break text-body-small">{{ item.email }}</code>
        <v-btn
          :icon="copied === item.email ? mdiCheck : mdiContentCopy"
          :title="t('copyEmail', { email: item.email })"
          variant="text"
          density="comfortable"
          size="small"
          @click="copy(item.email, t('copyEmailFailed', { email: item.email }))"
        />
      </div>
      <span
        v-else
        class="text-medium-emphasis"
      >—</span>
    </template>

    <template #item.expireAt="{ item }">
      <div
        v-if="item.expireAt"
        class="d-flex flex-column align-start ga-1 py-2"
      >
        {{ dayjs(item.expireAt).format('L') }}
        <v-chip
          v-if="expiration(item.expireAt)"
          :color="expiration(item.expireAt)!.color"
          size="small"
        >
          {{ expiration(item.expireAt)!.label }}
        </v-chip>
      </div>
      <span
        v-else
        class="text-medium-emphasis"
      >—</span>
    </template>

    <template #item.actions="{ item }">
      <confirm-menu
        variant="menu"
        yes-color="warning"
        :btn-props="{ color: 'warning', icon: true, variant: 'text', density: 'comfortable', disabled: saving }"
        :tooltip="t('deleteKey')"
        :text="t('deleteKeyDetails')"
        @confirm="removeApiKey(item)"
      />
    </template>
  </v-data-table>
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
  superadminShort: Super-administrateur
  asAccountShort: Contexte d'autres comptes
  cancel: Annuler
  add: Ajouter
  newKeyTitle: "Clé « {title} » créée"
  newKeyAlert: Cette clé secrète apparaît en clair car vous venez de la créer. Copiez-la car elle ne sera plus lisible par la suite.
  copySecret: Copier la clé
  copied: Copié
  copyEmail: "Copier l'email de la clé : {email}"
  copyFailed: "Impossible d'accéder au presse-papiers, copiez la valeur manuellement."
  copyEmailFailed: "Impossible d'accéder au presse-papiers. Email de la clé : {email}"
  scope: Portée
  email: Email
  key: Clé
  noScope: Permissions explicites uniquement
  scopeMsg: En attribuant des portées à cette clé d'API, celle-ci pourra effectuer les opérations sélectionnées sur l'ensemble des ressources accessibles aux administrateurs du compte. Sans portée définie, la clé ne bénéficiera que des permissions explicitement associées à son identifiant (pseudo adresse mail).
  emailMsg: Le pseudo email d'une clé, à copier depuis sa ligne, peut être utilisé pour lui affecter des permissions fines.
  expireAt: Date d'expiration
  expiration: Expiration
  expired: Expirée
  expiresToday: Expire aujourd'hui
  expiresIn: "Expire dans {n} jour | Expire dans {n} jour | Expire dans {n} jours"
  deleteKey: Supprimer cette clé d'API
  deleteKeyDetails: Voulez-vous vraiment supprimer cette clé d'API ? Si des programmes l'utilisent ils cesseront de fonctionner.
  datasets: Jeux de données - toutes opérations
  datasets-read: Jeux de données - lecture
  datasets-write: Jeux de données - écriture
  datasets-admin: Jeux de données - administration
  applications: Applications
  catalogs: Connecteurs aux catalogues
  stats: Récupération d'informations statistiques
  scopeShort:
    datasets: Jeux de données
    datasets-read: Jeux de données (lecture)
    datasets-write: Jeux de données (écriture)
    datasets-admin: Jeux de données (administration)
    applications: Applications
    catalogs: Catalogues
    stats: Statistiques
en:
  apiKeyUseDetails: You can refer to the API documentation and use this key by passing its value in the "x-apiKey" header.
  addApiKey: Add an API key
  addNewApiKey: Add a new API key
  title: Title
  required: Required field
  superadminKey: Super-admin key type
  asAccountKey: Key to work in the context of other accounts (required to configure periodic processings service)
  superadminShort: Super-admin
  asAccountShort: Other accounts context
  cancel: Cancel
  add: Add
  newKeyTitle: "Key \"{title}\" created"
  newKeyAlert: You can view this key because you just created it. Copy it, it won't be readable again on this platform.
  copySecret: Copy the key
  copied: Copied
  copyEmail: "Copy the key email: {email}"
  copyFailed: Cannot access the clipboard, copy the value manually.
  copyEmailFailed: "Cannot access the clipboard. Key email: {email}"
  scope: Scope
  email: Email
  key: Key
  noScope: Explicit permissions only
  scopeMsg: The scope of this API key defines the operations it can perform on all resources accessible to account administrators. Without a defined scope, the key will only have permissions explicitly associated with its identifier (pseudo email address).
  emailMsg: The pseudo email of a key, copied from its row, can be used to assign it fine-grained permissions.
  expireAt: Expiration date
  expiration: Expiration
  expired: Expired
  expiresToday: Expires today
  expiresIn: "Expires in {n} day | Expires in {n} day | Expires in {n} days"
  deleteKey: Delete this API key
  deleteKeyDetails: Do you really want to delete this API key ? Softwares or scripts that use this key won't work anymore.
  datasets: Datasets - all operations
  datasets-read: Datasets - read
  datasets-write: Datasets - write
  datasets-admin: Datasets - admin
  applications: Applications
  catalogs: Catalogs
  stats: Stats
  scopeShort:
    datasets: Datasets
    datasets-read: Datasets (read)
    datasets-write: Datasets (write)
    datasets-admin: Datasets (admin)
    applications: Applications
    catalogs: Catalogs
    stats: Stats
</i18n>

<script setup lang="ts">
import type { Settings } from '#api/types'
import type { SubEdit } from '~/composables/df-local/edit-fetch-local'
import { mdiAlert, mdiCheck, mdiContentCopy, mdiPlus } from '@mdi/js'
import { VDialog } from 'vuetify/components'

type ApiKey = NonNullable<Settings['apiKeys']>[number]

const { restrictedScopes, edit, inlineForm = false } = defineProps<{
  restrictedScopes?: string[]
  edit: SubEdit<Settings>
  /** an overlay adds no height to an iframe sized on its content, it would be cut */
  inlineForm?: boolean
}>()

const apiKeys = defineModel<Settings['apiKeys']>()

const saving = computed(() => edit.save.loading.value)

// each change is saved at once, a refused one is rolled back: the table only shows the server state
const saveApiKeys = async (keys: Settings['apiKeys']) => {
  apiKeys.value = keys
  await edit.save.execute()
  if (!edit.save.error.value) return true
  edit.cancel()
  return false
}

const { t, te } = useI18n()
const session = useSessionAuthenticated()
const { dayjs } = useLocaleDayjs()
const { sendUiNotif } = useUiNotif()

const maxDate = dayjs().add($uiConfig.apiKeysMaxDuration, 'day').format('YYYY-MM-DD')

const headers = computed(() => [
  { title: t('key'), key: 'title', sortable: false },
  { title: t('email'), key: 'email', sortable: false, width: '45%' },
  { title: t('expiration'), key: 'expireAt', sortable: false, nowrap: true },
  { title: '', key: 'actions', sortable: false, align: 'end' as const }
])

// by key id: the response of any later save drops the clearKey from the list
const clearKeys = defineModel<Record<string, string>>('clearKeys', { default: () => ({}) })
watch(apiKeys, (keys) => {
  const created = (keys ?? []).filter(k => k.id && k.clearKey && !clearKeys.value[k.id])
  if (created.length) clearKeys.value = { ...clearKeys.value, ...Object.fromEntries(created.map(k => [k.id, k.clearKey])) }
}, { immediate: true })
const newKeys = computed(() => (apiKeys.value ?? []).filter(k => k.id && clearKeys.value[k.id]))

// same milestones as the expiration mails: J-3 warning, then the expiry day (the key still works that day)
const expiration = (expireAt: string) => {
  const days = dayjs(expireAt).startOf('day').diff(dayjs().startOf('day'), 'day')
  if (days < 0) return { color: 'error', label: t('expired') }
  if (days === 0) return { color: 'warning', label: t('expiresToday') }
  if (days <= 3) return { color: 'warning', label: t('expiresIn', { n: days }, days) }
  return null
}

const copied = ref<string | null>(null)
const copy = async (value: string, failedMsg = t('copyFailed')) => {
  try {
    await navigator.clipboard.writeText(value)
  } catch {
    // unavailable over http, refused in an iframe without the clipboard-write permission
    sendUiNotif({ type: 'warning', msg: failedMsg })
    return
  }
  copied.value = value
  setTimeout(() => { if (copied.value === value) copied.value = null }, 2000)
}

const expireDate = computed({
  get: () => newApiKey.value.expireAt ? new Date(newApiKey.value.expireAt) : null,
  set: (v) => {
    newApiKey.value.expireAt = v ? dayjs(v).format('YYYY-MM-DD') : ''
  }
})

const createNewApiKey = () => ({
  title: '',
  scopes: [] as string[],
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

const resetNewApiKey = () => {
  newApiKey.value = createNewApiKey()
  if (filteredScopes.value.length === 1) newApiKey.value.scopes.push(filteredScopes.value[0])
}
onMounted(resetNewApiKey)

const addApiKey = async () => {
  if (!await saveApiKeys([...(apiKeys.value ?? []), newApiKey.value])) return
  createToggle.value = false
  resetNewApiKey()
}

const removeApiKey = (apiKey: ApiKey) => saveApiKeys((apiKeys.value ?? []).filter(k => k !== apiKey))

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

<style scoped>
/* any click selects the whole value: a double click would stop at the - and @ */
.api-key-email {
  user-select: all;
  min-width: 13rem;
}
</style>
