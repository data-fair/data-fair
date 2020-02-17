<template lang="html">
  <v-container fluid>
    <v-layout column>
      <template v-if="authorized">
        <storage-details :datasets="datasets" :url-template="$route.query.urlTemplate" />
      </template>

      <v-responsive v-else height="auto">
        <v-container fill-height>
          <v-layout align-center>
            <v-flex text-xs-center>
              <div class="headline">
                Vous n'êtes pas autorisé à voir ou modifier le contenu de cette page. Si vous avez besoin de connaitres ces informations, veuillez contacter un administrateur de celle ci.
              </div>
            </v-flex>
          </v-layout>
        </v-container>
      </v-responsive>
    </v-layout>
  </v-container>
</template>

<script>
import StorageDetails from '../../../../components/StorageDetails.vue'
import { mapState } from 'vuex'

export default {
  layout: 'embed',
  components: { StorageDetails },
  data: () => ({
    datasets: null
  }),
  computed: {
    ...mapState('session', ['user', 'initialized']),
    authorized() {
      if (!this.user) return false
      if (this.$route.params.type === 'user' && this.$route.params.id !== this.user.id) return false
      if (this.$route.params.type === 'organization') {
        const organization = this.user.organizations.find(o => o.id === this.$route.params.id)
        if (!organization) return false
        if (organization.role !== this.env.adminRole) return false
      }
      return true
    }
  },
  async created() {
    if (!this.authorized) return
    this.datasets = (await this.$axios.$get('api/v1/datasets', { params: { size: 10000, owner: `${this.$route.params.type}:${this.$route.params.id}`, select: 'id,title,storage', sort: 'storage.size:-1' } })).results
  }
}
</script>

<style lang="css">
</style>
