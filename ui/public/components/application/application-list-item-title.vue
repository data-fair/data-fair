<template>
  <v-list-item-title>
    <span v-if="noLink">{{ application.title || application.id }}</span>
    <nuxt-link
      v-else
      :to="`/application/${application.id}`"
    >
      {{ application.title || application.id }}
    </nuxt-link>
    <v-chip
      v-for="topic of application.topics"
      :key="topic.id"
      small
      outlined
      :color="topic.color || 'default'"
      class="ml-2"
      style="font-weight: bold"
    >
      {{ topic.title }}
    </v-chip>
  </v-list-item-title>
</template>

<script>
export default {
  props: ['application', 'showTopics', 'noLink']
}
</script>

<style>

</style>
