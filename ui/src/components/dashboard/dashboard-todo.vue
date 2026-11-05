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
    <!-- never claim everything is fine when a check could not run -->
    <v-card-text
      v-else-if="loaded && failed"
      class="d-flex align-center ga-2 text-medium-emphasis"
    >
      <v-icon :icon="mdiAlertCircleOutline" />
      {{ t('checksFailed') }}
    </v-card-text>
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
  checksFailed: Certaines vérifications n'ont pas abouti.
  datasetsError: Jeu de données en erreur | Jeux de données en erreur
  processingsError: Traitement en erreur | Traitements en erreur
  storage: Espace de stockage rempli à {n} %
  datasetsPublications: Publication de jeu de données à valider | Publications de jeux de données à valider
  applicationsPublications: Publication d'application à valider | Publications d'applications à valider
  reusesPublications: Publication de réutilisation à valider | Publications de réutilisations à valider
  pagesPublications: Publication de page à valider | Publications de pages à valider
  datasetsDraft: Brouillon de jeu de données à valider | Brouillons de jeux de données à valider
en:
  title: To do
  subtitle: What needs your attention
  see: See
  upToDate: Nothing to do, everything is up to date.
  checksFailed: Some checks could not complete.
  datasetsError: Dataset in error | Datasets in error
  processingsError: Processing in error | Processings in error
  storage: Storage space {n} % full
  datasetsPublications: Dataset publication to validate | Dataset publications to validate
  applicationsPublications: Application publication to validate | Application publications to validate
  reusesPublications: Reuse publication to validate | Reuse publications to validate
  pagesPublications: Page publication to validate | Page publications to validate
  datasetsDraft: Draft dataset to validate | Draft datasets to validate
</i18n>

<script setup lang="ts">
import {
  mdiClipboardCheckOutline, mdiChevronRight, mdiCheckCircle, mdiAlertCircle, mdiAlertCircleOutline, mdiFileDocumentEdit, mdiShareVariant,
  mdiImageMultiple, mdiCogTransferOutline, mdiFaceAgent, mdiHarddisk, mdiPageNext, mdiViewDashboardEdit
} from '@mdi/js'
import type { RouteLocationRaw } from 'vue-router'
import type { Ref } from 'vue'
import { usePermissions } from '~/composables/use-permissions'
import { resolveTitle } from '~/composables/layout/use-navigation-items'
import type { PublicationSite } from './dashboard-portals.vue'

const { limits, publicationSites, sharedFetches } = defineProps<{
  limits?: Record<string, { consumption: number, limit: number }>
  publicationSites?: PublicationSite[]
  // the fetches of the parent this card depends on
  sharedFetches: { loading: Readonly<Ref<boolean>>, error: Readonly<Ref<unknown>> }[]
}>()

const { t, locale } = useI18n()
const { canContrib, canAdmin, canContribDep, canAdminDep } = usePermissions()

type Line = { key: string, title?: string, icon: string, color: string, count?: number, to?: RouteLocationRaw, href?: string }
type FacetsRes = { count: number, facets: Record<string, { value: string }[]> }
type PortalsRes = { facets: { requestedPortals: Record<string, number> } }

const sitesFilter = computed(() => publicationSites?.map(p => `${p.type}:${p.id}`).join(','))
const sum = (counts?: Record<string, number>) => counts && Object.values(counts).reduce((a, b) => a + b, 0)

const datasetsErrorFetch = useFetch<{ count: number }>(() => canContribDep.value ? `${$apiPath}/datasets?size=0&shared=false&status=error` : null)
// the facet stays per status whatever the filters, "count" only follows them through a shallow copy in the processings router
const processingsErrorFetch = useFetch<{ facets: { statuses: Record<string, number> } }>(() => canAdminDep.value && $uiConfig.processingsIntegration ? `${$sitePath}/processings/api/v1/processings?size=0` : null, { notifError: false })
const datasetsPublicationsFetch = useFetch<FacetsRes>(() => canAdminDep.value && sitesFilter.value ? `${$apiPath}/datasets?size=0&shared=false&requestedPublicationSites=${sitesFilter.value}&facets=requestedPublicationSites` : null)
const applicationsPublicationsFetch = useFetch<FacetsRes>(() => canAdminDep.value && sitesFilter.value && !$uiConfig.disableApplications ? `${$apiPath}/applications?size=0&shared=false&requestedPublicationSites=${sitesFilter.value}&facets=requestedPublicationSites` : null)
// another service down must not raise a toast on the home page: its line just stays hidden
const reusesPublicationsFetch = useFetch<PortalsRes>(() => canAdminDep.value && $uiConfig.portalsIntegration ? `${$sitePath}/portals-manager/api/reuses?size=0` : null, { notifError: false })
const pagesPublicationsFetch = useFetch<PortalsRes>(() => canAdminDep.value && $uiConfig.portalsIntegration ? `${$sitePath}/portals-manager/api/pages?size=0` : null, { notifError: false })
// a finalized draft is the one waiting for validation
const datasetsDraftFetch = useFetch<{ count: number }>(() => canContribDep.value ? `${$apiPath}/datasets?size=0&shared=false&draftStatus=finalized` : null)

