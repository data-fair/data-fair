<template>
  <div>
    <v-form v-model="formValid">
      <v-jsf
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
  import VJsf from '@koumoul/vjsf/lib/VJsf.js'
  import '@koumoul/vjsf/dist/main.css'
  import eventBus from '~/event-bus'

  if (process.browser) {
    const Draggable = require('vuedraggable')
    Vue.component('draggable', Draggable)
  }

  const webhooksSchema = require('~/../contract/settings').properties.webhooks
  const wrapperSchema = {
    type: 'object',
    properties: {
      webhooks: webhooksSchema,
    },
  }

  export default {
    components: { VJsf },
    props: ['settings'],
    data: () => ({
      eventBus,
      wrapperSchema,
      formValid: true,
      wrapper: {
        webhooks: [],
      },
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
      },
    },
  }
</script>
