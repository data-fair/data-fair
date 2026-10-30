<template>
  <v-card class="h-100">
    <v-card-item>
      <v-card-title class="d-flex align-center ga-2">
        <v-icon
          :icon="mdiClipboardCheckOutline"
          color="primary"
        />
        {{ t('title') }}
      </v-card-title>
      <v-card-subtitle>{{ t('subtitle') }}</v-card-subtitle>
    </v-card-item>
    <!-- only the lines with something to do: an "up to date" line is noise -->
    <v-list
      v-if="items.length"
      class="py-0"
    >
      <v-list-item
        v-for="item in items"
        :key="item.key"
        lines="one"
        class="dashboard-todo-item"
        :style="{ borderLeftColor: `rgb(var(--v-theme-${item.color}))` }"
      >
        <template #prepend>
          <v-icon
            :icon="item.icon"
            :color="item.color"
          />
        </template>
        <v-list-item-title class="font-weight-bold text-wrap">
          {{ item.label }}
        </v-list-item-title>
        <template #append>
          <v-btn
            :to="item.to"
            :href="item.href"
            :color="item.color"
            :append-icon="mdiChevronRight"
            :title="item.title"
            variant="text"
          >
            {{ t('see') }}
          </v-btn>
        </template>
      </v-list-item>
    </v-list>
    <v-card-text
      v-else-if="loaded"
      class="d-flex align-center ga-2 text-success font-weight-bold"
    >
      <v-icon :icon="mdiCheckCircle" />
      {{ t('upToDate') }}
    </v-card-text>
    <v-progress-linear
      v-else
      indeterminate
      color="primary"
    />
  </v-card>
</template>

<i18n lang="yaml">
fr:
  title: À traiter
  subtitle: Ce qui demande votre attention
  see: Voir
  upToDate: Rien à traiter, tout est à jour.
  datasetsError: Jeu de données en erreur | Jeux de données en erreur
  processingsError: Traitement en erreur | Traitements en erreur
  storage: Espace de stockage rempli à {n} %
  datasetsPublications: Publication de jeu de données à valider | Publications de jeux de données à valider
  applicationsPublications: Publication d'application à valider | Publications d'applications à valider
  reusesPublications: Réutilisation en attente de publication | Réutilisations en attente de publication
  pagesPublications: Page dont la publication est demandée | Pages dont la publication est demandée
  datasetsDraft: Brouillon à valider | Brouillons à valider
en:
  title: To do
  subtitle: What needs your attention
  see: See
  upToDate: Nothing to do, everything is up to date.
  datasetsError: Dataset in error | Datasets in error
  processingsError: Processing in error | Processings in error
  storage: Storage space {n} % full
  datasetsPublications: Dataset publication to validate | Dataset publications to validate
  applicationsPublications: Application publication to validate | Application publications to validate
  reusesPublications: Reuse waiting for publication | Reuses waiting for publication
  pagesPublications: Page with a requested publication | Pages with a requested publication
  datasetsDraft: Draft to validate | Drafts to validate
</i18n>

<script setup lang="ts">
import {
  mdiClipboardCheckOutline, mdiChevronRight, mdiCheckCircle, mdiAlertCircle, mdiFileDocumentEdit, mdiShareVariant,
  mdiImageMultiple, mdiCogTransferOutline, mdiFaceAgent, mdiHarddisk, mdiPageNext, mdiViewDashboardEdit
} from '@mdi/js'
import type { RouteLocationRaw } from 'vue-router'
import { usePermissions } from '~/composables/use-permissions'
import statuses from '../../../../shared/statuses.json'
import type { PublicationSite } from './dashboard-portals.vue'

const { limits, publicationSites, pagesFacets } = defineProps<{
  limits?: Record<string, { consumption: number, limit: number }>
  publicationSites?: PublicationSite[]
  pagesFacets?: { requestedPortals: Record<string, number> }
}>()

const { t, locale } = useI18n()
const { canContrib, canAdmin, canContribDep, canAdminDep } = usePermissions()

type Line = { key: string, title: string, icon: string, color: string, count?: number, to?: RouteLocationRaw, href?: string }
type FacetsRes = { count: number, facets: Record<string, { value: string }[]> }
type PortalsRes = { facets: { requestedPortals: Record<string, number> } }

const sitesFilter = computed(() => publicationSites?.map(p => `${p.type}:${p.id}`).join(','))
const draftStatuses = Object.keys(statuses.dataset).filter(s => s !== 'error' && s !== 'finalized').join(',')
const sum = (counts?: Record<string, number>) => counts && Object.values(counts).reduce((a, b) => a + b, 0)

const datasetsErrorFetch = useFetch<{ count: number }>(() => canContribDep.value ? `${$apiPath}/datasets?size=0&shared=false&status=error` : null)
const processingsErrorFetch = useFetch<{ count: number }>(() => canAdminDep.value && $uiConfig.processingsIntegration ? `${$sitePath}/processings/api/v1/processings?size=0&statuses=error` : null)
const datasetsPublicationsFetch = useFetch<FacetsRes>(() => canAdminDep.value && sitesFilter.value ? `${$apiPath}/datasets?size=0&shared=false&requestedPublicationSites=${sitesFilter.value}&facets=requestedPublicationSites` : null)
const applicationsPublicationsFetch = useFetch<FacetsRes>(() => canAdminDep.value && sitesFilter.value && !$uiConfig.disableApplications ? `${$apiPath}/applications?size=0&shared=false&requestedPublicationSites=${sitesFilter.value}&facets=requestedPublicationSites` : null)
const reusesPublicationsFetch = useFetch<PortalsRes>(() => canAdminDep.value && $uiConfig.portalsIntegration ? `${$sitePath}/portals-manager/api/reuses?size=0` : null)
const datasetsDraftFetch = useFetch<{ count: number }>(() => canContribDep.value ? `${$apiPath}/datasets?size=0&shared=false&draftStatus=${draftStatuses}` : null)

