<template>
<md-layout md-column>
  <!-- <md-layout md-row> -->
    <md-input-container>
      <label>Serveur</label>
      <md-select v-model="externalApi.server">
        <md-option :value="server.url" v-for="server in externalApi.apiDoc.servers">{{server.description}}</md-option>
      </md-select>
    </md-input-container>
    <md-input-container>
      <label>Clé d'API</label>
      <md-input v-model="externalApi.apiKey"></md-input>
    </md-input-container>
    <md-input-container>
      <label>URL de mise à jour</label>
      <md-input v-model="externalApi.url"></md-input>
    </md-input-container>
  <!-- </md-layout> -->
</md-layout>
</template>

<script>
const {
  mapState
} = require('vuex')

export default {
  name: 'api-configuration',
  props: ['externalApi']
}
</script>
