<template lang="html">
  <div>
    <v-text-field
      v-model="catalog.apiKey"
      :hint="$t('apiKeyHelp', {url: catalog.url})"
      :rules="[() => !!catalog.apiKey || $t('requiredApiKey')]"
      class="mb-4"
      :label="$t('apiKey')"
      persistent-hint
      required
      :disabled="!!catalog.createdAt && !can('writeDescription')"
      @change="changeApiKey"
    >
      <template #message>
        <span v-html="$t('apiKeyHelp', {url: catalog.url})" />
      </template>
    </v-text-field>
    <v-text-field
      v-model="catalog.datasetUrlTemplate"
      :label="$t('datasetUrlTemplate')"
      :hint="$t('datasetUrlTemplateHelp')"
      class="mb-4"
      persistent-hint
      :disabled="!!catalog.createdAt && !can('writeDescription')"
      @change="$emit('change', {datasetUrlTemplate: catalog.datasetUrlTemplate})"
    />
    <v-text-field
      v-model="catalog.applicationUrlTemplate"
      :label="$t('applicationUrlTemplate')"
      :hint="$t('applicationUrlTemplateHelp')"
      class="mb-4"
      persistent-hint
      :disabled="!!catalog.createdAt && !can('writeDescription')"
      @change="$emit('change', {applicationUrlTemplate: catalog.applicationUrlTemplate})"
    />
    <v-text-field
      v-model="catalog.dataFairBaseUrl"
      :label="$t('dataFairBaseUrl')"
      :hint="$t('dataFairBaseUrlHelp')"
      class="mb-4"
      persistent-hint
      :disabled="!!catalog.createdAt && !can('writeDescription')"
      @change="$emit('change', {dataFairBaseUrl: catalog.dataFairBaseUrl})"
    />
    <v-autocomplete
      v-if="catalogType && catalogType.searchOrganization"
      v-model="catalog.organization"
      :items="organizations"
      :loading="organizationsLoading"
      :search-input.sync="searchOrganizations"
      :label="$t('org')"
      :hint="$t('orgHelp')"
      class="mb-4"
      :placeholder="$t('search')"
      return-object
      item-text="name"
      item-value="id"
      persistent-hint
      :no-data-text="$t('noOrgMatch')"
      :disabled="!!catalog.createdAt && !can('writeDescription')"
      @change="$emit('change', {organization: catalog.organization})"
    />
  </div>
</template>

<i18n lang="yaml">
fr:
  apiKey: Clé d'API
  requiredApiKey: La clé d'API est obligatoire
  apiKeyHelp: "Cette clé est à configurer dans <a target=\"_blank\" href=\"{url}/fr/admin/me/#apikey\">votre profil</a> sur le catalogue."
  datasetUrlTemplate: Format du lien vers la page d'un jeu de données
  datasetUrlTemplateHelp: "Laissez vide pour créer automatiquement un lien vers la page du jeu de données dans cette instance data-fair. Renseignez pour pointer vers une autre page publique. Par exemple 'https://test.com/datasets/{id}'."
  applicationUrlTemplate: Format du lien vers la page d'une application
  applicationUrlTemplateHelp: "Laissez vide pour créer automatiquement un lien vers la page de l'application dans cette instance data-fair. Renseignez pour pointer vers une autre page publique. Par exemple 'https://test.com/reuses/{id}'."
  dataFairBaseUrl: URL du service de données
  dataFairBaseUrlHelp: "Laissez vide pour utiliser l'exposition principale de ce service, renseignez pour faire passer les utilisateurs par un autre nom de domaine. Par exemple 'https://test.com/data-fair'"
  org: Organisation
  orgHelp: Laissez vide pour travailler sur un compte personnel. Sinon utilisez l'identifiant d'une organisation dans laquelle vous avez le droit d'écriture.
  search: Rechercher
  noOrgMatch: Aucune organisation ne correspond
en:
  apiKey: API key
  requiredApiKey: The API key is required
  apiKeyHelp: "This key must be configured in your <a target=\"_blank\" href=\"{url}/fr/admin/me/#apikey\">your profile</a> in the catalog."
  datasetUrlTemplate: Format of the link to a dataset's page
  datasetUrlTemplateHelp: "Leave empty to automatically create a link to the dataset's page in this data-fair instance. Enter to link to another public page. For example 'https://test.com/datasets/{id}'."
  applicationUrlTemplate: Format of the link to a application's page
  applicationUrlTemplateHelp: "Leave empty to automatically create a link to the application's page in this data-fair instance. Enter to link to another public page. For example 'https://test.com/reuses/{id}'."
  org: Organization
  orgHelp: Leave empty to work in a personnal account. Otherwise use the id of an organization in which you have write permissions.
  search: Search
  noOrgaMatch: No matching organization
</i18n>

<script>
import { mapGetters } from 'vuex'

export default {
  props: ['catalog', 'catalogType'],
  data () {
    return {
      organizations: [],
      searchOrganizations: '',
      organizationsLoading: false
    }
  },
  computed: {
    ...mapGetters('catalog', ['can'])
  },
  watch: {
    async searchOrganizations () {
      if (!this.searchOrganizations || this.searchOrganizations === (this.catalog.organization && this.catalog.organization.name)) return
      this.organizationsLoading = true
      this.organizations = (await this.$axios.$get('api/v1/catalogs/_organizations', { params: { type: this.catalog.type, url: this.catalog.url, q: this.searchOrganizations } })).results
      this.organizationsLoading = false
    }
  },
  created () {
    if (this.catalog.organization && this.catalog.organization) {
      this.organizations = [this.catalog.organization]
    }
  },
  methods: {
    changeApiKey () {
      if (this.catalog.apiKey && this.catalog.apiKey !== '**********') this.$emit('change', { apiKey: this.catalog.apiKey })
    }
  }
}
</script>

<style lang="css">
</style>
