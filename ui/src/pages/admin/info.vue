<template>
  <v-container v-if="services && statusFetch.data.value">
    <df-agent-chat-action
      v-if="showAgentChat"
      action-id="summarize-releases"
      :visible-prompt="t('summarizeReleasesPrompt')"
      :hidden-context="releasesContext"
      :btn-props="{ text: t('summarizeReleasesBtn'), class: 'mb-4' }"
      :title="t('summarizeReleasesPrompt')"
    />
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
      <h2 class="text-title-large mt-4">
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
          target="_blank"
        >
        <a
          :href="`https://github.com/${service.name}/releases`"
          target="_blank"
        >
          <img
            alt="Dernière version disponible"
            :src="`https://img.shields.io/github/v/tag/${service.name}?sort=semver&label=${encodeURIComponent(t('available'))}`"
          >
        </a>
      </p>
    </div>
  </v-container>
</template>

<i18n lang="yaml">
  fr:
    info: Informations sur les services
    installed: installé
    available: disponible
    summarizeReleasesBtn: Résumer les mises à jour
    summarizeReleasesPrompt: Fais un résumé des dernières mises à jour des services avec un focus sur les versions disponibles et non encore déployées.
    services:
      data-fair/data-fair: Data Fair - Back Office
      data-fair/simple-directory: Gestion des comptes
      data-fair/events: Gestion des événements & notifications
      data-fair/catalogs: Gestion des catalogues
      data-fair/processings: Gestion des traitements
      data-fair/portals: Gestion des portails
      data-fair/agents: Gestion des agents IA
      data-fair/metrics: Suivi d'audience
      data-fair/openapi-viewer: Visualisateur de documentation d'API
      data-fair/registry: Registre d'applications et services
  en:
    info: Services information
    installed: installed
    available: available
    summarizeReleasesBtn: Summarize updates
    summarizeReleasesPrompt: Summarize the latest service updates with a focus on versions that are available but not yet deployed.
    services:
      data-fair/data-fair: Data Fair - Back Office
      data-fair/simple-directory: Accounts management
      data-fair/events: Events & notifications management
      data-fair/catalogs: Catalogs management
      data-fair/processings: Processings management
      data-fair/portals: Portals management
      data-fair/agents: AI agents management
      data-fair/metrics: Audience tracking
      data-fair/openapi-viewer: API documentation viewer
      data-fair/registry: Applications and services registry
  </i18n>

<script setup lang="ts">
import { DfAgentChatAction } from '@data-fair/lib-vuetify-agents'
import { useBreadcrumbs } from '~/composables/layout/use-breadcrumbs'
import { useShowAgentChat } from '~/composables/agent/use-show-chat'
import { useAgentServicesInfoTool, useAgentGithubTool } from '~/composables/agent/releases-tools'

const { t, locale } = useI18n()
const breadcrumbs = useBreadcrumbs()
breadcrumbs.receive({ breadcrumbs: [{ text: t('info') }] })

// TODO: make this list dynamic when we contractualize the secondary services
// replace extra_nav_items and other parameters by simple activation params
type Service = { name: string, infoUrl: string, loaded?: boolean, error?: string, commit?: string, date?: string, version?: string }
const services = ref<Service[]>([
  { name: 'data-fair/data-fair', infoUrl: '/data-fair/api/v1/admin/info' },
  { name: 'data-fair/simple-directory', infoUrl: '/simple-directory/api/admin/info' }
])

if ($uiConfig.eventsIntegration) {
  services.value.push({ name: 'data-fair/events', infoUrl: '/events/api/admin/info' })
}
if ($uiConfig.catalogsIntegration) {
  services.value.push({ name: 'data-fair/catalogs', infoUrl: '/catalogs/api/admin/info' })
}
if ($uiConfig.processingsIntegration) {
  services.value.push({ name: 'data-fair/processings', infoUrl: '/processings/api/v1/admin/info' })
}
if ($uiConfig.portalsIntegration) {
  services.value.push({ name: 'data-fair/portals', infoUrl: '/portals-manager/api/admin/info' })
}
if ($uiConfig.agentsIntegration) {
  services.value.push({ name: 'data-fair/agents', infoUrl: '/agents/api/admin/info' })
}
if ($uiConfig.metricsIntegration) {
  services.value.push({ name: 'data-fair/metrics', infoUrl: '/metrics/api/admin/info' })
}
if ($uiConfig.openapiViewerIntegration) {
  services.value.push({ name: 'data-fair/openapi-viewer', infoUrl: '/openapi-viewer/api/admin/info' })
}
if ($uiConfig.registryIntegration) {
  services.value.push({ name: 'data-fair/registry', infoUrl: '/registry/api/admin/info' })
}

const showAgentChat = useShowAgentChat()

const releasesContext = `To answer questions about service releases:
1. Call list_services_versions to get each service and its currently installed version. The service name is the GitHub repo slug (owner/repo).
2. For each relevant service, call explore_github with "/repos/{name}/releases?per_page=10" to get recent releases. If a repo has no releases, fall back to "/repos/{name}/tags?per_page=10".
3. Compare the latest available version/tag with the installed version to identify versions that are available but not yet deployed.
4. Summarize the recent updates, focusing on those available-but-not-deployed versions. Respond in the user's language.`

useAgentServicesInfoTool(locale, services)
useAgentGithubTool(locale)

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
