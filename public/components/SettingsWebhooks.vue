<template>
  <div>
    <p>
      Les <i>webhooks</i> sont un moyen de lier vos propres services à des événements internes à ce service de diffusion de données (créations, mises à jour, etc.).
      Il s'agit d'une configuration technique pour personne avertie.
    </p>
    <v-btn color="primary" @click="showDialog = true" class="mb-3">Ajouter un webhook</v-btn>
    <v-container grid-list-md>
      <v-layout row wrap>
        <v-flex xs12 lg6 v-for="(webhook, rowIndex) in settings.webhooks" :key="rowIndex">
          <v-card>
            <v-card-title primary-title>
              <h4 class="title"><span v-if="webhook.title">{{ webhook.title }} - </span>{{ webhook.url }}</h4>
            </v-card-title>

            <v-subheader>Événéments déclencheurs</v-subheader>
            <v-list dense>
              <v-list-tile v-for="(event, i) in webhook.events" :key="i">
                {{ events[event].text }}
              </v-list-tile>
            </v-list>

            <v-card-actions>
              <v-spacer/>
              <v-btn flat icon color="warning" title="Supprimer ce webhook" @click="removeWebhook(rowIndex)">
                <v-icon>delete</v-icon>
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-flex>
      </v-layout>
    </v-container>

    <v-dialog v-model="showDialog" max-width="700px">
      <v-card>
        <v-card-title primary-title>
          Ajout d'un nouveau webhook
        </v-card-title>
        <v-card-text>
          <v-form v-model="newWebhookValid">
            <v-text-field label="Titre" v-model="newWebhook.title" :rules="[v => !!v || '']" required/>
            <v-text-field label="URL" v-model="newWebhook.url" :rules="[v => !!v || '']" required/>
            <v-checkbox :label="event.text" v-model="newWebhook.events" :value="eventId" v-for="(event, eventId) in events" :key="eventId"/>
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-spacer/>
          <v-btn flat @click="showDialog = false">Annuler</v-btn>
          <v-btn color="primary" @click="addWebhook" :disabled="!newWebhookValid">Ajouter</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script>
// TODO: manage webhooks for other types of resources
const events = require('../../shared/events.json').dataset

export default {
  name: 'Webhooks',
  props: ['settings'],
  data: () => ({
    events,
    newWebhook: {
      title: null,
      events: [],
      url: null,
      type: 'dataset'
    },
    newWebhookValid: false,
    showDialog: false
  }),
  methods: {
    addWebhook() {
      const webhook = Object.assign({}, this.newWebhook)
      this.settings.webhooks.push(webhook)
      this.showDialog = false
      this.$emit('webhook-updated')
    },
    removeWebhook(rowIndex) {
      this.settings.webhooks.splice(rowIndex, 1)
      this.$emit('webhook-updated')
    }
  }
}
</script>
