<template>
  <v-card
    :to="`/dataset/${dataset.id}`"
    outlined
    :elevation="hover ? 2 : 0"
    @mouseenter="hover = true"
    @mouseleave="hover = false"
  >
    <v-card-title>
      <span style="white-space: nowrap;overflow: hidden;text-overflow: ellipsis;">
        {{ dataset.title || dataset.id }}
      </span>
    </v-card-title>
    <v-divider />
    <v-card-text style="min-height: 96px;" class="pa-0">
      <v-list dense>
        <v-list-item v-if="dataset.isVirtual">
          <v-list-item-avatar>
            <v-icon>mdi-picture-in-picture-bottom-right-outline</v-icon>
          </v-list-item-avatar>
          <span>Jeu de données virtuel</span>
        </v-list-item>
        <v-list-item v-if="dataset.isRest">
          <v-list-item-avatar class="ml-0 my-0">
            <v-icon>mdi-all-inclusive</v-icon>
          </v-list-item-avatar>
          <span>Jeu de données incrémental</span>
        </v-list-item>
        <v-list-item v-if="dataset.file">
          <v-list-item-avatar class="ml-0 my-0">
            <v-icon>mdi-file</v-icon>
          </v-list-item-avatar>
          <span>{{ (dataset.remoteFile || dataset.originalFile || dataset.file).name }} {{ ((dataset.remoteFile || dataset.originalFile || dataset.file).size / 1000) | displayBytes }}</span>
        </v-list-item>
        <v-list-item v-if="dataset.count !== undefined">
          <v-list-item-avatar class="ml-0 my-0">
            <v-icon>mdi-view-headline</v-icon>
          </v-list-item-avatar>
          <span>{{ dataset.count.toLocaleString() }} lignes</span>
        </v-list-item>
      </v-list>
    </v-card-text>
    <v-divider />
    <v-row v-if="showTopics" style="min-height:30px;">
      <v-col class="pt-1 pb-0">
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
      </v-col>
    </v-row>
    <v-card-actions>
      <owner-short :owner="dataset.owner" />
      &nbsp;&nbsp;
      <visibility :visibility="dataset.visibility" />
      <v-spacer />
      <v-tooltip v-if="dataset.status === 'error'" top>
        <template v-slot:activator="{on}">
          <v-icon color="error" v-on="on">
            mdi-alert
          </v-icon>
        </template>
        En erreur
      </v-tooltip>
    </v-card-actions>
  </v-card>
</template>

<script>
  import OwnerShort from '~/components/owners/short.vue'
  import Visibility from '~/components/visibility.vue'
  const marked = require('marked')

  export default {
    components: { OwnerShort, Visibility },
    props: ['dataset', 'showTopics'],
    data: () => ({
      marked,
      hover: false,
    }),
  }
</script>

<style lang="css" scoped>
</style>
