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
          Ajouter une clé d'API
        </v-btn>
      </template>
      <v-card data-iframe-height>
        <v-card-title primary-title>
          Ajout d'une nouvelle clé d'API
        </v-card-title>
        <v-card-text>
          <v-form v-model="newApiKeyValid">
            <v-text-field
              v-model="newApiKey.title"
              :rules="[v => !!v || '']"
              label="Titre"
              required
              hide-details="auto"
            />
            <v-checkbox
              v-if="user.adminMode"
              v-model="newApiKey.adminMode"
              background-color="admin"
              color="white"
              dark
              label="Clé de type super-administrateur "
              hide-details="auto"
            />
            <v-checkbox
              v-if="user.adminMode && newApiKey.adminMode"
              v-model="newApiKey.asAccount"
              background-color="admin"
              color="white"
              dark
              label="Clé permettant de travailler dans le contexte d'autres comptes (nécessaire pour configurer le service de traitements périodiques)"
              hide-details="auto"
            />
            <v-checkbox
              v-for="scope of scopes"
              :key="scope.value"
              v-model="newApiKey.scopes"
              :label="scope.text"
              :value="scope.value"
              :rules="[v => !!v.length || '']"
              hide-details="auto"
            />
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            text
            @click="createMenu = false"
          >
            Annuler
          </v-btn>
          <v-btn
            :disabled="!newApiKeyValid"
            color="primary"
            @click="addApiKey"
          >
            Ajouter
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
                Cette clé secrète apparait en clair car vous venez de la créer. Notez là, elle ne sera pas lisible par la suite.
              </v-alert>
              <v-alert
                :value="!!apiKey.adminMode"
                type="warning"
              >
                Cette clé est de type super-administrateur
              </v-alert>
              <v-alert
                :value="!!apiKey.asAccount"
                type="warning"
              >
                Cette clé permet de travailler dans le contexte d'autres comptes
              </v-alert>
              <p v-if="!!apiKey.clearKey">
                Clé secrète : {{ apiKey.clearKey }}
              </p>
              <p>Portée : {{ apiKey.scopes.map(scope => scopes.find(s => s.value === scope).text).join(' - ') }}</p>
            </v-card-text>
            <v-card-actions>
              <v-spacer />
              <confirm-menu
                yes-color="warning"
                tooltip="supprimer cette clé d'API"
                :text="`Voulez vous vraiment supprimer cette clé d'API ? Si des programmes l'utilisent ils cesseront de fonctionner.`"
                @confirm="removeApiKey(rowIndex)"
              />
            </v-card-actions>
          </v-card>
        </v-col>
      </v-row>
    </v-container>
  </div>
</template>

<script>

import { mapState } from 'vuex'

export default {
  props: ['settings'],
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
      { value: 'datasets', text: 'Gestion des jeux de données' },
      { value: 'applications', text: 'Gestion des applications' },
      { value: 'catalogs', text: 'Gestion des connecteurs aux catalogues' },
      { value: 'stats', text: 'Récupération d\'informations statistiques' }
    ]
  }),
  computed: {
    ...mapState('session', ['user'])
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
