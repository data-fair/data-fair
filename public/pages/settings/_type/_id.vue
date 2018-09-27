<template lang="html">
  <v-layout column>
    <v-subheader>{{ $t('pages.settings.description') }}</v-subheader>
    <h2 class="display-1 mb-4">Paramètres de l'{{ $route.params.type ==='organization' ? ('organisation ' + organization.name): ('utilisateur ' +user.name) }}</h2>
    <p v-if="$route.params.type ==='organization'">Vous êtes <strong>{{ user.organizations.find(o => o.id===$route.params.id).role }}</strong> dans cette organisation.</p>
    <v-container v-if="$route.params.type === 'user' || isAdmin">
      <div v-if="$route.params.type ==='organization'">
        <h3 class="headline mb-3">Permissions générales par rôle</h3>
        <p>Le rôle <strong>{{ env.adminRole }}</strong> peut tout faire</p>

        <v-data-table
          :headers="[{text: 'Opération', sortable: false}].concat(organizationRoles.map(role => ({text: role, sortable: false, align: 'center'})))"
          :items="Object.values(operations)"
          hide-actions
          class="elevation-1"
        >
          <template slot="items" slot-scope="props">
            <tr>
              <td>
                {{ props.item.title }}
              </td>
              <td v-for="role in organizationRoles" :key="role">
                <v-checkbox v-model="settings.operationsPermissions[props.item.id]" :value="role" label="" @change="save"/>
              </td>
            </tr>
          </template>
        </v-data-table>
      </div>

      <h3 class="headline mt-3 mb-3">Licenses</h3>
      <settings-licenses v-if="settings" :settings="settings" @license-updated="save"/>
      <h3 class="headline mt-3 mb-3">Webhooks</h3>
      <settings-webhooks v-if="settings" :settings="settings" @webhook-updated="save"/>
    </v-container>
    <v-jumbotron v-else height="auto">
      <v-container fill-height>
        <v-layout align-center>
          <v-flex text-xs-center>
            <div class="headline">Vous n'êtes pas authorisé à voir ou modifier le contenu de cette page. Si vous voulez changer les paramètres de votre organisation, veuillez contacter un administrateur de celle ci.</div>
          </v-flex>
        </v-layout>
      </v-container>
    </v-jumbotron>
  </v-layout>

</template>

<script>
import { mapState } from 'vuex'
import SettingsWebhooks from '../../../components/SettingsWebhooks.vue'
import SettingsLicenses from '../../../components/SettingsLicenses.vue'
import eventBus from '../../../event-bus'

export default {
  middleware: 'auth',
  components: { SettingsWebhooks, SettingsLicenses },
  data: () => ({
    api: null,
    organizationRoles: [],
    organization: {},
    settings: null
  }),
  computed: {
    ...mapState('session', ['user']),
    ...mapState(['env']),
    operations() {
      return (this.api && [].concat(...Object.keys(this.api.paths).map(path => Object.keys(this.api.paths[path]).map(method => ({
        id: this.api.paths[path][method].operationId,
        title: this.api.paths[path][method].summary,
        public: !this.api.paths[path][method].security || this.api.paths[path][method].security.find(sr => !Object.keys(sr).length)
      })))).filter(o => !o.public)) || []
    },
    isAdmin() {
      return this.user.organizations.find(o => o.id === this.$route.params.id).role === this.env.adminRole
    }
  },
  async mounted() {
    if (this.$route.params.type === 'user' || this.isAdmin) {
      if (this.$route.params.type === 'organization') {
        let roles = []
        try {
          this.organization = await this.$axios.$get(this.env.directoryUrl + '/api/organizations/' + this.$route.params.id)
          roles = await this.$axios.$get(this.env.directoryUrl + '/api/organizations/' + this.$route.params.id + '/roles')
        } catch (err) {
          eventBus.$emit('notification', { type: 'error', msg: `Erreur pendant la récupération de la liste des rôles de l'organisation` })
        }
        this.organizationRoles = roles.filter(role => role !== this.env.adminRole)
      }
      this.settings = await this.$axios.$get('api/v1/settings/' + this.$route.params.type + '/' + this.$route.params.id)
      this.$set(this.settings, 'operationsPermissions', this.settings.operationsPermissions || {})
      this.$set(this.settings, 'webhooks', this.settings.webhooks || [])
      this.$set(this.settings, 'licenses', this.settings.licenses || [])
      this.api = await this.$axios.$get('api/v1/api-docs.json')
      this.operations.forEach(operation => {
        this.$set(this.settings.operationsPermissions, operation.id, this.settings.operationsPermissions[operation.id] || [])
      })
    }
  },
  methods: {
    async save() {
      try {
        await this.$axios.$put('api/v1/settings/' + this.$route.params.type + '/' + this.$route.params.id, this.settings)
        eventBus.$emit('notification', `Les paramètres ont bien été mis à jour`)
      } catch (error) {
        eventBus.$emit('notification', { error, msg: `Erreur pendant la mise à jour des paramètres` })
      }
    }
  }
}
</script>

<style lang="css">
</style>
