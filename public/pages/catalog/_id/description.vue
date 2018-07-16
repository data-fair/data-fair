<template lang="html">
  <div>
    <v-form v-model="newCatalogValid">
      <v-text-field label="URL" v-model="newCatalog.url" required :rules="[() => !!newCatalog.url]"/>
      <v-text-field label="Clé d'API" :hint="apiKeyHint" persistent-hint v-model="newCatalog.apiKey" required :rules="[() => !!newCatalog.apiKey]"/>
      <v-text-field label="Identifiant d'organisation" :hint="orgHint" persistent-hint v-model="newCatalog.organizationId" />
    </v-form>
  </div>
</template>

<script>

export default {
  components: {}
}
</script>

<style lang="css">
</style>
