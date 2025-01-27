<template>
  <v-card
    :loading="!activity"
    outlined
    tile
  >
    <v-card-title v-t="$t('activity')" />
    <v-card-text
      v-if="activity && !activity.results.length"
      v-t="$t('noActivity')"
    />
    <v-list
      v-if="activity"
      dense
      color="transparent"
      class="pb-1"
    >
      <v-list-item
        v-for="line of activity.results"
        :key="line.id"
        :to="`/${line.type}/${line.id}`"
        style="height:50px;"
      >
        <v-list-item-content>
          <v-list-item-title>
            <v-icon
              v-if="line.type === 'dataset'"
              small
            >
              mdi-database
            </v-icon>
            <v-icon
              v-if="line.type === 'application'"
              small
            >
              mdi-image-multiple
            </v-icon>
          &nbsp;{{ line.title }}
          </v-list-item-title>
          <v-list-item-subtitle>
            modification le {{ line.date | moment("L") }}
          </v-list-item-subtitle>
        </v-list-item-content>
      </v-list-item>
    </v-list>
    <v-list
      v-else
      dense
      class="list-actions"
    >
      <v-list-item
        v-for="i in nbLines"
        :key="i"
        style="height:50px;"
      >
        <v-skeleton-loader
          type="list-item-two-line"
          width="100%"
        />
      </v-list-item>
    </v-list>
  </v-card>
</template>

<i18n lang="yaml">
fr:
  activity: Activité
  noActivity: aucune activité
en:
  activity: Activity
  noActivity: no activity
</i18n>

<script>

const { mapGetters } = require('vuex')

export default {
  data () {
    return {
      activity: null,
      nbLines: 7
    }
  },
  computed: {
    ...mapGetters('session', ['activeAccount'])
  },
  async created () {
    // await new Promise(resolve => setTimeout(resolve, 4000))
    this.activity = await this.$axios.$get('api/v1/activity', {
      params: { size: this.nbLines, owner: `${this.activeAccount.type}:${this.activeAccount.id}` }
    })
  }
}
</script>

<style lang="css" scoped>
</style>
