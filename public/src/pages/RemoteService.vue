<template>
  <div class="remote-service" v-if="remoteService">
    <md-tabs md-fixed class="md-transparent" ref="tabs" @change="changeTab">
      <md-tab md-label="Description" md-icon="toc" id="description" :md-active="activeTab === 'description'">
        <h3 class="md-headline">Informations</h3>
        <md-layout md-row>
          <md-layout md-column md-flex="55">
            <md-input-container>
              <label>Titre</label>
              <md-input v-model="remoteService.title" @blur="save"/>
            </md-input-container>
            <md-input-container>
              <label>Description</label>
              <md-textarea v-model="remoteService.description" @blur="save"/>
            </md-input-container>
          </md-layout>
          <md-layout md-column md-flex="35" md-flex-offset="10">
            <md-card>
              <md-list>
                <md-list-item v-if="remoteService.apiDoc.info.contact && remoteService.apiDoc.info.contact.url">
                  <md-icon>home</md-icon> <span><a :href="remoteService.apiDoc.info.contact.url">{{ remoteService.apiDoc.info.contact.name || remoteService.apiDoc.info.contact.url }}</a></span>
                </md-list-item>
                <md-list-item v-if="remoteService.apiDoc.info.contact && remoteService.apiDoc.info.contact.email">
                  <md-icon>email</md-icon> <span><a :href="'mailto:'+remoteService.apiDoc.info.contact.email">{{ remoteService.apiDoc.info.contact.email }}</a></span>
                </md-list-item>
                <md-list-item v-if="remoteService.apiDoc.info.version">
                  <md-icon>label</md-icon> <span>{{ remoteService.apiDoc.info.version }}</span>
                </md-list-item>
                <md-list-item v-if="remoteService.apiDoc.info.termsOfService">
                  <md-icon>description</md-icon> <span><a :href="remoteService.apiDoc.info.termsOfService">Terms of Service</a></span>
                </md-list-item>
              </md-list>
            </md-card>
          </md-layout>
        </md-layout>

        <!-- <schema :remoteService="remoteService" @schema-updated="remoteService.schema = $event; remoteService.status = 'schematized';save()"></schema> -->
        <h3 class="md-headline">Opérations</h3>
        <md-list>
          <md-list-item v-for="(action, i) in remoteService.actions" :key="i">
            <md-layout md-row style="padding:8px" md-vertical-align="center">
              <md-layout md-column md-flex="5">
                <md-icon v-if="!action.inputCollection || !action.outputCollection">description
                  <md-tooltip>Opération unitaire</md-tooltip>
                </md-icon>
                <md-icon v-if="action.inputCollection && action.outputCollection">view_list
                  <md-tooltip>Opération de masse</md-tooltip>
                </md-icon>
              </md-layout>
              <md-layout md-column md-flex="15">
                {{ action.summary }}
              </md-layout>
              <md-layout md-flex="35" md-align="center">
                <div v-if="!Object.keys(action.input).length">Pas de données en entrée</div>
                <md-chip v-for="input in action.input" :key="input.concept" style="margin:4px 4px;" v-if="vocabulary[input.concept]">{{ vocabulary[input.concept].title }}
                  <md-tooltip md-direction="top">{{ vocabulary[input.concept].description }}</md-tooltip>
                </md-chip>
              </md-layout>
              <md-layout md-column md-flex="15" style="padding: 8px 16px">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 42">
                  <defs>
                    <filter id="dropshadow">
                      <feGaussianBlur in="SourceAlpha" stdDeviation="1"/>
                      <feOffset dx="1" dy="1" result="offsetblur"/>
                      <feMerge>
                        <feMergeNode/>
                        <feMergeNode in="SourceGraphic"/>
                      </feMerge>
                    </filter>
                  </defs>
                  <path d="M0,10 70,10 65,0 100,20 65,40 70,30 0,30 Z" fill="#90caf9" filter="url(#dropshadow)"/>
                  <text text-anchor="middle" x="45" y="24" style="font-size:10px">{{ actions[action.type] }}</text>
                </svg>
              </md-layout>
              <md-layout md-flex="30">
                <md-chip v-for="output in action.output" :key="output.concept" style="margin:4px 4px;" v-if="vocabulary[output.concept]">{{ vocabulary[output.concept].title }}
                  <md-tooltip md-direction="top">{{ vocabulary[output.concept].description }}</md-tooltip>
                </md-chip>
              </md-layout>
            </md-layout>
            <md-divider class="md-inset"/>
          </md-list-item>
        </md-list>
      </md-tab>

      <md-tab md-label="Configuration" md-icon="build" id="config" :md-active="activeTab === 'config'">
      <remote-service-configuration :remote-service="remoteService" @save="save"/></md-tab>

      <md-tab md-label="Permissions" md-icon="security" v-if="isOwner" id="permissions" :md-active="activeTab === 'permissions'">
        <permissions :resource="remoteService" :resource-url="resourceUrl" :api="api"/>
      </md-tab>

      <md-tab md-label="API" md-icon="cloud" id="api" :md-active="activeTab === 'api'">
        <open-api v-if="api" :api="api"/>
      </md-tab>
    </md-tabs>

    <div class="actions-buttons">
      <div style="margin-top: 100px">
        <md-button class="md-icon-button md-raised md-primary" :href="remoteService.apiDoc.externalDocs.url" v-if="remoteService.apiDoc.externalDocs" target="_blank">
          <md-icon>description</md-icon>
          <md-tooltip md-direction="left">{{ remoteService.apiDoc.externalDocs.description }}</md-tooltip>
        </md-button>
      </div>
      <div>
        <md-button class="md-icon-button md-raised md-primary" @click="refresh">
          <md-icon>refresh</md-icon>
          <md-tooltip md-direction="left">Mettre a jour la description de l'API</md-tooltip>
        </md-button>
      </div>
      <div>
        <md-button class="md-icon-button md-raised md-warn" id="delete" @click="$refs['delete-dialog'].open()">
          <md-icon>delete</md-icon>
          <md-tooltip md-direction="left">Supprimer cette configuration du service externe</md-tooltip>
        </md-button>
      </div>
    </div>

    <md-dialog md-open-from="#delete" md-close-to="#delete" ref="delete-dialog">
      <md-dialog-title>Suppression du jeu de données</md-dialog-title>

      <md-dialog-content>Voulez vous vraiment supprimer la description de l'API <code>{{ remoteService.title }}</code> ? La suppression est définitive et le paramétrage sera perdu.</md-dialog-content>

      <md-dialog-actions>
        <md-button class="md-default md-raised" @click="$refs['delete-dialog'].close()">Non</md-button>
        <md-button class="md-warn md-raised" @click="remove">Oui</md-button>
      </md-dialog-actions>
    </md-dialog>
  </div>
