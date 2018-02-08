<template lang="html">
  <md-layout md-column>
    <p>Les actions d'enrichissement proposées ci-dessous dépendent des concepts associés à ce jeu de données et des services distants configurés.</p>

    <md-layout>
      <md-list v-if="ready">
        <md-list-item v-for="(extension, i) in dataset.extensions" :key="i">
          <span>
            <md-checkbox v-model="extension.active" class="md-primary"/>
          </span>
          <div class="md-list-text-container">
            <span v-if="remoteServicesMap[extension.remoteService]">{{ remoteServicesMap[extension.remoteService].actions[extension.action].summary }} (service {{ remoteServicesMap[extension.remoteService].title }})</span>
            <p v-if="extension.active && extension.error" style="color: red;">{{ extension.error }}</p>
          </div>
          <div style="position:absolute;bottom:0;left:0;right:0;" v-if="extension.active && extension.progress !== undefined">
            <md-progress :md-progress="100 * (extension.progress || 0)"/>
          </div>
        </md-list-item>
      </md-list>
    </md-layout>
    <div>
      <md-button @click="save" class="md-raised md-warn">Appliquer</md-button>
    </div>
  </md-layout>
</template>

<script>
import { mapState, mapActions, mapGetters } from 'vuex'
const ws = require('../ws.js')

export default {
  data() {
    return {ready: false}
  },
  computed: {
    ...mapState(['vocabulary']),
    ...mapState('dataset', ['dataset', 'resourceUrl']),
    ...mapGetters('dataset', ['remoteServicesMap']),
    channel() {
      return 'datasets/' + this.dataset.id + '/extend-progress'
    }
  },
  watch: {
    remoteServicesMap() {
      // Add/remove available extensions
      const extensions = (this.dataset.extensions || []).filter(e => {
        return this.remoteServicesMap[e.remoteService] && this.remoteServicesMap[e.remoteService].actions[e.action]
      })
      Object.keys(this.remoteServicesMap).forEach(s => {
        Object.keys(this.remoteServicesMap[s].actions).forEach(a => {
          if (!extensions.find(e => e.remoteService === s && e.action === a)) {
            extensions.push({remoteService: s, action: a, active: false})
          }
        })
      })
      this.ready = true
      this.$set(this.dataset, 'extensions', extensions)
    }
  },
  mounted() {
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
    ...mapActions('dataset', ['fetchRemoteServices', 'patch']),
    save() {
      this.dataset.extensions.forEach(ext => {
        ext.error = ext.error || ''
      })
      this.patch({extensions: this.dataset.extensions})
    }
  }
}
</script>

<style lang="css">
</style>
