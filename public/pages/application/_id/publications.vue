<template lang="html">
  <v-container>
    <p>
      Publiez cette application sur un ou plusieurs catalogues Open Data.
      Cette publication rendra votre application plus facile à trouver et permettra à la communauté Open Data d'échanger avec vous.
    </p>

    <p v-if="!application.publications.length">
      Il n'existe pas encore de publication de cette application.
    </p>
    <v-list two-line v-else>
      <v-list-tile v-for="(publication, i) in application.publications" :key="publication.id">
        <v-list-tile-content v-if="catalogsById[publication.catalog]">
          <v-list-tile-title>Application publiée sur le catalogue "{{ catalogsById[publication.catalog].title }}"</v-list-tile-title>
          <v-list-tile-sub-title v-if="publication.status==='published'"><a :href="publication.targetUrl" target="_blank">{{ publication.targetUrl }}</a></v-list-tile-sub-title>
          <v-list-tile-sub-title v-else-if="publication.status==='error'" style="color:red;">{{ publication.error }}</v-list-tile-sub-title>
          <v-list-tile-sub-title v-else-if="publication.status==='deleted'">En attente de suppression</v-list-tile-sub-title>
          <v-list-tile-sub-title v-else>En attente de publication</v-list-tile-sub-title>
        </v-list-tile-content>
        <v-list-tile-content v-else>
          Cette publication référence une configuration de catalogue inconnue ({{ publication.catalog }}).
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
      catalogs: []
    }
  },
  computed: {
    ...mapState(['env']),
    ...mapState('application', ['application']),
    ...mapGetters('application', ['can', 'journalChannel']),
    catalogsById() {
      return this.catalogs.reduce((a, c) => { a[c.id] = c; return a }, {})
    }
  },
  async created() {
    const params = {'owner-type': this.application.owner.type, 'owner-id': this.application.owner.id}
    this.catalogs = (await this.$axios.$get('api/v1/catalogs', {params})).results
    eventBus.$on(this.journalChannel, this.onJournalEvent)
  },
  async destroyed() {
    eventBus.$off(this.journalChannel, this.onJournalEvent)
  },
  methods: {
    ...mapActions('application', ['patch', 'fetchInfo']),
    onJournalEvent(event) {
      if (event.type === 'publication') this.fetchInfo()
    },
    addPublication(publication) {
      this.application.publications.push(publication)
      this.patch({publications: this.application.publications})
    },
    deletePublication(publicationInd) {
      const publication = this.application.publications[publicationInd]
      publication.status = 'deleted'
      this.patch({publications: this.application.publications})
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
