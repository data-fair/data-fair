<template lang="html">
  <v-container fluid>
    <p v-t="'message'" />

    <p
      v-if="!application.publications.length"
      v-t="'noPublication'"
    />

    <v-btn
      v-if="authorizedCatalogs.length"
      v-t="'publish'"
      color="primary"
      @click="addPublicationDialog = true"
    />

    <v-list
      v-if="application.publications.length"
      two-line
    >
      <v-list-item
        v-for="(publication, i) in application.publications"
        :key="publication.id"
      >
        <v-list-item-content v-if="catalogsById[publication.catalog]">
          <v-list-item-title>
            {{ $t('appPublication', {catalog: catalogsById[publication.catalog].title}) }}
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
          v-t="{path: 'unknownCatalog', args: {catalog: publication.catalog}}"
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
        <v-card-text v-if="catalogs">
          <v-form v-model="newPublicationValid">
            <v-select
              v-model="newPublication.catalog"
              :items="catalogs"
              :item-text="catalogLabel"
              :rules="[
                c => !!c,
                c => !(application.publications || []).find(p => p.catalog === c) || $t('alreadyPublished')
              ]"
              item-value="id"
              :label="$t('catalog')"
              required
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
  message: Publiez cette application sur un ou plusieurs catalogues Open Data. Cette publication rendra vos données plus faciles à trouver et permettra à la communauté Open Data d'échanger avec vous.
  noPublication: Il n'existe pas encore de publication de cette application sur un catalogue.
  publish: Publier sur un catalogue
  appPublication: Application publiée sur le catalogue "{catalog}"
  waitingDeletion: En attente de suppression
  waitingPublication: En attente de publication
  unknownCatalog: Cette publication référence une configuration de catalogue inconnue ({catalog}).
  republish: Re-publier
  republishMessage: Voulez vous vraiment effectuer de nouveau la publication ?<br><br><b>Attention</b> si vous avez effectué des modifications sur le catalogue depuis la dernière publication elles seront perdues.
  addPublication: Ajout d'une nouvelle publication
  deletePublication: Supprimer cette publication
  deletionMessage: Voulez vous vraiment supprimer la publication ? La suppression est définitive et les données ne pourront pas être récupérées.<br><br><b>Attention</b> les données seront également supprimées dans le catalogue destinataire de la publication.
  catalog: Catalogue
  search: Rechercher
  cancel: Annuler
  add: Ajouter
  no: Non
  yes: Oui
  alreadyPublished: cette application a déjà été publiée sur ce catalogue
en:
  message: Publish this application onto one or more Open Data catalogs. This publication will make your data easier to find et will allow the Open Data community to interact with you.
  noPublication: There are no publication of this application on a catalog yet.
  publish: Publish on a catalog
  appPublication: Application published on the catalog "{catalog}"
  waitingDeletion: Waiting for deletion
  waitingPublication: Waiting for publication
  unknownCatalog: This publication references an unknown configuration of catalog ({catalog})
  republish: Re-publish
  republishMessage: Do you really want to re-publish ?<br><br><b>Warning</b> if you mage changes in the catalog since the last publication they will be lost.
  addPublication: Add a publication
  deletePublication: Delete this publication
  deletionMessage: Do you really want to delete the publication ? The deletion is definitive and the data will not be recoverable.<br><br><b>Warning</b> the data will also be delete in the catalog target of the publication.
  catalog: Catalog
  search: Search
  cancel: Cancel
  add: Add
  no: No
  yes: Yes
  alreadyPublished: this application was already published on this catalog
</i18n>

<script>
import { mapState, mapGetters, mapActions } from 'vuex'
import catalogPublicationsMixin from '~/mixins/catalog-publications'

export default {
  mixins: [catalogPublicationsMixin],
  computed: {
    ...mapState('application', ['application']),
    ...mapGetters('application', ['can', 'journalChannel']),
    resource () {
      return this.application
    }
  },
  methods: {
    ...mapActions('application', ['patch', 'fetchInfo'])
  }
}

</script>

<style lang="css">
</style>
