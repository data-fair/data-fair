<template lang="html">
  <v-row class="my-0 settings">
    <v-col :style="$vuetify.breakpoint.lgAndUp ? 'padding-right:256px;' : ''">
      <v-container class="py-0">
        <v-row v-if="initialized">
          <v-col>
            <!--<v-subheader>{{ $t('pages.settings.description') }}</v-subheader>-->
            <template v-if="authorized">
              <tutorial-alert
                id="settings-doc"
                text="Consultez la documentation sur les paramètres"
                href="https://data-fair.github.io/3/user-guide-backoffice/parameters"
              />
              <h2 class="mb-4">
                Paramètres de l'{{ activeAccount.type ==='organization' ? ('organisation ' + organization.name): ('utilisateur ' + user.name) }}
              </h2>
              <p v-if="activeAccount.type ==='organization'">
                Vous êtes <strong>{{ user.organizations.find(o => o.id===activeAccount.id).role }}</strong> dans cette organisation.
              </p>

              <!--<div v-if="activeAccount.type ==='organization'">
            <h3 class="mb-3">
              Permissions générales par rôle
            </h3>
            <p>Le rôle <strong>{{ env.adminRole }}</strong> peut tout faire</p>

            <v-data-table
              :headers="[{text: 'Opération', sortable: false}].concat(organizationRoles.map(role => ({text: role, sortable: false, align: 'center'})))"
              :items="Object.values(operations)"
              hide-default-footer
              class="elevation-1"
            >
              <template v-slot:item="{item}">
                <tr>
                  <td>{{ item.title }}</td>
                  <td v-for="role in organizationRoles" :key="role">
                    <v-checkbox
                      v-model="settings.operationsPermissions[item.id]"
                      :value="role"
                      label=""
                      @change="save"
                    />
                  </td>
                </tr>
              </template>
            </v-data-table>
          </div>-->
              <div
                v-for="section of sections"
                :key="section.id"
              >
                <layout-section-tabs
                  v-if="section.id === 'info'"
                  :svg="infoSvg"
                  svg-no-margin
                  :section="section"
                >
                  <template #extension>
                    <p>
                      Permettez aux utilisateurs de vos APIs et de vos applications de vous contacter en renseignant ces informations.
                    </p>
                  </template>
                  <template #tabs-items>
                    <v-container
                      fluid
                      class="py-1"
                    >
                      <v-row>
                        <v-col
                          cols="12"
                          md="6"
                        >
                          <settings-info
                            v-if="settings"
                            :settings="settings"
                            @updated="save"
                          />
                        </v-col>
                      </v-row>
                    </v-container>
                  </template>
                </layout-section-tabs>

                <layout-section-tabs
                  v-if="section.id === 'licences'"
                  :svg="qualitySvg"
                  :section="section"
                >
                  <template #extension>
                    <p>
                      Définissez des licences pour clarifier les utilisations possibles des jeux de données que vous diffusez.
                    </p>
                  </template>
                  <template #tabs-items>
                    <v-container
                      fluid
                      class="py-1"
                    >
                      <v-row>
                        <v-col
                          cols="12"
                          md="6"
                        >
                          <settings-licenses
                            v-if="settings"
                            :settings="settings"
                            @license-updated="save('fetchLicenses')"
                          />
                        </v-col>
                      </v-row>
                    </v-container>
                  </template>
                </layout-section-tabs>

                <layout-section-tabs
                  v-if="section.id === 'topics'"
                  :svg="flagsSvg"
                  svg-no-margin
                  :section="section"
                >
                  <template #extension>
                    <p v-if="env.disableApplications">
                      Les thématiques sont une manière simple d'organiser vos jeux de données.
                    </p>
                    <p v-else>
                      Les thématiques sont une manière simple d'organiser vos jeux de données et vos applications.
                    </p>
                  </template>
                  <template #tabs-items>
                    <v-container
                      fluid
                      class="py-1"
                    >
                      <v-row>
                        <v-col
                          cols="12"
                          md="6"
                        >
                          <settings-topics
                            v-if="settings"
                            :settings="settings"
                            @updated="save('fetchTopics')"
                          />
                        </v-col>
                      </v-row>
                    </v-container>
                  </template>
                </layout-section-tabs>

                <layout-section-tabs
                  v-if="section.id === 'datasetsMetadata'"
                  :svg="flagsSvg"
                  svg-no-margin
                  :section="section"
                >
                  <template #extension>
                    Configurez des métadonnées additionnelles pour vos jeux de données.
                  </template>
                  <template #tabs-items>
                    <v-container
                      fluid
                      class="py-1"
                    >
                      <v-row>
                        <v-col
                          cols="12"
                          md="6"
                        >
                          <settings-datasets-metadata
                            v-if="settings"
                            :settings="settings"
                            @updated="save('fetchDatasetsMetadata')"
                          />
                        </v-col>
                      </v-row>
                    </v-container>
                  </template>
                </layout-section-tabs>

                <layout-section-tabs
                  v-if="section.id === 'api-keys'"
                  :svg="securitysSvg"
                  svg-no-margin
                  :section="section"
                >
                  <template #extension>
                    <p>
                      Les clés d'API sont un moyen d'utiliser l'API de data-fair de manière sécurisée.
                      Il s'agit d'une configuration technique pour personne avertie.
                    </p>
                  </template>
                  <template #tabs-items>
                    <v-container
                      fluid
                      class="py-1"
                    >
                      <v-row>
                        <v-col
                          cols="12"
                          md="6"
                        >
                          <settings-api-keys
                            v-if="settings"
                            :settings="settings"
                            @updated="save"
                          />
                        </v-col>
                      </v-row>
                    </v-container>
                  </template>
                </layout-section-tabs>

                <layout-section-tabs
                  v-if="section.id === 'webhooks'"
                  :svg="wwwSvg"
                  svg-no-margin
                  :section="section"
                >
                  <template #extension>
                    <p>
                      Les <i>webhooks</i> sont un moyen de lier d'autres services Web à des événements internes à ce service de diffusion de données (créations, mises à jour, etc.).
                      Il s'agit d'une configuration technique pour personne avertie.
                    </p>
                  </template>
                  <template #tabs-items>
                    <v-container
                      fluid
                      class="pt-1 pb-6"
                    >
                      <v-row>
                        <v-col
                          cols="12"
                          md="6"
                        >
                          <settings-webhooks
                            v-if="settings"
                            :settings="settings"
                            @webhook-updated="save"
                          />
                        </v-col>
                      </v-row>
                    </v-container>
                  </template>
                </layout-section-tabs>

                <layout-section-tabs
                  v-if="section.id === 'privateVocabulary'"
                  :svg="checklistSvg"
                  svg-no-margin
                  :section="section"
                >
                  <template #extension>
                    <p>
                      Le <i>vocabulaire privé</i> vous permet d'étendre la liste des concepts avec lesquels pour pouvez annoter les colonnes de vos jeux de données.
                    </p>
                  </template>
                  <template #tabs-items>
                    <v-container fluid>
                      <v-alert
                        type="warning"
                        outlined
                        dense
                      >
                        Attention, si vous supprimez ou changez l'identifiant d'un concept référencé dans des jeux de données vous pouvez causer des dysfonctionnements.
                      </v-alert>
                      <v-row>
                        <v-col
                          cols="12"
                          md="6"
                        >
                          <settings-private-vocabulary
                            v-if="settings"
                            :settings="settings"
                            @updated="save('fetchVocabulary')"
                          />
                        </v-col>
                      </v-row>
                    </v-container>
                  </template>
                </layout-section-tabs>

                <layout-section-tabs
                  v-if="section.id === 'publicationSites'"
                  :svg="uiSvg"
                  svg-no-margin
                  :section="section"
                >
                  <template #extension>
                    <p>
                      Les <i>portails</i> sont les sites externes à Data Fair qui peuvent exposer ses ressources (jeux de données et applications).
                      Cette liste de sites est en partie gérée depuis l'onglet Portails mais certains paramètres relatifs à la publication des ressources sont édités ici.
                    </p>
                  </template>
                  <template #tabs-items>
                    <v-container
                      fluid
                      class="py-1"
                    >
                      <v-row>
                        <v-col
                          cols="12"
                          md="6"
                        >
                          <settings-publication-sites
                            v-if="settings"
                            :settings="settings"
                            @updated="save('fetchPublicationSites')"
                          />
                        </v-col>
                      </v-row>
                    </v-container>
                  </template>
                </layout-section-tabs>
              </div>
            </template>
            <layout-not-authorized v-else />
          </v-col>
        </v-row>
      </v-container>
    </v-col>
    <layout-navigation-right v-if="$vuetify.breakpoint.lgAndUp">
      <layout-toc :sections="sections" />
    </layout-navigation-right>
  </v-row>
