<template>
  <div>
    <v-form ref="form">
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

  const events = require('~/../shared/events.json').dataset
  const privateVocabularySchema = require('~/../contract/settings').properties.privateVocabulary
  const wrapperSchema = {
    type: 'object',
    properties: {
      privateVocabulary: privateVocabularySchema,
    },
  }

  export default {
    components: { VJsf },
    props: ['settings'],
    data: () => ({
      events,
      eventBus,
      wrapperSchema,
      formValid: true,
      wrapper: {
        privateVocabulary: [],
      },
    }),
    created() {
      this.wrapper.privateVocabulary = JSON.parse(JSON.stringify(this.settings.privateVocabulary || []))
    },
    methods: {
      async change() {
        await new Promise(resolve => setTimeout(resolve, 10))
        if (this.$refs.form.validate()) {
          this.settings.privateVocabulary = JSON.parse(JSON.stringify(this.wrapper.privateVocabulary))
          this.$emit('updated')
        }
      },
    },
  }
</script>
