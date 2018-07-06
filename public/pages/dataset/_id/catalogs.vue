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
      <v-list-tile v-for="publication in dataset.publications" :key="publication.id">
        <v-list-tile-content>
          <v-list-tile-title>Jeu de données <a :href="publication.udata.dataset.page" target="_blank">{{ publication.udata.dataset.slug }}</a> sur {{ publication.catalogUrl }}</v-list-tile-title>
          <v-list-tile-sub-title>Créé le {{ publication.udata.dataset.created_at | moment("DD/MM/YYYY à HH:mm") }}</v-list-tile-sub-title>
        </v-list-tile-content>
        <v-list-tile-action>
          <v-btn v-if="can('deletePublication')" color="warning" icon flat title="Supprimer cette publication" @click="deletePublicationId = publication.id; showDeleteDialog = true;">
            <v-icon>delete</v-icon>
          </v-btn>
        </v-list-tile-action>
      </v-list-tile>
    </v-list>

    <v-layout row wrap v-if="can('writePublication')">
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
              :items="catalogs.map(c => c.url)"
              v-model="newPublication.catalogUrl"
              label="Catalogue"
              hint="Cette liste est à configurer dans les paramètres de l'utilisateur ou de l'organisation propriétaire de ce jeu de données."
              persistent-hint
              required
              :rules="[() => !!newPublication.catalogUrl]"
            />
          </v-form>
        </v-card-text>

        <v-card-actions>
          <v-spacer/>
          <v-btn flat @click="addPublicationDialog = false">Annuler</v-btn>
          <v-btn color="primary" :disabled="!newPublicationValid" @click="addPublicationDialog = false; writePublication(newPublication)">Ajouter</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="showDeleteDialog" max-width="500">
      <v-card v-if="showDeleteDialog">
        <v-card-title primary-title>
          Suppression d'une publication'
        </v-card-title>
        <v-card-text>
          Voulez vous vraiment supprimer la publication vers {{ dataset.publications.find(p => p.id === deletePublicationId).catalogUrl }} ? La suppression est définitive et les données ne pourront pas être récupérées.
        </v-card-text>
        <v-card-actions>
          <v-spacer/>
          <v-btn flat @click="showDeleteDialog = false">Non</v-btn>
          <v-btn color="warning" @click="showDeleteDialog = false; deletePublication(deletePublicationId)">Oui</v-btn>
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
        catalogUrl: null
      },
      deletePublicationId: null,
      showDeleteDialog: false
    }
  },
  computed: {
    ...mapState(['env']),
    ...mapState('dataset', ['dataset', 'catalogs']),
    ...mapGetters('dataset', ['can'])
  },
  created() {
    if (this.can('writePublication')) this.$store.dispatch('dataset/fetchCatalogs')
  },
  methods: {
    ...mapActions('dataset', ['writePublication', 'deletePublication'])
  }
}

</script>

<style lang="css">
</style>
