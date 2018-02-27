<template>
  <md-layout md-column>
    <!-- <md-layout md-row> -->
    <md-input-container>
      <label>Serveur</label>
      <md-select v-model="remoteService.server" @change="changeServer">
        <md-option :value="server.url" v-for="(server, i) in remoteService.apiDoc.servers" :key="i">{{ server.description }}</md-option>
      </md-select>
    </md-input-container>
    <md-input-container>
      <label>Clé d'API</label>
      <md-input v-model="remoteService.apiKey.value" @blur="$emit('save')"/>
    </md-input-container>
    <md-input-container>
      <label>URL de mise à jour</label>
      <md-input v-model="remoteService.url" @blur="$emit('save')"/>
    </md-input-container>
  <!-- </md-layout> -->
  </md-layout>
</template>

<script>
export default {
  name: 'ApiConfiguration',
  props: ['remoteService'],
  data() {
    return {server: null}
  },
  mounted() {
    // Hack to work around object binding to md-select
    if (this.remoteService.server) this.server = this.remoteService.server
  },
  methods: {
    changeServer() {
      if (this.server && this.server !== this.remoteService.server) {
        this.remoteService.server = this.server
        this.$emit('save')
      }
    }
  }
}
</script>
