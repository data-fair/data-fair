<template>
  <v-container v-if="application && publicationSitesFetch.data.value">
    <p
      v-if="!publicationSitesFetch.data.value.length"
      class="mb-2"
    >
      {{ t('noPublicationSite') }}
    </p>
    <template v-else>
      <p class="mb-2">
        {{ t('publishThisApp') }}
      </p>
      <v-card
        rounded="0"
        border
      >
        <v-list>
          <v-list-item
            v-for="(site, i) in publicationSites"
            :key="i"
          >
            <v-list-item-title>
              <a
                class="simple-link"
                :href="site.applicationUrlTemplate && isPublished(site) ? site.applicationUrlTemplate.replace('{id}', application.id).replace('{slug}', application.slug ?? application.id) : site.url"
                target="_blank"
              >{{ site.title || site.url || site.id }}</a>
            </v-list-item-title>
            <template #append>
              <v-switch
                v-if="canPublish(site) || isPublished(site)"
                :model-value="isPublished(site)"
                :disabled="!canPublish(site)"
                :label="t('published')"
                color="primary"
                hide-details
                density="compact"
                @update:model-value="(val: boolean | null) => togglePublish(site, !!val)"
              />
              <v-switch
                v-else-if="canRequestPublication(site) && !isPublished(site)"
                :model-value="isRequested(site)"
                :label="t('publicationRequested')"
                color="primary"
                hide-details
                density="compact"
                @update:model-value="(val: boolean | null) => toggleRequested(site, !!val)"
              />
            </template>
          </v-list-item>
        </v-list>
      </v-card>

      <v-switch
        :model-value="application.preferLargeDisplay"
        :label="t('preferLargeDisplay')"
        class="mx-4 mt-4"
        @update:model-value="(val: boolean | null) => patch({ preferLargeDisplay: !!val })"
      />
    </template>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  noPublicationSite: Aucun portail de publication n'est configure.
  publishThisApp: Publiez cette application sur vos portails.
  published: publie
  publicationRequested: publication demandee
  preferLargeDisplay: privilegier un rendu large
en:
  noPublicationSite: No publication site is configured.
  publishThisApp: Publish this application on your portals.
  published: published
  publicationRequested: publication requested
  preferLargeDisplay: prefer a large display
</i18n>

<script lang="ts" setup>
import useApplicationStore from '~/composables/application/store'

const { t } = useI18n()
const { application, can, patch } = useApplicationStore()
const { account } = useSessionAuthenticated()

const owner = computed(() => application.value?.owner)
const publicationSitesFetch = useFetch<any[]>(() => {
  if (!owner.value) return null
  return `${$apiPath}/settings/${owner.value.type}/${owner.value.id}/publication-sites`
}, { immediate: true })

const publicationSites = computed(() => publicationSitesFetch.data.value ?? [])

const isPublished = (site: any) => {
  return application.value?.publicationSites?.includes(`${site.type}:${site.id}`) ?? false
}

const isRequested = (site: any) => {
  return application.value?.requestedPublicationSites?.includes(`${site.type}:${site.id}`) ?? false
}

const canPublish = (site: any) => {
  if (!can('writePublicationSites')) return false
  return !account.value?.department || account.value.department === site.department
}

const canRequestPublication = (_site: any) => {
  return can('writeDescription')
}

const togglePublish = async (site: any, publish: boolean) => {
  if (!application.value) return
  const siteKey = `${site.type}:${site.id}`
  const currentSites = application.value.publicationSites || []
  const currentRequested = application.value.requestedPublicationSites || []
  const newSites = publish
    ? [...currentSites, siteKey]
    : currentSites.filter((s: string) => s !== siteKey)
  const newRequested = currentRequested.filter((s: string) => s !== siteKey)
  await patch({ publicationSites: newSites, requestedPublicationSites: newRequested })
  application.value.publicationSites = newSites
  application.value.requestedPublicationSites = newRequested
}

const toggleRequested = async (site: any, requested: boolean) => {
  if (!application.value) return
  const siteKey = `${site.type}:${site.id}`
  const currentRequested = application.value.requestedPublicationSites || []
  const newRequested = requested
    ? [...currentRequested, siteKey]
    : currentRequested.filter((s: string) => s !== siteKey)
  await patch({ requestedPublicationSites: newRequested })
  application.value.requestedPublicationSites = newRequested
}
</script>
