<template lang="html">
  <v-container fluid>
    <p v-if="baseApps && baseApps.count === 0">Aucune application de base</p>
    <v-card v-else-if="baseApps">
      <v-list three-line>
        <v-list-tile v-for="baseApp in baseApps.results" :key="baseApp.id" avatar>
          <v-list-tile-avatar tile>
            <img :src="baseApp.thumbnail">
          </v-list-tile-avatar>
          <v-list-tile-content>
            <v-list-tile-title>
              {{ baseApp.title }} (<a :href="baseApp.url">{{ baseApp.url }}</a>)
              <v-icon v-if="baseApp.public" color="green">lock_open</v-icon>
              <v-icon v-else color="red">lock</v-icon>
            </v-list-tile-title>
            <v-list-tile-sub-title>{{ baseApp.description }}</v-list-tile-sub-title>
            <v-list-tile-sub-title>
              <nuxt-link :to="{path: '/applications', query: {url: baseApp.url}}">{{ baseApp.nbApps }} application{{ baseApp.nbApps > 1 ? 's' : '' }}</nuxt-link>
              - Jeux de données : {{ baseApp.datasetsFilters }} - Services distants: {{ baseApp.servicesFilters }}
            </v-list-tile-sub-title>
          </v-list-tile-content>
          <v-list-tile-action>
            <v-icon color="primary" @click="currentBaseApp = baseApp; patch = newPatch(baseApp); showEditDialog = true;">edit</v-icon>
          </v-list-tile-action>
        </v-list-tile>
      </v-list>
    </v-card>

    <v-dialog
      v-model="showEditDialog"
      max-width="500px"
      transition="dialog-transition"
      lazy
    >
      <v-card v-if="currentBaseApp">
        <v-card-title primary-title>
          <div>
            <h3 class="headline mb-0">Édition de {{ currentBaseApp.title }} ({{ currentBaseApp.url }})</h3>
          </div>
        </v-card-title>
        <v-card-text>
          <v-form>
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
            <v-checkbox v-model="patch.public" label="Public"/>
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-spacer/>
          <v-btn @click="showEditDialog = false">Annuler</v-btn>
          <v-btn color="primary" @click="applyPatch(currentBaseApp, patch); showEditDialog = false">Enregistrer</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script>
export default {
  data() {
    return {
      baseApps: null,
      patch: {},
      showEditDialog: false,
      currentBaseApp: null
    }
  },
  async mounted() {
    this.baseApps = await this.$axios.$get('api/v1/base-applications', { params: { size: 10000, thumbnail: '40x40', count: true } })
  },
  methods: {
    newPatch(baseApp) {
      return {
        title: baseApp.title,
        description: baseApp.description,
        public: baseApp.public,
        image: baseApp.image
      }
    },
    async applyPatch(baseApp, patch) {
      await this.$axios.$patch(`api/v1/base-applications/${baseApp.id}`, patch)
      Object.keys(patch).forEach(key => {
        this.$set(baseApp, key, patch[key])
      })
    }
  }
}
</script>

<style lang="css">
</style>
