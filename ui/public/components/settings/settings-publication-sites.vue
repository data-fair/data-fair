<template>
  <div style="min-height:60px;">
    <v-form ref="form">
      <lazy-v-jsf
        v-model="localValue"
        :schema="schema"
        :options="vjsfOptions"
        @change="change"
      />
    </v-form>
  </div>
</template>

<i18n lang="yaml">
fr:
  summary: résumé
  description: description
  license: licence
  topic: thématique
en:
  summary: summary
  description: description
  license: license
  topic: topic
</i18n>

<script>
import Vue from 'vue'
import { mapState } from 'vuex'
import eventBus from '~/event-bus'
import publicationSitesContract from '~/../../api/contract/publication-sites'
import settingsSchema from '~/../../api/types/settings/schema.js'

if (process.browser) {
  const Draggable = require('vuedraggable')
  Vue.component('Draggable', Draggable)
}

const publicationSitesSchema = publicationSitesContract(false)
const publicationSitesAdminSchema = publicationSitesContract(true)
const datasetsMetadataSchema = settingsSchema.properties.datasetsMetadata

export default {
  props: ['value', 'datasetsMetadata'],
  data: () => ({
    eventBus,
    formValid: true,
    localValue: [],

  }),
  computed: {
    ...mapState('session', ['user']),
    schema () {
      return this.user.adminMode ? publicationSitesAdminSchema : publicationSitesSchema
    },
    vjsfOptions () {
      return {
        locale: 'fr',
        arrayItemCardProps: { outlined: true, tile: true },
        editMode: 'inline',
        context: this.context
      }
    },
    context () {
      return {
        datasetsMetadata: [
          { key: 'summary', title: this.$t('summary') },
          { key: 'description', title: this.$t('description') },
          { key: 'license', title: this.$t('license') },
          { key: 'topics', title: this.$t('topic') }
        ].concat(Object.keys(this.datasetsMetadata || {})
          .filter(metadata => this.datasetsMetadata[metadata].active)
          .map(metadata => ({
            key: metadata,
            title: datasetsMetadataSchema.properties[metadata].title || datasetsMetadataSchema.properties[metadata].properties.active.title
          })))
      }
    }
  },
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
