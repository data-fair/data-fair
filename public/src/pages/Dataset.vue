<template>
<md-layout md-align="center">
  <md-layout md-column md-flex="90" v-if="dataset">
    <md-tabs md-fixed class="md-transparent">
      <md-tab md-label="Métadonnées" md-icon="toc">
        <h3 class="md-headline">Informations</h3>
        <md-layout md-row>
          <md-layout md-column md-flex="45">
            <md-input-container>
              <label>Titre</label>
              <md-input v-model="dataset.title" @blur="save"></md-input>
            </md-input-container>
            <md-input-container>
              <label>Description</label>
              <md-textarea v-model="dataset.description" @blur="save"></md-textarea>
            </md-input-container>
          </md-layout>
          <md-layout md-column md-flex="45" md-flex-offset="10">
            <md-card>
              <md-list>
                <md-list-item>
                  <md-icon>insert_drive_file</md-icon> <span>{{dataset.file.name}}</span> <span>{{(dataset.file.size / 1024).toFixed(2)}} ko</span>
                </md-list-item>
                <md-list-item>
                  <md-icon>update</md-icon> <span>{{dataset.updatedBy}}</span> <span>{{dataset.updatedAt | moment("DD/MM/YYYY, HH:mm")}}</span>
                </md-list-item>
                <md-list-item>
                  <md-icon>add_circle_outline</md-icon> <span>{{dataset.createdBy}}</span> <span>{{dataset.createdAt | moment("DD/MM/YYYY, HH:mm")}}</span>
                </md-list-item>
              </md-list>
            </md-card>
          </md-layout>
        </md-layout>

        <schema :dataset="dataset" @schema-updated="dataset.schema = $event; dataset.status = 'schematized';save()"></schema>

        <h3 class="md-headline">Actions</h3>
        <md-dialog md-open-from="#delete" md-close-to="#delete" ref="delete-dialog">
          <md-dialog-title>Suppression du jeu de données</md-dialog-title>

          <md-dialog-content>Voulez vous vraiment supprimer le jeux de données <code>{{dataset.title}}</code> ? La suppression est définitive et les données ne pourront pas être récupérées.</md-dialog-content>

          <md-dialog-actions>
            <md-button class="md-default md-raised" @click="$refs['delete-dialog'].close()">Non</md-button>
            <md-button class="md-warn md-raised" @click="remove">Oui</md-button>
          </md-dialog-actions>
        </md-dialog>

        <md-layout md-align="center">
          <a :href="downloadLink">
            <md-button class="md-icon-button md-raised md-primary">
              <md-icon>file_download</md-icon>
            </md-button>
          </a>
          <md-button class="md-icon-button md-raised md-warn" id="delete" @click="$refs['delete-dialog'].open()">
            <md-icon>delete</md-icon>
          </md-button>
        </md-layout>
      </md-tab>

      <md-tab md-label="Vue tableau" md-icon="view_list">
        <tabular-view :dataset="dataset"></tabular-view>
      </md-tab>

      <!-- <md-tab md-label="Permissions" md-icon="security">
        <permissions :dataset="dataset" @toggle-visibility="dataset.public = !dataset.public;save()"></permissions>
      </md-tab> -->

      <md-tab md-label="Enrichissement" md-icon="merge_type" :md-disabled="!actions.length">
        <md-list>
          <md-list-item v-for="action in actions">
            <md-layout md-row style="padding:8px" md-vertical-align="center">
              <md-layout md-column md-flex="10">
                <h5 class="md-title">Utilisez</h5>
              </md-layout>
              <md-layout md-flex="40" md-align="center">
                <md-checkbox v-for="input in action.input" :md-value="input.concept" v-model="input.selected" class="md-primary" v-if="vocabulary[input.concept] && input.concept !== 'http://schema.org/identifier'">{{vocabulary[input.concept].title}}
                  <md-tooltip md-direction="top">{{vocabulary[input.concept].description}}</md-tooltip>
                </md-checkbox>
              </md-layout>
              <md-layout md-column md-flex="15" style="padding: 8px 16px">
                <h5 class="md-title">pour rajouter</h5>
              </md-layout>
              <md-layout md-flex="20">
                <md-chip v-for="output in action.output" class="md-warn" style="margin:4px 4px;" v-if="vocabulary[output.concept] && output.concept !== 'http://schema.org/identifier'">{{vocabulary[output.concept].title}}
                  <md-tooltip md-direction="top">{{vocabulary[output.concept].description}}</md-tooltip>
                </md-chip>
              </md-layout>
              <md-layout md-column md-flex="15">
                <md-button class="md-raised md-primary" :disabled="action.input.filter(i => i.selected).length === 0" @click="execute(action)">Démarrer</md-button>
              </md-layout>
            </md-layout>
            <md-divider class="md-inset"></md-divider>
          </md-list-item>
        </md-list>
      </md-tab>

      <md-tab md-label="Journal" md-icon="event_note">
        <journal :dataset="dataset"></journal>
      </md-tab>

      <md-tab md-label="API" md-icon="cloud">
        <DatasetAPIDoc :dataset="dataset"></DatasetAPIDoc>
      </md-tab>
    </md-tabs>
  </md-layout>
