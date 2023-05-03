<template lang="html">
  <v-row>
    <v-col
      cols="12"
      md="6"
      lg="5"
      order-md="2"
    >
      <v-sheet v-if="!simple">
        <v-list dense>
          <owner-list-item :owner="dataset.owner" />

          <v-list-item
            v-if="dataset.file"
            style="overflow: hidden;"
          >
            <v-list-item-avatar class="ml-0 my-0">
              <v-icon>mdi-file</v-icon>
            </v-list-item-avatar>
            <span>{{ (dataset.remoteFile || dataset.originalFile || dataset.file).name }} {{ ((dataset.remoteFile || dataset.originalFile || dataset.file).size) | bytes($i18n.locale) }}</span>
          </v-list-item>

          <v-list-item :title="$t('updatedAt')">
            <v-list-item-avatar class="ml-0 my-0">
              <v-icon>mdi-pencil</v-icon>
            </v-list-item-avatar>
            <span>{{ dataset.updatedBy.name }} {{ dataset.updatedAt | moment("lll") }}</span>
          </v-list-item>

          <v-list-item
            v-if="dataset.dataUpdatedAt"
            :title="$t('dataUpdatedAt')"
          >
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
            <nuxt-link
              :to="`/datasets?children=${dataset.id}`"
              v-text="$tc('virtualDatasets', nbVirtualDatasets)"
            />
          </v-list-item>

          <v-list-item v-if="dataset.isRest">
            <v-list-item-avatar class="ml-0 my-0">
              <v-icon>mdi-all-inclusive</v-icon>
            </v-list-item-avatar>
            <span v-t="'restDataset'" />
          </v-list-item>
          <v-list-item v-if="dataset.isRest">
            <v-list-item-avatar class="ml-0 my-0">
              <v-icon :disabled="!dataset.rest.history">
                mdi-history
              </v-icon>
            </v-list-item-avatar>
            <span
              v-if="dataset.rest.history"
              v-t="'history'"
            />
            <span
              v-else
              v-t="'noHistory'"
            />
            <dataset-edit-history
              v-if="can('writeDescriptionBreaking')"
              :history="dataset.rest.history"
              @change="history => {dataset.rest.history = history; patch({rest: dataset.rest})}"
            />
          </v-list-item>
          <v-list-item v-if="dataset.isRest && dataset.rest.history">
            <v-list-item-avatar class="ml-0 my-0">
              <v-icon
                :disabled="!dataset.rest.historyTTL.active"
                color="warning"
              >
                mdi-delete-clock
              </v-icon>
            </v-list-item-avatar>
            <span
              v-if="dataset.rest.historyTTL.active"
              v-t="{path: 'historyTTL', args: {days: dataset.rest.historyTTL.delay.value}}"
            />
            <span
              v-else
              v-t="'noHistoryTTL'"
            />
            <dataset-edit-ttl
              v-if="can('writeDescriptionBreaking')"
              :ttl="dataset.rest.historyTTL"
              :schema="dataset.schema"
              :revisions="true"
              @change="ttl => {dataset.rest.historyTTL = ttl; patch({rest: dataset.rest})}"
            />
          </v-list-item>
          <v-list-item v-if="dataset.isRest">
            <v-list-item-avatar class="ml-0 my-0">
              <v-icon
                :disabled="!dataset.rest.ttl.active"
                color="warning"
              >
                mdi-delete-restore
              </v-icon>
            </v-list-item-avatar>
            <span
              v-if="dataset.rest.ttl.active"
              v-t="{path: 'ttl', args: {col: dataset.rest.ttl.prop, days: dataset.rest.ttl.delay.value}}"
            />
            <span
              v-else
              v-t="'noTTL'"
            />
            <dataset-edit-ttl
              v-if="can('writeDescriptionBreaking')"
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
        clearable
        :required="required.includes('license')"
        :rules="required.includes('license') ? [(val) => !!val]: []"
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
        :required="required.includes('topics')"
        :rules="required.includes('topics') ? [(val) => !!val.length]: []"
        @input="patch({topics: dataset.topics})"
      />
      <v-select
        v-if="editProjection && projections"
        v-model="dataset.projection"
        :items="projections"
        :disabled="!can('writeDescriptionBreaking')"
        item-text="title"
        item-key="code"
        :label="$t('projection')"
        return-object
        hide-details
        class="mb-3"
        clearable
        :loading="!projections"
        @input="patch({projection: dataset.projection})"
      />
      <v-text-field
        v-model="dataset.origin"
        :disabled="!can('writeDescription')"
        :label="$t('origin')"
        hide-details
        class="mb-3"
        clearable
        :required="required.includes('origin')"
        :rules="required.includes('origin') ? [(val) => !!val]: []"
        @change="patch({origin: dataset.origin})"
      />
      <v-text-field
        v-model="dataset.image"
        :disabled="!can('writeDescription')"
        :label="$t('image')"
        hide-details
        class="mb-3"
        clearable
        :required="required.includes('image')"
        :rules="required.includes('image') ? [(val) => !!val]: []"
        @change="patch({image: dataset.image})"
      />
      <v-combobox
        v-if="datasetsMetadata && datasetsMetadata.keywords && datasetsMetadata.keywords.active"
        v-model="dataset.keywords"
        :items="keywordsFacets && keywordsFacets.map(f => f.value)"
        :disabled="!can('writeDescription')"
        :label="$t('keywords')"
        hide-details
        multiple
        chips
        deletable-chips
        class="mb-3"
        :loading="loadingKeywordsFacets"
        :required="required.includes('keywords')"
        :rules="required.includes('keywords') ? [(val) => !!val.length]: []"
        @update:search-input="fetchKeywordsFacets"
        @change="patch({keywords: dataset.keywords})"
      />
      <v-combobox
        v-if="datasetsMetadata && datasetsMetadata.spatial && datasetsMetadata.spatial.active"
        v-model="dataset.spatial"
        :items="spatialFacets && spatialFacets.map(f => f.value)"
        :disabled="!can('writeDescription')"
        :label="$t('spatial')"
        hide-details
        class="mb-3"
        :loading="loadingSpatialFacets"
        clearable
        :required="required.includes('spatial')"
        :rules="required.includes('spatial') ? [(val) => !!val]: []"
        @update:search-input="fetchSpatialFacets"
        @change="patch({spatial: dataset.spatial})"
      />
      <v-text-field
        v-if="datasetsMetadata && datasetsMetadata.temporal && datasetsMetadata.temporal.active"
        :value="formatTemporal(dataset.temporal)"
        readonly
        :label="$t('temporal')"
        hide-details
        class="mb-3"
        clearable
        :required="required.includes('temporal')"
        :rules="required.includes('temporal') ? [(val) => !!val]: []"
        @click="temporalMenu = true"
        @click:clear="patch({temporal: null})"
      >
        <template #append>
          <v-menu
            v-model="temporalMenu"
            left
            :close-on-content-click="false"
          >
            <template #activator="{attrs, on}">
              <v-icon
                v-bind="attrs"
                v-on="on"
              >
                mdi-calendar
              </v-icon>
            </template>
            <v-date-picker
              :value="[dataset.temporal && dataset.temporal.start, dataset.temporal && dataset.temporal.end].filter(d => !!d)"
              multiple
              @input="setTemporalDates"
            />
          </v-menu>
        </template>
      </v-text-field>
      <v-select
        v-if="datasetsMetadata && datasetsMetadata.frequency && datasetsMetadata.frequency.active"
        v-model="dataset.frequency"
        :items="frequencies"
        :disabled="!can('writeDescription')"
        :label="$t('frequency')"
        hide-details
        clearable
        class="mb-3"
        :required="required.includes('frequency')"
        :rules="required.includes('frequency') ? [(val) => !!val]: []"
        @change="patch({frequency: dataset.frequency || ''})"
      />
    </v-col>
    <v-col
      cols="12"
      md="6"
      lg="7"
      order-md="1"
      class="pt-5"
    >
      <v-text-field
        v-model="dataset.title"
        :disabled="!can('writeDescription')"
        :label="$t('title')"
        outlined
        dense
        hide-details
        class="mb-3"
        :required="required.includes('title')"
        :rules="required.includes('title') ? [(val) => !!val]: []"
        @change="patch({title: dataset.title})"
      />
      <markdown-editor
        v-model="dataset.description"
        :disabled="!can('writeDescription')"
        :label="$t('description')"
        :required="required.includes('description')"
        :rules="required.includes('description') ? [(val) => !!val]: []"
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
  restDataset: Jeu de données éditable
  ttl: Supprimer automatiquement les lignes dont la colonne {col} contient une date dépassée de {days} jours.
  noTTL: pas de politique d'expiration des lignes configurée
  licence: Licence
  topics: Thématiques
  projection: Projection cartographique
  origin: Provenance
  image: Adresse d'une image utilisée comme vignette
  spatial: Couverture géographique
  temporal: Couverture temporelle
  keywords: Mots clés
  frequency: Fréquence des mises à jour
  title: Titre
  description: Description
  frequencyItems:
    triennial: tous les 3 ans
    biennial: tous les 2 ans
    annual: tous les ans
    semiannual: 2 fois par an
    threeTimesAYear: 3 fois par an
    quarterly: chaque trimestre
    bimonthly: tous les 2 mois
    monthly: tous les mois
    semimonthly: 2 fois par mois
    biweekly: toutes les 2 semaines
    threeTimesAMonth: 3 fois par mois
    weekly: chaque semaine
    semiweekly: 2 fois par semaine
    threeTimesAWeek: 3 fois par semaine
    daily: tous les jours
    continuous: en continu
    irregular: irrégulier
  noHistory: Pas d'historisation (ne conserve pas les révisions des lignes)
  history: Historisation (conserve les révisions des lignes)
  historyTTL: Supprimer automatiquement les révisions de lignes qui datent de plus de {days} jours.
  noHistoryTTL: pas de politique d'expiration des révisions configurée
