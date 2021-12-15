<template>
  <v-container fluid>
    <v-select
      v-model="remoteService.server"
      :items="remoteService.apiDoc.servers"
      item-value="url"
      item-text="description"
      label="Serveur"
      @change="patch({server: remoteService.server})"
    />

    <v-text-field
      v-model="remoteService.apiKey.value"
      label="Clé d'API"
      @change="patch({apiKey: remoteService.apiKey})"
    />

    <!-- Read only, updating can cause problems and confusion.
    For example the POST _default_services will crash because it will create duplicates -->
    <v-text-field
      v-model="remoteService.url"
      :disabled="true"
      label="URL de mise à jour"
    />

    <div v-if="remoteService.parameters.length">
      <h2 class="text-h6 mt-3 mb-3">
        {{ $t('staticParams') }}
      </h2>

      <p>
        {{ $t('staticParamsMsg') }}
      </p>

      <p>{{ $t('staticParamsSplit') }}</p>
      <template v-for="operation in operations">
        <div
          v-if="remoteService.parameters.filter(p => p.operationId === operation.id).length"
          :key="operation.id"
        >
          <h3 class="text-h6 mt-4 mb-2">
            {{ operation.title }}
          </h3>
          <v-text-field
            v-for="(param, i) in remoteService.parameters.filter(p => p.operationId === operation.id)"
            :key="i"
            v-model="param.value"
            :label="param.title"
            @change="patch({parameters: remoteService.parameters})"
          />
        </div>
      </template>
    </div>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  staticParams: Paramètres statiques
  staticParamsMsg: Ces paramètres seront associés à toutes les requêtes émises vers le service au travers de cette exposition. Ils vous permettent par exemple de filtrer la source pour obtenir une spécialisation du service sur un secteur.
  staticParamsSplit: Les filtres peuvent contenir plusieurs valeurs séparées par des virgules.
en:
  staticParams: Static parameters
  staticParamsMsg: These parameters will be associated to all requests transmitted to the server. They let you filter the source to get a specialized exposition of the service for example.
  staticParamsSplit: Filters can contain multiple values separated by commas.
</i18n>

<script>
  import { mapState, mapActions } from 'vuex'

  export default {
    data: () => ({
      restrictions: [],
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
          parameters: this.api.paths[path][method].parameters || [],
        }))))) || []
      },
    },
    watch: {
      operations() {
        this.setRestrictions()
      },
    },
    created() {
      this.remoteService.apiKey = this.remoteService.apiKey || { in: 'header' }
      this.setRestrictions()
    },
    methods: {
      ...mapActions('remoteService', ['patch']),
      setRestrictions() {
        this.operations.forEach(operation => {
          operation.parameters.filter(p => !!p['x-refersTo'] && p.in === 'query').forEach(param => {
            let staticParam = this.remoteService.parameters.find(p => p.operationId === operation.id && p.name === param.name)
            if (!staticParam) {
              staticParam = { operationId: operation.id, name: param.name, value: '' }
              this.remoteService.parameters.push(staticParam)
            }
            staticParam['x-refersTo'] = param['x-refersTo']
            staticParam.title = param.title || param.description
          })
        })
      },
    },
  }
</script>
