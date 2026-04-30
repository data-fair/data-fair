<template>
  <v-list-item-title>
    <span v-if="noLink">{{ dataset.title || dataset.id }}</span>
    <nuxt-link
      v-else
      :to="`/dataset/${dataset.id}`"
    >
      {{ dataset.title || dataset.id }}
    </nuxt-link>
    <v-chip
      v-for="topic of dataset.topics"
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
  props: ['dataset', 'showTopics', 'noLink']
}
</script>

<style>

</style>
