<template lang="html">
  <v-row class="my-0">
    <v-col :style="this.$vuetify.breakpoint.lgAndUp ? 'padding-right:256px;' : ''">
      <v-container class="py-0">
        <layout-doc-link tooltip="Consultez la documentation sur les paramètres" doc-key="settings" />
        <v-row v-if="initialized">
          <v-col>
            <!--<v-subheader>{{ $t('pages.settings.description') }}</v-subheader>-->
            <template v-if="authorized">
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

              <layout-section-tabs
                :svg="qualitySvg"
                :section="sections.find(s => s.id === 'licences')"
              >
                <template v-slot:extension>
                  <p>
                    Définissez des licences pour clarifier les utilisations possibles des jeux de données que vous diffusez.
                  </p>
                </template>
                <template v-slot:tabs-items>
                  <v-container fluid class="py-1">
                    <v-row>
                      <v-col cols="12" md="6">
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
                :svg="flagsSvg"
                svg-no-margin
                :section="sections.find(s => s.id === 'topics')"
              >
                <template v-slot:extension>
                  <p v-if="env.disableApplications">
                    Les thématiques sont une manière simple d'organiser vos jeux de données.
                  </p>
                  <p v-else>
                    Les thématiques sont une manière simple d'organiser vos jeux de données et vos visualisations.
                  </p>
                </template>
                <template v-slot:tabs-items>
                  <v-container fluid class="py-1">
                    <v-row>
                      <v-col cols="12" md="6">
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
                :svg="securitysSvg"
                svg-no-margin
                :section="sections.find(s => s.id === 'api-keys')"
              >
                <template v-slot:extension>
                  <p>
                    Les clés d'API sont un moyen d'utiliser l'API de data-fair de manière sécurisée.
                    Il s'agit d'une configuration technique pour personne avertie.
                  </p>
                </template>
                <template v-slot:tabs-items>
                  <v-container fluid class="py-1">
                    <v-row>
                      <v-col cols="12" md="6">
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
                :svg="wwwSvg"
                svg-no-margin
                :section="sections.find(s => s.id === 'webhooks')"
              >
                <template v-slot:extension>
                  <p>
                    Les <i>webhooks</i> sont un moyen de lier d'autres services Web à des événements internes à ce service de diffusion de données (créations, mises à jour, etc.).
                    Il s'agit d'une configuration technique pour personne avertie.
                  </p>
                </template>
                <template v-slot:tabs-items>
                  <v-container fluid class="py-1">
                    <v-row>
                      <v-col cols="12" md="6">
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
                :svg="uiSvg"
                svg-no-margin
                :section="sections.find(s => s.id === 'publicationSites')"
                :admin="true"
              >
                <template v-slot:extension>
                  <p>
                    Les <i>sites de publication</i> sont les sites externes à data-fair qui peuvent exposer ses ressources (jeux de données et visualisations).
                    Cette liste de sites est normalement gérée automatiquement par le projet data-fair-portals.
                  </p>
                </template>
                <template v-slot:tabs-items>
                  <v-container fluid class="py-1">
                    <v-row>
                      <v-col cols="12" md="6">
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
            </template>
            <layout-not-authorized v-else />
          </v-col>
        </v-row>
      </v-container>
    </v-col>
    <layout-navigation-right v-if="this.$vuetify.breakpoint.lgAndUp">
      <layout-toc :sections="sections" />
    </layout-navigation-right>
  </v-row>
</template>

<script>
  import { mapState, mapGetters } from 'vuex'
  import eventBus from '~/event-bus'

  export default {
    // middleware: 'auth',
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
    }),
    computed: {
      ...mapState('session', ['user', 'initialized']),
      ...mapGetters('session', ['activeAccount']),
      ...mapState(['env']),
      authorized() {
        if (!this.user) return false
        if (this.activeAccount.type === 'user' && this.activeAccount.id !== this.user.id) return false
        if (this.activeAccount.type === 'organization') {
          const organization = this.user.organizations.find(o => o.id === this.activeAccount.id)
          if (!organization) return false
          if (organization.role !== this.env.adminRole) return false
        }
        return true
      },
      sections() {
        const sections = [{
          id: 'licences',
          title: 'Licences',
        }, {
          id: 'topics',
          title: 'Thématiques',
        }, {
          id: 'api-keys',
          title: 'Clés d\'API',
        }, {
          id: 'webhooks',
          title: 'Appels extérieurs (Webhooks)',
        }]
        if (this.user.adminMode) {
          sections.push({
            id: 'publicationSites',
            title: 'Sites de publication',
          })
        }
        return sections
      },
    },
    watch: {
      authorized: {
        handler() {
          if (this.authorized) this.init()
        },
        immediate: true,
      },
    },
    methods: {
      async init() {
        if (this.activeAccount.type === 'organization') {
          let roles = []
          try {
            this.organization = await this.$axios.$get(this.env.directoryUrl + '/api/organizations/' + this.activeAccount.id)
            roles = await this.$axios.$get(this.env.directoryUrl + '/api/organizations/' + this.activeAccount.id + '/roles')
          } catch (err) {
            eventBus.$emit('notification', { type: 'error', msg: 'Erreur pendant la récupération de la liste des rôles de l\'organisation' })
          }
          this.organizationRoles = roles.filter(role => role !== this.env.adminRole)
        }
        this.settings = await this.$axios.$get('api/v1/settings/' + this.activeAccount.type + '/' + this.activeAccount.id)
        this.$set(this.settings, 'operationsPermissions', this.settings.operationsPermissions || {})
        this.$set(this.settings, 'webhooks', this.settings.webhooks || [])
        this.$set(this.settings, 'apiKeys', this.settings.apiKeys || [])
        this.$set(this.settings, 'licenses', this.settings.licenses || [])
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
      async save(action) {
        try {
          this.settings = await this.$axios.$put('api/v1/settings/' + this.activeAccount.type + '/' + this.activeAccount.id, this.settings)
          eventBus.$emit('notification', 'Les paramètres ont été mis à jour')
          if (action) this.$store.dispatch(action, this.activeAccount)
        } catch (error) {
          eventBus.$emit('notification', { error, msg: 'Erreur pendant la mise à jour des paramètres' })
        }
      },
    },
    head: () => ({
      title: 'Paramètres',
    }),
  }
</script>

<style lang="css">
</style>