</template>

<i18n lang="yaml">
fr:
  licences: Licences
  topics: Thématiques
  datasetsMetadata: Métadonnées des jeux de données
  apiKeys: "Clés d'API"
  webhooks: "Appels extérieurs (Webhooks)"
  privateVocab: Vocabulaire privé
  publicationSites: Sites de publication
  info: Informations de contact
en:
  licences: Licences
  topics: Topics
  datasetsMetadata: Datasets metadata
  apiKeys: API keys
  webhooks: "External requests (Webhooks)"
  privateVocab: Private vocabulary
  publicationSites: Publication sites
  info: Contact information
</i18n>

<script>
import { mapState, mapGetters } from 'vuex'
import eventBus from '~/event-bus'

export default {
  data: () => ({
    api: null,
    operations: null,
    organizationRoles: [],
    organization: {},
    settings: null,
    ready: false,
    qualitySvg: require('~/assets/svg/Quality Check_Monochromatic.svg?raw'),
    flagsSvg: require('~/assets/svg/Crossed flags_Two Color.svg?raw'),
    securitysSvg: require('~/assets/svg/Security_Two Color.svg?raw'),
    wwwSvg: require('~/assets/svg/World wide web_Two Color.svg?raw'),
    uiSvg: require('~/assets/svg/User Interface _Two Color.svg?raw'),
    checklistSvg: require('~/assets/svg/Checklist_Two Color.svg?raw'),
    infoSvg: require('~/assets/svg/Sending emails_Monochromatic.svg?raw')
  }),
  head: () => ({
    title: 'Paramètres'
  }),
  computed: {
    ...mapState('session', ['user', 'initialized']),
    ...mapGetters('session', ['activeAccount']),
    ...mapState(['env']),
    authorized () {
      if (!this.user) return false
      if (this.activeAccount.type === 'user' && this.activeAccount.id !== this.user.id) return false
      if (this.activeAccount.type === 'organization') {
        const organization = this.user.organizations.find(o => o.id === this.activeAccount.id)
        if (!organization) return false
        if (organization.role !== this.env.adminRole) return false
      }
      return true
    },
    sections () {
      if (!this.user) return []
      const sections = []
      if (!this.activeAccount.department) {
        sections.push({
          id: 'info',
          title: this.$t('info')
        })
        sections.push({
          id: 'licences',
          title: this.$t('licences')
        })
        sections.push({
          id: 'topics',
          title: this.$t('topics')
        })
        sections.push({
          id: 'datasetsMetadata',
          title: this.$t('datasetsMetadata')
        })
        sections.push({
          id: 'privateVocabulary',
          title: this.$t('privateVocab')
        })
      }
      sections.push({
        id: 'api-keys',
        title: this.$t('apiKeys')
      })
      sections.push({
        id: 'webhooks',
        title: this.$t('webhooks')
      })

      sections.push({
        id: 'publicationSites',
        title: this.$t('publicationSites')
      })
      return sections
    },
    settingsUrl () {
      let url = 'api/v1/settings/' + this.activeAccount.type + '/' + this.activeAccount.id
      if (this.activeAccount.department) url += ':' + this.activeAccount.department
      return url
    }
  },
  watch: {
    authorized: {
      handler () {
        if (this.authorized) this.init()
      },
      immediate: true
    }
  },
  methods: {
    async init () {
      if (this.activeAccount.type === 'organization') {
        let roles = []
        this.organization = await this.$axios.$get(this.env.directoryUrl + '/api/organizations/' + this.activeAccount.id)
        roles = await this.$axios.$get(this.env.directoryUrl + '/api/organizations/' + this.activeAccount.id + '/roles')
        this.organizationRoles = roles.filter(role => role !== this.env.adminRole)
      }
      this.settings = await this.$axios.$get(this.settingsUrl)
      this.$set(this.settings, 'webhooks', this.settings.webhooks || [])
      this.$set(this.settings, 'apiKeys', this.settings.apiKeys || [])
      if (!this.activeAccount.department) {
        this.$set(this.settings, 'operationsPermissions', this.settings.operationsPermissions || {})
        this.$set(this.settings, 'licenses', this.settings.licenses || [])
      }

      /*
        this.api = await this.$axios.$get('api/v1/api-docs.json')
        this.operations = (this.api && [].concat(...Object.keys(this.api.paths).map(path => Object.keys(this.api.paths[path]).map(method => ({
          id: this.api.paths[path][method].operationId,
          title: this.api.paths[path][method].summary,
          public: !this.api.paths[path][method].security || this.api.paths[path][method].security.find(sr => !Object.keys(sr).length),
        })))).filter(o => !o.public)) || []
        this.operations.forEach(operation => {
          this.$set(this.settings.operationsPermissions, operation.id, this.settings.operationsPermissions[operation.id] || [])
        })
        */
    },
    async save (action) {
      this.settings = await this.$axios.$put(this.settingsUrl, this.settings)
      eventBus.$emit('notification', 'Les paramètres ont été mis à jour')
      if (action) this.$store.dispatch(action, this.activeAccount)
    }
  }
}
</script>
