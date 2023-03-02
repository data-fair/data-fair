<template>
  <div>
    <v-menu
      v-model="createMenu"
      max-width="700px"
      :close-on-content-click="false"
    >
      <template #activator="{on, attrs}">
        <v-btn
          color="primary"
          class="mb-3"
          v-bind="attrs"
          v-on="on"
        >
          {{ $t('addApiKey') }}
        </v-btn>
      </template>
      <v-card data-iframe-height>
        <v-card-title primary-title>
          {{ $t('addNewApiKey') }}
        </v-card-title>
        <v-card-text>
          <v-form v-model="newApiKeyValid">
            <v-text-field
              v-model="newApiKey.title"
              :rules="[v => !!v || '']"
              :label="$t('title')"
              required
              hide-details="auto"
            />
            <v-checkbox
              v-if="user.adminMode"
              v-model="newApiKey.adminMode"
              background-color="admin"
              color="white"
              dark
              :label="$t('superadminKey')"
              hide-details="auto"
            />
            <v-checkbox
              v-if="user.adminMode && newApiKey.adminMode"
              v-model="newApiKey.asAccount"
              background-color="admin"
              color="white"
              dark
              :label="$t('asAccountKey')"
              hide-details="auto"
            />
            <template v-if="filteredScopes.length > 1">
              <v-checkbox
                v-for="scope of filteredScopes"
                :key="scope.value"
                v-model="newApiKey.scopes"
                :label="scope.text"
                :value="scope.value"
                :rules="[v => !!v.length || '']"
                hide-details="auto"
              />
            </template>
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            text
            @click="createMenu = false"
          >
            {{ $t('cancel') }}
          </v-btn>
          <v-btn
            :disabled="!newApiKeyValid"
            color="primary"
            @click="addApiKey"
          >
            {{ $t('add') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-menu>
    <v-container class="pt-0 px-0">
      <v-row>
        <v-col
          v-for="(apiKey, rowIndex) in settings.apiKeys"
          :key="rowIndex"
          cols="12"
        >
          <v-card
            tile
            outlined
          >
            <v-card-title
              primary-title
              class="py-2"
            >
              <h4 class="text-h6">
                {{ apiKey.title }}
              </h4>
              <v-spacer />
              <settings-api-key-use-menu :api-key="apiKey" />
            </v-card-title>
            <v-card-text class="pb-0">
              <v-alert
                :value="!!apiKey.clearKey"
                type="warning"
              >
                {{ $t('newKeyAlert') }}
              </v-alert>
              <v-alert
                :value="!!apiKey.adminMode"
                type="warning"
              >
                {{ $t('superadminKeyAlert') }}
              </v-alert>
              <v-alert
                :value="!!apiKey.asAccount"
                type="warning"
              >
                {{ $t('asAccountKeyAlert') }}
              </v-alert>
              <p v-if="!!apiKey.clearKey">
                {{ $t('secretKey') }} : {{ apiKey.clearKey }}
              </p>
              <p>{{ $t('scope') }} : {{ apiKey.scopes.map(scope => scopes.find(s => s.value === scope).text).join(' - ') }}</p>
            </v-card-text>
            <v-card-actions>
              <v-spacer />
              <confirm-menu
                yes-color="warning"
                :tooltip="$t('deleteKey')"
                :text="$t('deleteKeyDetails')"
                @confirm="removeApiKey(rowIndex)"
              />
            </v-card-actions>
          </v-card>
        </v-col>
      </v-row>
    </v-container>
  </div>
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
</i18n>

<script>

import { mapState } from 'vuex'

export default {
  props: ['settings', 'restrictedScopes'],
  data: () => ({
    newApiKey: {
      title: null,
      scopes: []
    },
    newApiKeyValid: false,
    createMenu: false,
    showDeleteDialog: false,
    currentApiKey: null,
    showUseDialog: false,
    scopes: [
      { value: 'datasets', text: 'jeux de données' },
      { value: 'applications', text: 'applications' },
      { value: 'catalogs', text: 'connecteurs aux catalogues' },
      { value: 'stats', text: 'récupération d\'informations statistiques' }
    ]
  }),
  computed: {
    ...mapState('session', ['user']),
    filteredScopes () {
      if (!this.restrictedScopes || this.restrictedScopes.length === 0) return this.scopes
      return this.scopes.filter(s => this.restrictedScopes.includes(s.value))
    }
  },
  mounted () {
    if (this.filteredScopes.length === 1) {
      this.newApiKey.scopes.push(this.filteredScopes[0].value)
    }
  },
  methods: {
    addApiKey () {
      const apiKey = Object.assign({}, this.newApiKey)
      this.settings.apiKeys.push(apiKey)
      this.createMenu = false
      this.$emit('updated')
    },
    removeApiKey (rowIndex) {
      this.settings.apiKeys.splice(rowIndex, 1)
      this.$emit('updated')
    }
  }
}
</script>
