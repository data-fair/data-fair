<template lang="html">
  <v-card>
    <v-calendar locale="fr-fr" :start="dataset.timePeriod.startDate" :end="dataset.timePeriod.endDate">
      <template v-slot:day="{ present, past, date }">
        <v-layout fill-height>
          BIM
        </v-layout>
      </template>
    </v-calendar>
  </v-card>
</template>

<script>
import { mapState, mapGetters } from 'vuex'
import eventBus from '../event-bus'

export default {
  data: () => ({
    data: null
  }),
  computed: {
    ...mapState(['env']),
    ...mapState('dataset', ['dataset']),
    ...mapGetters('dataset', ['resourceUrl'])
  },
  async mounted() {
    this.refresh()
  },
  methods: {
    async refresh() {
      try {
        this.data = await this.$axios.$get(this.resourceUrl + '/lines', { size: 10000 })
      } catch (error) {
        eventBus.$emit('notification', { error })
      }
    }
  }
}
</script>

<style lang="css">
</style>
