<template>
  <div style="min-height:60px;">
    <v-form ref="form">
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

if (process.browser) {
  const Draggable = require('vuedraggable')
  Vue.component('Draggable', Draggable)
}

const publicationSitesSchema = require('~/../contract/settings').properties.publicationSites
const wrapperSchema = {
  type: 'object',
  properties: {
    publicationSites: publicationSitesSchema
  }
}

export default {
  props: ['settings'],
  data: () => ({
    eventBus,
    wrapperSchema,
    formValid: true,
    wrapper: {
      publicationSites: []
    }
  }),
  created () {
    this.wrapper.publicationSites = JSON.parse(JSON.stringify(this.settings.publicationSites || []))
  },
  methods: {
    async change () {
      await new Promise(resolve => setTimeout(resolve, 10))
      if (this.$refs.form.validate()) {
        this.settings.publicationSites = JSON.parse(JSON.stringify(this.wrapper.publicationSites))
        this.$emit('updated')
      }
    }
  }
}
</script>
