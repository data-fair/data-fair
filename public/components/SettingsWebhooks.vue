<template>
  <div>
    <p>
      Les <i>webhooks</i> sont un moyen de lier d'autres services Web à des événements internes à ce service de diffusion de données (créations, mises à jour, etc.).
      Il s'agit d'une configuration technique pour personne avertie.
    </p>
    <v-form v-model="formValid">
      <v-jsonschema-form :schema="wrapperSchema" :model="wrapper" :options="{requiredMessage: 'Information obligatoire'}" @error="error => eventBus.$emit('notification', {error})" @change="change" />
    </v-form>
  </div>
</template>

<script>
import Vue from 'vue'
import VJsonschemaForm from '@koumoul/vuetify-jsonschema-form/lib/index.vue'
import '@koumoul/vuetify-jsonschema-form/dist/main.css'
import eventBus from '../event-bus.js'

if (process.browser) {
  const Draggable = require('vuedraggable')
  Vue.component('draggable', Draggable)
}

const events = require('../../shared/events.json').dataset
const webhooksSchema = require('../../contract/settings.json').properties.webhooks
const wrapperSchema = {
  type: 'object',
  properties: {
    webhooks: webhooksSchema
  }
}

export default {
  name: 'Webhooks',
  components: { VJsonschemaForm },
  props: ['settings'],
  data: () => ({
    events,
    eventBus,
    wrapperSchema,
    formValid: true,
    wrapper: {
      webhooks: []
    }
  }),
  created() {
    this.wrapper.webhooks = JSON.parse(JSON.stringify(this.settings.webhooks))
  },
  methods: {
    async change() {
      await new Promise(resolve => setTimeout(resolve, 10))
      if (this.formValid) {
        this.settings.webhooks = JSON.parse(JSON.stringify(this.wrapper.webhooks))
        const missingInfo = !!this.settings.webhooks.find(w => {
          return Object.keys(w.target).length === 0 || w.events.length === 0
        })
        if (!missingInfo) this.$emit('webhook-updated')
      }
    }
  }
}
</script>
