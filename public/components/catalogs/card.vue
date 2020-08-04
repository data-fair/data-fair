<template>
  <v-card
    :to="`/catalog/${catalog.id}`"
    outlined
    :elevation="hover ? 2 : 0"
    @mouseenter="hover = true"
    @mouseleave="hover = false"
  >
    <v-card-title>
      <span style="white-space: nowrap;overflow: hidden;text-overflow: ellipsis;">
        {{ catalog.title || catalog.id }}
      </span>
    </v-card-title>
    <v-divider />
    <v-card-text
      style="min-height:60px;max-height:160px;overflow:hidden;margin-bottom:40px;"
      v-html="marked($options.filters.truncate(catalog.description || '', 200))"
    />

    <v-card-actions style="position:absolute; bottom: 0px;width:100%;">
      <owner-short :owner="catalog.owner" />
      <v-spacer />
    </v-card-actions>
  </v-card>
</template>

<script>
  import OwnerShort from '~/components/owners/short.vue'
  const marked = require('marked')

  export default {
    components: { OwnerShort },
    props: ['catalog'],
    data: () => ({
      marked,
      hover: false,
    }),
  }
</script>

<style lang="css" scoped>
</style>
