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
            <span>{{ (dataset.remoteFile || dataset.originalFile || dataset.file).name }} {{ ((dataset.remoteFile || dataset.originalFile || dataset.file).size) | displayBytes($i18n.locale) }}</span>
          </v-list-item>

          <v-list-item :title="$t('updatedAt')">
            <v-list-item-avatar class="ml-0 my-0">
              <v-icon>mdi-pencil</v-icon>
            </v-list-item-avatar>
            <span>{{ dataset.updatedBy.name }} {{ dataset.updatedAt | moment("lll") }}</span>
          </v-list-item>

          <v-list-item v-if="dataset.dataUpdatedAt" :title="$t('dataUpdatedAt')">
            <v-list-item-avatar class="ml-0 my-0">
              <v-icon>{{ dataset.isRest ? 'mdi-playlist-edit' : 'mdi-upload' }}</v-icon>
            </v-list-item-avatar>
            <span>{{ dataset.dataUpdatedBy.name }} {{ dataset.dataUpdatedAt | moment("lll") }}</span>
          </v-list-item>

          <v-list-item title="création">
            <v-list-item-avatar class="ml-0 my-0">
              <v-icon>mdi-plus-circle-outline</v-icon>
            </v-list-item-avatar>
            <span>{{ dataset.createdBy.name }} {{ dataset.createdAt | moment("lll") }}</span>
          </v-list-item>

          <v-list-item v-if="dataset.count !== undefined">
            <v-list-item-avatar class="ml-0 my-0">
              <v-icon>mdi-view-headline</v-icon>
            </v-list-item-avatar>
            <span v-text="$tc('lines', dataset.count)" />
          </v-list-item>

          <v-list-item v-if="nbVirtualDatasets">
            <v-list-item-avatar class="ml-0 my-0">
              <v-icon>mdi-picture-in-picture-bottom-right-outline</v-icon>
            </v-list-item-avatar>
            <nuxt-link :to="`/datasets?children=${dataset.id}`" v-text="$tc('virtualDatasets', nbVirtualDatasets)" />
          </v-list-item>

          <v-list-item v-if="dataset.isRest">
            <v-list-item-avatar class="ml-0 my-0">
              <v-icon>mdi-all-inclusive</v-icon>
            </v-list-item-avatar>
            <span v-t="'restDataset'" />
          </v-list-item>
          <v-list-item v-if="dataset.isRest">
            <v-list-item-avatar class="ml-0 my-0">
              <v-icon :disabled="!dataset.rest.ttl.active">
                mdi-delete-restore
              </v-icon>
            </v-list-item-avatar>
            <span v-if="dataset.rest.ttl.active" v-t="{path: 'ttl', args: {col: dataset.rest.ttl.prop, days: dataset.rest.ttl.delay.value}}" />
            <span v-else v-t="'noTTL'" />
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
        :label="$t('licence')"
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
        :label="$t('topics')"
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
        :label="$t('projection')"
        return-object
        hide-details
        class="mb-3"
        @input="patch({projection: dataset.projection})"
      />
      <v-text-field
        v-model="dataset.origin"
        :disabled="!can('writeDescription')"
        :label="$t('origin')"
        hide-details
        class="mb-3"
        @change="patch({origin: dataset.origin})"
      />
      <v-text-field
        v-model="dataset.image"
        :disabled="!can('writeDescription')"
        :label="$t('image')"
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
        :label="$t('title')"
        @change="patch({title: dataset.title})"
      />
      <markdown-editor
        v-model="dataset.description"
        :disabled="!can('writeDescription')"
        :label="$t('description')"
        @change="patch({description: dataset.description})"
      />
    </v-col>
  </v-row>
</template>

<i18n lang="yaml">
fr:
  updatedAt: dernière mise à jour des métadonnées
  dataUpdatedAt: dernière mise à jour des données
  lines: aucune ligne | 1 ligne | {count} lignes
  virtualDatasets: pas de jeu de données virtual | 1 jeu de données virtuel | {count} jeux de données virtuels
  restDataset: Jeu de données incrémental
  ttl: Supprimer automatiquement les lignes dont la colonne {col} contient une date dépassée de {days} jours.
  noTTL: pas de politique d'expiration automatique configurée
  licence: Licence
  topics: Thématiques
  projection: Projection cartographique
  origin: Provenance
  image: Adresse d'une image utilisée comme vignette
  title: Titre
  description: Description
en:
  updatedAt: last update of metadata
  dataUpdatedAt: last update of data
  lines: no line | 1 line | {count} lines
  virtualDatasets: no virtual dataset | 1 virtual dataset | {count} virtual datasets
  restDataset: Incremental dataset
  ttl: Automatically delete lines whose column {col} contains a date exceeded by {days} days.
  noTTL: no automatic expiration configured
  licence: License
  topics: Topics
  projection: Map projection
  origin: Origin
  image: URL of an image used as thumbnail
  title: Title
  description: Description
</i18n>

<script>
  const { mapState, mapActions, mapGetters } = require('vuex')

  const coordXUri = 'http://data.ign.fr/def/geometrie#coordX'
  const coordYUri = 'http://data.ign.fr/def/geometrie#coordY'

  export default {
    data() {
      return { error: null }
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
        if (!this.dataset.isMetaOnly) {
          this.data = await this.$axios.$get(this.resourceUrl + '/lines', { params: { size: 0, draft: !!this.dataset.draftReason } })
        }
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
