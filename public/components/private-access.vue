<template>
  <div>
    <v-checkbox
      v-model="patch.public"
      :label="$t('public')"
      @change="$emit('change')"
    />
    <v-autocomplete
      v-if="!patch.public"
      v-model="patch.privateAccess"
      :items="organizations"
      :loading="loadingOrganizations"
      :search-input.sync="searchOrganizations"
      :filter="() => true"
      :multiple="true"
      :clearable="true"
      item-text="name"
      item-value="id"
      :label="$t('privateAccess')"
      :placeholder="$t('searchName')"
      return-object
      @change="$emit('change')"
    />
  </div>
</template>

<i18n lang="yaml">
fr:
  public: Public
  privateAccess: Vue restreinte à des organisations
  searchName: Saisissez un nom d'organisation
en:
  public: Public
  privateAccess: Restricted access to some organizations
  searchName: Search an organization name
</i18n>

<script>
  import { mapState } from 'vuex'

  export default {
    props: ['patch'],
    data() {
      return {
        loadingOrganizations: false,
        searchOrganizations: '',
        organizations: [],
      }
    },
    computed: {
      ...mapState(['env']),
    },
    watch: {
      searchOrganizations() {
        this.listOrganizations()
      },
    },
    created() {
      this.patch.privateAccess = this.patch.privateAccess || []
    },
    methods: {
      listOrganizations: async function() {
        if (this.search && this.search === this.currentEntity.name) return

        this.loadingOrganizations = true
        if (!this.searchOrganizations || this.searchOrganizations.length < 3) {
          this.organizations = this.patch.privateAccess
        } else {
          this.organizations = this.patch.privateAccess.concat((await this.$axios.$get(this.env.directoryUrl + '/api/organizations', { params: { q: this.searchOrganizations } }))
            .results.map(r => ({ ...r, type: 'organization' })),
          )
        }
        this.loadingOrganizations = false
      },
    },
  }
</script>

<style>

</style>
