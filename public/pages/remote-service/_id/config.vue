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
    />

    <v-text-field
      label="URL de mise à jour"
      v-model="remoteService.url"
      @blur="patch({url: remoteService.url})"
    />
  </v-container>
</template>

<script>
import {mapState, mapActions} from 'vuex'

export default {
  computed: {
    ...mapState('remoteService', ['remoteService'])
  },
  methods: {
    ...mapActions('remoteService', ['patch'])
  }
}
</script>
