<template>
  <v-row v-if="initialized" class="home my-0">
    <v-col v-if="missingSubscription">
      <v-iframe :src="env.subscriptionUrl" />
    </v-col>
    <v-col v-else :style="this.$vuetify.breakpoint.lgAndUp ? 'padding-right:256px;' : ''">
      <v-container class="py-0">
        <v-responsive v-if="!user">
          <v-container class="fill-height">
            <v-row align="center">
              <v-col class="text-center">
                <h3 v-t="'title'" class="text-h4 mb-3 mt-5" />
                <layout-wrap-svg
                  :source="dataProcessSvg"
                  :color="$vuetify.theme.themes.light.primary"
                />
                <div
                  v-if="!env.disableApplications && !env.disableRemoteServices"
                  v-t="'description'"
                  class="text-h6"
                />
                <p v-t="'authRequired'" class="text-h6 mt-5" />
                <v-btn
                  v-t="'login'"
                  color="primary"
                  @click="login"
                />
              </v-col>
            </v-row>
          </v-container>
        </v-responsive>
        <v-row v-else>
          <v-col>
            <h2 class="mb-4">
              <template v-if="activeAccount.type === 'organization'">
                {{ $t('organizationSpace', {name: activeAccount.name}) }}
              </template>
              <template v-else>
                {{ $t('userSpace', {name: activeAccount.name}) }}
              </template>
            </h2>
            <p v-if="activeAccount.type ==='organization'" v-html="$t('organizationRole', {role: user.organizations.find(o => o.id===activeAccount.id).role})" />
            <p v-else-if="user.organizations.length">
              <v-icon color="warning">
                mdi-alert
              </v-icon>
              <i18n path="collaborativeMessage">
                <template #collaborativeMode>
                  <strong v-t="'collaborativeMode'" />
                </template>
                <template #yourAccountLink>
                  <nuxt-link v-t="'yourAccount'" to="/me" />
                </template>
              </i18n>
            </p>
            <p v-else>
              <i18n path="collaborativeMessageNoOrg">
                <template #collaborativeMode>
                  <strong v-t="'collaborativeMode'" />
                </template>
                <template #yourAccountLink>
                  <nuxt-link v-t="'yourAccount'" to="/me" />
                </template>
              </i18n>
            </p>
            <p v-if="!env.disableApplications && !env.disableRemoteServices">
              {{ $t('description') }}
            </p>
            <layout-section-tabs
              :min-height="390"
              :svg="dataSvg"
              svg-no-margin
              :section="sections.find(s => s.id === 'datasets')"
            >
              <template v-slot:extension>
                <p v-if="stats && datasets">
                  <span v-if="datasets.count > 1">
                    <i18n path="datasetsCountMessage">
                      <template #link>
                        <nuxt-link to="/datasets">
                          {{ $t('datasetsCount', {count: $n(datasets.count)}) }}
                        </nuxt-link>
                      </template>
                    </i18n>
                  </span>
                  <span v-else-if="datasets.count === 1">
                    <i18n path="datasetsCountMessage1">
                      <template #link>
                        <nuxt-link to="/datasets">
                          {{ $t('datasetsCount1') }}
                        </nuxt-link>
                      </template>
                    </i18n>
                  </span>
                  <span v-else v-t="'datasetsCountNone'" />
                  <i18n v-if="stats.storageLimit && stats.storageLimit !== -1" path="storageWithLimit">
                    <template #bytes>
                      {{ stats.storage | displayBytes($i18n.locale) }}
                    </template>
                    <template #bytesLimit>
                      {{ stats.storageLimit | displayBytes($i18n.locale) }}
                    </template>
                  </i18n>
                  <i18n v-else path="storageWithoutLimit">
                    <template #bytes>
                      {{ stats.storage | displayBytes($i18n.locale) }}
                    </template>
                  </i18n>
                </p>
              </template>
              <template v-slot:tabs-items>
                <v-container fluid class="py-0 px-2">
                  <v-row>
                    <v-col
                      cols="12"
                      sm="6"
                      md="7"
                    >
                      <storage-treemap
                        v-if="stats && datasets"
                        :stats="stats"
                        :datasets="datasets"
                      />
                    </v-col>
                    <v-col
                      cols="12"
                      sm="6"
                      md="5"
                    >
                      <dataset-list-actions />
                    </v-col>
                  </v-row>
                </v-container>
              </template>
            </layout-section-tabs>

            <layout-section-tabs
              v-if="!env.disableApplications"
              :min-height="400"
              :svg="graphicSvg"
              :section="sections.find(s => s.id === 'apps')"
            >
              <template v-slot:extension>
                <p v-if="stats">
                  <i18n v-if="stats.applications > 1" path="appsCountMessage">
                    <template #link>
                      <nuxt-link to="/applications">
                        {{ $t('appsCount', {count: $n(stats.applications)}) }}
                      </nuxt-link>
                    </template>
                  </i18n>
                  <i18n v-else-if="stats.applications=== 1" path="appsCountMessage1">
                    <template #link>
                      <nuxt-link to="/applications">
                        {{ $t('appsCount1') }}
                      </nuxt-link>
                    </template>
                  </i18n>
                  <span v-else v-t="'appsCountNone'" />
                  <span v-if="baseApps">
                    {{ $t('baseAppsCount', {count: $n(baseApps.length)}) }}
                  </span>
                </p>
              </template>
              <template v-slot:tabs-items>
                <v-container fluid>
                  <v-row v-if="baseApps">
                    <v-spacer />
                    <v-carousel
                      cycle
                      style="max-width:510px;"
                      hide-delimiters
                      show-arrows
                    >
                      <v-carousel-item
                        v-for="(app, i) in baseApps"
                        :key="i"
                      >
                        <div style="position:relative">
                          <v-sheet
                            style="position:absolute;top:0;left:0;right:0;z-index:1;"
                            flat
                            color="rgba(0, 0, 0, 0.6)"
                            class="pa-2"
                            dark
                          >
                            {{ app.title[$i18n.locale] || app.title[$i18n.defaultLocale] || app.title.fr }}
                          </v-sheet>
                          <v-img
                            :src="app.image"
                            height="340"
                            contain
                          />
                          <v-sheet
                            v-if="app.description[$i18n.locale] || app.description[$i18n.defaultLocale] || app.description.fr"
                            style="position:absolute;bottom:0;left:0;right:0;z-index:1;"
                            flat
                            color="rgba(0, 0, 0, 0.6)"
                            class="pa-2"
                            dark
                          >
                            {{ app.description[$i18n.locale] || app.description[$i18n.defaultLocale] || app.description.fr }}
                          </v-sheet>
                        </div>
                      </v-carousel-item>
                    </v-carousel>
                    <v-spacer />
                  </v-row>
                </v-container>
              </template>
            </layout-section-tabs>
          </v-col>
        </v-row>
      </v-container>
    </v-col>

    <layout-navigation-right v-if="this.$vuetify.breakpoint.lgAndUp">
      <activity v-if="activity" :activity="activity" />
    </layout-navigation-right>
  </v-row>
