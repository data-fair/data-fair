<template>
  <v-container>

    <v-select
      :items="remoteService.apiDoc.servers"
      item-value="url"
      item-text="description"
      v-model="remoteService.server"
      label="Serveur"
      @input="patch({server: remoteService.server})"
    />

    <v-text-field
      label="Clé d'API"
      v-model="remoteService.apiKey.value"
      @blur="patch({apiKey: remoteService.apiKey})"
      @keyup.native.enter="patch({apiKey: remoteService.apiKey})"
    />

    <!-- Read only, updating can cause problems and confusion.
    For example the POST _default_services will crash because it will create duplicates -->
    <v-text-field
      label="URL de mise à jour"
      v-model="remoteService.url"
      :disabled="true"
    />

    <div v-if="remoteService.parameters.length">
      <h2 class="headline mt-3 mb-3">Paramètres statiques</h2>

      <p>Ces paramètres seront associés à toutes les requêtes émises vers le service au travers de cette exposition.
      Ils vous permettent par exemple de filtrer la source pour obtenir une spécialisation du service sur un secteur.</p>

      <p>Les filtres peuvent contenir plusieurs valeurs séparées par des virgules.</p>

      <div v-for="operation in operations" :key="operation.id" v-if="remoteService.parameters.filter(p => p.operationId === operation.id).length">
        <h3 class="title mt-4 mb-2">{{ operation.title }}</h3>
        <v-text-field
          v-for="(param, i) in remoteService.parameters.filter(p => p.operationId === operation.id)"
          :key="i"
          :label="param.title"
          v-model="param.value"
          @blur="patch({parameters: remoteService.parameters})"
          @keyup.native.enter="patch({parameters: remoteService.parameters})"
        />
      </div>
    </div>
  </v-container>
</template>

<script>
import {mapState, mapActions} from 'vuex'

export default {
  data: () => ({
    restrictions: []
  }),
  computed: {
    ...mapState('remoteService', ['remoteService']),
    api() {
      return this.remoteService.apiDoc
    },
    operations() {
      return (this.api && [].concat(...Object.keys(this.api.paths).map(path => Object.keys(this.api.paths[path]).map(method => ({
        id: this.api.paths[path][method].operationId,
        title: this.api.paths[path][method].summary,
        parameters: this.api.paths[path][method].parameters || []
      }))))) || []
    }
  },
  watch: {
    operations() {
      this.setRestrictions()
    }
  },
  created() {
    this.remoteService.apiKey = this.remoteService.apiKey || {}
    this.setRestrictions()
  },
  methods: {
    ...mapActions('remoteService', ['patch']),
    setRestrictions() {
      this.operations.forEach(operation => {
        operation.parameters.filter(p => !!p['x-refersTo'] && p.in === 'query').forEach(param => {
          let staticParam = this.remoteService.parameters.find(p => p.operationId === operation.id && p.name === param.name)
          if (!staticParam) {
            staticParam = {operationId: operation.id, name: param.name, value: ''}
            this.remoteService.parameters.push(staticParam)
          }
          staticParam['x-refersTo'] = param['x-refersTo']
          staticParam.title = param.title || param.description
        })
      })
    }
  }
}
</script>
