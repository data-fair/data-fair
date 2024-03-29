<template lang="html">
  <v-container fluid>
    <p v-t="'message'" />

    <p
      v-if="!dataset.publications.length"
      v-t="'noPublication'"
    />

    <v-btn
      v-if="authorizedCatalogs.length"
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
          <v-list-item-title
            v-if="publication.addToDataset && publication.addToDataset.id"
            v-t="{path: 'resourcePublication', args: {dataset: publication.addToDataset.title, catalog: catalogsById[publication.catalog].title}}"
          />
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
          <v-list-item-subtitle
            v-else-if="publication.status==='deleted'"
            v-t="'waitingDeletion'"
          />
          <v-list-item-subtitle
            v-else
            v-t="'waitingPublication'"
          />
        </v-list-item-content>
        <v-list-item-content
          v-else
          v-t="{path: 'unknownCatalog', args: {datalog: publication.catalog}}"
        />
        <v-list-item-action>
          <v-row>
            <v-btn
              v-if="catalogsById[publication.catalog] && userOwnerRole(catalogsById[publication.catalog].owner) === 'admin' && ['error', 'published'].includes(publication.status)"
              color="warning"
              icon
              :title="$t('republish')"
              class="mr-4"
              @click="rePublishInd = i; showRepublishDialog = true;"
            >
              <v-icon>mdi-play</v-icon>
            </v-btn>
            <v-btn
              v-if="(!catalogsById[publication.catalog] && can('writePublications')) || (catalogsById[publication.catalog] && userOwnerRole(catalogsById[publication.catalog].owner) === 'admin')"
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
        <v-card-title
          v-t="'addPublication'"
          primary-title
        />
        <v-card-text v-if="catalogs && addPublicationDialog">
          <v-form v-model="newPublicationValid">
            <v-select
              v-model="newPublication.catalog"
              :items="authorizedCatalogs"
              :item-text="catalogLabel"
              :rules="[
                c => !!c,
                c => !(dataset.publications || []).find(p => p.catalog === c) || $t('alreadyPublished')
              ]"
              item-value="id"
              :label="$t('catalog')"
              required
            />

            <v-select
              v-model="newPublicationAction"
              :disabled="!newPublication.catalog"
              :label="$t('newPublicationAction')"
              :items="[
                {text: $t('newPublicationActions.newDataset'), value: 'newDataset'},
                {text: $t('newPublicationActions.addToDataset'), value: 'addToDataset'},
                {text: $t('newPublicationActions.replaceDataset'), value: 'replaceDataset'}
              ]"
            />

            <v-autocomplete
              v-if="newPublication.catalog && newPublicationAction === 'addToDataset'"
              v-model="newPublication.addToDataset"
              :items="catalogDatasets"
              :loading="catalogDatasetsLoading"
              :search-input.sync="searchCatalogDatasets"
              class="mb-4"
              :label="$t('searchDataset')"
              return-object
              item-text="title"
              item-value="id"
              persistent-hint
              :no-data-text="$t('datasetNoMatch')"
              :rules="[v => !!v]"
            />

            <v-autocomplete
              v-if="newPublication.catalog && newPublicationAction === 'replaceDataset'"
              v-model="newPublication.replaceDataset"
              :items="catalogDatasets"
              :loading="catalogDatasetsLoading"
              :search-input.sync="searchCatalogDatasets"
              class="mb-4"
              :label="$t('searchDataset')"
              return-object
              item-text="title"
              item-value="id"
              persistent-hint
              :no-data-text="$t('datasetNoMatch')"
              :rules="[v => !!v]"
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
      <v-card
        v-if="showDeleteDialog"
        outlined
      >
        <v-card-title
          v-t="'deletePublication'"
          primary-title
        />
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

    <v-dialog
      v-model="showRepublishDialog"
      max-width="500"
    >
      <v-card
        v-if="showRepublishDialog"
        outlined
      >
        <v-card-title
          v-t="'republish'"
          primary-title
        />
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
  newPublicationAction: Action à effectuer
  newPublicationActions:
    newDataset: Créer un nouveau jeu de données dans le catalogue
    addToDataset: Ajouter comme ressource à un jeu de données du catalogue
    replaceDataset: Écraser un jeu de données du catalogue
  searchDataset: Rechercher un jeu de données
  datasetNoMatch: Aucun jeu de données du catalogue ne correspond
  cancel: Annuler
  add: Ajouter
  no: Non
  yes: Oui
  alreadyPublished: ce jeu de données a déjà été publié sur ce catalogue
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
  newPublicationAction: Action
  newPublicationActions:
    newDataset: Create a new dataset in the catalog
    addToDataset: Add as a resource to a dataset of the catalog
    replaceDataset: Overwirte a dataset of the catalog
  searchDataset: Search a dataset
  datasetNoMatch: No dataset from the catalog matches this search
  cancel: Cancel
  add: Add
  no: No
  yes: Yes
  alreadyPublished: this dataset was already published on this catalog
</i18n>

<script>
import { mapState, mapGetters, mapActions } from 'vuex'
import catalogPublicationsMixin from '~/mixins/catalog-publications'

export default {
  mixins: [catalogPublicationsMixin],
  data () {
    return {
      catalogDatasets: [],
      catalogDatasetsLoading: false,
      searchCatalogDatasets: ''
    }
  },
  computed: {
    ...mapState('dataset', ['dataset']),
    ...mapGetters('dataset', ['journalChannel', 'can']),
    resource () {
      return this.dataset
    }
  },
  watch: {
    async searchCatalogDatasets () {
      if (!this.searchCatalogDatasets || this.searchCatalogDatasets === (this.newPublication.addToDataset && this.newPublication.addToDataset.title)) return
      this.catalogDatasetsLoading = true
      const catalog = this.catalogsById[this.newPublication.catalog]
      this.catalogDatasets = (await this.$axios.$get(`api/v1/catalogs/${catalog.id}/datasets`, { params: { q: this.searchCatalogDatasets } }))
        .results
        .map(r => ({ id: r.id, title: r.title }))
      this.catalogDatasetsLoading = false
    },
    addPublicationDialog () {
      this.newPublicationAction = 'newDataset'
    },
    newPublicationAction (v) {
      delete this.newPublication.addToDataset
      delete this.newPublication.replaceDataset
    }
  },
  methods: {
    ...mapActions('dataset', ['patch', 'fetchInfo'])
  }
}

</script>

<style lang="css">
</style>
