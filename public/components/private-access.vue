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
      :items="suggestions"
      :loading="loading"
      :search-input.sync="search"
      :filter="() => true"
      :multiple="true"
      :clearable="true"
      :item-text="(item) => item && `${item.name} (${item.type})`"
      :item-value="(item) => item && `${item.type}:${item.id}`"
      :label="$t('privateAccess')"
      :placeholder="$t('searchName')"
      return-object
      @change="onChange"
    />
  </div>
</template>

<i18n lang="yaml">
fr:
  public: Public
  privateAccess: Vue restreinte à des comptes
  searchName: Saisissez un nom d'organisation
en:
  public: Public
  privateAccess: Restricted access to some accounts
  searchName: Search an organization name
</i18n>

<script>
  import { mapState } from 'vuex'

  export default {
    props: ['patch'],
    data() {
      return {
        loading: false,
        search: '',
        suggestions: [],
      }
    },
    computed: {
      ...mapState(['env']),
    },
    watch: {
      search() {
        this.listSuggestions()
      },
    },
    created() {
      this.patch.privateAccess = this.patch.privateAccess || []
      this.listSuggestions()
    },
    methods: {
      listSuggestions: async function() {
        if (!this.search || this.search.length < 3) {
          this.suggestions = this.patch.privateAccess
          return
        }

        this.loading = true
        const orgs = (await this.$axios.$get(this.env.directoryUrl + '/api/organizations', { params: { q: this.search } }))
          .results.map(r => ({ ...r, type: 'organization' }))
        const users = (await this.$axios.$get(this.env.directoryUrl + '/api/users', { params: { q: this.search } }))
          .results.map(r => ({ ...r, type: 'user' }))
        this.suggestions = this.patch.privateAccess.concat(orgs).concat(users)
        this.loading = false
      },
      onChange() {
        this.search = ''
        this.$emit('change')
      },
    },
  }
</script>

<style>

</style>
