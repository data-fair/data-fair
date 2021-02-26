<template>
  <v-card
    outlined
    tile
    :elevation="hover ? 4 : 0"
    @mouseenter="hover = true"
    @mouseleave="hover = false"
  >
    <nuxt-link :to="`/catalog/${catalog.id}`" style="text-decoration:none">
      <v-card-title class="font-weight-bold">
        <span style="white-space: nowrap;overflow: hidden;text-overflow: ellipsis;">
          {{ catalog.title || catalog.id }}
        </span>
      </v-card-title>
      <v-divider />
      <v-card-text
        style="min-height:60px;max-height:160px;overflow:hidden;margin-bottom:40px;"
        v-html="marked($options.filters.truncate(catalog.description || '', 200))"
      />
    </nuxt-link>
    <v-card-actions style="position:absolute; bottom: 0px;width:100%;">
      <!--<owner-short :owner="catalog.owner" />-->
      <v-spacer />
    </v-card-actions>
  </v-card>
</template>

<script>
  const marked = require('marked')

  export default {
    components: { },
    props: ['catalog'],
    data: () => ({
      marked,
      hover: false,
    }),
  }
</script>

<style lang="css" scoped>
</style>
