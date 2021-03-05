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
      v-html="marked($options.filters.truncate(remoteService.description || '', 200))"
    />
  </v-card>
</template>

<script>
  const marked = require('marked/lib/marked')

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
