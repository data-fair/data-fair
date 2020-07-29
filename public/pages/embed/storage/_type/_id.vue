<template lang="html">
  <v-container
    v-if="initialized"
    fluid
  >
    <v-row>
      <v-col>
        <template v-if="authorized">
          <storage-details
            :datasets="datasets"
            :url-template="$route.query.urlTemplate"
          />
        </template>

        <not-authorized v-else />
      </v-col>
    </v-row>
  </v-container>
</template>

<script>
  import 'iframe-resizer/js/iframeResizer.contentWindow'
  import StorageDetails from '~/components/storage-details.vue'
  import { mapState } from 'vuex'

  export default {
    layout: 'embed',
    components: { StorageDetails },
    data: () => ({
      datasets: null,
    }),
    computed: {
      ...mapState(['env']),
      ...mapState('session', ['user', 'initialized']),
      organization() {
        if (this.$route.params.type === 'organization') {
          return this.user.organizations.find(o => o.id === this.$route.params.id)
        } else {
          return null
        }
      },
      authorized() {
        if (!this.user) return false
        if (this.user.adminMode) return true
        if (this.$route.params.type === 'user' && this.$route.params.id !== this.user.id) return false
        if (this.$route.params.type === 'organization') {
          if (!this.organization) return false
          if (this.organization.role !== this.env.adminRole) return false
        }
        return true
      },
    },
    async created() {
      if (!this.authorized) return
      this.datasets = (await this.$axios.$get('api/v1/datasets', { params: { size: 10000, owner: `${this.$route.params.type}:${this.$route.params.id}`, select: 'id,title,storage', sort: 'storage.size:-1' } })).results
    },
  }
</script>

<style lang="css">
</style>
