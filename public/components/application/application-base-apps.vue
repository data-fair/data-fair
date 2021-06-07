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
          <application-base-apps-card
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

  export default {
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
