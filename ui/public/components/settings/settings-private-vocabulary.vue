<template>
  <div style="min-height:60px;">
    <v-form ref="form">
      <lazy-v-jsf
        :key="randomKey"
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

const privateVocabularySchema = settingsSchema.properties.privateVocabulary
const wrapperSchema = {
  type: 'object',
  properties: {
    privateVocabulary: privateVocabularySchema
  }
}

export default {
  props: ['settings'],
  data: () => ({
    eventBus,
    wrapperSchema,
    formValid: true,
    wrapper: {
      privateVocabulary: []
    },
    randomKey: Math.random()
  }),
  watch: {
    settings () {
      this.refresh()
    }
  },
  created () {
    this.refresh()
  },
  methods: {
    async change () {
      await new Promise(resolve => setTimeout(resolve, 10))
      if (this.$refs.form.validate()) {
        this.settings.privateVocabulary = JSON.parse(JSON.stringify(this.wrapper.privateVocabulary))
        this.$emit('updated')
      }
    },
    refresh () {
      this.wrapper.privateVocabulary = JSON.parse(JSON.stringify(this.settings.privateVocabulary || []))
      this.randomKey = Math.random()
    }
  }
}
</script>
