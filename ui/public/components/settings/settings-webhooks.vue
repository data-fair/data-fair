<template>
  <div style="min-height:60px;">
    <v-form v-model="formValid">
      <lazy-v-jsf
        v-model="wrapper"
        :schema="wrapperSchema"
        :options="{locale: 'fr', arrayItemCardProps: {outlined: true, tile: true}, editMode: 'inline'}"
        @change="change"
      />
    </v-form>
  </div>
</template>

<script>
import Vue from 'vue'
import eventBus from '~/event-bus'
import settingsSchema from '~/../../api/types/settings/schema.js'

if (process.browser) {
  const Draggable = require('vuedraggable')
  Vue.component('Draggable', Draggable)
}

const webhooksSchema = settingsSchema.properties.webhooks
const wrapperSchema = {
  type: 'object',
  properties: {
    webhooks: webhooksSchema
  }
}

export default {
  props: ['settings'],
  data: () => ({
    eventBus,
    wrapperSchema,
    formValid: true,
    wrapper: {
      webhooks: []
    }
  }),
  created () {
    this.wrapper.webhooks = JSON.parse(JSON.stringify(this.settings.webhooks))
  },
  methods: {
    async change () {
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
