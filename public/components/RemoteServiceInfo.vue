<template lang="html">
  <v-container fluid grid-list-lg>
    <v-layout row wrap>
      <v-flex xs12 md6 order-md2>
        <v-card class="mb-3">
          <v-list>
            <v-list-tile v-if="remoteService.apiDoc.info.contact && remoteService.apiDoc.info.contact.url">
              <v-list-tile-avatar><v-icon>home</v-icon></v-list-tile-avatar>
              <span><a :href="remoteService.apiDoc.info.contact.url">{{ remoteService.apiDoc.info.contact.name || remoteService.apiDoc.info.contact.url }}</a></span>
            </v-list-tile>
            <v-list-tile v-if="remoteService.apiDoc.info.contact && remoteService.apiDoc.info.contact.email">
              <v-list-tile-avatar><v-icon>email</v-icon></v-list-tile-avatar>
              <span><a :href="'mailto:'+remoteService.apiDoc.info.contact.email">{{ remoteService.apiDoc.info.contact.email }}</a></span>
            </v-list-tile>
            <v-list-tile v-if="remoteService.apiDoc.info.version">
              <v-list-tile-avatar><v-icon>label</v-icon></v-list-tile-avatar>
              <span>{{ remoteService.apiDoc.info.version }}</span>
            </v-list-tile>
            <v-list-tile v-if="remoteService.apiDoc.info.termsOfService">
              <v-list-tile-avatar><v-icon>description</v-icon></v-list-tile-avatar>
              <span><a :href="remoteService.apiDoc.info.termsOfService">Terms of Service</a></span>
            </v-list-tile>
          </v-list>
        </v-card>
      </v-flex>
      <v-flex xs12 md6 order-md1>
        <v-text-field v-model="remoteService.title" :disabled="!user.isAdmin" label="Titre" @blur="patch({title: remoteService.title})" />
        <v-textarea v-model="remoteService.description" :disabled="!user.isAdmin" label="Description" box rows="5" @blur="patch({description: remoteService.description})" />
      </v-flex>
    </v-layout>
  </v-container>
</template>

<script>
const { mapState, mapActions } = require('vuex')

export default {
  computed: {
    ...mapState('session', ['user']),
    ...mapState('remoteService', ['remoteService'])
  },
  methods: {
    ...mapActions('remoteService', ['patch'])
  }
}
</script>

<style lang="css">
</style>