</md-layout>
</template>

<script>
import Permissions from '../components/Permissions.vue'
import Journal from '../components/Journal.vue'
import Schema from '../components/Schema.vue'
import DatasetAPIDoc from '../components/DatasetAPIDoc.vue'
import TabularView from '../components/TabularView.vue'

export default {
  name: 'dataset',
  components: {
    Permissions,
    Journal,
    Schema,
    DatasetAPIDoc,
    TabularView
  },
  data: () => ({
    dataset: null,
    actions: [],
    vocabulary: {}
  }),
  computed:{
    downloadLink() {
      if (this.dataset) return window.CONFIG.publicUrl + '/api/v1/datasets/' + this.dataset.id + '/raw/' + this.dataset.file.name
    },
    concepts() {
      if (this.dataset) return new Set(this.dataset.schema.filter(field => field['x-refersTo']).map(field => field['x-refersTo']))
      return []
    }
  },
  mounted() {
    this.$http.get(window.CONFIG.publicUrl + '/api/v1/datasets/' + this.$route.params.datasetId).then(result => {
      this.dataset = result.data
    })
    this.$http.get(window.CONFIG.publicUrl + '/api/v1/vocabulary').then(results => {
      results.data.forEach(term => term.identifiers.forEach(id => this.vocabulary[id] = term))
    })
  },
  methods: {
    save() {
      this.$http.put(window.CONFIG.publicUrl + '/api/v1/datasets/' + this.$route.params.datasetId, this.dataset).then(result => {
        this.$store.dispatch('notify', `Le jeu de données a bien été mis à jour`)
        this.dataset = result.data
      }, error => {
        this.$store.dispatch('notifyError', `Erreur ${error.status} pendant la mise à jour du jeu de données`)
      })
    },
    remove() {
      this.$refs['delete-dialog'].close()
      this.$http.delete(window.CONFIG.publicUrl + '/api/v1/datasets/' + this.$route.params.datasetId).then(result => {
        this.$store.dispatch('notify', `Le jeu de données ${this.dataset.title} a bien été supprimé`)
        this.$router.push({
          name: 'Home'
        })
      }, error => {
        this.$store.dispatch('notifyError', `Erreur ${error.status} pendant la suppression du jeu de données ${this.dataset.title}`)
      })
    },
    execute(action) {
      const params = {
        inputConcepts: action.input.filter(i => i.selected).map(i => i.concept),
        dataset: this.dataset.id
      }
      this.$http.post(window.CONFIG.publicUrl + '/api/v1/external-apis/' + action.api + '/actions/' + action.id, params)
    }
  },
  watch: {
    concepts() {
      if (this.concepts.size) {
        this.$http.get(window.CONFIG.publicUrl + '/api/v1/external-apis?input-concepts=' + [...this.concepts].map(encodeURIComponent).join(',')).then(result => {
          result.data.results.forEach(r => r.actions.forEach(a => a.api = r.id))
          this.actions = [].concat(...result.data.results.map(r => r.actions.filter(a => a.input.map(i => i.concept).filter(x => this.concepts.has(x)).length))).filter(a => a.inputCollection && a.outputCollection)
        })
      } else {
        this.actions = []
      }
    }
  }
}
</script>
