<template>
  <v-container class="pt-0" fluid>
    <v-row v-if="user">
      <v-col>
        <datasets-list />
      </v-col>

      <div class="actions-buttons">
        <v-menu
          v-if="user"
          bottom
          left
        >
          <template v-slot:activator="{on}">
            <v-btn
              fab
              small
              color="primary"
              title="Créer un jeu de données"
              v-on="on"
            >
              <v-icon>mdi-plus</v-icon>
            </v-btn>
          </template>
          <v-list>
            <v-list-item @click="importFileSheet = true">
              <v-list-item-avatar>
                <v-icon color="primary">
                  mdi-file-upload
                </v-icon>
              </v-list-item-avatar>
              <v-list-item-title>Importer un fichier</v-list-item-title>
            </v-list-item>
            <v-list-item @click="createVirtualSheet = true">
              <v-list-item-avatar>
                <v-icon color="primary">
                  mdi-picture-in-picture-bottom-right-outline
                </v-icon>
              </v-list-item-avatar>
              <v-list-item-title>Créer un jeu virtuel</v-list-item-title>
            </v-list-item>
            <v-list-item @click="createRestSheet = true">
              <v-list-item-avatar>
                <v-icon color="primary">
                  mdi-all-inclusive
                </v-icon>
              </v-list-item-avatar>
              <v-list-item-title>Créer un jeu incrémental</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-menu>
      </div>

      <div class="text-center">
        <v-bottom-sheet v-model="importFileSheet">
          <import-file
            v-if="importFileSheet"
            @cancel="importFileSheet = false"
          />
        </v-bottom-sheet>
        <v-bottom-sheet v-model="createVirtualSheet">
          <create-virtual
            v-if="createVirtualSheet"
            @cancel="createVirtualSheet = false"
          />
        </v-bottom-sheet>
        <v-bottom-sheet v-model="createRestSheet">
          <create-rest
            v-if="createRestSheet"
            @cancel="createRestSheet = false"
          />
        </v-bottom-sheet>
      </div>
    </v-row>
    <!-- Anonymous: show jumbotron -->
    <v-col
      v-else-if="initialized"
      md="6"
      offset="3"
    >
      <v-responsive>
        <v-container class="fill-height">
          <v-row align="center">
            <v-col class="text-center">
              <h3 class="display-1 mb-3 mt-5">
                {{ $t('pages.datasets.title') }}
              </h3>
              <div class="text-h6">
                {{ $t('pages.datasets.description') }}
              </div>
              <p class="title mt-5">
                {{ $t('common.authrequired') }}
              </p>
              <v-btn
                color="primary"
                @click="login"
              >
                {{ $t('common.login') }}
              </v-btn>
            </v-col>
          </v-row>
        </v-container>
      </v-responsive>
    </v-col>
  </v-container>
</template>

<script>
  import { mapState, mapActions } from 'vuex'

  import ImportFile from '~/components/datasets/import-file.vue'
  import CreateVirtual from '~/components/datasets/create-virtual.vue'
  import CreateRest from '~/components/datasets/create-rest.vue'
  import DatasetsList from '~/components/datasets/list.vue'

  export default {
    name: 'Datasets',
    components: { ImportFile, CreateVirtual, CreateRest, DatasetsList },
    data() {
      return { importFileSheet: false, createVirtualSheet: false, createRestSheet: false }
    },
    computed: {
      ...mapState('session', ['user', 'initialized']),
    },
    created() {
      this.fetchVocabulary()
    },
    methods: {
      ...mapActions('session', ['login']),
      ...mapActions(['fetchVocabulary']),
    },
  }
</script>
