<template lang="html">
  <v-container>
    <p>Les actions d'enrichissement proposées ci-dessous dépendent des concepts associés à ce jeu de données et des services configurés.</p>

    <v-data-table
      v-if="ready"
      :items="dataset.extensions"
      hide-headers
      hide-actions
      class="elevation-1 mb-3"
    >
      <template slot="no-data">
        Aucun enrichissement possible.
      </template>
      <template slot="items" slot-scope="props">
        <tr>
          <td>
            <v-checkbox primary hide-details v-model="props.item.active"/>
          </td>
          <td class="pt-2 pb-2">
            <span v-if="remoteServicesMap[props.item.remoteService]">
              {{ remoteServicesMap[props.item.remoteService].actions[props.item.action].summary }} (service {{ remoteServicesMap[props.item.remoteService].title }})
            </span>

            <v-select
              v-if="props.item.active && remoteServicesMap[props.item.remoteService] && selectFields[props.item.remoteService + '_' + props.item.action].fieldsAndTags"
              :items="selectFields[props.item.remoteService + '_' + props.item.action].fieldsAndTags"
              item-value="name"
              item-text="title"
              v-model="props.item.select"
              label=""
              multiple
              placeholder="Tous les champs en sortie"
              persistent-hint
            >
              <template slot="item" slot-scope="data">
                <template v-if="typeof data.item !== 'object'">
                  <v-list-tile-content>{{ data.item }}</v-list-tile-content>
                </template>
                <template v-else>
                  <v-list-tile-content>
                    <v-list-tile-title>{{ data.item.title || data.item.name }}</v-list-tile-title>
                  </v-list-tile-content>
                </template>
              </template>
            </v-select>
            <v-alert type="error" :value="props.item.active && props.item.error">
              {{ props.item.error }}
            </v-alert>
          </td>
          <td class="text-xs-right">
            <v-progress-circular
              v-if="props.item.active"
              :size="40"
              :width="6"
              :rotate="360"
              :value="100 * (props.item.progress || 0)"
              color="primary"
              class="mt-2"
            >
              <span v-if="props.item.active && (props.item.progress === 1 || props.item.error)">
                <v-btn icon flat color="accent" @click="save(props.item)" title="Recommencer et écraser les valeurs enrichies précédemment">
                  <v-icon>play_circle_filled</v-icon>
                </v-btn>
              </span>
            </v-progress-circular>

          </td>

        </tr>
      </template>
    </v-data-table>
    <v-layout row>
      <v-spacer/><v-btn @click="save" class="md-raised" color="primary">Appliquer</v-btn>
    </v-layout>
  </v-container>
</template>

<script>
import { mapState, mapActions, mapGetters } from 'vuex'
import eventBus from '../../../event-bus.js'

export default {
  components: {},
  data() {
    return {ready: false}
  },
  computed: {
    ...mapState(['vocabulary']),
    ...mapState('dataset', ['dataset']),
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
        const fieldsAndTags = []
        tags.forEach(tag => {
          fieldsAndTags.push(tag)
          fields.filter(field => field['x-tags'].includes(tag)).forEach(field => fieldsAndTags.push(field))
        })
        const noTagsFields = fields.filter(field => !field['x-tags'] || field['x-tags'].length === 0)
        if (fieldsAndTags.length > 0 && noTagsFields.length > 0) {
          fieldsAndTags.push('Autres')
        }
        noTagsFields.forEach(field => fieldsAndTags.push(field))
        res[extension.remoteService + '_' + extension.action] = {fields, tags, fieldsAndTags}
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
  created() {
    this.fetchRemoteServices()
    eventBus.$emit('subscribe', this.channel)
    eventBus.$on(this.channel, info => {
      const extension = this.dataset.extensions.find(e => e.remoteService === info.remoteService && e.action === info.action)
      if (extension) {
        extension.progress = info.progress
        extension.error = info.error
      }
    })
  },
  destroyed() {
    eventBus.$emit('unsubscribe', this.channel)
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
    &:after {
      height: 0;
    }
  }
  .error {
    color: red;
    padding-bottom: 16px;
  }
}
</style>
