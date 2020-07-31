<template>
  <v-card
    height="100%"
    :to="`/dataset/${dataset.id}`"
    outlined
    :elevation="hover ? 2 : 0"
    @mouseenter="hover = true"
    @mouseleave="hover = false"
  >
    <v-card-title>
      <span>{{ dataset.title || dataset.id }}
        <v-chip
          v-for="topic of dataset.topics"
          :key="topic.id"
          small
          outlined
          :color="topic.color || 'default'"
          class="ml-3"
          style="font-weight: bold"
        >
          {{ topic.title }}
        </v-chip>
      </span>
    </v-card-title>

    <v-card-text
      style="min-height:60px;max-height:160px;overflow:hidden;margin-bottom:40px;"
      class="flex"
      v-html="marked($options.filters.truncate(dataset.description || '', 200))"
    />
    <v-card-actions style="position:absolute; bottom: 0px;width:100%;">
      <owner-short :owner="dataset.owner" />
      &nbsp;<v-chip
        small
        :color="dataset.visibility === 'public' ? 'primary' : 'accent'"
        text-color="white"
      >
        {{ {public: 'Public', private: 'Privé', protected: 'Protégé'}[dataset.visibility] }}
      </v-chip>
      <template v-if="dataset.status === 'error'">
        <v-spacer />
        <span><v-icon color="red">mdi-alert</v-icon>&nbsp;erreur</span>
      </template>
    </v-card-actions>
  </v-card>
</template>

<script>
  import OwnerShort from '~/components/owners/short.vue'
  const marked = require('marked')

  export default {
    components: { OwnerShort },
    props: ['dataset'],
    data: () => ({
      marked,
      hover: false,
    }),
  }
</script>

<style lang="css" scoped>
</style>