// lines declared by another service (customers...), same "can" values as extraNavigationItems
const can: Record<string, typeof canContrib> = { contrib: canContrib, admin: canAdmin, contribDep: canContribDep, adminDep: canAdminDep }
const extraItems = ($uiConfig.extraTodoItems ?? []).map(extra => ({
  extra,
  fetch: useFetch<Record<string, any>>(() => !extra.can || can[extra.can]?.value ? extra.url : null, { notifError: false })
}))

// only the known sites: the facet also lists the other sites requested by the same resources
const requestedSitesQuery = (res?: FacetsRes | null) => ({ requestedPublicationSites: res?.facets.requestedPublicationSites.map(f => f.value).filter(v => sitesFilter.value?.split(',').includes(v)).join(',') })

const requestedPortalsLink = (path: string, res?: PortalsRes | null) => ({ path, query: { requestedPortal: Object.keys(res?.facets.requestedPortals ?? {}).join(',') } })

// the fullest of the stored and indexed spaces, a line from 80 %
const storagePercent = computed(() => {
  if (!limits) return
  const percent = Math.max(0, ...['store_bytes', 'indexed_bytes'].filter(k => limits[k]?.limit > 0).map(k => Math.round(100 * limits[k].consumption / limits[k].limit)))
  return percent >= 80 ? percent : 0
})

// failures and quotas first, then publications to validate grouped by kind, then people waiting on you, drafts
const items = computed(() => {
  const lines: Line[] = [
    { key: 'datasetsError', count: datasetsErrorFetch.data.value?.count, icon: mdiAlertCircle, color: 'error', to: { path: '/datasets', query: { status: 'error' } } },
    { key: 'processingsError', count: processingsErrorFetch.data.value?.facets.statuses.error, icon: mdiCogTransferOutline, color: 'error', to: { path: '/processings', query: { status: 'error' } } },
    { key: 'storage', count: storagePercent.value, icon: mdiHarddisk, color: 'warning', to: '/storage' },
    { key: 'datasetsPublications', count: datasetsPublicationsFetch.data.value?.count, icon: mdiShareVariant, color: 'warning', to: { path: '/datasets', query: requestedSitesQuery(datasetsPublicationsFetch.data.value) } },
    { key: 'applicationsPublications', count: applicationsPublicationsFetch.data.value?.count, icon: mdiImageMultiple, color: 'warning', to: { path: '/applications', query: requestedSitesQuery(applicationsPublicationsFetch.data.value) } },
    { key: 'reusesPublications', count: sum(reusesPublicationsFetch.data.value?.facets.requestedPortals), icon: mdiPageNext, color: 'warning', to: requestedPortalsLink('/reuses', reusesPublicationsFetch.data.value) },
    { key: 'pagesPublications', count: sum(pagesPublicationsFetch.data.value?.facets.requestedPortals), icon: mdiViewDashboardEdit, color: 'warning', to: requestedPortalsLink('/pages', pagesPublicationsFetch.data.value) },
    ...extraItems.map(({ extra, fetch }) => ({
      key: extra.id,
      count: (extra.countPath ?? 'count').split('.').reduce((obj: any, k) => obj?.[k], fetch.data.value) as number | undefined,
      icon: extra.icon ?? mdiFaceAgent,
      color: 'accent',
      to: extra.to,
      href: extra.href,
      title: resolveTitle(extra.title, locale.value)
    })),
    { key: 'datasetsDraft', count: datasetsDraftFetch.data.value?.count, icon: mdiFileDocumentEdit, color: 'warning', to: { path: '/datasets', query: { draftStatus: 'finalized' } } }
  ]
  // a line without permission or integration has no fetch, so no count
  return lines.filter(line => line.count).map(line => {
    const title = line.title || t(line.key, { n: line.count }, line.count!)
    // the storage line carries its percentage in its title
    return { ...line, title, label: line.key === 'storage' ? title : `${line.count} · ${title}` }
  })
})

// a failed fetch counts as loaded, so a missing service does not leave the card loading forever
const fetches = [...sharedFetches, datasetsErrorFetch, processingsErrorFetch, datasetsPublicationsFetch, applicationsPublicationsFetch, reusesPublicationsFetch, pagesPublicationsFetch, datasetsDraftFetch, ...extraItems.map(e => e.fetch)]
const loaded = computed(() => fetches.every(f => !f.loading.value))
const failed = computed(() => fetches.some(f => f.error.value))
</script>

<style>
.dashboard-todo-item { border-left: 4px solid transparent; }
.dashboard-todo-item + .dashboard-todo-item { border-top: thin solid rgba(var(--v-border-color), var(--v-border-opacity)); }
</style>
