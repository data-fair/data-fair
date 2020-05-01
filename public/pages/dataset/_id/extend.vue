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
      <template
        slot="items"
        slot-scope="props"
      >
        <tr>
          <td>
            <v-checkbox
              v-model="props.item.active"
              primary
              hide-details
            />
          </td>
          <td class="pt-2 pb-2">
            <span v-if="remoteServicesMap[props.item.remoteService] && remoteServicesMap[props.item.remoteService].actions[props.item.action]">
              {{ remoteServicesMap[props.item.remoteService].actions[props.item.action].summary }} (service {{ remoteServicesMap[props.item.remoteService].title }})
              &nbsp;
              <v-btn
                v-if="props.item.progress === 1"
                small
                outline
                @click="currentExtension = props.item; extensionDetailsDialog = true;"
              >Voir détails</v-btn>
            </span>

            <v-select
              v-if="props.item.active && remoteServicesMap[props.item.remoteService] && selectFields[props.item.remoteService + '_' + props.item.action].fieldsAndTags"
              v-model="props.item.select"
              :items="selectFields[props.item.remoteService + '_' + props.item.action].fieldsAndTags"
              item-value="name"
              item-text="title"
              label=""
              multiple
              placeholder="Tous les champs en sortie"
              persistent-hint
            >
              <template
                slot="item"
                slot-scope="data"
              >
                <template v-if="typeof data.item !== 'object'">
                  <v-list-item-content>{{ data.item }}</v-list-item-content>
                </template>
                <template v-else>
                  <v-list-item-content>
                    <v-list-item-title>{{ data.item.title || data.item.name }}</v-list-item-title>
                  </v-list-item-content>
                </template>
              </template>
            </v-select>
            <v-alert
              :value="props.item.active && props.item.error"
              type="error"
            >
              {{ props.item.error }}
            </v-alert>
          </td>
          <td class="text-right">
            <v-progress-circular
              v-if="props.item.active"
              :size="40"
              :width="6"
              :rotate="360"
              :value="100 * (props.item.progress || 0)"
              color="primary"
              class="mt-2"
            >
              <span v-if="props.item.active && (props.item.progress >= 1 || props.item.error)">
                <v-btn
                  icon
                  flat
                  color="accent"
                  title="Recommencer et écraser les valeurs enrichies précédemment"
                  @click="save(props.item)"
                >
                  <v-icon>play_circle_filled</v-icon>
                </v-btn>
              </span>
            </v-progress-circular>
          </td>
        </tr>
      </template>
    </v-data-table>
    <v-row>
      <v-spacer /><v-btn
        class="md-raised"
        color="primary"
        @click="save"
      >
        Appliquer
      </v-btn>
    </v-row>

    <v-dialog
      v-model="extensionDetailsDialog"
      :fullscreen="$vuetify.breakpoint.mdAndDown"
      :max-width="1200"
    >
      <v-card v-if="currentExtension">
        <v-card-title
          primary-title
          class="headline"
        >
          Extension: {{ remoteServicesMap[currentExtension.remoteService].actions[currentExtension.action].summary }} (service {{ remoteServicesMap[currentExtension.remoteService].title }})
        </v-card-title>
        <v-card-text>
          <dataset-extension-details
            :remote-service="currentExtension.remoteService"
            :action="currentExtension.action"
          />
        </v-card-text>
        <v-divider />

        <v-card-actions>
          <v-spacer />
          <v-btn
            color="primary"
            flat
            @click="extensionDetailsDialog = false"
          >
            ok
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script>
  import { mapState, mapActions, mapGetters } from 'vuex'
  import DatasetExtensionDetails from '../../../components/datasets/extension-details.vue'
  import eventBus from '~/event-bus'
  import logger from '../../../logger'

  export default {
    components: {
      DatasetExtensionDetails,
    },
    data() {
      return {
        ready: false,
        extensionDetailsDialog: false,
        currentExtension: null,
      }
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
            .filter(f => !f.concept || f.concept !== 'http://schema.org/identifier')
            .filter(f => f.name !== 'error')
            .sort((a, b) => (a.title || a.name).localeCompare(b.title || b.name))
          const tags = [...new Set([].concat(...fields.map(f => f['x-tags'])))].sort()
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
          res[extension.remoteService + '_' + extension.action] = { fields, tags, fieldsAndTags }
        })
        return res
      },
    },
    async created() {
      eventBus.$emit('subscribe', this.channel)
      eventBus.$on(this.channel, info => {
        const extension = this.dataset.extensions.find(e => e.remoteService === info.remoteService && e.action === info.action)
        if (extension) {
          extension.progress = info.progress
          extension.error = info.error
        }
      })

      await this.fetchRemoteServices()
      logger.debug('remoteServicesMap after fetchRemoteServices', this.remoteServicesMap)

      // Add/remove proposed extensions based on available services
      this.dataset.extensions = this.dataset.extensions.filter(e => {
        return this.remoteServicesMap[e.remoteService] && this.remoteServicesMap[e.remoteService].actions[e.action]
      })
      Object.keys(this.remoteServicesMap).forEach(s => {
        Object.keys(this.remoteServicesMap[s].actions).forEach(a => {
          if (!this.dataset.extensions.find(e => e.remoteService === s && e.action === a)) {
            this.dataset.extensions.push({ remoteService: s, action: a, active: false, progress: 0 })
          }
        })
      })
      logger.debug('dataset.extensions after fetchRemoteServices', this.dataset.extensions)

      this.ready = true
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
        this.patch({ extensions: this.dataset.extensions, silent: true })
      },
    },
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
