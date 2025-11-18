<template>
  <v-container
    v-if="dataset && publicationSitesFetch.data.value"
    fluid
  >
    <p
      v-if="!publicationSitesFetch.data.value.length"
      class="mb-2"
    >
      {{ t('noPublicationSite') }}
    </p>
    <template v-else>
      <p class="mb-2">
        {{ t('publishThisDataset') }}
      </p>

      <v-card
        tile
        border
      >
        <v-list>
          <v-list-item
            v-for="(site,i) in publicationSites"
            :key="i"
          >
            <v-list-item-title>
              <a
                class="simple-link"
                :href="site.datasetUrlTemplate && dataset.publicationSites?.includes(`${site.type}:${site.id}`) ? site.datasetUrlTemplate.replace('{id}', dataset.id).replace('{slug}', dataset.slug ?? dataset.id) : site.url"
                target="_blank"
              >{{ site.title || site.url || site.id }}</a>
              <span v-if="site.department"> - {{ site.departmentName || site.department }}</span>
              <span
                v-if="toggleRequestedPublicationSitesStatus(site) === 'disabled'"
                class="text-info"
              > - {{ t('publicationRequested') }}</span>
              <v-tooltip
                v-if="hasWarning(site) || sitesContribPermissionsRisk[`${site.type}:${site.id}`]"
              >
                <template #activator="{props}">
                  <v-icon
                    v-bind="props"
                    :icon="mdiAlert"
                    color="warning"
                    class="ml-4"
                  />
                </template>
                <p
                  v-if="hasWarning(site)"
                >
                  {{ t('hasWarning') }}{{ sitesWarnings[`${site.type}:${site.id}`].map(w => t('warning.' + w)).join(', ') }}
                </p>
                <span
                  v-if="sitesContribPermissionsRisk[`${site.type}:${site.id}`]"
                >
                  {{ t('contribPermission') }}
                </span>
              </v-tooltip>
            </v-list-item-title>

            <v-list-item-subtitle>
              <v-switch
                v-if="togglePublicationSitesStatus(site) !== 'hidden'"
                hide-details
                density="compact"
                :model-value="dataset.publicationSites?.includes(`${site.type}:${site.id}`)"
                :disabled="togglePublicationSitesStatus(site) === 'disabled'"
                :label="t('published')"
                class="mt-0 ml-6"
                color="primary"
                @update:model-value="togglePublicationSites(site)"
              />
              <v-switch
                v-if="toggleRequestedPublicationSitesStatus(site) === 'visible'"
                hide-details
                density="compact"
                :model-value="dataset.requestedPublicationSites?.includes(`${site.type}:${site.id}`)"
                :disabled="toggleRequestedPublicationSitesStatus(site) === 'disabled'"
                :label="t('publicationRequested')"
                class="mt-0 ml-6"
                @update:model-value="toggleRequestedPublicationSites(site)"
              />
            </v-list-item-subtitle>
          </v-list-item>
        </v-list>
      </v-card>
    </template>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  noPublicationSite: Vous n'avez pas configuré de portail sur lequel publier ce jeu de données.
  publishThisDataset: Publiez ce jeu de données sur un ou plusieurs de vos portails.
  published: publié
  publicationRequested: publication demandée
  hasWarning: "métadonnées manquantes : "
  warning:
    title: titre
    summary: résumé
    description: description
    topics: thématique
    license: licence
    temporal: couverture temporelle
    spatial: couverture géographique
    keywords: mot clé
    frequency: fréquence des mises à jour
    creator: personne ou organisme créateur
    modified: date de dernière modification de la source
  contribPermission: permission trop large accordée aux contributeurs (risque de rupture de compatibilité)
en:
  noPublicationSite: You haven't configured a portal to publish this dataset on.
  publishThisDataset: Publish this dataset on one or more of your portals.
  published: published
  publicationRequested: publication requested
  hasWarning: "missing metadata : "
  warning:
    title: title
    summary: summary
    description: description
    topics: topic
    license: license
    temporal: temporal coverage
    smissingSpatial: spatial coverage
    keywords: keyword
    frequency: update frequency
    creator: creator person or entity
    modified: date of last modification of the source
  contribPermission: too broad permission granted to contribs (risk of compatibility breakage)
</i18n>

<script lang="ts" setup>
import type { Dataset, Permission, PublicationSite } from '#api/types'
import { mdiAlert } from '@mdi/js'
import permissionsUtils from '~/utils/permissions'

const { id, dataset, patchDataset, can } = useDatasetStore()
const { account } = useSessionAuthenticated()
const { t } = useI18n()

