<template>
<md-layout md-align="center">
  <md-layout md-column md-flex="90" v-if="settings">
    <h2 class="md-display-1" v-if="$route.params.type ==='organization'">Paramètre de l'organisation {{userOrganizations[$route.params.id].name}}</h2>
    <h2 class="md-display-1" v-if="$route.params.type ==='user'">Mes paramètres personnels</h2>

    <h3 class="md-headline">Webhooks</h3>
    <md-table>
      <md-table-header>
        <md-table-row>
          <md-table-head>Nom</md-table-head>
          <md-table-head>URL</md-table-head>
          <md-table-head>Evènements</md-table-head>
        </md-table-row>
      </md-table-header>

      <md-table-body>
        <md-table-row>
          <md-table-cell>
            <md-input-container>
              <label>Titre</label>
              <md-input v-model="newWebhook.title"></md-input>
            </md-input-container>
          </md-table-cell>
          <md-table-cell>
            <md-input-container>
              <label>URL</label>
              <md-input v-model="newWebhook.url"></md-input>
            </md-input-container>
          </md-table-cell>
          <md-table-cell>
            <md-select v-model="newWebhook.events" multiple>
              <md-option :value="eventId" v-for="(event, eventId) in events">{{event.text}}</md-option>
            </md-select>
          </md-table-cell>
          <md-table-cell>
            <md-button class="md-icon-button md-raised md-primary" @click="addWebhook">
              <md-icon>add</md-icon>
            </md-button>
          </md-table-cell>
        </md-table-row>
        <md-table-row v-for="(webhook, rowIndex) in settings.webhooks" :key="rowIndex">
          <md-table-cell>
            <span>{{webhook.title}}</span>
          </md-table-cell>
          <md-table-cell>
            <span>{{webhook.url}}</span>
          </md-table-cell>
          <md-table-cell>
            {{webhook.events}}
          </md-table-cell>
          <md-table-cell>
            <md-button class="md-icon-button md-raised md-warn" @click="removeWebhook(rowIndex)">
              <md-icon>remove</md-icon>
            </md-button>
          </md-table-cell>
        </md-table-row>
      </md-table-body>
    </md-table>
  </md-layout>
</md-layout>
</template>

<script>
const {
  mapState
} = require('vuex')
const events = require('../events.json')

export default {
  name: 'settings',
  data: () => ({
    settings: null,
    newWebhook: {
      title: null,
      events: [],
      url: null
    },
    events: events
  }),
  computed: {
    ...mapState({
      user: state => state.user,
      userOrganizations: state => state.userOrganizations
    })
  },
  mounted() {
    this.$http.get(window.CONFIG.publicUrl + '/api/v1/settings/' + this.$route.params.type + '/' + this.$route.params.id).then(response => {
      this.settings = response.data
      this.settings.webhooks = this.settings.webhooks || []
    })
  },
  methods: {
    save() {
      this.$http.put(window.CONFIG.publicUrl + '/api/v1/settings/' + this.$route.params.type + '/' + this.$route.params.id, this.settings).then(result => {
        this.$store.dispatch('notify', `Les paramètres ont bien été mis à jour`)
      }, error => {
        this.$store.dispatch('notifyError', `Erreur ${error.status} pendant la mise à jour des paramètres`)
      })
    },
    addWebhook(){
      this.settings.webhooks.push(this.newWebhook)
      this.newWebhook = {
        title: null,
        events: [],
        url: null
      }
      this.save()
    },
    removeWebhook(rowIndex){
      this.settings.webhooks.splice(rowIndex, 1)
      this.save()
    }
  }
}
</script>
