<template>
  <v-autocomplete
    :value="value"
    :items="applications"
    :loading="loadingApplications"
    :search-input.sync="search"
    no-filter
    item-text="title"
    item-value="id"
    :label="label || $t('selectApplication')"
    :placeholder="$t('search')"
    return-object
    outlined
    dense
    hide-details
    style="max-width: 600px"
    clearable
    @change="application => { $emit('input', application); $emit('change', application) }"
  >
    <template #item="{item}">
      <application-list-item
        :application="item"
        :dense="true"
        :show-topics="true"
        :no-link="true"
      />
    </template>
  </v-autocomplete>
</template>

<i18n lang="yaml">
fr:
  selectApplication: Choisissez une application
  ownerApplications: Vos applications
en:
  selectApplication: Choose an application
  ownerApplications: Your applications
</i18n>

<script>
import { mapGetters } from 'vuex'

export default {
  props: {
    value: { type: Object, default: null },
    label: { type: String, default: '' },
    extraParams: { type: Object, default: () => ({}) },
    owner: { type: Object, default: null }
  },
  data: () => ({
    loadingApplications: false,
    search: '',
    applications: []
  }),
  computed: {
    ...mapGetters('session', ['activeAccount'])
  },
  watch: {
    search () {
      this.searchApplications()
    },
    owner () {
      this.searchApplications()
    },
    extraParams () {
      this.searchApplications()
    }
  },
  methods: {
    async searchApplications () {
      this.loadingApplications = true
      const owner = this.owner || this.activeAccount

      let items = []
      if (this.value) items.push(this.value)

      let ownerFilter = `${owner.type}:${owner.id}`
      if (owner.department) ownerFilter += `:${owner.department}`
      const res = await this.$axios.$get('api/v1/applications', {
        params: {
          q: this.search,
          size: 20,
          select: 'id,title,url,-userPermissions,-links,-owner',
          owner: ownerFilter,
          ...this.extraParams
        }
      })

      const ownerApplications = res.results.filter(d => !items.find(rd => rd.id === d.id))

      if (items.length && ownerApplications.length) {
        items.push({ header: this.$t('ownerApplications') })
      }
      items = items.concat(ownerApplications)

      this.applications = items
      this.loadingApplications = false
    }
  }
}
</script>

<style>

</style>
