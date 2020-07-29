<template lang="html">
  <v-container>
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
          <div v-if="activeAccount.type ==='organization'">
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
          </div>

          <h3 class="mt-3 mb-3">
            Licenses
          </h3>
          <settings-licenses
            v-if="settings"
            :settings="settings"
            @license-updated="save"
          />
          <h3 class="mt-3 mb-3">
            Thématiques
          </h3>
          <settings-topics
            v-if="settings"
            :settings="settings"
            @updated="save"
          />
          <h3 class="mt-3 mb-3">
            Clés d'API
          </h3>
          <settings-api-keys
            v-if="settings"
            :settings="settings"
            @updated="save"
          />
          <h3 class="mt-3 mb-3">
            Appels extérieurs (Webhooks)
          </h3>
          <settings-webhooks
            v-if="settings"
            :settings="settings"
            @webhook-updated="save"
          />
        </template>
        <not-authorized v-else />
      </v-col>
    </v-row>
  </v-container>
</template>

<script>
  import { mapState, mapGetters } from 'vuex'
  import SettingsWebhooks from '~/components/settings/webhooks.vue'
  import SettingsLicenses from '~/components/settings/licenses.vue'
  import SettingsApiKeys from '~/components/settings/api-keys.vue'
  import SettingsTopics from '~/components/settings/topics.vue'
  import eventBus from '~/event-bus'

  export default {
    // middleware: 'auth',
    components: { SettingsWebhooks, SettingsLicenses, SettingsApiKeys, SettingsTopics },
    data: () => ({
      api: null,
      organizationRoles: [],
      organization: {},
      settings: null,
      ready: false,
    }),
    computed: {
      ...mapState('session', ['user', 'initialized']),
      ...mapGetters('session', ['activeAccount']),
      ...mapState(['env']),
      operations() {
        return (this.api && [].concat(...Object.keys(this.api.paths).map(path => Object.keys(this.api.paths[path]).map(method => ({
          id: this.api.paths[path][method].operationId,
          title: this.api.paths[path][method].summary,
          public: !this.api.paths[path][method].security || this.api.paths[path][method].security.find(sr => !Object.keys(sr).length),
        })))).filter(o => !o.public)) || []
      },
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
        this.api = await this.$axios.$get('api/v1/api-docs.json')
        this.operations.forEach(operation => {
          this.$set(this.settings.operationsPermissions, operation.id, this.settings.operationsPermissions[operation.id] || [])
        })
      },
      async save() {
        try {
          this.settings = await this.$axios.$put('api/v1/settings/' + this.activeAccount.type + '/' + this.activeAccount.id, this.settings)
          eventBus.$emit('notification', 'Les paramètres ont bien été mis à jour')
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
