<template>
  <div>
    <v-form v-model="formValid">
      <v-jsf
        v-model="wrapper"
        :schema="wrapperSchema"
        :options="opts"
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

  const events = require('~/../shared/events.json').dataset
  const topicsSchema = require('~/../contract/settings').properties.topics
  const wrapperSchema = {
    type: 'object',
    properties: {
      topics: topicsSchema,
    },
  }

  export default {
    name: 'Topics',
    components: { VJsf },
    props: ['settings'],
    data: () => ({
      events,
      eventBus,
      wrapperSchema,
      formValid: true,
      wrapper: {
        topics: [],
      },
      opts: {
        locale: 'fr',
        hideReadOnly: true,
        colorPickerProps: { showSwatches: true },
        arrayItemCardProps: { outlined: true, tile: true },
        editMode: 'inline',
      },
    }),
    created() {
      this.wrapper.topics = JSON.parse(JSON.stringify(this.settings.topics || []))
    },
    methods: {
      async change() {
        console.log('change !')
        await new Promise(resolve => setTimeout(resolve, 10))
        if (this.formValid) {
          this.settings.topics = JSON.parse(JSON.stringify(this.wrapper.topics))
          this.$emit('updated')
        }
      },
    },
  }
</script>
