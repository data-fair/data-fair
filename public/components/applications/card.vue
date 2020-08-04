<template>
  <v-card
    height="100%"
    :to="`/application/${application.id}`"
    outlined
    :elevation="hover ? 2 : 0"
    @mouseenter="hover = true"
    @mouseleave="hover = false"
  >
    <v-card-title>
      <span>{{ application.title || application.id }}
        <v-chip
          v-for="topic of application.topics"
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
    <v-divider />
    <v-img
      :src="`${application.href}/capture`"
      height="200px"
    />
    <v-divider v-if="!hideDescription" />
    <v-card-text
      v-if="!hideDescription"
      style="max-height:160px;overflow: hidden; margin-bottom: 40px;"
      v-html="marked($options.filters.truncate(application.description || '', 200))"
    />

    <v-card-actions v-if="!hideOwner" style="position:absolute; bottom: 0px;width:100%;">
      <owner-short :owner="application.owner" />
      &nbsp;<v-chip
        small
        :color="application.visibility === 'public' ? 'primary' : 'accent'"
        text-color="white"
      >
        {{ {public: 'Public', private: 'Privé', protected: 'Protégé'}[application.visibility] }}
      </v-chip>
      <template v-if="application.status === 'error'">
        <v-spacer />
        <span><v-icon color="red">mdi-alert</v-icon>&nbsp;En erreur</span>
      </template>
    </v-card-actions>
  </v-card>
</template>

<script>
  import OwnerShort from '~/components/owners/short.vue'
  const marked = require('marked')

  export default {
    components: { OwnerShort },
    props: ['application', 'hideOwner', 'hideDescription'],
    data: () => ({
      marked,
      hover: false,
    }),
  }
</script>

<style lang="css" scoped>
</style>
