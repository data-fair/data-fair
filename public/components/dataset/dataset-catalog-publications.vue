<template lang="html">
  <v-container fluid>
    <p v-t="'message'" />

    <p v-if="!dataset.publications.length" v-t="'noPublication'" />

    <v-btn
      v-if="can('writeDescription')"
      v-t="'publish'"
      color="primary"
      @click="addPublicationDialog = true"
    />

    <v-list
      v-if="dataset.publications.length"
      two-line
    >
      <v-list-item
        v-for="(publication, i) in dataset.publications"
        :key="publication.id"
      >
        <v-list-item-content v-if="catalogsById[publication.catalog]">
          <v-list-item-title v-if="publication.addToDataset && publication.addToDataset.id" v-t="{path: 'resourcePublication', args: {dataset: publication.addToDataset.title, catalog: catalogsById[publication.catalog].title}}" />
          <v-list-item-title v-else>
            {{ $t('datasetPublication', {catalog: catalogsById[publication.catalog].title}) }}
            <span v-if="publication.publishedAt">({{ publication.publishedAt | moment('lll') }})</span>
          </v-list-item-title>
          <v-list-item-subtitle v-if="publication.status==='published'">
            <a
              :href="publication.targetUrl"
              target="_blank"
            >{{ publication.targetUrl }}</a>
          </v-list-item-subtitle>
          <v-list-item-subtitle
            v-else-if="publication.status==='error'"
            style="color:red;"
          >
            {{ publication.error }}
          </v-list-item-subtitle>
          <v-list-item-subtitle v-else-if="publication.status==='deleted'" v-t="'waitingDeletion'" />
          <v-list-item-subtitle v-else v-t="'waitingPublication'" />
        </v-list-item-content>
        <v-list-item-content v-else v-t="{path: 'unknownCatalog', args: {datalog: publication.catalog}}" />
        <v-list-item-action>
          <v-row>
            <v-btn
              v-if="can('writeDescription') && ['error', 'published'].includes(publication.status)"
              color="warning"
              icon
              :title="$t('republish')"
              class="mr-4"
              @click="rePublishInd = i; showRepublishDialog = true;"
            >
              <v-icon>mdi-play</v-icon>
            </v-btn>
            <v-btn
              v-if="can('writeDescription')"
              color="warning"
              icon
              :title="$t('deletePublication')"
              @click="deletePublicationInd = i; showDeleteDialog = true;"
            >
              <v-icon>mdi-delete</v-icon>
            </v-btn>
          </v-row>
        </v-list-item-action>
      </v-list-item>
    </v-list>

    <v-dialog
      v-model="addPublicationDialog"
      max-width="700px"
    >
      <v-card outlined>
        <v-card-title v-t="'addPublication'" primary-title />
        <v-card-text v-if="catalogs">
          <v-form v-model="newPublicationValid">
            <v-select
              v-model="newPublication.catalog"
              :items="catalogs"
              :item-text="catalogLabel"
              :rules="[() => !!newPublication.catalog]"
              item-value="id"
              :label="$t('catalog')"
              required
            />

            <v-autocomplete
              v-model="newPublication.addToDataset"
              :disabled="!newPublication.catalog"
              :items="catalogDatasets"
              :loading="catalogDatasetsLoading"
              :search-input.sync="searchCatalogDatasets"
              class="mb-4"
              :label="$t('addToDataset')"
              :placeholder="$t('search')"
              return-object
              item-text="title"
              item-value="id"
              :hint="$t('addToDatasetEmpty')"
              persistent-hint
              :no-data-text="$t('datasetNoMatch')"
            />
          </v-form>
        </v-card-text>

        <v-card-actions>
          <v-spacer />
          <v-btn
            v-t="'cancel'"
            text
            @click="addPublicationDialog = false"
          />
          <v-btn
            v-t="'add'"
            :disabled="!newPublicationValid"
            color="primary"
            @click="addPublicationDialog = false; addPublication(newPublication)"
          />
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog
      v-model="showDeleteDialog"
      max-width="500"
    >
      <v-card v-if="showDeleteDialog" outlined>
        <v-card-title v-t="'deletePublication'" primary-title />
        <v-card-text v-html="$t('deletionMessage')" />
        <v-card-actions>
          <v-spacer />
          <v-btn
            v-t="'no'"
            text
            @click="showDeleteDialog = false"
          />
          <v-btn
            v-t="'yes'"
            color="warning"
            @click="showDeleteDialog = false; deletePublication(deletePublicationInd)"
          />
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="showRepublishDialog" max-width="500">
      <v-card v-if="showRepublishDialog" outlined>
        <v-card-title v-t="'republish'" primary-title />
        <v-card-text v-html="$t('republishMessage')" />
        <v-card-actions>
          <v-spacer />
          <v-btn
            v-t="'no'"
            text
            @click="showRepublishDialog = false"
          />
          <v-btn
            v-t="'yes'"
            color="warning"
            @click="showRepublishDialog = false; rePublish(rePublishInd)"
          />
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  message: Publiez ce jeu de données sur un ou plusieurs catalogues Open Data. Cette publication rendra vos données plus faciles à trouver et permettra à la communauté Open Data d'échanger avec vous.
  noPublication: Il n'existe pas encore de publication de ce jeu de données sur un catalogue.
  publish: Publier sur un catalogue
  resourcePublication: Ressource associée au jeu de données "{dataset}" sur le catalogue "{catalog}"
  datasetPublication: Jeu de données publié sur le catalogue "{catalog}"
  waitingDeletion: En attente de suppression
  waitingPublication: En attente de publication
  unknownCatalog: Cette publication référence une configuration de catalogue inconnue ({catalog}).
  republish: Re-publier
  republishMessage: Voulez vous vraiment effectuer de nouveau la publication ?<br><br><b>Attention</b> si vous avez effectué des modifications sur le catalogue depuis la dernière publication elles seront perdues.
  addPublication: Ajout d'une nouvelle publication
  deletePublication: Supprimer cette publication
  deletionMessage: Voulez vous vraiment supprimer la publication ? La suppression est définitive et les données ne pourront pas être récupérées.<br><br><b>Attention</b> les données seront également supprimées dans le catalogue destinataire de la publication.
  catalog: Catalogue
  addToDataset: Ajouter comme ressource à un jeu de données du catalogue
  search: Rechercher
  addToDatasetEmpty: Laissez vide pour créer un nouveau jeu de données dans le catalogue.
  datasetNoMatch: Aucun jeu de données du catalogue ne correspond
  cancel: Annuler
  add: Ajouter
  no: Non
  yes: Oui
