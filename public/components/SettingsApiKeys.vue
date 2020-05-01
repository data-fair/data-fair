<template>
  <div>
    <p>
      Les <i>clés d'API</i> sont un moyen d'utiliser l'API de data-fair de manière sécurisée.
      Il s'agit d'une configuration technique pour personne avertie.
    </p>
    <v-btn
      color="primary"
      class="mb-3"
      @click="showDialog = true"
    >
      Ajouter une clé d'API
    </v-btn>
    <v-container grid-list-md>
      <v-row>
        <v-col
          v-for="(apiKey, rowIndex) in settings.apiKeys"
          :key="rowIndex"
          cols="12"
          lg="6"
        >
          <v-card>
            <v-card-title primary-title>
              <h4 class="title">
                {{ apiKey.title }}
              </h4>
              <v-spacer />
              <v-btn
                color="primary"
                flat
                class="pa-0 ma-0"
                @click="currentApiKey = rowIndex; showUseDialog = true"
              >
                Utiliser
              </v-btn>
            </v-card-title>
            <v-card-text>
              <v-alert
                :value="apiKey.clearKey"
                type="warning"
              >
                Cette clé secrète apparait en clair car vous venez de la créer. Notez là, elle ne sera pas lisible par la suite.
              </v-alert>
              <v-alert
                :value="apiKey.adminMode"
                type="admin"
              >
                Cette clé est de type super-administrateur
              </v-alert>
              <p v-if="!!apiKey.clearKey">
                Clé secrète : {{ apiKey.clearKey }}
              </p>
              <v-subheader>Portée</v-subheader>
              <p>{{ apiKey.scopes.map(scope => scopes.find(s => s.value === scope).text).join(' - ') }}</p>
            </v-card-text>
            <v-card-actions>
              <v-spacer />
              <v-btn
                flat
                icon
                color="warning"
                title="Supprimer cette clé d'API"
                @click="currentApiKey = rowIndex; showDeleteDialog = true"
              >
                <v-icon>delete</v-icon>
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-col>
      </v-row>
    </v-container>

    <v-dialog
      v-model="showDialog"
      max-width="700px"
    >
      <v-card>
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
            />
            <v-checkbox
              v-if="user.adminMode"
              v-model="newApiKey.adminMode"
              background-color="admin"
              color="white"
              dark
              label="Clé de type super-administrateur "
            />
            <v-checkbox
              v-for="scope of scopes"
              :key="scope.value"
              v-model="newApiKey.scopes"
              :label="scope.text"
              :value="scope.value"
              :rules="[v => !!v.length || '']"
            />
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            flat
            @click="showDialog = false"
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
    </v-dialog>

    <v-dialog
      v-model="showDeleteDialog"
      max-width="700px"
    >
      <v-card v-if="showDeleteDialog">
        <v-card-title primary-title>
          Suppression d'une clé d'API
        </v-card-title>
        <v-card-text>
          Voulez vous vraiment supprimer la clé d'API "{{ settings.apiKeys[currentApiKey].title }}" ? La suppression est définitive, si des programmes l'utilisent ils cesseront de fonctionner.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            flat
            @click="showDeleteDialog = false"
          >
            Non
          </v-btn>
          <v-btn
            color="warning"
            @click="showDeleteDialog = false; removeApiKey(currentApiKey)"
          >
            Oui
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog
      v-model="showUseDialog"
      max-width="700px"
    >
      <v-card v-if="showUseDialog">
        <v-card-title primary-title>
          Utilisation d'une clé d'API
        </v-card-title>
        <v-card-text>
          <p>
            Vous pouvez utiliser la clé d'API pour travailler avec <a :to="localePath('api-doc')">l'API HTTP racine de ce sercice</a> ou avec les APIs indépendantes de chaque entité (jeux de données, applications, services distants, etc.).
          </p><p>
            Il suffit de passer le header "x-apiKey" dans votre client HTTP. Par exemple :
          </p>
          <pre><code>curl -v -H "x-apiKey: {{ settings.apiKeys[currentApiKey].clearKey || 'XXX' }}" {{ env.publicUrl }}/api/v1/{{ settings.apiKeys[currentApiKey].scopes[0] }}</code></pre>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            flat
            color="primary"
            @click="showUseDialog = false"
          >
            Ok
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script>

  import { mapState } from 'vuex'
  const events = require('../../shared/events.json').dataset

  export default {
    props: ['settings'],
    data: () => ({
      events,
      newApiKey: {
        title: null,
        scopes: [],
      },
      newApiKeyValid: false,
      showDialog: false,
      showDeleteDialog: false,
      currentApiKey: null,
      showUseDialog: false,
      scopes: [
        { value: 'datasets', text: 'Gestion des jeux de données' },
        { value: 'applications', text: 'Gestion des configurations d\'applications' },
        { value: 'catalogs', text: 'Gestion des connecteurs aux catalogues' },
        { value: 'stats', text: 'Récupération d\'informations statistiques' },
      ],
    }),
    computed: {
      ...mapState('session', ['user']),
      ...mapState(['env']),
    },
    methods: {
      addApiKey() {
        const apiKey = Object.assign({}, this.newApiKey)
        this.settings.apiKeys.push(apiKey)
        this.showDialog = false
        this.$emit('updated')
      },
      removeApiKey(rowIndex) {
        this.settings.apiKeys.splice(rowIndex, 1)
        this.$emit('updated')
      },
    },
  }
</script>
