<template>
<div>
  <md-button id="new-webhook" class="md-raised md-primary" @click="$refs['new-webhook-dialog'].open()">Ajouter des webhook</md-button>
  <md-list v-if="settings">
    <md-list-item v-for="(webhook, rowIndex) in settings.webhooks" style="padding:8px 0">
      <md-card style="padding:16px;width:100%">
        <md-layout md-row md-vertical-align="center">
          <md-layout md-flex="40" md-column>
            <md-subheader>Nom</md-subheader>
            <span>{{webhook.title}}</span>
            <md-subheader>URL</md-subheader>
            <span>{{webhook.url}}</span>
          </md-layout>

          <md-layout md-flex="50" md-column>
            <md-subheader>Evènements déclencheurs</md-subheader>
            <ul>
              <li v-for="event in webhook.events">{{events[event].text}}</li>
            </ul>
          </md-layout>

          <md-layout md-flex="5" md-flex-offset="5" md-column>
            <md-button class="md-icon-button md-raised md-warn md-dense" @click="removeWebhook(rowIndex)">
              <md-icon>remove</md-icon>
            </md-button>
          </md-layout>
        </md-layout>
      </md-card>
    </md-list-item>
  </md-list>

  <md-dialog md-open-from="#new-webhook" md-close-to="#new-webhook" ref="new-webhook-dialog">
    <md-dialog-title>Ajout d'un nouveau webhook</md-dialog-title>

    <md-dialog-content>
      <md-input-container>
        <label>Titre</label>
        <md-input v-model="newWebhook.title"></md-input>
      </md-input-container>

      <md-input-container>
        <label>URL</label>
        <md-input v-model="newWebhook.url"></md-input>
      </md-input-container>

      <md-layout md-column>
        <md-subheader>Evènements</md-subheader>
        <md-checkbox :md-value="eventId" v-model="newWebhook.events" v-for="(event, eventId) in events">{{event.text}}</md-checkbox>
      </md-layout>
    </md-dialog-content>

    <md-dialog-actions>
      <md-button class="md-warn md-raised" @click="$refs['new-webhook-dialog'].close()">Annuler</md-button>
      <md-button class="md-success md-raised" @click="addWebhook">Ajouter</md-button>
    </md-dialog-actions>
  </md-dialog>

</div>
</template>

<script>
const {
  mapState
} = require('vuex')
const events = require('../../../shared/events.json')

export default {
  name: 'webhooks',
  props: ['settings'],
  data: () => ({
    events: events,
    newWebhook: {
      title: null,
      events: [],
      url: null
    },
    organizations: {},
    users: {},
    newWebhookOrganizationRoles: []
  }),
  computed: {
    ...mapState({
      userOrganizations: state => state.userOrganizations
    }),
    operations() {
      return (this.api && [].concat(...Object.keys(this.api.paths).map(path => Object.keys(this.api.paths[path]).map(method => ({
        id: this.api.paths[path][method].operationId,
        title: this.api.paths[path][method].summary
      }))))) || []
    }
  },
  mounted() {
    this.settings.webhooks = this.settings.webhooks || []
  },
  methods: {
    addWebhook() {
      const webhook = Object.assign({}, this.newWebhook)
      this.settings.webhooks.push(webhook)
      this.$refs['new-webhook-dialog'].close()
      this.$emit('webhook-updated')
    },
    removeWebhook(rowIndex) {
      this.settings.webhooks.splice(rowIndex, 1)
      this.$emit('webhook-updated')
    }
  },
  watch: {
    settings() {
      this.settings.webhooks = this.settings.webhooks || []
    }
  }
}
</script>