en:
  message: Publish this dataset onto one or more Open Data catalogs. This publication will make your data easier to find et will allow the Open Data community to interact with you.
  noPublication: There are no publication of this dataset on a catalog yet.
  publish: Publish on a catalog
  resourcePublication: Resource associated to the dataset "{dataset}" in the catalog "{catalog}"
  datasetPublication: Dataset published on the catalog "{catalog}"
  waitingDeletion: Waiting for deletion
  waitingPublication: Waiting for publication
  unknownCatalog: This publication references an unknown configuration of catalog ({catalog})
  republish: Re-publish
  republishMessage: Do you really want to re-publish ?<br><br><b>Warning</b> if you mage changes in the catalog since the last publication they will be lost.
  addPublication: Add a publication
  deletePublication: Delete this publication
  deletionMessage: Do you really want to delete the publication ? The deletion is definitive and the data will not be recoverable.<br><br><b>Warning</b> the data will also be delete in the catalog target of the publication.
  catalog: Catalog
  addToDataset: Add as a resource to a dataset of the catalog
  search: Search
  addToDatasetEmpty: Leave empty to create a new dataset in the catalog
  datasetNoMatch: No dataset from the catalog matches this search
  cancel: Cancel
  add: Add
  no: No
  yes: Yes
</i18n>

<script>
  import { mapState, mapGetters, mapActions } from 'vuex'
  import eventBus from '~/event-bus'

  export default {
    data() {
      return {
        addPublicationDialog: false,
        newPublicationValid: false,
        newPublication: {
          catalog: null,
          status: 'waiting',
        },
        deletePublicationInd: null,
        rePublishInd: null,
        showDeleteDialog: false,
        showRepublishDialog: false,
        catalogs: [],
        catalogDatasets: [],
        catalogDatasetsLoading: false,
        searchCatalogDatasets: '',
      }
    },
    computed: {
      ...mapState(['env']),
      ...mapState('dataset', ['dataset']),
      ...mapGetters('dataset', ['can', 'journalChannel']),
      catalogsById() {
        return this.catalogs.reduce((a, c) => { a[c.id] = c; return a }, {})
      },
    },
    watch: {
      async searchCatalogDatasets() {
        if (!this.searchCatalogDatasets || this.searchCatalogDatasets === (this.newPublication.addToDataset && this.newPublication.addToDataset.title)) return
        this.catalogDatasetsLoading = true
        const catalog = this.catalogsById[this.newPublication.catalog]
        this.catalogDatasets = (await this.$axios.$get(`api/v1/catalogs/${catalog.id}/datasets`, { params: { q: this.searchCatalogDatasets } }))
          .results
          .map(r => ({ id: r.id, title: r.title }))
        this.catalogDatasetsLoading = false
      },
    },
    async created() {
      const params = { owner: this.dataset.owner.type + ':' + this.dataset.owner.id }
      this.catalogs = (await this.$axios.$get('api/v1/catalogs', { params })).results
      eventBus.$on(this.journalChannel, this.onJournalEvent)
    },
    async destroyed() {
      eventBus.$off(this.journalChannel, this.onJournalEvent)
    },
    methods: {
      ...mapActions('dataset', ['patch', 'fetchInfo']),
      onJournalEvent(event) {
        if (event.type === 'publication') this.fetchInfo()
      },
      addPublication(publication) {
        this.dataset.publications.push(publication)
        this.patch({ publications: this.dataset.publications })
      },
      deletePublication(publicationInd) {
        this.dataset.publications[publicationInd].status = 'deleted'
        this.patch({ publications: this.dataset.publications })
      },
      rePublish(publicationInd) {
        this.dataset.publications[publicationInd].status = 'waiting'
        this.patch({ publications: this.dataset.publications })
      },
      catalogLabel(catalog) {
        if (!catalog) return 'catalogue inconnu'
        let label = `${catalog.title} - ${catalog.url}`
        if (catalog.organization && catalog.organization.id) label += ` (${catalog.organization.name})`
        return label
      },
    },
  }

</script>

<style lang="css">
</style>
