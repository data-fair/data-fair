<template lang="html">
  <md-layout md-column>
    <p>Les actions d'enrichissement proposées ci-dessous dépendent des concepts associés à ce jeu de données et des services distants configurés.</p>

    <md-layout>
      <md-list v-if="ready">
        <md-list-item v-for="(extension, i) in dataset.extensions" :key="i">
          <span>
            <md-checkbox v-model="extension.active" class="md-primary"/>
          </span>
          <span>{{ remoteServices[extension.remoteService].actions[extension.action].summary }} (service {{ remoteServices[extension.remoteService].title }})</span>
          <p v-if="extension.error" class="md-error">{{ extension.error }}</p>
          <div style="position:absolute;bottom:0;left:0;right:0;" v-if="extension.progress !== undefined">
            <md-progress :md-progress="100 * (extension.progress || 0)"/>
          </div>
          <!--<md-layout md-row style="padding:8px" md-vertical-align="center">
        <md-layout md-column md-flex="10">
          <h5 class="md-title">Utilisez</h5>
        </md-layout>
        <md-layout md-flex="40" md-align="center">
          <md-checkbox v-for="input in action.input" :key="input.concept" :md-value="input.concept" v-model="input.selected" class="md-primary" v-if="vocabulary[input.concept] && input.concept !== 'http://schema.org/identifier'">{{ vocabulary[input.concept].title }}
            <md-tooltip md-direction="top">{{ vocabulary[input.concept].description }}</md-tooltip>
          </md-checkbox>
        </md-layout>
        <md-layout md-column md-flex="15" style="padding: 8px 16px">
          <h5 class="md-title">pour rajouter</h5>
        </md-layout>
        <md-layout md-flex="20">
          <md-chip v-for="output in action.output" :key="output.concept" class="md-warn" style="margin:4px 4px;" v-if="vocabulary[output.concept] && output.concept !== 'http://schema.org/identifier'">{{ vocabulary[output.concept].title }}
            <md-tooltip md-direction="top">{{ vocabulary[output.concept].description }}</md-tooltip>
          </md-chip>
        </md-layout>
        <md-layout md-column md-flex="15">
          <md-button class="md-raised md-primary" :disabled="action.input.filter(i => i.selected).length === 0" @click="execute(action)">Démarrer</md-button>
        </md-layout>
      </md-layout>
    -->
        </md-list-item>
      </md-list>
    </md-layout>
    <div>
      <md-button @click="save" class="md-raised md-warn">Appliquer</md-button>
    </div>
  </md-layout>
</template>

<script>
import { mapState } from 'vuex'
const ws = require('../ws.js')

export default {
  props: ['dataset'],
  data() {
    return {
      ready: false,
      remoteServices: {},
      channel: 'datasets/' + this.dataset.id + '/extend-progress'
    }
  },
  computed: {
    ...mapState(['vocabulary']),
    resourceUrl() {
      return window.CONFIG.publicUrl + '/api/v1/datasets/' + this.dataset.id
    },
    concepts() {
      return new Set(this.dataset.schema.map(field => field['x-refersTo']).filter(c => c))
    }
  },
  watch: {
    concepts() {
      this.fetchRemoteServices()
    }
  },
  mounted() {
    this.$store.dispatch('fetchVocabulary')
    this.fetchRemoteServices()
    ws.$emit('subscribe', this.channel)
    ws.$on(this.channel, info => {
      const extension = this.dataset.extensions.find(e => e.remoteService === info.remoteService && e.action === info.action)
      if (extension) {
        this.$set(extension, 'progress', info.progress)
        this.$set(extension, 'error', info.error)
      }
    })
  },
  destroyed() {
    ws.$emit('unsubscribe', this.channel)
  },
  methods: {
    // An action is using an remote services endpoint to enrich a specific dataset
    save() {
      const patch = { extensions: this.dataset.extensions }
      this.$http.patch(this.resourceUrl, patch).then(result => {
        this.$store.dispatch('notify', `Le jeu de données a bien été mis à jour`)
      }, error => {
        this.$store.dispatch('notifyError', `Erreur ${error.status} pendant la mise à jour du jeu de données`)
      })
    },
    async fetchRemoteServices() {
      if (this.concepts.size) {
        const res = await this.$http.get(window.CONFIG.publicUrl + '/api/v1/remote-services?input-concepts=' + [...this.concepts].map(encodeURIComponent).join(','))
        this.remoteServices = {}
        res.data.results
          .filter(s => s.owner.type === this.dataset.owner.type && s.owner.id === this.dataset.owner.id)
          .forEach(s => {
            s.actions = s.actions
              .filter(a => a.inputCollection && a.outputCollection)
              .filter(a => a.input.find(i => this.concepts.has(i.concept)))
              .reduce((a, b) => { a[b.id] = b; return a }, {})
            this.remoteServices[s.id] = s
          })
      } else {
        this.remoteServices = {}
      }

      // Add/remove available extensions
      const extensions = (this.dataset.extensions || []).filter(e => {
        return this.remoteServices[e.remoteService] && this.remoteServices[e.remoteService].actions[e.action]
      })
      Object.keys(this.remoteServices).forEach(s => {
        Object.keys(this.remoteServices[s].actions).forEach(a => {
          if (!extensions.find(e => e.remoteService === s && e.action === a)) {
            extensions.push({remoteService: s, action: a, active: false})
          }
        })
      })
      this.ready = true
      this.$set(this.dataset, 'extensions', extensions)
    }
  }
}
</script>

<style lang="css">
</style>
