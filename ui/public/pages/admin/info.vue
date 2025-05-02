<template lang="html">
  <v-row
    v-if="servicesInfos && status"
    class="my-0"
  >
    <v-col :style="$vuetify.breakpoint.lgAndUp ? 'padding-right:256px;' : ''">
      <v-container class="py-0">
        <v-expansion-panels>
          <v-expansion-panel
            expand
            focusable
          >
            <v-expansion-panel-header>Statut : {{ status.status }}</v-expansion-panel-header>
            <v-expansion-panel-content>
              <pre v-if="status">{{ JSON.stringify(status, null, 2) }}</pre>
            </v-expansion-panel-content>
          </v-expansion-panel>
        </v-expansion-panels>
        <div
          v-for="service of servicesInfos"
          :key="service.name"
        >
          <h2 class="text-h6 mt-4">
            {{ $t('services.' + service.name) }}
          </h2>
          <v-alert
            v-if="service.error"
            :type="error"
          >
            {{ service.error }}
          </v-alert>
          <p v-else>
            <img
              alt="Dernière version disponible"
              :src="`https://img.shields.io/badge/${encodeURIComponent($t('installed') + '-' + service.version.replace(/-/g, '--') + '-green')}`"
              :href="`https://github.com/${service.name}/releases`"
            >
            <a
              :href="`https://github.com/${service.name}/releases`"
              target="blank"
            >
              <img
                alt="Dernière version disponible"
                :src="`https://img.shields.io/github/v/tag/${service.name}?sort=semver&label=${encodeURIComponent($t('available'))}`"
              >
            </a>
          </p>
        </div>
      </v-container>
    </v-col>
  </v-row>
</template>

<i18n lang="yaml">
  fr:
    installed: installé
    available: disponible
    services:
      data-fair/data-fair: Data Fair - Back Office
      data-fair/catalogs: Catalogs management

  en:
    installed: installed
    available: available
    services:
      data-fair/data-fair: Data Fair - Back Office
      data-fair/catalogs: Catalogs management
  </i18n>

<script>
// TODO: make this list dynamic when we contractualize the secondary services
// replace extra_nav_items and other parameters by simple activation params
const services = [
  { name: 'data-fair/data-fair', infoUrl: '/data-fair/api/v1/admin/info' }
]

if (process.env.catalogsIntegration) {
  services.push({ name: 'data-fair/catalogs', infoUrl: '/catalogs/api/admin/info' })
}

export default {
  middleware: ['admin-required'],
  data () {
    return { info: null, status: null, servicesInfos: null }
  },
  async mounted () {
    this.status = await this.$axios.$get('api/v1/admin/status')
    for (const service of services) {
      try {
        Object.assign(service, await this.$axios.$get('api/v1/admin/info'))
      } catch (err) {
        service.error = err.message ?? err.response?.data ?? err
      }
    }
    this.servicesInfos = services
  }
}
</script>

<style lang="css">
</style>
