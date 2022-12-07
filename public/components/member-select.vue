<template>
  <v-autocomplete
    :value="value"
    :items="filledMembers"
    :search-input.sync="search"
    no-filter
    :loading="loading"
    item-text="name"
    item-value="id"
    :label="$t('member', {org: organization.name})"
    required
    return-object
    clearable
    @change="o => $emit('input', o)"
  >
    <template #item="{item}">
      <v-list-item-content>
        <v-list-item-title>{{ item.name }}</v-list-item-title>
        <v-list-item-subtitle class="text-caption">
          {{ item.email }}
          <span v-if="item.role"> - {{ item.role }}</span>
          <span v-if="item.department"> - {{ item.departmentName || item.department }}</span>
        </v-list-item-subtitle>
      </v-list-item-content>
    </template>
  </v-autocomplete>
</template>

<i18n lang="yaml">
fr:
  member: Membre de {org}
en:
  member: Member of {org}
</i18n>

<script>
import { mapState } from 'vuex'

export default {
  props: {
    value: { type: Object, default: null },
    organization: { type: Object, required: true }
  },
  data: () => ({
    members: [],
    search: '',
    loading: false
  }),
  computed: {
    ...mapState(['env']),
    filledMembers () {
      const members = []
      if (this.value && this.value.id) {
        members.push(this.value)
      }
      return members.concat(this.members)
    }
  },
  watch: {
    search: async function () {
      if (this.search && this.value && this.search === this.value.name) return
      this.loading = true
      if (this.search && this.search.length >= 3) {
        this.members = (await this.$axios.$get(`${this.env.directoryUrl}/api/organizations/${this.organization.id}/members`, { params: { q: this.search } })).results
      } else {
        this.members = []
      }
      this.loading = false
    }
  }
}
</script>

<style>

</style>
