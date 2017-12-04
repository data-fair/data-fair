<template>
<md-layout md-align="center">
  <md-layout md-column md-flex="90" v-if="externalApi">
    <md-tabs md-fixed class="md-transparent">
      <md-tab md-label="Métadonnées" md-icon="toc">
        <h3 class="md-headline">Informations</h3>
        <md-layout md-row>
          <md-layout md-column md-flex="55">
            <md-input-container>
              <label>Titre</label>
              <md-input v-model="externalApi.title" @blur="save"></md-input>
            </md-input-container>
            <md-input-container>
              <label>Description</label>
              <md-textarea v-model="externalApi.description" @blur="save"></md-textarea>
            </md-input-container>
          </md-layout>
          <md-layout md-column md-flex="35" md-flex-offset="10">
            <md-card>
              <md-list>
                <md-list-item v-if="externalApi.apiDoc.info.contact && externalApi.apiDoc.info.contact.url">
                  <md-icon>home</md-icon> <span><a :href="externalApi.apiDoc.info.contact.url">{{externalApi.apiDoc.info.contact.name || externalApi.apiDoc.info.contact.url}}</a></span>
                </md-list-item>
                <md-list-item v-if="externalApi.apiDoc.info.contact && externalApi.apiDoc.info.contact.email">
                  <md-icon>email</md-icon> <span><a :href="'mailto:'+externalApi.apiDoc.info.contact.email">{{externalApi.apiDoc.info.contact.email}}</a></span>
                </md-list-item>
                <md-list-item v-if="externalApi.apiDoc.info.version">
                  <md-icon>label</md-icon> <span>{{externalApi.apiDoc.info.version}}</span>
                </md-list-item>
                <md-list-item v-if="externalApi.apiDoc.info.termsOfService">
                  <md-icon>description</md-icon> <span><a :href="externalApi.apiDoc.info.termsOfService">Terms of Service</a></span>
                </md-list-item>
              </md-list>
            </md-card>
          </md-layout>
        </md-layout>

        <!-- <schema :externalApi="externalApi" @schema-updated="externalApi.schema = $event; externalApi.status = 'schematized';save()"></schema> -->
        <h3 class="md-headline">Opérations</h3>
        <md-list>
          <md-list-item v-for="action in externalApi.actions">
            <md-layout md-row style="padding:8px" md-vertical-align="center">
              <md-layout md-column md-flex="5">
                <md-icon v-if="!action.inputCollection || !action.outputCollection">description<md-tooltip>Opération unitaire</md-tooltip></md-icon>
                <md-icon v-if="action.inputCollection && action.outputCollection">view_list<md-tooltip>Opération de masse</md-tooltip></md-icon>
              </md-layout>
              <md-layout md-column md-flex="15">
                {{action.summary}}
              </md-layout>
              <md-layout md-flex="35" md-align="center">
                  <div v-if="!Object.keys(action.input).length">Pas de données en entrée</div>
                  <md-chip v-for="input in action.input" style="margin:4px 4px;" v-if="vocabulary[input.concept]">{{vocabulary[input.concept].title}}
                    <md-tooltip md-direction="top">{{vocabulary[input.concept].description}}</md-tooltip>
                  </md-chip>
              </md-layout>
              <md-layout md-column md-flex="15" style="padding: 8px 16px">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 42">
                  <defs>
                    <filter id="dropshadow">
                        <feGaussianBlur in="SourceAlpha" stdDeviation="1"></feGaussianBlur>
                        <feOffset dx="1" dy="1" result="offsetblur"></feOffset>
                        <feMerge>
                            <feMergeNode></feMergeNode>
                            <feMergeNode in="SourceGraphic"></feMergeNode>
                        </feMerge>
                    </filter>
                   </defs>
                  <path d='M0,10 70,10 65,0 100,20 65,40 70,30 0,30 Z' fill="#90caf9" filter="url(#dropshadow)"/>
                  <text text-anchor="middle" x="45" y="24" style="font-size:10px">{{actions[action.type]}}</text>
                </svg>
              </md-layout>
              <md-layout md-flex="30">
                <md-chip v-for="output in action.output" style="margin:4px 4px;" v-if="vocabulary[output.concept]">{{vocabulary[output.concept].title}}
                  <md-tooltip md-direction="top">{{vocabulary[output.concept].description}}</md-tooltip>
                </md-chip>
              </md-layout>
            </md-layout>
            <md-divider class="md-inset"></md-divider>
          </md-list-item>
        </md-list>

        <h3 class="md-headline">Actions</h3>
        <md-dialog md-open-from="#delete" md-close-to="#delete" ref="delete-dialog">
          <md-dialog-title>Suppression du jeu de données</md-dialog-title>

          <md-dialog-content>Voulez vous vraiment supprimer la description de l'API <code>{{externalApi.title}}</code> ? La suppression est définitive et le paramétrage sera perdu.</md-dialog-content>

          <md-dialog-actions>
            <md-button class="md-default md-raised" @click="$refs['delete-dialog'].close()">Non</md-button>
            <md-button class="md-warn md-raised" @click="remove">Oui</md-button>
          </md-dialog-actions>
        </md-dialog>

        <md-layout md-align="center">
          <!-- link to external doc -->
          <a :href="externalApi.apiDoc.externalDocs.url" v-if="externalApi.apiDoc.externalDocs" target="_blank">
            <md-button class="md-icon-button md-raised md-primary">
              <md-icon>description</md-icon>
              <md-tooltip md-direction="top">{{externalApi.apiDoc.externalDocs.description}}</md-tooltip>
            </md-button>
          </a>
          <md-button class="md-icon-button md-raised md-warn" id="delete" @click="$refs['delete-dialog'].open()">
            <md-icon>delete</md-icon>
          </md-button>
        </md-layout>
      </md-tab>

      <md-tab md-label="Configuration" md-icon="build">
        <api-configuration :external-api="externalApi"></api-configuration>
      </md-tab>

      <!-- <md-tab md-label="Permissions" md-icon="security">
        <permissions :externalApi="externalApi" @toggle-visibility="externalApi.public = !externalApi.public;save()"></permissions>
      </md-tab> -->

      <md-tab md-label="API" md-icon="cloud">
        <!-- <ExternalApiAPIDoc :externalApi="externalApi"></ExternalApiAPIDoc> -->
      </md-tab>
    </md-tabs>
  </md-layout>
