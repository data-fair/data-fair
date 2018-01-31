<template lang="html">
  <md-list v-if="vocabulary">

    <p>Les actions d'enrichissement proposées ci-dessous dépendent des concepts associés aux colonnes de ce jeu de données et des servuces distants configurés.</p>
    <md-list-item v-for="(action, i) in actions" :key="i">
      <span>
        <md-checkbox v-model="action.selected" class="md-primary"/>
      </span>
      <span>{{ action.summary }} (service {{ action.remoteService.title }})</span>
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
      <md-divider class="md-inset"/>
    </md-list-item>
  </md-list>
</template>

<script>
import { mapState } from 'vuex'

export default {
  props: ['dataset'],
  data() {
    return {
      actions: []
    }
  },
  computed: {
    ...mapState(['vocabulary']),
    concepts() {
      return new Set(this.dataset.schema.map(field => field['x-refersTo']).filter(c => c))
    }
  },
  watch: {
    concepts() {
      this.fetchActions()
    }
  },
  mounted() {
    this.$store.dispatch('fetchVocabulary')
    this.fetchActions()
  },
  methods: {
    // An action is using an remote services endpoint to enrich a specific dataset
    execute(action) {
      const params = {
        inputConcepts: action.input.filter(i => i.selected).map(i => i.concept),
        dataset: this.dataset.id
      }
      this.$http.post(window.CONFIG.publicUrl + '/api/v1/remote-services/' + action.api.id + '/actions/' + action.id, params)
    },
    fetchActions() {
      if (this.concepts.size) {
        this.$http.get(window.CONFIG.publicUrl + '/api/v1/remote-services?input-concepts=' + [...this.concepts].map(encodeURIComponent).join(',')).then(res => {
          res.data.results.forEach(r => r.actions.forEach(a => { a.remoteService = r }))
          this.actions = [].concat(...res.data.results.map(r => r.actions.filter(a => a.input.map(i => i.concept).filter(x => this.concepts.has(x)).length))).filter(a => a.inputCollection && a.outputCollection)
        })
      } else {
        this.actions = []
      }
    }
  }
}
</script>

<style lang="css">
</style>
