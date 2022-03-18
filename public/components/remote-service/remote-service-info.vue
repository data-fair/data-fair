<template lang="html">
  <v-row>
    <v-col
      cols="12"
      md="6"
      order-md="2"
    >
      <v-sheet>
        <v-list dense>
          <v-list-item v-if="remoteService.apiDoc.info.contact && remoteService.apiDoc.info.contact.url">
            <v-list-item-avatar class="ml-0 my-0">
              <v-icon>mdi-home</v-icon>
            </v-list-item-avatar>
            <span><a :href="remoteService.apiDoc.info.contact.url">{{ remoteService.apiDoc.info.contact.name || remoteService.apiDoc.info.contact.url }}</a></span>
          </v-list-item>
          <v-list-item v-if="remoteService.apiDoc.info.contact && remoteService.apiDoc.info.contact.email">
            <v-list-item-avatar class="ml-0 my-0">
              <v-icon>mdi-email</v-icon>
            </v-list-item-avatar>
            <span><a :href="'mailto:'+remoteService.apiDoc.info.contact.email">{{ remoteService.apiDoc.info.contact.email }}</a></span>
          </v-list-item>
          <v-list-item v-if="remoteService.apiDoc.info.version">
            <v-list-item-avatar class="ml-0 my-0">
              <v-icon>mdi-label</v-icon>
            </v-list-item-avatar>
            <span>{{ remoteService.apiDoc.info.version }}</span>
          </v-list-item>
          <v-list-item v-if="remoteService.apiDoc.info.termsOfService">
            <v-list-item-avatar class="ml-0 my-0">
              <v-icon>mdi-information-variant</v-icon>
            </v-list-item-avatar>
            <span><a :href="remoteService.apiDoc.info.termsOfService">{{ $t('termsOfService') }}</a></span>
          </v-list-item>
        </v-list>
      </v-sheet>
    </v-col>
    <v-col
      cols="12"
      md="6"
      order-md="1"
    >
      <v-text-field
        v-model="remoteService.title"
        :disabled="!user.adminMode"
        :label="$t('title')"
        color="admin"
        @change="patch({title: remoteService.title})"
      />
      <markdown-editor
        v-model="remoteService.description"
        :disabled="!user.adminMode"
        :label="$t('description')"
        :easymde-config="{minHeight: '150px'}"
        @change="patch({description: remoteService.description})"
      />
    </v-col>
  </v-row>
</template>

<i18n lang="yaml">
fr:
  termsOfService: Conditions d'utilisation
  title: Titre
  description: Description
en:
  termsOfService: Terms of service
  title: Title
  description: Description
</i18n>

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