const permissionsFetch = useFetch<Permission[]>($apiPath + `/datasets/${id}/permissions`)
const settingsPath = computed(() => {
  return `${dataset.value?.owner.type}/${dataset.value?.owner.id}${encodeURIComponent(':*')}`
})
const publicationSitesFetch = useFetch<PublicationSite[]>(() => $apiPath + `/settings/${settingsPath.value}/publication-sites`, { immediate: false, watch: false })
watch(dataset, () => {
  if (dataset.value) publicationSitesFetch.refresh()
})
const publicationSites = computed(() => {
  const publicationSites = [...publicationSitesFetch.data.value ?? []]
  publicationSites.sort((ps1, ps2) => {
    if (dataset.value?.owner.department && dataset.value?.owner.department === ps1.department && ps1.department !== ps2.department) {
      return -1
    }
    if (dataset.value?.owner.department && dataset.value?.owner.department === ps2.department && ps1.department !== ps2.department) {
      return 1
    }
    if (!dataset.value?.owner.department && !ps1.department && !!ps2.department) return -1
    if (!dataset.value?.owner.department && !!ps1.department && !ps2.department) return 1
    return 0
  })
  return publicationSites
})

const sitesWarnings = computed(() => {
  if (!dataset.value) return {}
  const sitesWarnings: Record<string, (keyof Dataset)[]> = {}
  for (const site of publicationSitesFetch.data.value ?? []) {
    const warnings = sitesWarnings[`${site.type}:${site.id}`] = [] as (keyof Dataset)[]
    const requiredMetadata = (site.settings?.datasetsRequiredMetadata as (keyof Dataset)[]) || []
    for (const m of requiredMetadata) {
      if (m === 'temporal') {
        if (!(dataset.value.temporal && dataset.value.temporal.start)) warnings.push(m)
      } else if (m === 'keywords') {
        if (!(dataset.value.keywords && dataset.value.keywords.length)) warnings.push(m)
      } else if (m === 'topics') {
        if (!(dataset.value.topics && dataset.value.topics.length)) warnings.push(m)
      } else if (m === 'title') {
        if (!(dataset.value.title && dataset.value.title.length > 3)) warnings.push(m)
      } else if (m === 'summary') {
        if (!(dataset.value.summary && dataset.value.summary.length > 10)) warnings.push(m)
      } else if (m === 'description') {
        if (!(dataset.value.description && dataset.value.description.length > 10)) warnings.push(m)
      } else {
        if (!dataset.value[m]) warnings.push(m)
      }
    }
  }
  return sitesWarnings
})

const hasWarning = (site: PublicationSite) => {
  return sitesWarnings.value[`${site.type}:${site.id}`]?.length
}

const sitesContribPermissionsRisk = computed(() => {
  const permissions = permissionsFetch.data.value
  const d = dataset.value
  if (!permissions || !d) return {}
  const sitesContribPermissionsRisk: Record<string, boolean> = {}
  for (const site of publicationSitesFetch.data.value ?? []) {
    if (!site.settings?.staging && permissions.find(p => permissionsUtils.isContribWriteAllPermission(p, d))) {
      sitesContribPermissionsRisk[`${site.type}:${site.id}`] = true
    }
  }
  return sitesContribPermissionsRisk
})

const togglePublicationSites = (site: PublicationSite) => {
  const siteKey = `${site.type}:${site.id}`
  let publicationSites = [...dataset.value!.publicationSites ?? []]
  let requestedPublicationSites = [...dataset.value!.requestedPublicationSites ?? []]
  if (publicationSites.includes(siteKey)) {
    publicationSites = publicationSites.filter(s => s !== siteKey)
  } else {
    publicationSites.push(siteKey)
    requestedPublicationSites = requestedPublicationSites.filter(s => s !== siteKey)
  }
  patchDataset.execute({ publicationSites, requestedPublicationSites })
}

const toggleRequestedPublicationSites = (site: PublicationSite) => {
  const siteKey = `${site.type}:${site.id}`
  let requestedPublicationSites = [...dataset.value!.requestedPublicationSites ?? []]
  if (requestedPublicationSites.includes(siteKey)) {
    requestedPublicationSites = requestedPublicationSites.filter(s => s !== siteKey)
  } else {
    requestedPublicationSites.push(siteKey)
  }
  patchDataset.execute({ requestedPublicationSites })
}

const canPublish = (site: PublicationSite) => {
  const warnings = sitesWarnings.value[`${site.type}:${site.id}`]
  return warnings && warnings.length === 0 && can('writePublicationSites') && (!account.value.department || account.value.department === site.department)
}

const togglePublicationSitesStatus = (site: PublicationSite) => {
  const canToggle = (canPublish(site) || site.settings?.staging) && can('writeDescription')
  if (dataset.value?.publicationSites?.includes(`${site.type}:${site.id}`)) {
    if (!canToggle) return 'disabled'
    return 'visible'
  } else {
    if (!canToggle) return 'hidden'
    if (hasWarning(site) || sitesContribPermissionsRisk.value[`${site.type}:${site.id}`]) return 'disabled'
    return 'visible'
  }
}

const toggleRequestedPublicationSitesStatus = (site: PublicationSite) => {
  if (dataset.value?.publicationSites?.includes(`${site.type}:${site.id}`)) return 'hidden'

  const canTogglePs = (canPublish(site) || site.settings?.staging) && can('writeDescription')

  if (dataset.value?.requestedPublicationSites?.includes(`${site.type}:${site.id}`)) {
    if (canTogglePs) return 'disabled'
    if (can('writeDescription')) return 'visible'
  } else {
    if (!canTogglePs && can('writeDescription')) return 'visible'
    return 'hidden'
  }
}
</script>

<style lang="css" scoped>
</style>
