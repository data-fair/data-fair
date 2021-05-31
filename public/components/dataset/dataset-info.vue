<template lang="html">
  <v-row>
    <v-col
      cols="12"
      md="6"
      lg="5"
      order-md="2"
    >
      <v-sheet>
        <v-list dense>
          <owner-list-item :owner="dataset.owner" />

          <v-list-item v-if="dataset.file" style="overflow: hidden;">
            <v-list-item-avatar class="ml-0 my-0">
              <v-icon>mdi-file</v-icon>
            </v-list-item-avatar>
            <span>{{ (dataset.remoteFile || dataset.originalFile || dataset.file).name }} {{ ((dataset.remoteFile || dataset.originalFile || dataset.file).size) | displayBytes }}</span>
          </v-list-item>

          <v-list-item>
            <v-list-item-avatar class="ml-0 my-0">
              <v-icon>mdi-pencil</v-icon>
            </v-list-item-avatar>
            <span>{{ dataset.updatedBy.name }} {{ dataset.updatedAt | moment("DD/MM/YYYY, HH:mm") }}</span>
          </v-list-item>

          <v-list-item>
            <v-list-item-avatar class="ml-0 my-0">
              <v-icon>mdi-plus-circle-outline</v-icon>
            </v-list-item-avatar>
            <span>{{ dataset.createdBy.name }} {{ dataset.createdAt | moment("DD/MM/YYYY, HH:mm") }}</span>
          </v-list-item>

          <v-list-item v-if="dataset.count !== undefined">
            <v-list-item-avatar class="ml-0 my-0">
              <v-icon>mdi-view-headline</v-icon>
            </v-list-item-avatar>
            <span>{{ dataset.count.toLocaleString() }} lignes</span>
          </v-list-item>

          <v-list-item v-if="nbVirtualDatasets">
            <v-list-item-avatar class="ml-0 my-0">
              <v-icon>mdi-picture-in-picture-bottom-right-outline</v-icon>
            </v-list-item-avatar>
            <nuxt-link :to="`/datasets?children=${dataset.id}`">
              {{ nbVirtualDatasets }} jeu{{ nbVirtualDatasets > 1 ? 'x' : '' }} de données virtuel{{ nbVirtualDatasets > 1 ? 's' : '' }}
            </nuxt-link>
          </v-list-item>

          <v-list-item v-if="dataset.isRest">
            <v-list-item-avatar class="ml-0 my-0">
              <v-icon>mdi-all-inclusive</v-icon>
            </v-list-item-avatar>
            <span>Jeu de données incrémental</span>
          </v-list-item>
          <v-list-item v-if="dataset.isRest">
            <v-list-item-avatar class="ml-0 my-0">
              <v-icon :disabled="!dataset.rest.ttl.active">
                mdi-delete-restore
              </v-icon>
            </v-list-item-avatar>
            <span v-if="dataset.rest.ttl.active">Supprimer automatiquement les lignes dont la colonne {{ dataset.rest.ttl.prop }} contient une date dépassée de {{ dataset.rest.ttl.delay.value.toLocaleString() }} jours.</span>
            <span v-else>pas de politique d'expiration automatique configurée</span>
            <dataset-edit-ttl
              v-if="can('writeDescription')"
              :ttl="dataset.rest.ttl"
              :schema="dataset.schema"
              @change="ttl => {dataset.rest.ttl = ttl; patch({rest: dataset.rest})}"
            />
          </v-list-item>
        </v-list>
      </v-sheet>

      <v-select
        v-model="dataset.license"
        :items="licenses"
        :disabled="!can('writeDescription')"
        item-text="title"
        item-key="href"
        label="Licence"
        return-object
        hide-details
        class="mb-3"
        @input="patch({license: dataset.license})"
      />
      <v-select
        v-if="topics && topics.length"
        v-model="dataset.topics"
        :items="topics"
        :disabled="!can('writeDescription')"
        item-text="title"
        item-key="id"
        label="Thématiques"
        multiple
        return-object
        hide-details
        class="mb-3"
        @input="patch({topics: dataset.topics})"
      />
      <v-select
        v-if="editProjection && projections"
        v-model="dataset.projection"
        :items="projections"
        :disabled="!can('writeDescription')"
        item-text="title"
        item-key="code"
        label="Projection cartographique"
        return-object
        hide-details
        class="mb-3"
        @input="patch({projection: dataset.projection})"
      />
      <v-text-field
        v-model="dataset.origin"
        :disabled="!can('writeDescription')"
        label="Provenance"
        hide-details
        class="mb-3"
        @change="patch({origin: dataset.origin})"
      />
      <v-text-field
        v-model="dataset.image"
        :disabled="!can('writeDescription')"
        label="Adresse d'une image utilisée comme vignette"
        hide-details
        class="mb-3"
        @change="patch({image: dataset.image})"
      />
    </v-col>
    <v-col
      cols="12"
      md="6"
      lg="7"
      order-md="1"
    >
      <v-text-field
        v-model="dataset.title"
        :disabled="!can('writeDescription')"
        label="Titre"
        @change="patch({title: dataset.title})"
      />
      <markdown-editor
        v-model="dataset.description"
        :disabled="!can('writeDescription')"
        label="Description"
        @change="patch({description: dataset.description})"
      />
    </v-col>
  </v-row>
</template>

<script>
  const { mapState, mapActions, mapGetters } = require('vuex')
  const events = require('~/../shared/events.json').dataset

  const coordXUri = 'http://data.ign.fr/def/geometrie#coordX'
  const coordYUri = 'http://data.ign.fr/def/geometrie#coordY'

  export default {
    data() {
      return { events, error: null }
    },
    computed: {
      ...mapState(['projections']),
      ...mapState('dataset', ['dataset', 'nbVirtualDatasets']),
      ...mapState('session', ['user']),
      ...mapGetters('dataset', ['can', 'resourceUrl']),
      licenses() {
        return this.$store.getters.ownerLicenses(this.dataset.owner)
      },
      topics() {
        return this.$store.getters.ownerTopics(this.dataset.owner)
      },
      editProjection() {
        return !!(this.dataset && this.dataset.schema &&
          this.dataset.schema.find(p => p['x-refersTo'] === coordXUri) &&
          this.dataset.schema.find(p => p['x-refersTo'] === coordYUri))
      },
    },
    watch: {
      licenses() {
        if (!this.dataset.license) return
        // Matching object reference, so that the select components works
        this.dataset.license = this.licenses.find(l => l.href === this.dataset.license.href)
      },
      projections() {
        if (!this.dataset.projection) return
        // Matching object reference, so that the select components works
        this.dataset.projection = this.projections.find(l => l.code === this.dataset.projection.code)
      },
    },
    async mounted() {
      if (this.dataset) {
        this.$store.dispatch('fetchLicenses', this.dataset.owner)
        this.$store.dispatch('fetchTopics', this.dataset.owner)
      }
      if (this.editProjection) this.$store.dispatch('fetchProjections')

      // Ping the data endpoint to check that index is available
      try {
        this.data = await this.$axios.$get(this.resourceUrl + '/lines', { size: 0 })
      } catch (err) {
      // Do nothing, error should be added to the journal
      }
    },
    methods: {
      ...mapActions('dataset', ['patch', 'reindex']),
    },
  }
</script>

<style lang="css">
</style>
