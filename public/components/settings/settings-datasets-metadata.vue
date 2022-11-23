<template>
  <div style="min-height:60px;">
    <v-form v-model="formValid">
      <lazy-v-jsf
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
import eventBus from '~/event-bus'

if (process.browser) {
  const Draggable = require('vuedraggable')
  Vue.component('Draggable', Draggable)
}

const datasetsMetadataSchema = require('~/../contract/settings').properties.datasetsMetadata
const wrapperSchema = {
  type: 'object',
  properties: {
    datasetsMetadata: datasetsMetadataSchema
  }
}

export default {
  props: ['settings'],
  data: () => ({
    eventBus,
    wrapperSchema,
    formValid: true,
    wrapper: {
      datasetsMetadata: []
    },
    opts: {
      locale: 'fr',
      hideReadOnly: true,
      colorPickerProps: { showSwatches: true },
      arrayItemCardProps: { outlined: true, tile: true },
      editMode: 'inline',
      fieldProps: { dense: true, hideDetails: true }
    }
  }),
  created () {
    this.wrapper.datasetsMetadata = JSON.parse(JSON.stringify(this.settings.datasetsMetadata || {}))
  },
  methods: {
    async change () {
      console.log('change !')
      await new Promise(resolve => setTimeout(resolve, 10))
      if (this.formValid) {
        this.settings.datasetsMetadata = JSON.parse(JSON.stringify(this.wrapper.datasetsMetadata))
        this.$emit('updated')
      }
    }
  }
}
</script>
