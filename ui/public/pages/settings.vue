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
                persistent
              />
              <h2 class="mb-4">
                Paramètres de l'{{ activeAccount.type ==='organization' ? ('organisation ' + organization.name): ('utilisateur ' + user.name) }} {{ activeAccount.department ? (' / ' + (activeAccount.departmentName ?? activeAccount.department)) : '' }}
              </h2>
              <p v-if="activeAccount.type ==='organization'">
                Vous êtes <strong>{{ user.organizations.find(o => o.id===activeAccount.id).role }}</strong> dans cette organisation.
              </p>
              <p v-if="activeAccount.type ==='organization' && !activeAccount.department && accountDetails?.departments?.length">
                <v-select
                  v-model="selectedDepartment"
                  label="Département"
                  :items="[{id: null, name: 'racine de l\'organisation'}, ...accountDetails.departments]"
                  item-text="name"
                  item-value="id"
                  style="max-width: 500px;"
                  @change="init"
                />
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
              <v-progress-linear
                v-if="!settings"
                indeterminate
              />
              <template v-else>
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
                              v-model="settings.info"
                              @input="patch({info: settings.info})"
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
                            <d-frame
                              :src="`/data-fair/embed/settings/${settingsPath}/licenses`"
                              resize="yes"
                              @notif="emitFrameNotif"
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
                            <d-frame
                              :src="`/data-fair/embed/settings/${settingsPath}/topics`"
                              resize="yes"
                              @notif="emitFrameNotif"
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
                              v-model="settings.datasetsMetadata"
                              @input="patch({datasetsMetadata: settings.datasetsMetadata})"
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
                      <d-frame
                        :src="`/data-fair/embed/settings/${settingsPath}/api-keys`"
                        resize="yes"
                        @notif="emitFrameNotif"
                      />
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
                        class="py-1"
                      >
                        <v-row>
                          <v-col
                            cols="12"
                            md="6"
                          >
                            <d-frame
                              :src="`/data-fair/embed/settings/${settingsPath}/webhooks`"
                              resize="yes"
                              @notif="emitFrameNotif"
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
                          Attention, si vous supprimez un concept référencé dans des jeux de données vous pouvez causer des dysfonctionnements.
                        </v-alert>
                        <v-row>
                          <v-col
                            cols="12"
                            md="6"
                          >
                            <settings-private-vocabulary
                              v-model="settings.privateVocabulary"
                              @input="patch({privateVocabulary: settings.privateVocabulary})"
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
                              v-model="settings.publicationSites"
                              :datasets-metadata="settings.datasetsMetadata"
                              @input="patch({publicationSites: settings.publicationSites})"
                            />
                          </v-col>
                        </v-row>
                      </v-container>
                    </template>
                  </layout-section-tabs>

                  <layout-section-tabs
                    v-if="section.id === 'compat'"
                    svg-no-margin
                    admin
                    :section="section"
                  >
                    <template #extension>
                      <p>
                        Gérez les compatibilités de votre organisation avec d'autres services. Peut-être particulièrement utile en période de transition.
                      </p>
                    </template>
                    <template #tabs-items>
                      <v-container
                        fluid
                        class="py-1"
                      >
                        <v-row>
                          <v-col>
                            <v-checkbox
                              v-model="settings.compatODS"
                              :label="$t('compatODS')"
                              @change="patch({compatODS: settings.compatODS})"
                            />
                          </v-col>
                        </v-row>
                      </v-container>
                    </template>
                  </layout-section-tabs>
                </div>
              </template>
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
  publicationSites: Portails
  info: Informations de contact
  compat: Gestion des compatibilités
  compatODS: Activer la compatibilité ODS
en:
  licences: Licenses
  topics: Topics
  datasetsMetadata: Datasets metadata
  apiKeys: API keys
  webhooks: "External requests (Webhooks)"
  privateVocab: Private vocabulary
  publicationSites: Portals
  info: Contact information
  compat: Compatibility management
  compatODS: Enable ODS compatibility
</i18n>

<script>
import { mapState, mapGetters, mapActions } from 'vuex'
import '@data-fair/frame/lib/d-frame.js'

export default {
  async beforeRouteLeave (to, from, next) {
    await this.$store.dispatch('fetchLicenses', this.settingsAccount)
    await this.$store.dispatch('fetchTopics', this.settingsAccount)
    await this.$store.dispatch('fetchDatasetsMetadata', this.settingsAccount)
    await this.$store.dispatch('fetchDatasetsMetadata', this.settingsAccount)
    await this.$store.dispatch('fetchPublicationSites', this.settingsAccount)
    await this.$store.dispatch('fetchVocabulary', true)
    next()
  },
  middleware: ['auth-required'],
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
    infoSvg: require('~/assets/svg/Sending emails_Monochromatic.svg?raw'),
    accountDetails: null,
    selectedDepartment: null
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
      if (!this.settingsAccount.department) {
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
      if (!this.env.disablePublicationSites) {
        sections.push({
          id: 'publicationSites',
          title: this.$t('publicationSites')
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
      if (this.env.compatODS && this.user.adminMode) {
        sections.push({
          id: 'compat',
          title: this.$t('compat')
        })
      }
      return sections
    },
    settingsAccount () {
      if (this.selectedDepartment) return { ...this.activeAccount, department: this.selectedDepartment }
      else return this.activeAccount
    },
    settingsPath () {
      let settingsPath = this.settingsAccount.type + '/' + this.settingsAccount.id
      if (this.settingsAccount.department) settingsPath += encodeURIComponent(':') + this.settingsAccount.department
      return settingsPath
    },
    settingsUrl () {
      return 'api/v1/settings/' + this.settingsPath
    },
  },
  watch: {
    authorized: {
      handler () {
        if (this.authorized) {
          this.init()
          this.fetchAccountDetails()
        }
      },
      immediate: true
    }
  },
  methods: {
    ...mapActions(['emitFrameNotif']),
    async init () {
      this.settings = null
      if (this.settingsAccount.type === 'organization') {
        let roles = []
        this.organization = await this.$axios.$get(this.env.directoryUrl + '/api/organizations/' + this.settingsAccount.id)
        roles = await this.$axios.$get(this.env.directoryUrl + '/api/organizations/' + this.settingsAccount.id + '/roles')
        this.organizationRoles = roles.filter(role => role !== this.env.adminRole)
      }
      this.settings = await this.$axios.$get(this.settingsUrl)
      this.$set(this.settings, 'webhooks', this.settings.webhooks || [])
      this.$set(this.settings, 'apiKeys', this.settings.apiKeys || [])
      if (!this.settingsAccount.department) {
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
    async patch (patch) {
      this.settings = await this.$axios.$patch(this.settingsUrl, patch)
    },
    async fetchAccountDetails () {
      this.accountDetails = {
        ...await this.$axios.$get(`${this.env.directoryUrl}/api/${this.activeAccount.type}s/${this.activeAccount.id}`),
        type: this.activeAccount.type
      }
    }
  }
}
</script>
