<template>
  <v-card
    :to="`/application/${application.id}`"
    outlined
    :elevation="hover ? 2 : 0"
    @mouseenter="hover = true"
    @mouseleave="hover = false"
  >
    <v-card-title>
      <span style="white-space: nowrap;overflow: hidden;text-overflow: ellipsis;">
        {{ application.title || application.id }}
      </span>
    </v-card-title>
    <v-divider />
    <v-img
      :src="`${application.href}/capture`"
      height="180px"
    />
    <v-divider v-if="!hideDescription" />
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
    <v-card-actions>
      <owner-short :owner="application.owner" />
      &nbsp;&nbsp;
      <visibility :visibility="application.visibility" />
      <v-spacer />
      <v-tooltip v-if="status !== 'configured'" top>
        <template v-slot:activator="{on}">
          <v-icon :color="status === 'error' ? 'error' : 'warning'" v-on="on">
            {{ status === 'error' ? 'mdi-alert' : 'mdi-reload-alert' }}
          </v-icon>
        </template>
        {{ status === 'error' ? 'En erreur' : 'Brouillon non validé' }}
      </v-tooltip>
    </v-card-actions>
  </v-card>
</template>

<script>
  import OwnerShort from '~/components/owners/short.vue'
  import Visibility from '~/components/visibility.vue'

  export default {
    components: { OwnerShort, Visibility },
    props: ['application', 'showTopics'],
    data: () => ({
      hover: false,
    }),
    computed: {
      status() {
        if (this.application.status === 'error') return 'error'
        if (!this.application.configuration) return 'draft'
        return 'configured'
      },
    },
  }
</script>

<style lang="css" scoped>
</style>