// lines declared by another service (customers...), same "can" values as extraNavigationItems
const can: Record<string, typeof canContrib> = { contrib: canContrib, admin: canAdmin, contribDep: canContribDep, adminDep: canAdminDep }
const extraItems = ($uiConfig.extraTodoItems ?? []).map(extra => ({
  extra,
  fetch: useFetch<Record<string, any>>(() => !extra.can || can[extra.can]?.value ? extra.url : null)
}))

const requestedSitesQuery = (res?: FacetsRes | null) => ({ requestedPublicationSites: res?.facets.requestedPublicationSites.map(f => f.value).join(',') })

// the fullest of the stored and indexed spaces, a line from 80 %
const storagePercent = computed(() => {
  if (!limits) return
  const percent = Math.max(0, ...['store_bytes', 'indexed_bytes'].filter(k => limits[k]?.limit > 0).map(k => Math.round(100 * limits[k].consumption / limits[k].limit)))
  return percent >= 80 ? percent : 0
})

// failures and quotas first, then publications to validate grouped by kind, then people waiting on you, drafts
const lines = computed(() => {
  const lines: (Line & { active: boolean })[] = [
    { key: 'datasetsError', active: canContribDep.value, count: datasetsErrorFetch.data.value?.count, icon: mdiAlertCircle, color: 'error', to: { path: '/datasets', query: { status: 'error' } }, title: '' },
    { key: 'processingsError', active: canAdminDep.value && !!$uiConfig.processingsIntegration, count: processingsErrorFetch.data.value?.count, icon: mdiCogTransferOutline, color: 'error', to: '/processings', title: '' },
    { key: 'storage', active: canContrib.value, count: storagePercent.value, icon: mdiHarddisk, color: 'warning', to: '/storage', title: '' },
    { key: 'datasetsPublications', active: canAdminDep.value && !!sitesFilter.value, count: datasetsPublicationsFetch.data.value?.count, icon: mdiShareVariant, color: 'warning', to: { path: '/datasets', query: requestedSitesQuery(datasetsPublicationsFetch.data.value) }, title: '' },
    { key: 'applicationsPublications', active: canAdminDep.value && !!sitesFilter.value && !$uiConfig.disableApplications, count: applicationsPublicationsFetch.data.value?.count, icon: mdiImageMultiple, color: 'warning', to: { path: '/applications', query: requestedSitesQuery(applicationsPublicationsFetch.data.value) }, title: '' },
    { key: 'reusesPublications', active: canAdminDep.value && !!$uiConfig.portalsIntegration, count: sum(reusesPublicationsFetch.data.value?.facets.requestedPortals), icon: mdiPageNext, color: 'warning', to: '/reuses', title: '' },
    { key: 'pagesPublications', active: canAdminDep.value && !!$uiConfig.portalsIntegration, count: sum(pagesFacets?.requestedPortals), icon: mdiViewDashboardEdit, color: 'warning', to: '/pages', title: '' },
    ...extraItems.map(({ extra, fetch }) => ({
      key: extra.id,
      active: !extra.can || !!can[extra.can]?.value,
      count: (extra.countPath ?? 'count').split('.').reduce((obj: any, k) => obj?.[k], fetch.data.value) as number | undefined,
      icon: extra.icon ?? mdiFaceAgent,
      color: 'accent',
      href: extra.href,
      title: typeof extra.title === 'string' ? extra.title : (extra.title[locale.value] ?? extra.title.fr)
    })),
    { key: 'datasetsDraft', active: canContribDep.value, count: datasetsDraftFetch.data.value?.count, icon: mdiFileDocumentEdit, color: 'warning', to: { path: '/datasets', query: { draftStatus: draftStatuses } }, title: '' }
  ]
  return lines.filter(line => line.active)
})

const items = computed(() => lines.value
  .filter(line => line.count)
  .map(line => {
    const title = line.title || t(line.key, { n: line.count }, line.count!)
    // the storage line carries its percentage in its title
    return { ...line, title, label: line.key === 'storage' ? title : `${line.count} · ${title}` }
  }))

// a failed fetch counts as loaded, so a missing service does not leave the card loading forever
const fetches = [datasetsErrorFetch, processingsErrorFetch, datasetsPublicationsFetch, applicationsPublicationsFetch, reusesPublicationsFetch, datasetsDraftFetch, ...extraItems.map(e => e.fetch)]
const loaded = computed(() => fetches.every(f => !f.loading.value))
</script>

<style>
.dashboard-todo-item { border-left: 4px solid transparent; }
.dashboard-todo-item + .dashboard-todo-item { border-top: thin solid rgba(var(--v-border-color), var(--v-border-opacity)); }
</style>
