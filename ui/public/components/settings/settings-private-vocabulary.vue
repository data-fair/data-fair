<template>
  <div style="min-height:60px;">
    <v-form ref="form">
      <lazy-v-jsf
        v-model="localValue"
        :schema="privateVocabularySchema"
        :options="vjsfOptions"
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

export default {
  props: ['value'],
  data: () => ({
    eventBus,
    privateVocabularySchema,
    localValue: [],
    randomKey: Math.random(),
    vjsfOptions: { locale: 'fr', arrayItemCardProps: { outlined: true, tile: true }, editMode: 'inline' }
  }),
  created () {
    this.localValue = JSON.parse(JSON.stringify(this.value || []))
  },
  methods: {
    async change () {
      await new Promise(resolve => setTimeout(resolve, 10))
      if (this.$refs.form.validate()) {
        this.$emit('input', this.localValue)
      }
    }
  }
}
</script>
