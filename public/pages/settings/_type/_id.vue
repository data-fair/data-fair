<template lang="html">
  <v-container>
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
              <v-checkbox label="" v-model="settings.operationsPermissions[props.item.id]" :value="role" @change="save"/>
            </td>
          </tr>
        </template>
      </v-data-table>
    </div>

    <h3 class="headline mt-3 mb-3">Licenses</h3>
    <settings-licenses v-if="settings" :settings="settings" @license-updated="save"/>
    <h3 class="headline mt-3 mb-3">Catalogues</h3>
    <settings-catalogs v-if="settings" :settings="settings" @catalog-updated="save"/>
    <h3 class="headline mt-3 mb-3">Webhooks</h3>
    <settings-webhooks v-if="settings" :settings="settings" @webhook-updated="save"/>
  </v-container>

</template>

<script>
import {mapState} from 'vuex'
import SettingsWebhooks from '../../../components/SettingsWebhooks.vue'
import SettingsLicenses from '../../../components/SettingsLicenses.vue'
import SettingsCatalogs from '../../../components/SettingsCatalogs.vue'
import eventBus from '../../../event-bus'

export default {
  components: {SettingsWebhooks, SettingsLicenses, SettingsCatalogs},
  data: () => ({
    api: null,
    organizationRoles: [],
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
    }
  },
  async mounted() {
    if (this.$route.params.type === 'organization') {
      const roles = await this.$axios.$get(this.env.directoryUrl + '/api/organizations/' + this.$route.params.id + '/roles')
      this.organizationRoles = roles.filter(role => role !== this.env.adminRole)
    }
    this.settings = await this.$axios.$get('api/v1/settings/' + this.$route.params.type + '/' + this.$route.params.id)
    this.$set(this.settings, 'operationsPermissions', this.settings.operationsPermissions || {})
    this.$set(this.settings, 'webhooks', this.settings.webhooks || [])
    this.$set(this.settings, 'licenses', this.settings.licenses || [])
    this.$set(this.settings, 'catalogs', this.settings.catalogs || [])
    this.api = await this.$axios.$get('api/v1/api-docs.json')
    this.operations.forEach(operation => {
      this.$set(this.settings.operationsPermissions, operation.id, this.settings.operationsPermissions[operation.id] || [])
    })
  },
  methods: {
    async save() {
      try {
        await this.$axios.$put('api/v1/settings/' + this.$route.params.type + '/' + this.$route.params.id, this.settings)
        eventBus.$emit('notification', `Les paramètres ont bien été mis à jour`)
      } catch (error) {
        eventBus.$emit('notification', {error, msg: `Erreur pendant la mise à jour des paramètres`})
      }
    }
  }
}
</script>

<style lang="css">
</style>
