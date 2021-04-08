<template>
  <v-card
    outlined
    tile
    :elevation="hover ? 4 : 0"
    @mouseenter="hover = true"
    @mouseleave="hover = false"
  >
    <nuxt-link :to="`/application/${application.id}`" style="text-decoration:none">
      <v-card-title>
        <span class="font-weight-bold" style="white-space: nowrap;overflow: hidden;text-overflow: ellipsis;">
          {{ application.title || application.id }}
        </span>
      </v-card-title>
      <v-divider />
      <v-img
        :src="`${application.href}/capture`"
        :aspect-ratio="800 / 450"
      />
      <v-divider />
      <v-row v-if="showTopics" style="min-height:30px;">
        <v-col class="pt-1 pb-0">
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
        </v-col>
      </v-row>
    </nuxt-link>
    <v-card-actions class="pl-3">
      <owner-short v-if="showOwner" :owner="application.owner" />
      &nbsp;&nbsp;
      <visibility :visibility="application.visibility" />
      <v-tooltip v-if="!!application.errorMessage" top>
        <template v-slot:activator="{on}">
          <v-icon color="error" v-on="on">
            mdi-alert
          </v-icon>
        </template>
        En erreur
      </v-tooltip>
      &nbsp;&nbsp;
      <v-tooltip v-if="application.status !== 'configured' && application.status !== 'error'" top>
        <template v-slot:activator="{on}">
          <v-icon color="warning" v-on="on">
            mdi-reload-alert
          </v-icon>
        </template>
        Brouillon non validé
      </v-tooltip>
    </v-card-actions>
  </v-card>
</template>

<script>
  export default {
    props: ['application', 'showTopics', 'showOwner'],
    data: () => ({
      hover: false,
    }),
  }
</script>

<style lang="css" scoped>
</style>