</template>

<i18n lang="yaml">
fr:
  title: Data Fair
  breadcrumb: Partage et visualisation de données
  description: Enrichissez et publiez facilement vos données. Vous pouvez les utiliser dans des applications dédiées et les mettre à disposition d'autres personnes en mode ouvert ou privé.
  authRequired: Vous devez être authentifié pour utiliser ce service.
  login: Se connecter / S'inscrire
  organizationSpace: Espace de l'organisation {name}
  userSpace: Espace de l'utilisateur {name}
  organizationRole: Vous êtes <strong>{role}</strong> dans cette organisation.
  collaborativeMessage: Pour travailler en {collaborativeMode} vous devez ouvrir le menu personnel (en haut à droite) et changer de compte actif. Pour créer une nouvelle organisation rendez vous sur {yourAccountLink}.
  collaborativeMessageNoOrg: Pour travailler en {collaborativeMode} vous devez créer une organisation. Pour cela rendez vous sur {yourAccountLink}.
  collaborativeMode: mode collaboratif
  yourAccount: votre compte
  datasets: Jeux de données
  datasetsCountMessage: '{link} ont déjà été créés dans votre espace.'
  datasetsCount: '{count} jeux de données'
  datasetsCountMessage1: '{link} a déjà été créé dans votre espace.'
  datasetsCount1: 1 jeu de données
  datasetsCountNone: Aucun jeu de donnée n'a été créé pour l'instant dans votre espace.
  storageWithLimit: Vous utilisez {bytes} sur un total disponible de {bytesLimit}.
  storageWithoutLimit: Vous utilisez {bytes} de stockage.
  apps: Visualisations
  appsCountMessage: '{link} ont déjà été configurées dans votre espace.'
  appsCount: '{count} visualisations'
  appsCountMessage1: '{link} a déjà été configurée'
  appsCount1: 1 visualisation
  appsCountNone: Aucune visualisation n'a été configurée pour l'instant dans votre espace.
  baseAppsCount: Vous avez accès à {count} applications pour configurer autant de visualisations que vous le souhaitez.
