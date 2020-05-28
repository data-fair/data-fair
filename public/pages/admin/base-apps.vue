<template lang="html">
  <v-container fluid>
    <v-row>
      <v-col>
        <h2 class="title">
          Applications de base
        </h2>
        <v-row>
          <v-col
            cols="12"
            sm="6"
            md="4"
            lg="3"
          >
            <v-text-field
              v-model="q"
              name="q"
              label="Rechercher"
              hide-details
              solo
              append-icon="mdi-magnify"
              @keypress.enter="refresh"
            />
          </v-col>
        </v-row>

        <v-row>
          <v-col
            cols="12"
            sm="6"
            md="4"
            lg="3"
          >
            <v-text-field
              v-model="urlToAdd"
              label="Ajouter"
              placeholder="Saisissez l'URL d'une nouvelle application de base"
              @keypress.enter="add"
            />
          </v-col>
        </v-row>

        <v-card v-if="baseApps">
          <v-list three-line>
            <v-list-item
              v-for="baseApp in baseApps.results"
              :key="baseApp.id"
              avatar
            >
              <v-list-item-avatar tile>
                <img :src="baseApp.thumbnail">
              </v-list-item-avatar>
              <v-list-item-content>
                <v-list-item-title>
                  {{ baseApp.title }} - {{ baseApp.applicationName }} ({{ baseApp.version }}) - <a :href="baseApp.url">{{ baseApp.url }}</a>
                  <v-icon
                    v-if="baseApp.public"
                    color="green"
                  >
                    mdi-lock-open
                  </v-icon>
                  <template v-else>
                    <v-icon color="red">
                      mdi-lock
                    </v-icon>
                    <span>{{ (baseApp.privateAccess || []).map(p => p.name).join(', ') }}</span>
                  </template>
                  <v-icon v-if="baseApp.deprecated">
                    mdi-eye-off
                  </v-icon>
                </v-list-item-title>
                <v-list-item-subtitle>{{ baseApp.description }}</v-list-item-subtitle>
                <v-list-item-subtitle>
                  <nuxt-link :to="{path: '/applications', query: {url: baseApp.url, showAll: true}}">
                    {{ baseApp.nbApplications }} application{{ baseApp.nbApplications > 1 ? 's' : '' }}
                  </nuxt-link>
                  - Jeux de données : {{ baseApp.datasetsFilters }}
                </v-list-item-subtitle>
              </v-list-item-content>
              <v-list-item-action>
                <v-icon
                  color="primary"
                  @click="currentBaseApp = baseApp; patch = newPatch(baseApp); showEditDialog = true;"
                >
                  mdi-pencil
                </v-icon>
              </v-list-item-action>
            </v-list-item>
          </v-list>
        </v-card>
      </v-col>
    </v-row>

    <v-dialog
      v-model="showEditDialog"
      max-width="500px"
      transition="dialog-transition"
      lazy
    >
      <v-card v-if="currentBaseApp">
        <v-card-title primary-title>
          <h3 class="headline mb-0">
            Édition de {{ currentBaseApp.title }}
          </h3>
        </v-card-title>
        <v-card-text>
          <p>URL : {{ currentBaseApp.url }}</p>
          <v-checkbox
            v-model="patch.deprecated"
            label="Dépréciée"
          />
          <v-form>
            <v-text-field
              v-model="patch.applicationName"
              name="applicationName"
              label="Identifiant d'application"
            />
            <v-text-field
              v-model="patch.version"
              name="version"
              label="Version d'application"
            />
            <v-text-field
              v-model="patch.title"
              name="title"
              label="Titre"
            />
            <v-textarea
              v-model="patch.description"
              name="description"
              label="Description"
            />
            <v-text-field
              v-model="patch.image"
              name="image"
              label="Image"
            />
            <v-checkbox
              v-model="patch.public"
              label="Public"
            />
            <v-autocomplete
              v-if="!patch.public"
              v-model="patch.privateAccess"
              :items="organizations"
              :loading="loadingOrganizations"
              :search-input.sync="searchOrganizations"
              :filter="() => true"
              :multiple="true"
              :clearable="true"
              item-text="name"
              item-value="id"
              label="Vue restreinte à des organisations"
              placeholder="Saisissez le nom d'organisation"
              return-object
            />
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="showEditDialog = false">
            Annuler
          </v-btn>
          <v-btn
            color="primary"
            @click="applyPatch(currentBaseApp, patch); showEditDialog = false"
          >
            Enregistrer
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script>
  import { mapState } from 'vuex'
  import eventBus from '~/event-bus'

  export default {
    data() {
      return {
        baseApps: null,
        patch: {},
        showEditDialog: false,
        currentBaseApp: null,
        q: null,
        urlToAdd: null,
        loadingOrganizations: false,
        searchOrganizations: '',
        organizations: [],
      }
    },
    computed: {
      ...mapState(['env']),
    },
    watch: {
      searchOrganizations() {
        this.listOrganizations()
      },
    },
    async mounted() {
      this.refresh()
    },
    methods: {
      async refresh() {
        this.baseApps = await this.$axios.$get('api/v1/admin/base-applications', { params: { size: 10000, thumbnail: '40x40', count: true, q: this.q } })
      },
      newPatch(baseApp) {
        return {
          title: baseApp.title,
          applicationName: baseApp.applicationName,
          version: baseApp.version,
          description: baseApp.description,
          public: baseApp.public,
          deprecated: baseApp.deprecated,
          image: baseApp.image,
          privateAccess: baseApp.privateAccess || [],
        }
      },
      async applyPatch(baseApp, patch) {
        const actualPatch = { ...patch }
        if (actualPatch.public) actualPatch.privateAccess = []
        await this.$axios.$patch(`api/v1/base-applications/${baseApp.id}`, actualPatch)
        Object.keys(actualPatch).forEach(key => {
          this.$set(baseApp, key, actualPatch[key])
        })
      },
      async add() {
        try {
          await this.$axios.$post('api/v1/base-applications', { url: this.urlToAdd })
          eventBus.$emit('notification', { type: 'success', msg: 'Application de base ajoutée' })
        } catch (error) {
          eventBus.$emit('notification', { error, msg: 'Impossible d\'ajouter\' l\'application de base' })
        }
        this.refresh()
      },
      listOrganizations: async function() {
        if (this.search && this.search === this.currentEntity.name) return

        this.loadingOrganizations = true
        if (!this.searchOrganizations || this.searchOrganizations.length < 3) {
          this.organizations = this.patch.privateAccess
        } else {
          this.organizations = this.patch.privateAccess.concat((await this.$axios.$get(this.env.directoryUrl + '/api/organizations', { params: { q: this.searchOrganizations } }))
            .results.map(r => ({ ...r, type: 'organization' })),
          )
        }
        this.loadingOrganizations = false
      },
    },
  }
</script>

<style lang="css">
</style>
