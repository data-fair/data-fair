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
        <v-list-tile-content>
          <v-list-tile-title v-if="catalogsById[publication.catalog]">Jeu de données publié sur {{ catalogsById[publication.catalog].title }}</v-list-tile-title>
          <v-list-tile-sub-title v-if="publication.status==='published'"><a :href="publication.targetUrl" target="_blank">{{ publication.targetUrl }}</a></v-list-tile-sub-title>
          <v-list-tile-sub-title v-else-if="publication.status==='error'">{{ publication.error }}</v-list-tile-sub-title>
          <v-list-tile-sub-title v-else>En attente</v-list-tile-sub-title>
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
          Suppression d'une publication'
        </v-card-title>
        <v-card-text>
          Voulez vous vraiment supprimer la publication vers {{ dataset.publications.targetUrl }} ? La suppression est définitive et les données ne pourront pas être récupérées.
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
      catalogs: []
    }
  },
  computed: {
    ...mapState(['env']),
    ...mapState('dataset', ['dataset']),
    ...mapGetters('dataset', ['can']),
    catalogsById() {
      return this.catalogs.reduce((a, c) => { a[c.id] = c; return a }, {})
    }
  },
  async created() {
    const params = {'owner-type': this.dataset.owner.type, 'owner-id': this.dataset.owner.id}
    this.catalogs = (await this.$axios.$get('api/v1/catalogs', {params})).results
  },
  methods: {
    ...mapActions('dataset', ['patch']),
    addPublication(publication) {
      this.dataset.publications.push(publication)
      this.patch({publications: this.dataset.publications})
    },
    deletePublication(publicationInd) {
      this.dataset.publications.splice(publicationInd, 1)
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
