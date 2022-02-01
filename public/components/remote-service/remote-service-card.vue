<template>
  <v-card
    height="100%"
    :to="`/remote-service/${remoteService.id}`"
    outlined
    tile
    :elevation="hover ? 4 : 0"
    @mouseenter="hover = true"
    @mouseleave="hover = false"
  >
    <v-card-title class="font-weight-bold">
      {{ remoteService.title || remoteService.id }}
    </v-card-title>
    <v-card-text
      style="min-height:60px"
      class="pb-0"
      v-html="marked($options.filters.truncate(remoteService.description || '', 200))"
    />
    <v-card-actions>
      <visibility :visibility="remoteService.public ? 'public' : 'protected'" />
      <template v-if="!remoteService.public && remoteService.privateAccess">
        <div
          v-for="owner in remoteService.privateAccess"
          :key="owner.id"
          class="ml-2"
        >
          <owner-short :owner="owner" />
        </div>
      </template>
    </v-card-actions>
  </v-card>
</template>

<script>
  import { marked } from 'marked'

  export default {
    props: ['remoteService'],
    data: () => ({
      marked,
      hover: false,
    }),
  }
</script>

<style lang="css" scoped>
</style>
