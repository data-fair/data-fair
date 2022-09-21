<template>
  <v-container
    fluid
    class="py-0"
  >
    <v-alert
      dense
      type="warning"
      outlined
      v-text="$t('deprecated')"
    />
    <v-row>
      <v-col>
        <v-dialog
          v-if="can('writeDescription')"
          v-model="dialog"
          :width="$vuetify.breakpoint.mdAndUp ? $vuetify.breakpoint.width/2 : $vuetify.breakpoint.width-20"
          style="margin-right:160px"
          persistent
        >
          <template #activator="{on}">
            <v-btn
              v-t="'addReuse'"
              color="primary"
              v-on="on"
            />
          </template>

          <v-card outlined>
            <v-toolbar
              dense
              flat
            >
              <v-toolbar-title v-t="newReuse" />
            </v-toolbar>
            <v-card-text>
              <dataset-external-reuse-form :reuse="newReuse" />
            </v-card-text>

            <v-divider />
            <v-card-actions>
              <v-spacer />
              <v-btn
                v-t="'cancel'"
                text
                @click.native="dialog = false"
              />
              <v-btn
                v-t="'add'"
                :disabled="!newReuse.title || !newReuse.link"
                color="primary"
                @click.native="addReuse()"
              />
            </v-card-actions>
          </v-card>
        </v-dialog>
        <p
          v-else-if="!(dataset.extras && dataset.extras.externalReuses && dataset.extras.externalReuses.length)"
          v-t="'noReuse'"
        />
      </v-col>
    </v-row>
    <v-list v-if="dataset.extras && dataset.extras.externalReuses && dataset.extras.externalReuses.length">
      <v-list-item
        v-for="(reuse, i) in dataset.extras.externalReuses"
        :key="i"
      >
        <!-- <v-list-item-avatar size="80">
          <v-layout column>
            <span>{{ attachment.name.split('.').pop().toUpperCase() }}</span>
            <small>{{ attachment.size | bytes }}</small>
          <v-icon :class="[item.iconClass]">{{ item.icon }}</v-icon>
          </v-layout>
        </v-list-item-avatar> -->
        <v-list-item-content>
          <v-list-item-title>{{ reuse.title }} </v-list-item-title>
          <v-list-item-subtitle>{{ reuse.description }}</v-list-item-subtitle>
        </v-list-item-content>
        <v-list-item-action v-if="can('writeDescription')">
          <v-row style="width:60px">
            <!-- <v-btn :href="baseUrl+'/'+attachment.name" icon ripple >
              <v-icon color="primary">mdi-download</v-icon>
            </v-btn> -->
            <v-dialog
              v-model="editDialog[i]"
              :width="$vuetify.breakpoint.mdAndUp ? $vuetify.breakpoint.width/2 : $vuetify.breakpoint.width-20"
              persistent
            >
              <template #activator="{on}">
                <v-btn
                  color="primary"
                  icon
                  v-on="on"
                >
                  <v-icon color="primary">
                    mdi-pencil
                  </v-icon>
                </v-btn>
              </template>

              <v-card outlined>
                <v-toolbar
                  dense
                  flat
                >
                  <v-toolbar-title v-t="'editReuse'" />
                </v-toolbar>
                <v-card-text>
                  <dataset-external-reuse-form :reuse="reuse" />
                </v-card-text>

                <v-divider />
                <v-card-actions>
                  <v-spacer />
                  <v-btn
                    v-t="'cancel'"
                    text
                    @click.native="editDialog[i] = false"
                  />
                  <v-btn
                    v-t="'save'"
                    :disabled="!reuse.title || !reuse.link"
                    color="primary"
                    @click.native="editReuse(i)"
                  />
                </v-card-actions>
              </v-card>
            </v-dialog>
            <v-spacer />
            <confirm-menu
              yes-color="warning"
              :text="$t('confirmDeleteText')"
              :tooltip="$t('confirmDeleteTooltip')"
              @confirm="removeReuse(i)"
            />
          </v-row>
        </v-list-item-action>
      </v-list-item>
    </v-list>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  addReuse: Ajouter une réutilisation
  newReuse: Nouvelle réutilisation externe
  cancel: Annuler
  add: Ajouter
  noReuse: Aucune réutilisation externe déclarée pour l'instant.
  editReuse: Editer la réutilisation externe
  save: Enregistrer
  confirmDeleteTooltip: Supprimer la réutilisation
  confirmDeleteText: Souhaitez-vous confirmer la suppression ?
  deprecated: Cette gestion des réutilisations est dépréciée. À la place veuillez gérer les réutilisations directement dans l'administration des portails.
en:
  addReuse: Add a reuse
  newReuse: New external reuse
  cancel: Cancel
  add: Add
  noReuse: No external reuse has been declared yet.
  editReuse: Edit the external reuse
  save: Save
  confirmDeleteTooltip: Delete the reuse
  confirmDeleteText: Do you want to confirm the deletion ?
  deprecated: This management of reuses is deprecated. Instead please manage reuses directly in the portals administration.
</i18n>

<script>

const { mapState, mapGetters } = require('vuex')

export default {
  data: function () {
    return {
      dialog: null,
      editDialog: { },
      newReuse: {
        type: 'link'
      }
    }
  },
  computed: {
    ...mapState('dataset', ['dataset']),
    ...mapGetters('dataset', ['can'])
  },
  created () {
    this.dataset.extras = this.dataset.extras || {}
    this.dataset.extras.externalReuses = this.dataset.extras.externalReuses || []
  },
  methods: {
    async addReuse () {
      this.dataset.extras.externalReuses.push(this.newReuse)
      await this.updateExternalReuses()
      this.newReuse = {
        type: 'link'
      }
      this.dialog = false
    },
    async editReuse (i) {
      this.editDialog[i] = false
      await this.updateExternalReuses()
    },
    async removeReuse (idx) {
      this.dataset.extras.externalReuses.splice(idx, 1)
      await this.updateExternalReuses()
    },
    async updateExternalReuses () {
      await this.$store.dispatch('dataset/patch', { extras: this.dataset.extras })
    }
  }
}
</script>