</template>

<script>
import {mapState} from 'vuex'
import RemoteServiceConfiguration from '../components/RemoteServiceConfiguration.vue'
import Permissions from '../components/Permissions.vue'
import OpenApi from 'vue-openapi'

export default {
  name: 'RemoteService',
  components: {
    RemoteServiceConfiguration,
    Permissions,
    OpenApi
  },
  data: () => ({
    remoteService: null,
    api: null,
    vocabulary: {},
    activeTab: null,
    actions: {
      'http://schema.org/SearchAction': 'Recherche',
      'http://schema.org/ReadAction': 'Lecture',
      'http://schema.org/CheckAction': 'Vérification'
    }
  }),
  computed: {
    ...mapState(['user']),
    resourceUrl() {
      return window.CONFIG.publicUrl + '/api/v1/remote-services/' + this.$route.params.remoteServiceId
    },
    isOwner() {
      return this.remoteService.userPermissions.isOwner
    }
  },
  mounted() {
    this.activeTab = this.$route.query.tab || 'description'
    this.$http.get(this.resourceUrl).then(result => {
      this.remoteService = result.data
      this.$http.get(this.resourceUrl + '/api-docs.json').then(response => {
        this.api = response.body
      })
    })
    this.$http.get(window.CONFIG.publicUrl + '/api/v1/vocabulary').then(results => {
      results.data.forEach(term => term.identifiers.forEach(id => { this.vocabulary[id] = term }))
    })
  },
  methods: {
    save() {
      const patch = Object.assign({}, ...['apiDoc', 'url', 'apiKey', 'server', 'description', 'title'].map(key => ({ [key]: this.remoteService[key] })))
      this.$http.patch(this.resourceUrl, patch).then(result => {
        this.$store.dispatch('notify', `La description de l'API a bien été mise à jour`)
        this.remoteService = result.data
      }, error => {
        this.$store.dispatch('notifyError', `Erreur ${error.status} pendant la mise à jour de la description de l'API`)
      })
    },
    remove() {
      this.$refs['delete-dialog'].close()
      this.$http.delete(this.resourceUrl).then(result => {
        this.$store.dispatch('notify', `La description de l'API ${this.remoteService.title} a bien été supprimée`)
        this.$router.push({name: 'RemoteServices'})
      }, error => {
        this.$store.dispatch('notifyError', `Erreur ${error.status} pendant la suppression de la description de l'API ${this.remoteService.title}`)
      })
    },
    refresh() {
      this.$http.post(this.resourceUrl + '/_update').then(result => {
        this.$store.dispatch('notify', `La définition de l'API a bien été mise à jour`)
        this.remoteService = result.data
      }, error => {
        this.$store.dispatch('notifyError', `Erreur ${error.status} pendant la mise à jour de la définition de l'API`)
      })
    },
    changeTab(event) {
      this.activeTab = this.$refs.tabs.activeTab
      this.$router.push({query: {tab: this.$refs.tabs.activeTab}})
    }
  }
}
</script>

<style>
.remote-service .action{
  height: calc(100vh - 64px);
}
</style>