en:
  updatedAt: last update of metadata
  dataUpdatedAt: last update of data
  lines: no line | 1 line | {count} lines
  virtualDatasets: no virtual dataset | 1 virtual dataset | {count} virtual datasets
  restDataset: Editable dataset
  ttl: Automatically delete lines whose column {col} contains a date exceeded by {days} days.
  noTTL: no automatic expiration of lines configured
  licence: License
  topics: Topics
  projection: Map projection
  origin: Origin
  image: URL of an image used as thumbnail
  spatial: Spatial coverage
  temporal: Temporal coverage
  keywords: Keywords
  frequency: Update frequency
  title: Title
  description: Description
  frequencyItems:
    triennial: every 3 years
    biennial: every 2 years
    annual: every year
    semiannual: twice a year
    threeTimesAYear: 3 times a year
    quarterly: every quarter
    bimonthly: every 2 months
    monthly: every month
    semimonthly: twice a month
    biweekly: every 2 weeks
    threeTimesAMonth: 3 times a month
    weekly: every week
    semiweekly: twice a week
    threeTimesAWeek: 3 times a week
    daily: every day
    continuous: continuous
    irregular: irregular
  history: History (store revisions of lines)
  noHistory: 'No history configured (do not store revisions of lines)'
  historyTTL: Automatically delete revisions more than {days} days old.
  noHistoryTTL: no automatic expiration of revisions configured
