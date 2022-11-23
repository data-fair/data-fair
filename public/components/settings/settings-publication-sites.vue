<template>
  <div style="min-height:60px;">
    <v-form ref="form">
      <!--{{ context }}<br>
      {{ wrapper }}-->
      <lazy-v-jsf
        v-model="wrapper"
        :schema="wrapperSchema"
        :options="{locale: 'fr', arrayItemCardProps: {outlined: true, tile: true}, editMode: 'inline', context}"
        @change="change"
      />
    </v-form>
  </div>
</template>

<i18n lang="yaml">
fr:
  description: description
  license: licence
  topic: thématique
en:
  description: description
  license: license
  topic: topic
</i18n>

<script>
import Vue from 'vue'
import eventBus from '~/event-bus'

if (process.browser) {
  const Draggable = require('vuedraggable')
  Vue.component('Draggable', Draggable)
}

const publicationSitesSchema = require('~/../contract/settings').properties.publicationSites
const datasetsMetadataSchema = require('~/../contract/settings').properties.datasetsMetadata
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
  computed: {
    context () {
      return {
        datasetsMetadata: [
          { key: 'description', title: this.$t('description') },
          { key: 'license', title: this.$t('license') },
          { key: 'topics', title: this.$t('topic') }
        ].concat(Object.keys(this.settings.datasetsMetadata || {})
          .filter(metadata => this.settings.datasetsMetadata[metadata].active)
          .map(metadata => ({
            key: metadata,
            title: datasetsMetadataSchema.properties[metadata].title || datasetsMetadataSchema.properties[metadata].properties.active.title
          })))
      }
    }
  },
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
