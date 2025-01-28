<template lang="html">
  <v-row class="my-0">
    <v-col :style="$vuetify.breakpoint.lgAndUp ? 'padding-right:256px;' : ''">
      <v-container class="py-0">
        <h2 class="text-h6">
          Propriétaires
        </h2>

        <v-row v-if="owners">
          <v-col>
            <v-row>
              <v-col
                cols="12"
                sm="6"
                md="4"
                lg="3"
              >
                <v-text-field
                  v-model="q"
                  name="q"
                  label="Rechercher par le nom"
                  @keypress.enter="refresh"
                />
              </v-col>
            </v-row>
            <v-sheet v-if="owners.results.length">
              <v-list three-line>
                <v-list-item
                  v-for="owner in owners.results"
                  :key="owner.id"
                >
                  <v-list-item-content>
                    <v-list-item-title>
                      {{ owner.name || owner.id }} ({{ owner.type }})
                    </v-list-item-title>
                    <v-list-item-subtitle>
                      <span v-if="owner.consumption && (owner.consumption.storage !== undefined)">{{ parseFloat(((owner.consumption && owner.consumption.storage || 0) / 1000).toFixed(2)).toLocaleString() }} ko stockés</span>
                      <span v-if="owner.storage !== undefined">pour une limite à {{ parseFloat((owner.storage / 1000).toFixed(2)).toLocaleString() }} ko</span>
                    </v-list-item-subtitle>
                    <v-list-item-subtitle>
                      <nuxt-link :to="{path: '/datasets', query: {'ownerExt': `${owner.type}:${owner.id}`, shared: true}}">
                        {{ owner.nbDatasets }} jeux de données
                      </nuxt-link>
                      -
                      <nuxt-link :to="{path: '/applications', query: {'ownerExt': `${owner.type}:${owner.id}`, shared: true}}">
                        {{ owner.nbApplications }} applications
                      </nuxt-link>
                    </v-list-item-subtitle>
                  </v-list-item-content>
                </v-list-item>
              </v-list>
            </v-sheet>
          </v-col>
        </v-row>
      </v-container>
    </v-col>
  </v-row>
</template>

<script>
export default {
  middleware: ['admin-required'],
  data () {
    return { owners: null, q: null }
  },
  async mounted () {
    this.refresh()
  },
  methods: {
    async refresh () {
      this.owners = await this.$axios.$get('api/v1/admin/owners', { params: { size: 1000, q: this.q } })
    }
  }
}
</script>

<style lang="css">
</style>
