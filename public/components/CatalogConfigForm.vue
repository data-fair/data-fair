<template lang="html">
  <div>
    <v-text-field
      v-model="catalog.apiKey"
      :hint="apiKeyHint"
      :rules="[() => !!catalog.apiKey || `La clé d'API est obligatoire`]"
      class="mb-4"
      label="Clé d'API"
      persistent-hint
      required
      @change="changeApiKey"
    />
    <v-text-field
      v-model="catalog.datasetUrlTemplate"
      hint="Laissez vide pour créer automatiquement un lien vers la page du jeu de données dans cette instance data-fair. Renseignez pour pointer vers une autre page publique. Par exemple 'https://koumoul.com/datasets/{id}'."
      class="mb-4"
      label="Format du lien vers la page d'un jeu de données"
      persistent-hint
      @change="$emit('change', {datasetUrlTemplate: catalog.datasetUrlTemplate})"
    />
    <v-text-field
      v-model="catalog.applicationUrlTemplate"
      hint="Laissez vide pour créer automatiquement un lien vers l'application dans cette instance data-fair. Renseignez pour pointer vers une autre page publique. Par exemple 'https://koumoul.com/reuses/{id}'."
      class="mb-4"
      label="Format du lien vers la page d'une application"
      persistent-hint
      @change="$emit('change', {applicationUrlTemplate: catalog.applicationUrlTemplate})"
    />
    <v-autocomplete
      v-if="catalogType && catalogType.searchOrganization"
      v-model="catalog.organization"
      :items="organizations"
      :loading="organizationsLoading"
      :search-input.sync="searchOrganizations"
      :hint="orgHint"
      class="mb-4"
      label="Organisation"
      placeholder="Tapez pour rechercher"
      return-object
      item-text="name"
      item-value="id"
      persistent-hint
      no-data-text="Aucune organisation ne correspond"
      @change="$emit('change', {organization: catalog.organization})"
    />
  </div>
</template>

<script>
export default {
  props: ['catalog', 'catalogType'],
  data() {
    return {
      orgHint: 'Laissez vide pour travailler sur un compte personnel. Sinon utilisez l\'identifiant d\'une organisation dans laquelle vous avez le droit d\'écriture.',
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
      this.organizations = (await this.$axios.$get('api/v1/catalogs/_organizations', { params: { type: this.catalog.type, url: this.catalog.url, q: this.searchOrganizations } })).results
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
      if (this.catalog.apiKey && this.catalog.apiKey !== '**********') this.$emit('change', { apiKey: this.catalog.apiKey })
    }
  }
}
</script>

<style lang="css">
</style>