en:
  breadcrumb: Share and visualize data
  description: Easily enrich and publish your data. You can use it in dedicated applications and make it available to other people both openly or privately.
  authRequired: You must be logged in to use this service.
  login: Login / Sign up
  organizationSpace: Space of organization {name}
  userSpace: Space of user {name}
  organizationRole: You are <strong>{role}</strong> in this organization.
  collaborativeMessage: To work in {collaborativeMode} you must open the personal menu (top right) and change the active account. To create a new organization please visit {yourAccountLink}.
  collaborativeMessageNoOrg: To work in {collaborativeMode} you must create an organization. To do so please visit {yourAccountLink}.
  collaborativeMode: collaborative mode
  yourAccount: your account
  datasets: Datasets
  datasetsCountMessage: '{link} were already loaded in your space.'
  datasetsCount: '{count} datasets'
  datasetsCountMessage1: '{link} was already loaded in your space.'
  datasetsCount1: 1 dataset
  datasetsCountNone: No dataset was loaded in your space yet.
  storageWithLimit: You use {bytes} out of {bytesLimit} of total available space.
  storageWithoutLimit: You use {bytes} of storage space.
  apps: Visualizations
  appsCountMessage: '{link} were already configured in your space.'
  appsCount: '{count} visualizations'
  appsCountMessage1: '{link} was already configured in your space'
  appsCount1: 1 visualization
  appsCountNone: No visualization was configured in your space yet.
  baseAppsCount: You have access to {count} applications to configure as many visualizations as you want.
</i18n>

<script>
  import 'iframe-resizer/js/iframeResizer'
  import VIframe from '@koumoul/v-iframe'

  const { mapState, mapActions, mapGetters } = require('vuex')

  export default {
    components: { VIframe },
    data: () => ({
      stats: null,
      datasets: null,
      baseApps: null,
      activity: null,
      dataSvg: require('~/assets/svg/Data Arranging_Two Color.svg?raw'),
      graphicSvg: require('~/assets/svg/Graphics and charts_Monochromatic.svg?raw'),
      dataProcessSvg: require('~/assets/svg/Data Process_Two Color.svg?raw'),
    }),
    computed: {
      ...mapState('session', ['user', 'initialized']),
      ...mapState(['env']),
      ...mapGetters(['missingSubscription']),
      ...mapGetters('session', ['activeAccount']),
      sections() {
        return [
          { id: 'datasets', title: this.$t('datasets') },
          { id: 'apps', title: this.$t('apps') },
        ]
      },
    },
    async created() {
      if (!this.user) return
      this.$store.dispatch('breadcrumbs', [{ text: this.$t('breadcrumb') }])

      this.stats = await this.$axios.$get('api/v1/stats')

      const owner = `${this.activeAccount.type}:${this.activeAccount.id}`
      this.activity = await this.$axios.$get('api/v1/activity', {
        params: { size: 8, owner },
      })

      this.datasets = await this.$axios.$get('api/v1/datasets', {
        params: { size: 11, owner: owner, select: 'id,title,storage', sort: 'storage.size:-1' },
      })

      this.baseApps = (await this.$axios.$get('api/v1/base-applications', {
        params: { size: 10000, privateAccess: owner, select: 'title,image' },
      })).results
    },
    methods: {
      ...mapActions('session', ['login']),
    },
  }
</script>

<style lang="css">
.data-fair a {
  text-decoration: none;
}
</style>
