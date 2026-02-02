<template lang="html">
  <v-row
    v-if="services && statusFetch.data.value"
    class="my-0"
  >
    <v-col :style="display.lgAndUp ? 'padding-right:256px;' : ''">
      <v-container class="py-0">
        <v-expansion-panels>
          <v-expansion-panel
            expand
            focusable
          >
            <v-expansion-panel-title>Statut : {{ statusFetch.data.value.status }}</v-expansion-panel-title>
            <v-expansion-panel-text>
              <pre>{{ JSON.stringify(statusFetch.data.value, null, 2) }}</pre>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
        <div
          v-for="service of services"
          :key="service.name"
        >
          <h2 class="text-h6 mt-4">
            {{ t('services.' + service.name) }}
          </h2>
          <v-alert
            v-if="service.error"
            type="error"
          >
            {{ service.error }}
          </v-alert>
          <v-progress-circular
            v-else-if="!service.loaded"
            indeterminate
            size="16"
          />
          <p v-else>
            <img
              v-if="service.version"
              :alt="`Version installée : ${service.version}`"
              :src="`https://img.shields.io/badge/${encodeURIComponent(t('installed') + '-' + service.version.replace(/-/g, '--') + '-green')}`"
              :href="`https://github.com/${service.name}/releases`"
              :title="serviceTitle(service)"
              class="mr-2"
            >
            <a
              :href="`https://github.com/${service.name}/releases`"
              target="blank"
            >
              <img
                alt="Dernière version disponible"
                :src="`https://img.shields.io/github/v/tag/${service.name}?sort=semver&label=${encodeURIComponent(t('available'))}`"
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
      data-fair/simple-directory: Gestion des comptes
      data-fair/openapi-viewer: Documentation des API
      data-fair/events: Gestion des événements/notifications
      data-fair/catalogs: Gestion des catalogues
      data-fair/portals: Portails
  en:
    installed: installed
    available: available
    services:
      data-fair/data-fair: Data Fair - Back Office
      data-fair/simple-directory: Accounts management
      data-fair/openapi-viewer: API documentation
      data-fair/events: Events/notifications management
      data-fair/catalogs: Catalogs management
      data-fair/portals: Portals
  </i18n>

<script lang="ts" setup>
import { useDisplay } from 'vuetify/lib/composables/display.mjs'

const display = useDisplay()
const { t } = useI18n()

// TODO: make this list dynamic when we contractualize the secondary services
// replace extra_nav_items and other parameters by simple activation params
type Service = { name: string, infoUrl: string, loaded?: boolean, error?: string, commit?: string, date?: string, version?: string }
const services = ref<Service[]>([
  { name: 'data-fair/data-fair', infoUrl: '/data-fair/api/v1/admin/info' },
  { name: 'data-fair/simple-directory', infoUrl: '/simple-directory/api/admin/info' },
  { name: 'data-fair/openapi-viewer', infoUrl: '/openapi-viewer/api/admin/info' }
])

if ($uiConfig.eventsIntegration) {
  services.value.push({ name: 'data-fair/events', infoUrl: '/events/api/admin/info' })
}
if ($uiConfig.catalogsIntegration) {
  services.value.push({ name: 'data-fair/catalogs', infoUrl: '/catalogs/api/admin/info' })
}
if ($uiConfig.portalsIntegration) {
  services.value.push({ name: 'data-fair/portals', infoUrl: '/portals-manager/api/admin/info' })
}

onMounted(async () => {
  for (const service of services.value) {
    try {
      Object.assign(service, await $fetch(window.location.origin + service.infoUrl))
      service.loaded = true
    } catch (err: any) {
      service.error = err.message ?? err.response?.data ?? err
    }
  }
})

const statusFetch = useFetch<any>($apiPath + '/admin/status')

const serviceTitle = (service: Service) => {
  const parts = []
  if (service.commit) parts.push('commit: ' + service.commit)
  if (service.date) parts.push('date: ' + service.date)
  return parts.join('\n')
}
</script>

<style lang="css">
</style>
