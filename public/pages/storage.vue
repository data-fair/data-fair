<template lang="html">
  <v-container v-if="initialized">
    <v-row>
      <v-col>
        <template v-if="authorized">
          <h2 class="display-1 mb-4">
            Détail du stockage de l'{{ activeAccount.type ==='organization' ? ('organisation ' + ((organization && organization.name) || activeAccount.id)): ('utilisateur ' + user.name) }}
          </h2>
          <storage-details :datasets="datasets" />
        </template>

        <v-responsive
          v-else
          height="auto"
        >
          <v-container class="fill-height">
            <v-row align="center">
              <v-col class="text-center">
                <div class="headline">
                  Vous n'êtes pas autorisé à voir ou modifier le contenu de cette page. Si vous avez besoin de connaitres ces informations, veuillez contacter un administrateur de celle ci.
                </div>
              </v-col>
            </v-row>
          </v-container>
        </v-responsive>
      </v-col>
    </v-row>
  </v-container>
</template>

<script>
  import StorageDetails from '~/components/storage-details.vue'
  import { mapState, mapGetters } from 'vuex'

  export default {
    components: { StorageDetails },
    data: () => ({
      datasets: null,
    }),
    computed: {
      ...mapState(['env']),
      ...mapState('session', ['user', 'initialized']),
      ...mapGetters('session', ['activeAccount']),
      organization() {
        if (this.activeAccount.type === 'organization') {
          return this.user.organizations.find(o => o.id === this.activeAccount.id)
        } else {
          return null
        }
      },
      authorized() {
        if (!this.user) return false
        if (this.user.adminMode) return true
        if (this.activeAccount.type === 'user' && this.activeAccount.id !== this.user.id) return false
        if (this.activeAccount.type === 'organization') {
          if (!this.organization) return false
          if (this.organization.role !== this.env.adminRole) return false
        }
        return true
      },
    },
    async created() {
      if (!this.authorized) return
      this.datasets = (await this.$axios.$get('api/v1/datasets', { params: { size: 10000, owner: `${this.activeAccount.type}:${this.activeAccount.id}`, select: 'id,title,storage', sort: 'storage.size:-1' } })).results
    },
  }
</script>

<style lang="css">
</style>
