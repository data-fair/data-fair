<template lang="html">
  <div>
    <v-text-field
      class="mb-4"
      label="Clé d'API"
      :hint="apiKeyHint"
      persistent-hint
      v-model="catalog.apiKey"
      required
      :rules="[() => !!catalog.apiKey || `La clé d'API est obligatoire`]"
      @blur="changeApiKey"
    />
    <v-autocomplete
      class="mb-4"
      v-model="catalog.organization"
      :items="organizations"
      :loading="organizationsLoading"
      :search-input.sync="searchOrganizations"
      label="Organisation"
      placeholder="Tapez pour rechercher"
      return-object
      item-text="name"
      item-value="id"
      :hint="orgHint"
      persistent-hint
      no-data-text="Aucune organisation ne correspond"
      @change="$emit('change', {organization: catalog.organization})"
    />
  </div>
</template>

<script>
export default {
  props: ['catalog'],
  data() {
    return {
      orgHint: `Laissez vide pour travailler sur un compte personnel. Sinon utilisez l'identifiant d'une organisation dans laquelle vous avez le droit d'écriture.`,
      organizations: [],
      searchOrganizations: '',
      organizationsLoading: false
    }
  },
  computed: {
    apiKeyHint() {
      return `Cette clé est à configurer dans <a target="_blank" href="${this.catalog.url}/fr/admin/me/#apikey">votre profil</a> sur le catalogue.`
    }
  },
  watch: {
    async searchOrganizations() {
      if (!this.searchOrganizations || this.searchOrganizations === (this.catalog.organization && this.catalog.organization.name)) return
      this.organizationsLoading = true
      this.organizations = (await this.$axios.$get('api/v1/catalogs/_organizations', {params: {type: this.catalog.type, url: this.catalog.url, q: this.searchOrganizations}})).results
      this.organizationsLoading = false
    }
  },
  created() {
    if (this.catalog.organization && this.catalog.organization) {
      this.organizations = [this.catalog.organization]
    }
  },
  methods: {
    changeApiKey() {
      if (this.catalog.apiKey && this.catalog.apiKey !== '**********') this.$emit('change', {apiKey: this.catalog.apiKey})
    }
  }
}
</script>

<style lang="css">
</style>
