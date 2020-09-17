<template>
  <v-container
    fluid
    class="pa-0 mb-2"
  >
    <v-progress-linear
      v-if="loading"
      :indeterminate="true"
      color="primary"
      height="2"
    />
    <template v-for="category in categories" v-else>
      <h3 :key="category" class="text-h6">
        {{ 'Visualisation de type '+category }}
      </h3>
      <v-row :key="'layout-'+category">
        <v-col
          v-for="baseApp in baseApps.filter(a => a.category === category)"
          :key="baseApp.id"
          md="3"
          sm="4"
          cols="6"
        >
          <v-tooltip top :activator="`#baseapp-${baseApp._id}`">
            <span v-if="baseApp.description">{{ baseApp.description }}</span>
            <template v-for="(disabled, i) in baseApp.disabled">
              <br :key="'br-' + i">
              <span :key="'span-' + i">{{ disabled }}</span>
            </template>
          </v-tooltip>
          <base-app-card
            :id="`baseapp-${baseApp._id}`"
            :base-app="baseApp"
            :selected="value && value._id === baseApp._id"
            @click="$emit('input', baseApp)"
          />
        </v-col>
      </v-row>
    </template>
  </v-container>
</template>

<script>
  import { mapGetters, mapState } from 'vuex'
  import BaseAppCard from '~/components/applications/base-app-card.vue'

  export default {
    components: { BaseAppCard },
    props: ['dataset', 'value'],
    data: () => ({
      baseApps: null,
      loading: true,
    }),
    computed: {
      ...mapState(['env', 'vocabulary']),
      ...mapGetters('session', ['activeAccount']),
      categories() {
        return this.env.baseAppsCategories.concat('autre')
          .filter(c => this.baseApps && this.baseApps.filter(b => b.category === c).length)
      },
    },
    watch: {
      dataset() {
        this.refresh()
      },
    },
    async created() {
      this.refresh()
    },
    methods: {
      async refresh() {
        this.loading = true
        const params = {
          size: 1000,
          privateAccess: this.activeAccount.type + ':' + this.activeAccount.id,
          dataset: this.dataset ? this.dataset.id : 'any',
        }
        this.baseApps = (await this.$axios.get('api/v1/base-applications', { params })).data.results
        this.loading = false
      },
    },
  }
</script>

<style lang="css" scoped>
</style>