</i18n>

<script>
const { mapState, mapActions, mapGetters } = require('vuex')

const coordXUri = 'http://data.ign.fr/def/geometrie#coordX'
const coordYUri = 'http://data.ign.fr/def/geometrie#coordY'
const projectGeomUri = 'http://data.ign.fr/def/geometrie#Geometry'

export default {
  props: {
    required: { type: Array, default: () => ([]) },
    simple: { type: Boolean, default: false }
  },
  data () {
    return {
      error: null,
      spatialFacets: null,
      loadingSpatialFacets: false,
      keywordsFacets: null,
      loadingKeywordsFacets: false,
      temporalMenu: false
    }
  },
  computed: {
    ...mapState(['projections']),
    ...mapState('dataset', ['dataset', 'nbVirtualDatasets']),
    ...mapState('session', ['user']),
    ...mapGetters('dataset', ['can', 'resourceUrl']),
    licenses () {
      return this.$store.getters.ownerLicenses(this.dataset.owner)
    },
    topics () {
      return this.$store.getters.ownerTopics(this.dataset.owner)
    },
    datasetsMetadata () {
      return this.$store.getters.ownerDatasetsMetadata(this.dataset.owner)
    },
    editProjection () {
      return !!(this.dataset && this.dataset.schema && (
        (this.dataset.schema.find(p => p['x-refersTo'] === coordXUri) && this.dataset.schema.find(p => p['x-refersTo'] === coordYUri)) ||
        this.dataset.schema.find(p => p['x-refersTo'] === projectGeomUri)
      ))
    },
    frequencies () {
      // https://www.dublincore.org/specifications/dublin-core/collection-description/frequency/
      return ['triennial', 'biennial', 'annual', 'semiannual', 'threeTimesAYear', 'quarterly', 'bimonthly', 'monthly', 'semimonthly', 'biweekly', 'threeTimesAMonth', 'weekly', 'semiweekly', 'threeTimesAWeek', 'daily', 'continuous', 'irregular']
        .map(value => ({ value, text: this.$t('frequencyItems.' + value) })).reverse()
    }
  },
  watch: {
    licenses () {
      if (!this.dataset.license) return
      // Matching object reference, so that the select components works
      this.$set(this.dataset, 'license', this.licenses.find(l => l.href === this.dataset.license.href))
    },
    projections () {
      if (!this.dataset.projection) return
      // Matching object reference, so that the select components works
      this.$set(this.dataset, 'projection', this.projections.find(l => l.code === this.dataset.projection.code))
    },
    editProjection: {
      handler () {
        if (this.editProjection) this.$store.dispatch('fetchProjections')
      },
      immediate: true
    }
  },
  async mounted () {
    if (this.dataset) {
      this.$store.dispatch('fetchLicenses', this.dataset.owner)
      this.$store.dispatch('fetchTopics', this.dataset.owner)
      this.$store.dispatch('fetchDatasetsMetadata', this.dataset.owner)
    }

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
    async fetchSpatialFacets (search) {
      if (this.spatialFacets || !search) return
      this.loadingSpatialFacets = true
      this.spatialFacets = (await this.$axios.$get('api/v1/datasets', {
        params: { size: 0, facets: 'spatial', owner: `${this.dataset.owner.type}:${this.dataset.owner.id}` }
      })).facets.spatial
      this.loadingSpatialFacets = false
    },
    async fetchKeywordsFacets (search) {
      if (this.keywordsFacets || !search) return
      this.loadingKeywordsFacets = true
      this.keywordsFacets = (await this.$axios.$get('api/v1/datasets', {
        params: { size: 0, facets: 'keywords', owner: `${this.dataset.owner.type}:${this.dataset.owner.id}` }
      })).facets.keywords
      this.loadingKeywordsFacets = false
    },
    setTemporalDates (dates) {
      dates.sort()
      if (dates.length === 3) {
        dates[1] = dates[2]
        delete dates[2]
      }
      const temporal = {}
      if (dates[0]) temporal.start = dates[0]
      if (dates[1]) temporal.end = dates[1]
      this.$set(this.dataset, 'temporal', temporal)
      this.patch({ temporal: temporal })
    },
    formatTemporal (temporal) {
      if (!temporal || !temporal.start) return ''
      let str = this.$moment(temporal.start).format('LL')
      if (temporal.end) str += ' - ' + this.$moment(temporal.end).format('LL')
      return str
    }
  }
}
</script>

<style lang="css">
</style>
