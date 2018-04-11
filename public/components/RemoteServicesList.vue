<template>
  <v-container fluid grid-list-lg>
    <h3 class="display-1">{{ remoteServices.count }} service{{ plural }} distant{{ plural }} configuré{{ plural }}</h3>
    <v-layout row wrap>
      <v-flex sm12 md6 lg4 xl3 v-for="remoteService in remoteServices.results" :key="remoteService.id">
        <v-card>
          <v-card-title primary-title>
            <nuxt-link :to="`/remote-service/${remoteService.id}/description`">{{ remoteService.title || remoteService.id }}</nuxt-link>
          </v-card-title>
          <v-card-text v-if="remoteService.description" v-html="remoteService.description"/>
          <v-card-actions>
            <span v-if="remoteService.owner.type === 'user'"><v-icon>person</v-icon>{{ remoteService.owner.name }}</span>
            <span v-if="remoteService.owner.type === 'organization'"><v-icon>group</v-icon>{{ remoteService.owner.name }}</span>
            <v-chip text-color="white" :color="remoteService.public ? 'primary' : 'accent'">{{ remoteService.public ? 'Public' : 'Privé' }}</v-chip>
          </v-card-actions>
        </v-card>
      </v-flex>
    </v-layout>
  </v-container>
</template>

<script>
const {mapState} = require('vuex')

export default {
  data: () => ({
    remoteServices: {
      count: 0,
      results: []
    }
  }),
  computed: {
    ...mapState(['user', 'env']),
    plural() {
      return this.remoteServices.count > 1 ? 's' : ''
    }
  },
  mounted() {
    this.refresh()
  },
  methods: {
    async refresh() {
      this.remoteServices = await this.$axios.$get(this.env.publicUrl + '/api/v1/remote-services?size=100')
    }
  }
}
</script>
