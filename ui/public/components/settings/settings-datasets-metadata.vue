<template>
  <div style="min-height:60px;">
    <v-form v-model="formValid">
      <lazy-v-jsf
        v-model="localValue"
        :schema="datasetsMetadataSchema"
        :options="opts"
        @change="change"
      />
    </v-form>
  </div>
</template>

<script>
import Vue from 'vue'
import settingsSchema from '~/../../api/types/settings/schema.js'

if (process.browser) {
  const Draggable = require('vuedraggable')
  Vue.component('Draggable', Draggable)
}

const datasetsMetadataSchema = settingsSchema.properties.datasetsMetadata

export default {
  props: ['value'],
  data: () => ({
    datasetsMetadataSchema,
    formValid: true,
    localValue: [],
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
    this.localValue = JSON.parse(JSON.stringify(this.value || []))
  },
  methods: {
    async change () {
      await new Promise(resolve => setTimeout(resolve, 10))
      if (this.formValid) this.$emit('input', this.localValue)
    }
  }
}
</script>
