<template lang="html">
  <v-container v-if="info && status" fluid>
    <p>Version : {{ info.version }}</p>
    <v-expansion-panel expand focusable>
      <v-expansion-panel-content>
        <div slot="header">
          Statut : {{ status.status }}
        </div>
        <pre v-if="status">{{ JSON.stringify(status, null, 2) }}</pre>
      </v-expansion-panel-content>
      <v-expansion-panel-content>
        <div slot="header">
          Configuration
        </div>
        <pre v-if="status">{{ JSON.stringify(info.config, null, 2) }}</pre>
      </v-expansion-panel-content>
    </v-expansion-panel>
  </v-container>
</template>

<script>
export default {
  data() {
    return { info: null, status: null }
  },
  async mounted() {
    this.info = await this.$axios.$get('api/v1/admin/info')
    this.status = await this.$axios.$get('api/v1/status')
  }
}
</script>

<style lang="css">
</style>
