<template lang="html">
  <md-layout md-column>
    <p>Les actions d'enrichissement proposées ci-dessous dépendent des concepts associés à ce jeu de données et des services distants configurés.</p>

    <md-layout>
      <md-list v-if="ready" class="extensions-list">
        <md-list-item v-for="(extension, i) in dataset.extensions" :key="i">
          <span>
            <md-checkbox v-model="extension.active" class="md-primary"/>
          </span>
          <div class="md-list-text-container">
            <span v-if="remoteServicesMap[extension.remoteService]">{{ remoteServicesMap[extension.remoteService].actions[extension.action].summary }} (service {{ remoteServicesMap[extension.remoteService].title }})</span>
            <md-input-container v-if="extension.active && remoteServicesMap[extension.remoteService]">

              <md-select v-if="selectFields[extension.remoteService + '_' + extension.action].tags.length" multiple placeholder="Tous les champs en sortie" v-model="extension.select">
                <template v-for="tag in selectFields[extension.remoteService + '_' + extension.action].tags">
                  <md-subheader :key="tag">{{ tag }}</md-subheader>
                  <md-option v-for="output in selectFields[extension.remoteService + '_' + extension.action].fields.filter(field => field['x-tags'].includes(tag))"
                             :key="tag + output.name"
                             :value="output.name">
                    {{ output.title || output.name }}
                  </md-option>
                </template>
                <md-subheader>Autres</md-subheader>
                <md-option v-for="output in selectFields[extension.remoteService + '_' + extension.action].fields.filter(field => !field['x-tags'].length)"
                           :key="output.name"
                           :value="output.name">
                  {{ output.title || output.name }}
                </md-option>
              </md-select>

              <md-select v-else multiple placeholder="Tous les champs en sortie" v-model="extension.select">
                <md-option v-for="output in selectFields[extension.remoteService + '_' + extension.action].fields"
                           :key="output.name"
                           :value="output.name">
                  {{ output.title || output.name }}
                </md-option>
              </md-select>
            </md-input-container>
            <p v-if="extension.active && extension.error" style="color: red;">{{ extension.error }}</p>
          </div>
          <span v-if="extension.active && extension.progress === 1">
            <md-button class="md-icon-button md-warn" @click="save(extension)">
              <md-tooltip>Recommencer et écraser les valeurs enrichies précédemment</md-tooltip>
              <md-icon>play_circle_filled</md-icon>
            </md-button>
          </span>
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
  components: {},
  data() {
    return {ready: false}
  },
  computed: {
    ...mapState(['vocabulary']),
    ...mapState('dataset', ['dataset', 'resourceUrl']),
    ...mapGetters('dataset', ['remoteServicesMap']),
    channel() {
      return 'datasets/' + this.dataset.id + '/extend-progress'
    },
    selectFields() {
      const res = {}
      this.dataset.extensions.forEach(extension => {
        const fields = this.remoteServicesMap[extension.remoteService].actions[extension.action].output
          .map(field => { field['x-tags'] = field['x-tags'] || []; return field })
          .filter(o => !o.concept || o.concept !== 'http://schema.org/identifier')
          .sort((a, b) => (a.title || a.name).localeCompare(b.title || b.name))
        const tags = [...new Set(Array.concat([], ...fields.map(f => f['x-tags'])))].sort()
        res[extension.remoteService + '_' + extension.action] = {fields, tags}
      })
      return res
    }
  },
  watch: {
    remoteServicesMap() {
      // Add/remove available extensions
      this.dataset.extensions = this.dataset.extensions.filter(e => {
        return this.remoteServicesMap[e.remoteService] && this.remoteServicesMap[e.remoteService].actions[e.action]
      })
      Object.keys(this.remoteServicesMap).forEach(s => {
        Object.keys(this.remoteServicesMap[s].actions).forEach(a => {
          if (!this.dataset.extensions.find(e => e.remoteService === s && e.action === a)) {
            this.dataset.extensions.push({remoteService: s, action: a, active: false, progress: 0})
          }
        })
      })
      this.ready = true
    }
  },
  mounted() {
    this.fetchRemoteServices()
    ws.$emit('subscribe', this.channel)
    ws.$on(this.channel, info => {
      const extension = this.dataset.extensions.find(e => e.remoteService === info.remoteService && e.action === info.action)
      if (extension) {
        extension.progress = info.progress
        extension.error = info.error
      }
    })
  },
  destroyed() {
    ws.$emit('unsubscribe', this.channel)
  },
  methods: {
    ...mapActions('dataset', ['fetchRemoteServices', 'patch']),
    save(forceNextExtension) {
      this.dataset.extensions.forEach(ext => {
        if (forceNextExtension && forceNextExtension.remoteService === ext.remoteService && forceNextExtension.action === ext.action) {
          ext.forceNext = true
          ext.progress = 0
        } else {
          ext.forceNext = false
        }
        ext.progress = ext.progress || 0
        ext.error = ext.error || ''
      })
      this.patch({extensions: this.dataset.extensions, silent: true})
    }
  }
}
</script>

<style lang="less">
.extensions-list {
  max-width: 100%;
  .md-input-container {
    padding-top: 4px;
    .md-select {
      width: auto;
    }
  }
}
</style>
