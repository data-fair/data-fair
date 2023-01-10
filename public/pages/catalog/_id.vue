<template>
  <v-row v-if="catalog">
    <v-col :style="$vuetify.breakpoint.lgAndUp ? 'padding-right:256px;' : ''">
      <v-container class="py-0">
        <v-row class="catalog">
          <v-col>
            <layout-section-tabs
              :min-height="390"
              :svg="checklistSvg"
              svg-no-margin
              :section="sections.find(s => s.id === 'metadata')"
            >
              <template #tabs>
                <v-tab href="#metadata-info">
                  <v-icon>mdi-information</v-icon>&nbsp;&nbsp;Informations
                </v-tab>
              </template>
              <template #tabs-items>
                <v-tab-item value="metadata-info">
                  <v-container
                    fluid
                    class="pb-0"
                  >
                    <catalog-info />
                  </v-container>
                </v-tab-item>
              </template>
            </layout-section-tabs>

            <layout-section-tabs
              :min-height="390"
              :svg="progressSvg"
              svg-no-margin
              :section="sections.find(s => s.id === 'import')"
            >
              <template #tabs>
                <v-tab href="#import-datasets">
                  <v-icon>mdi-information</v-icon>&nbsp;&nbsp;Jeux de données
                </v-tab>
              </template>
              <template #tabs-items>
                <v-tab-item value="import-datasets">
                  <v-container
                    fluid
                    class="pb-0"
                  >
                    <catalog-datasets />
                  </v-container>
                </v-tab-item>
              </template>
            </layout-section-tabs>
          </v-col>
        </v-row>
      </v-container>
    </v-col>

    <layout-navigation-right v-if="$vuetify.breakpoint.lgAndUp">
      <catalog-actions />
      <layout-toc :sections="sections" />
    </layout-navigation-right>
    <layout-actions-button v-else>
      <template #actions>
        <catalog-actions />
      </template>
    </layout-actions-button>
  </v-row>
</template>

<i18n lang="yaml">
fr:
  catalogs: Catalogues
  metadata: Métadonnées
  import: Imports
en:
  catalogs: Catalogs
  metadata: Metadata
  import: Imports
</i18n>

<script>
import { mapState, mapGetters } from 'vuex'

export default {
  middleware: ['auth-required'],
  data: () => ({
    showDeleteDialog: false,
    showOwnerDialog: false,
    newOwner: null,
    mini: false,
    checklistSvg: require('~/assets/svg/Checklist_Two Color.svg?raw'),
    progressSvg: require('~/assets/svg/Progress _Two Color.svg?raw')
  }),
  async fetch ({ store, route }) {
    store.dispatch('catalog/clear')
    await store.dispatch('catalog/setId', route.params.id)
  },
  computed: {
    ...mapState('catalog', ['catalog']),
    ...mapGetters('catalog', ['can']),
    sections () {
      const sections = []
      if (!this.catalog) return sections
      sections.push({ title: this.$t('metadata'), id: 'metadata' })
      sections.push({ title: this.$t('imports'), id: 'import' })
      return sections
    }
  },
  created () {
    // children pages are deprecated
    const path = `/catalog/${this.$route.params.id}`
    if (this.$route.path !== path) return this.$router.push(path)
    if (this.catalog) this.$store.dispatch('breadcrumbs', [{ text: this.$t('catalogs'), to: '/catalogs' }, { text: this.catalog.title || this.catalog.id }])
  }
}
</script>

<style>
.catalog .v-tab {
  font-weight: bold;
}
</style>