</md-layout>
</template>

<script>
const {
  mapState
} = require('vuex')
import ApiConfiguration from '../components/ApiConfiguration.vue'
import Permissions from '../components/Permissions.vue'

export default {
  name: 'externalApi',
  components: {
    ApiConfiguration,
    Permissions,
    // ExternalApiAPIDoc
  },
  data: () => ({
    externalApi: null,
    vocabulary: {},
    actions: {
      'http://schema.org/SearchAction': 'Recherche',
      'http://schema.org/CheckAction': 'Vérification'
    }
  }),
  computed: mapState({
    user: state => state.user
  }),
  mounted() {
    this.$http.get(window.CONFIG.publicUrl + '/api/v1/external-apis/' + this.$route.params.externalApiId).then(result => {
      this.externalApi = result.data
    })
    this.$http.get(window.CONFIG.publicUrl + '/api/v1/vocabulary').then(results => {
      results.data.forEach(term => term.identifiers.forEach(id => this.vocabulary[id] = term))
    })
  },
  methods: {
    save() {
      this.$http.put(window.CONFIG.publicUrl + '/api/v1/external-apis/' + this.$route.params.externalApiId, this.externalApi).then(result => {
        this.$store.dispatch('notify', `La description de l'API a bien été mise à jour`)
        this.externalApi = result.data
      }, error => {
        this.$store.dispatch('notifyError', `Erreur ${error.status} pendant la mise à jour de la description de l'API`)
      })
    },
    remove() {
      this.$refs['delete-dialog'].close()
      this.$http.delete(window.CONFIG.publicUrl + '/api/v1/external-apis/' + this.$route.params.externalApiId).then(result => {
        this.$store.dispatch('notify', `La description de l'API ${this.externalApi.title} a bien été supprimée`)
        this.$router.push({
          name: 'Home'
        })
      }, error => {
        this.$store.dispatch('notifyError', `Erreur ${error.status} pendant la suppression de la description de l'API ${this.externalApi.title}`)
      })
    }
  }
}
</script>
