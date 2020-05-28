<template lang="html">
  <v-container>
    <p>
      Publiez ce jeu de données sur un ou plusieurs catalogues Open Data.
      Cette publication rendra vos données plus faciles à trouver et permettra à la communauté Open Data d'échanger avec vous.
    </p>

    <p v-if="!dataset.publications.length">
      Il n'existe pas encore de publication de ce jeu de données.
    </p>
    <v-list
      v-else
      two-line
    >
      <v-list-item
        v-for="(publication, i) in dataset.publications"
        :key="publication.id"
      >
        <v-list-item-content v-if="catalogsById[publication.catalog]">
          <v-list-item-title v-if="publication.addToDataset && publication.addToDataset.id">
            Ressource associée au jeu de données "{{ publication.addToDataset.title }}" sur le catalogue "{{ catalogsById[publication.catalog].title }}"
          </v-list-item-title>
          <v-list-item-title v-else>
            Jeu de données publié sur le catalogue "{{ catalogsById[publication.catalog].title }}" <span v-if="publication.publishedAt">({{ publication.publishedAt | moment("DD/MM/YYYY, HH:mm") }})</span>
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
          <v-list-item-subtitle v-else-if="publication.status==='deleted'">
            En attente de suppression
          </v-list-item-subtitle>
          <v-list-item-subtitle v-else>
            En attente de publication
          </v-list-item-subtitle>
        </v-list-item-content>
        <v-list-item-content v-else>
          Cette publication référence une configuration de catalogue inconnue ({{ publication.catalog }}).
        </v-list-item-content>
        <v-list-item-action>
          <v-row>
            <v-btn
              v-if="can('writeDescription') && ['error', 'published'].includes(publication.status)"
              color="warning"
              icon
              title="Re-publier"
              class="mr-4"
              @click="rePublishInd = i; showRepublishDialog = true;"
            >
              <v-icon>mdi-play</v-icon>
            </v-btn>
            <v-btn
              v-if="can('writeDescription')"
              color="warning"
              icon
              title="Supprimer cette publication"
              @click="deletePublicationInd = i; showDeleteDialog = true;"
            >
              <v-icon>mdi-delete</v-icon>
            </v-btn>
          </v-row>
        </v-list-item-action>
      </v-list-item>
    </v-list>

    <v-row
      v-if="can('writeDescription')"
    >
      <v-spacer />
      <v-btn
        color="primary"
        @click="addPublicationDialog = true"
      >
        Ajouter une publication
      </v-btn>
    </v-row>

    <v-dialog
      v-model="addPublicationDialog"
      max-width="700px"
    >
      <v-card>
        <v-card-title primary-title>
          Ajout d'une nouvelle publication
        </v-card-title>
        <v-card-text v-if="catalogs">
          <v-form v-model="newPublicationValid">
            <v-select
              v-model="newPublication.catalog"
              :items="catalogs"
              :item-text="catalogLabel"
              :rules="[() => !!newPublication.catalog]"
              item-value="id"
              label="Catalogue"
              required
            />

            <v-autocomplete
              v-model="newPublication.addToDataset"
              :disabled="!newPublication.catalog"
              :items="catalogDatasets"
              :loading="catalogDatasetsLoading"
              :search-input.sync="searchCatalogDatasets"
              class="mb-4"
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
          <v-spacer />
          <v-btn text @click="addPublicationDialog = false">
            Annuler
          </v-btn>
          <v-btn
            :disabled="!newPublicationValid"
            color="primary"
            @click="addPublicationDialog = false; addPublication(newPublication)"
          >
            Ajouter
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog
      v-model="showDeleteDialog"
      max-width="500"
    >
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
          <v-spacer />
          <v-btn text @click="showDeleteDialog = false">
            Non
          </v-btn>
          <v-btn
            color="warning"
            @click="showDeleteDialog = false; deletePublication(deletePublicationInd)"
          >
            Oui
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog
      v-model="showRepublishDialog"
      max-width="500"
    >
      <v-card v-if="showRepublishDialog">
        <v-card-title primary-title>
          Re-publication
        </v-card-title>
        <v-card-text>
          Voulez vous vraiment effectuer de nouveau la publication ?
          <br>
          <br>
          <b>Attention</b> si vous avez effectué des modifications sur le catalogue depuis la dernière publication elles seront perdues.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="showRepublishDialog = false">
            Non
          </v-btn>
          <v-btn
            color="warning"
            @click="showRepublishDialog = false; rePublish(rePublishInd)"
          >
            Oui
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

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
