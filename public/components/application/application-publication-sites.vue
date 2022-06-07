<template>
  <v-container fluid>
    <p
      v-if="!publicationSites || !publicationSites.length"
      v-t="'noPublicationSite'"
    />
    <template v-else>
      <p v-t="'publishThisApp'" />
      <v-row class="px-2">
        <v-card
          tile
          outlined
          style="min-width: 400px;"
        >
          <v-list
            class="py-0"
            two-line
          >
            <v-list-item
              v-for="(site,i) in publicationSites"
              :key="i"
            >
              <v-list-item-action>
                <v-checkbox
                  :input-value="application.publicationSites.includes(`${site.type}:${site.id}`)"
                  :disabled="!canAdmin"
                  @change="toggle(site)"
                />
              </v-list-item-action>

              <v-list-item-content>
                <v-list-item-title>
                  <v-icon
                    v-if="site.private"
                    small
                    color="warning"
                  >
                    mdi-lock
                  </v-icon>
                  <a :href="site.url">{{ site.title || site.url || site.id }}</a>
                </v-list-item-title>
                <v-list-item-subtitle>
                  <a
                    v-if="site.applicationUrlTemplate && application.publicationSites.includes(`${site.type}:${site.id}`)"
                    :href="site.applicationUrlTemplate.replace('{id}', application.id)"
                  >
                    {{ site.applicationUrlTemplate.replace('{id}', application.id) }}
                  </a>
                </v-list-item-subtitle>
              </v-list-item-content>
            </v-list-item>
          </v-list>
        </v-card>
      </v-row>
      <v-row>
        <v-col class="px-0">
          <tutorial-alert id="app-share-prefer-large">
            {{ $t('preferLargeDisplayTutorial') }}
          </tutorial-alert>
          <v-switch
            :input-value="application.preferLargeDisplay"
            :label="$t('preferLargeDisplay')"
            class="mx-4"
            @change="value => patchAndCommit({preferLargeDisplay: value})"
          />
        </v-col>
      </v-row>
    </template>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  noPublicationSite: Vous n'avez pas configuré de portail sur lequel publier cette visualisation.
  publishThisApp: Publiez cette visualisation sur un ou plusieurs de vos portails.
  preferLargeDisplay: privilégier un rendu large
  preferLargeDisplayTutorial: En cochant l'option ci-dessous vous indiquez aux portails que cette visualisation est à afficher sur une largeur importante autant que possible. Ceci pourra changer l'affichage dans les pages des jeux de données ou les tableaux de bords par exemple.
en:
  noPublicationSite: You haven't configured a portal to publish this visualization on.
  publishThisApp: Publish this visualization on one or more of your portals.
  preferLargeDisplay: prefer a large display
  preferLargeDisplayTutorial: By checking the following option you indicate to the portals that this visualization should be rendered on a large section of page as much as possible. This will change the rendering in dataset pages and dashboards.
</i18n>

<script>
import { mapState, mapGetters, mapActions } from 'vuex'
export default {
  props: {
    publicationSites: {
      type: Array,
      default: () => []
    }
  },
  data: () => ({
    selected: []
  }),
  computed: {
    ...mapState('application', ['application']),
    ...mapGetters('dataset', ['can']),
    ...mapGetters(['canAdmin'])
  },
  methods: {
    ...mapActions('application', ['patch', 'patchAndCommit']),
    toggle (site) {
      const key = `${site.type}:${site.id}`
      if (this.application.publicationSites.includes(key)) {
        this.application.publicationSites = this.application.publicationSites.filter(s => s !== key)
      } else {
        this.application.publicationSites.push(key)
      }
      this.patch({ publicationSites: this.application.publicationSites })
    }
  }
}
</script>

<style lang="css" scoped>
</style>
