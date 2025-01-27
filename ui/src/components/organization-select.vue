<template>
  <v-autocomplete
    :value="value"
    :items="filledOrganizations"
    :search-input.sync="search"
    :loading="loading"
    item-text="name"
    item-value="id"
    :label="$t('organization')"
    required
    cache-items
    return-object
    clearable
    @change="o => $emit('input', o)"
  >
    <template #item="{item}">
      <v-list-item-content>
        <v-list-item-title>{{ item.name }}</v-list-item-title>
        <v-list-item-subtitle class="text-caption">{{ item.id }}</v-list-item-subtitle>
      </v-list-item-content>
    </template>
  </v-autocomplete>
</template>

<i18n lang="yaml">
fr:
  organization: Organisation
en:
  organization: Organization
</i18n>

<script>
import { mapState } from 'vuex'

export default {
  props: {
    value: { type: Object, default: null }
  },
  data: () => ({
    organizations: [],
    search: '',
    loading: false
  }),
  computed: {
    ...mapState(['env']),
    filledOrganizations () {
      const orgs = []
      if (this.value && this.value.id) {
        orgs.push(this.value)
      }
      return orgs.concat(this.organizations)
    }
  },
  watch: {
    search: async function () {
      if (this.search && this.value && this.search === this.value.name) return
      this.loading = true
      if (this.search && this.search.length >= 3) {
        this.organizations = (await this.$axios.$get(this.env.directoryUrl + '/api/organizations', { params: { q: this.search } })).results
      } else {
        this.organizations = []
      }
      this.loading = false
    }
  }
}
</script>

<style>

</style>
