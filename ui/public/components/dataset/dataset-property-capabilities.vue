<template>
  <v-dialog
    v-model="dialog"
    max-width="800px"
    @input="toggle"
  >
    <template #activator="{on, attrs}">
      <v-btn
        v-if="relevantCapabilities && relevantCapabilities.length"
        fab
        small
        depressed
        dark
        v-bind="attrs"
        :title="$t('technicalConfig')"
        v-on="on"
      >
        <v-icon>mdi-tune</v-icon>
      </v-btn>
    </template>
    <v-card v-if="dialog">
      <v-toolbar
        dense
        flat
      >
        <v-toolbar-title v-t="'technicalConfig'" />
        <v-spacer />
        <v-btn
          icon
          @click.native="dialog = false"
        >
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-toolbar>
      <v-card-text class="px-3 pb-0">
        <tutorial-alert
          id="capabilities"
          persistent
        >
          <p v-t="'tutorialCapabilities'" />
          <p
            v-t="'tutorialEnergy'"
            class="mb-0"
          />
        </tutorial-alert>

        <v-form ref="form">
          <lazy-v-jsf
            v-if="editCapabilities"
            v-model="editCapabilities"
            :schema="schema"
            :options="{context, disableAll: !editable}"
            @change="apply"
          />
        </v-form>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<i18n lang="yaml">
fr:
  technicalConfig: Configuration technique
  tutorialCapabilities: Par défaut la plupart des options sont cochées pour maximiser les utilisations possibles de vos jeux de données. Pour de petits volumes il n'y a pas d'inconvénient à conserver ce paramétrage. Mais pour des volumes importants désactiver les options inutiles permet de réduire les temps de traitement et de requête.
  tutorialEnergy: Qui dit temps de traitement dit énergie. En désactivant les options inutiles vous contribuez à rendre cette plateforme moins énergivore.
en:
  technicalConfig: Technical configuration
  tutorialCapabilities: Most options are active by default to maximize usage possibilities of your datasets. For small volumes of data there is no need to change this. But for larger datasets disabling some options will reduce processing and request times.
  tutorialEnergy: Processing time is synonymous to energy consumption. By disabling some options you contribute making this platform more energy efficient.
</i18n>

<script>
import { mapState } from 'vuex'
import capabilitiesSchema from '~/../../api/contract/capabilities.js'

const capabilitiesDefaultFalse = Object.keys(capabilitiesSchema.properties).filter(key => capabilitiesSchema.properties[key].default === false)

export default {
  props: ['editable', 'property'],
  data () {
    return {
      dialog: false,
      editCapabilities: null
    }
  },
  computed: {
    ...mapState('session', ['user']),
    relevantCapabilities () {
      const type = this.property.type
      if (type === 'number' || type === 'integer') {
        return ['index', 'textStandard', 'values']
      } else if (type === 'boolean') {
        return ['index', 'textStandard', 'values']
      } else if (type === 'string' && (this.property.format === 'date' || this.property.format === 'date-time')) {
        return ['index', 'textStandard', 'values']
      } else if (this.property['x-refersTo'] === 'https://purl.org/geojson/vocab#geometry') {
        return ['geoShape', 'vtPrepare']
      } else if (this.property['x-refersTo'] === 'http://schema.org/DigitalDocument') {
        return ['indexAttachment']
      } else if (type === 'string') {
        return ['index', 'text', 'textStandard', 'textAgg', 'values', 'insensitive', 'wildcard']
      }
      return []
    },
    schema () {
      const schema = JSON.parse(JSON.stringify(capabilitiesSchema))
      Object.keys(schema.properties).forEach(key => {
        if (!this.relevantCapabilities.includes(key)) delete schema.properties[key]
      })
      return schema
    },
    context () {
      return {}
    }
  },
  methods: {
    toggle (show) {
      if (show) {
        this.editCapabilities = this.property['x-capabilities'] ? { ...this.property['x-capabilities'] } : {}
      } else {
        this.editCapabilities = null
      }
    },
    apply () {
      const capabilities = { ...this.editCapabilities }
      // we only keep the values that were toggled to false
      for (const key in capabilities) {
        if (capabilities[key] === true && !capabilitiesDefaultFalse.includes(key)) delete capabilities[key]
      }
      for (const key in capabilities) {
        if (capabilities[key] === false && capabilitiesDefaultFalse.includes(key)) delete capabilities[key]
      }
      if (Object.keys(capabilities).length) this.$set(this.property, 'x-capabilities', capabilities)
      else this.$delete(this.property, 'x-capabilities')
    }
  }
}
</script>

<style>

</style>
