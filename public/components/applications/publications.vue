<template lang="html">
  <v-container fluid>
    <p>
      Publiez cette application sur un ou plusieurs catalogues Open Data.
      Cette publication rendra votre application plus facile à trouver et permettra à la communauté Open Data d'échanger avec vous.
    </p>

    <p v-if="!application.publications.length">
      Il n'existe pas encore de publication de cette application.
    </p>

    <v-btn
      v-if="can('writeDescription')"
      color="primary"
      @click="addPublicationDialog = true"
    >
      Ajouter une publication
    </v-btn>

    <v-list
      v-if="application.publications.length"
      two-line
    >
      <v-list-item
        v-for="(publication, i) in application.publications"
        :key="publication.id"
      >
        <v-list-item-content v-if="catalogsById[publication.catalog]">
          <v-list-item-title>Application publiée sur le catalogue "{{ catalogsById[publication.catalog].title }}"</v-list-item-title>
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

    <v-dialog
      v-model="addPublicationDialog"
      max-width="700px"
    >
      <v-card outlined>
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
      <v-card v-if="showDeleteDialog" outlined>
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

    <v-dialog v-model="showRepublishDialog" max-width="500">
      <v-card v-if="showRepublishDialog" outlined>
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
        showDeleteDialog: false,
        rePublishInd: null,
        showRepublishDialog: false,
        catalogs: [],
      }
    },
    computed: {
      ...mapState(['env']),
      ...mapState('application', ['application']),
      ...mapGetters('application', ['can', 'journalChannel']),
      catalogsById() {
        return this.catalogs.reduce((a, c) => { a[c.id] = c; return a }, {})
      },
    },
    async created() {
      const params = { owner: this.application.owner.type + ':' + this.application.owner.id }
      this.catalogs = (await this.$axios.$get('api/v1/catalogs', { params })).results
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
        this.patch({ publications: this.application.publications })
      },
      deletePublication(publicationInd) {
        const publication = this.application.publications[publicationInd]
        publication.status = 'deleted'
        this.patch({ publications: this.application.publications })
      },
      rePublish(publicationInd) {
        const publication = this.application.publications[publicationInd]
        publication.status = 'waiting'
        this.patch({ publications: this.application.publications })
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
