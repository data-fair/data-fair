<template>
  <v-container fluid class="py-0">
    <v-row>
      <v-col>
        <v-dialog
          v-if="can('writeDescription')"
          v-model="dialog"
          :width="$vuetify.breakpoint.mdAndUp ? $vuetify.breakpoint.width/2 : $vuetify.breakpoint.width-20"
          style="margin-right:160px"
          persistent
        >
          <template v-slot:activator="{on}">
            <v-btn
              color="primary"
              v-on="on"
            >
              Ajouter une réutilisation
            </v-btn>
          </template>

          <v-card outlined>
            <v-toolbar dense flat>
              <v-toolbar-title>Nouvelle réutilisation externe</v-toolbar-title>
            </v-toolbar>
            <v-card-text>
              <external-reuse-form :reuse="newReuse" />
            </v-card-text>

            <v-divider />
            <v-card-actions>
              <v-spacer />
              <v-btn text @click.native="dialog = false">
                Annuler
              </v-btn>
              <v-btn
                :disabled="!newReuse.title || !newReuse.link"
                color="primary"
                @click.native="addReuse()"
              >
                Ajouter
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>
        <p v-else-if="!(dataset.extras && dataset.extras.externalReuses && dataset.extras.externalReuses.length)">
          Aucune réutilisation externe déclarée pour l'instant.
        </p>
      </v-col>
    </v-row>
    <v-list v-if="dataset.extras && dataset.extras.externalReuses && dataset.extras.externalReuses.length">
      <v-list-item v-for="(reuse, i) in dataset.extras.externalReuses" :key="i">
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
              <template v-slot:activator="{on}">
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
                <v-toolbar dense flat>
                  <v-toolbar-title>Editer la réutilisation externe</v-toolbar-title>
                </v-toolbar>
                <v-card-text>
                  <external-reuse-form :reuse="reuse" />
                </v-card-text>

                <v-divider />
                <v-card-actions>
                  <v-spacer />
                  <v-btn text @click.native="editDialog[i] = false">
                    Annuler
                  </v-btn>
                  <v-btn
                    :disabled="!reuse.title || !reuse.link"
                    color="primary"
                    @click.native="editReuse(i)"
                  >
                    Enregistrer
                  </v-btn>
                </v-card-actions>
              </v-card>
            </v-dialog>
            <v-spacer />
            <confirm-menu
              yes-color="warning"
              text="Souhaitez-vous confirmer la suppression ?"
              tooltip="Supprimer la réutilisation"
              @confirm="removeReuse(i)"
            />
          </v-row>
        </v-list-item-action>
      </v-list-item>
    </v-list>
  </v-container>
</template>

<script>
  import ConfirmMenu from '~/components/confirm-menu.vue'
  import ExternalReuseForm from '~/components/datasets/external-reuse-form.vue'

  const { mapState, mapGetters } = require('vuex')

  export default {
    components: { ConfirmMenu, ExternalReuseForm },
    data: function() {
      return {
        dialog: null,
        editDialog: { },
        newReuse: {
          type: 'link',
        },
      }
    },
    computed: {
      ...mapState('dataset', ['dataset']),
      ...mapGetters('dataset', ['can']),
    },
    created() {
      this.dataset.extras = this.dataset.extras || {}
      this.dataset.extras.externalReuses = this.dataset.extras.externalReuses || []
    },
    methods: {
      async addReuse() {
        this.dataset.extras.externalReuses.push(this.newReuse)
        await this.updateExternalReuses()
        this.newReuse = {
          type: 'link',
        }
        this.dialog = false
      },
      async editReuse(i) {
        this.editDialog[i] = false
        await this.updateExternalReuses()
      },
      async removeReuse(idx) {
        this.dataset.extras.externalReuses.splice(idx, 1)
        await this.updateExternalReuses()
      },
      async updateExternalReuses() {
        await this.$store.dispatch('dataset/patch', { extras: this.dataset.extras })
      },
    },
  }
</script>
