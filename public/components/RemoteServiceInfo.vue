<template lang="html">
  <v-container
    class="pa-0"
    fluid
    grid-list-lg
  >
    <v-row>
      <v-col
        cols="12"
        md="6"
        order-md="2"
      >
        <v-card class="mb-3">
          <v-list>
            <v-list-item v-if="remoteService.apiDoc.info.contact && remoteService.apiDoc.info.contact.url">
              <v-list-item-avatar><v-icon>home</v-icon></v-list-item-avatar>
              <span><a :href="remoteService.apiDoc.info.contact.url">{{ remoteService.apiDoc.info.contact.name || remoteService.apiDoc.info.contact.url }}</a></span>
            </v-list-item>
            <v-list-item v-if="remoteService.apiDoc.info.contact && remoteService.apiDoc.info.contact.email">
              <v-list-item-avatar><v-icon>email</v-icon></v-list-item-avatar>
              <span><a :href="'mailto:'+remoteService.apiDoc.info.contact.email">{{ remoteService.apiDoc.info.contact.email }}</a></span>
            </v-list-item>
            <v-list-item v-if="remoteService.apiDoc.info.version">
              <v-list-item-avatar><v-icon>label</v-icon></v-list-item-avatar>
              <span>{{ remoteService.apiDoc.info.version }}</span>
            </v-list-item>
            <v-list-item v-if="remoteService.apiDoc.info.termsOfService">
              <v-list-item-avatar><v-icon>description</v-icon></v-list-item-avatar>
              <span><a :href="remoteService.apiDoc.info.termsOfService">Terms of Service</a></span>
            </v-list-item>
          </v-list>
        </v-card>
      </v-col>
      <v-col
        cols="12"
        md="6"
        order-md="1"
      >
        <v-text-field
          v-model="remoteService.title"
          :disabled="!user.adminMode"
          label="Titre"
          color="admin"
          @change="patch({title: remoteService.title})"
        />
        <v-textarea
          v-model="remoteService.description"
          :disabled="!user.adminMode"
          label="Description"
          box
          rows="5"
          color="admin"
          @change="patch({description: remoteService.description})"
        />
      </v-col>
    </v-row>
  </v-container>
</template>

<script>
  const { mapState, mapActions } = require('vuex')

  export default {
    computed: {
      ...mapState('session', ['user']),
      ...mapState('remoteService', ['remoteService']),
    },
    methods: {
      ...mapActions('remoteService', ['patch']),
    },
  }
</script>

<style lang="css">
</style>
