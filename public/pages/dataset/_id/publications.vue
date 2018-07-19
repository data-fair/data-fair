<template lang="html">
  <v-container>
    <p>
      Publiez ce jeu de données sur un ou plusieurs catalogues Open Data.
      Cette publication rendra vos données plus faciles à trouver et permettra à la communauté Open Data d'échanger avec vous.
    </p>

    <p v-if="!dataset.publications.length">
      Il n'existe pas encore de publication de ce jeu de données.
    </p>
    <v-list two-line v-else>
      <v-list-tile v-for="(publication, i) in dataset.publications" :key="publication.id">
        <v-list-tile-content v-if="catalogsById[publication.catalog]">
          <v-list-tile-title v-if="publication.addToDataset && publication.addToDataset.id">Ressource ajoutée au jeu de données "{{ publication.addToDataset.title }}" sur le catalogue "{{ catalogsById[publication.catalog].title }}"</v-list-tile-title>
          <v-list-tile-title v-else>Jeu de données publié sur le catalogue "{{ catalogsById[publication.catalog].title }}"</v-list-tile-title>
          <v-list-tile-sub-title v-if="publication.status==='published'"><a :href="publication.targetUrl" target="_blank">{{ publication.targetUrl }}</a></v-list-tile-sub-title>
          <v-list-tile-sub-title v-else-if="publication.status==='error'" style="color:red;">{{ publication.error }}</v-list-tile-sub-title>
          <v-list-tile-sub-title v-else-if="publication.status==='deleted'">En attente de suppression</v-list-tile-sub-title>
          <v-list-tile-sub-title v-else>En attente de publication</v-list-tile-sub-title>
        </v-list-tile-content>
        <v-list-tile-action>
          <v-btn v-if="can('writeDescription')" color="warning" icon flat title="Supprimer cette publication" @click="deletePublicationInd = i; showDeleteDialog = true;">
            <v-icon>delete</v-icon>
          </v-btn>
        </v-list-tile-action>
      </v-list-tile>
    </v-list>

    <v-layout row wrap v-if="can('writeDescription')">
      <v-spacer/>
      <v-btn color="primary" @click="addPublicationDialog = true">Ajouter une publication</v-btn>
    </v-layout>

    <v-dialog v-model="addPublicationDialog" max-width="700px">
      <v-card>
        <v-card-title primary-title>
          Ajout d'une nouvelle publication
        </v-card-title>
        <v-card-text v-if="catalogs">
          <v-form v-model="newPublicationValid">
            <v-select
              :items="catalogs"
              :item-text="catalogLabel"
              item-value="id"
              v-model="newPublication.catalog"
              label="Catalogue"
              required
              :rules="[() => !!newPublication.catalog]"
            />

            <v-autocomplete
              class="mb-4"
              :disabled="!newPublication.catalog"
              v-model="newPublication.addToDataset"
              :items="catalogDatasets"
              :loading="catalogDatasetsLoading"
              :search-input.sync="searchCatalogDatasets"
              label="Ajouter comme ressource à un jeu de données du catalogue"
              placeholder="Tapez pour rechercher"
              return-object
              item-text="title"
              item-value="id"
              hint="Laissez vide pour créer un nouveau jeu de données dans le catalogue."
              persistent-hint
              no-data-text="Aucun jeu de données du catalogue ne correspond"
            />
          </v-form>
        </v-card-text>

        <v-card-actions>
          <v-spacer/>
          <v-btn flat @click="addPublicationDialog = false">Annuler</v-btn>
          <v-btn color="primary" :disabled="!newPublicationValid" @click="addPublicationDialog = false; addPublication(newPublication)">Ajouter</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="showDeleteDialog" max-width="500">
      <v-card v-if="showDeleteDialog">
        <v-card-title primary-title>
          Suppression d'une publication
        </v-card-title>
        <v-card-text>
          Voulez vous vraiment supprimer la publication ? La suppression est définitive et les données ne pourront pas être récupérées.
          <br>
          <br>
          <b>Attention</b> les données seront également supprimées dans le catalogue destinataire de la publication.
        </v-card-text>
        <v-card-actions>
          <v-spacer/>
          <v-btn flat @click="showDeleteDialog = false">Non</v-btn>
          <v-btn color="warning" @click="showDeleteDialog = false; deletePublication(deletePublicationInd)">Oui</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script>
import {mapState, mapGetters, mapActions} from 'vuex'
import eventBus from '../../../event-bus.js'

export default {
  data() {
    return {
      addPublicationDialog: false,
      newPublicationValid: false,
      newPublication: {
        catalog: null,
        status: 'waiting'
      },
      deletePublicationInd: null,
      showDeleteDialog: false,
      catalogs: [],
      catalogDatasets: [],
      catalogDatasetsLoading: false,
      searchCatalogDatasets: ''
    }
  },
  computed: {
    ...mapState(['env']),
    ...mapState('dataset', ['dataset']),
    ...mapGetters('dataset', ['can', 'journalChannel']),
    catalogsById() {
      return this.catalogs.reduce((a, c) => { a[c.id] = c; return a }, {})
    }
  },
  watch: {
    async searchCatalogDatasets() {
      if (!this.searchCatalogDatasets || this.searchCatalogDatasets === (this.newPublication.addToDataset && this.newPublication.addToDataset.title)) return
      this.catalogDatasetsLoading = true
      const catalog = this.catalogsById[this.newPublication.catalog]
      this.catalogDatasets = (await this.$axios.$get('api/v1/catalogs/_datasets', {params: {type: catalog.type, url: catalog.url, q: this.searchCatalogDatasets}})).results
      this.catalogDatasetsLoading = false
    }
  },
  async created() {
    const params = {'owner-type': this.dataset.owner.type, 'owner-id': this.dataset.owner.id}
    this.catalogs = (await this.$axios.$get('api/v1/catalogs', {params})).results
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
      this.patch({publications: this.dataset.publications})
    },
    deletePublication(publicationInd) {
      this.dataset.publications[publicationInd].status = 'deleted'
      this.patch({publications: this.dataset.publications})
    },
    catalogLabel(catalog) {
      if (!catalog) return 'catalogue inconnu'
      let label = `${catalog.title} - ${catalog.url}`
      if (catalog.organization && catalog.organization.id) label += ` (${catalog.organization.name})`
      return label
    }
  }
}

</script>

<style lang="css">
</style>
