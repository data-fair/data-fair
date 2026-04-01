<template>
  <v-container
    v-if="application && publicationSitesFetch.data.value"
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
                :href="site.url"
                target="_blank"
              >{{ site.title || site.url || site.id }}</a>
            </v-list-item-title>
            <v-list-item-subtitle
              v-if="application.owner.department"
              class="mb-2"
            >
              <span>{{ application.owner.name }}</span>
              <span v-if="site.department"> - {{ site.departmentName || site.department }}</span>
            </v-list-item-subtitle>
            <v-list-item-subtitle
              v-if="site.applicationUrlTemplate && isPublished(site)"
              class="mb-2"
            >
              <a
                :href="site.applicationUrlTemplate.replace('{id}', application.id).replace('{slug}', application.slug ?? application.id)"
                target="_blank"
              >
                {{ site.applicationUrlTemplate.replace('{id}', application.id).replace('{slug}', application.slug ?? application.id) }}
              </a>
            </v-list-item-subtitle>

            <v-list-item-subtitle>
              <v-switch
                hide-details
                density="compact"
                :model-value="isPublished(site)"
                :disabled="(!canPublish(site) && !site.settings?.staging) || !canRequestPublication(site)"
                :label="t('published')"
                class="mt-0 ml-6"
                color="primary"
                @update:model-value="(val: boolean | null) => togglePublish(site, !!val)"
              />
              <v-switch
                v-if="application.owner.type === 'organization' && !site.settings?.staging && !isPublished(site)"
                hide-details
                density="compact"
                :model-value="isRequested(site)"
                :disabled="isPublished(site) || canPublish(site) || !canRequestPublication(site)"
                :label="t('publicationRequested')"
                class="mt-0 ml-6"
                @update:model-value="(val: boolean | null) => toggleRequested(site, !!val)"
              />
            </v-list-item-subtitle>
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
  noPublicationSite: Vous n'avez pas configuré de portail sur lequel publier cette application.
  publishThisApp: Publiez cette application sur un ou plusieurs de vos portails.
  published: publié
  publicationRequested: publication demandée par un contributeur
  preferLargeDisplay: privilégier un rendu large
en:
  noPublicationSite: You haven't configured a portal to publish this application on.
  publishThisApp: Publish this application on one or more of your portals.
  published: published
  publicationRequested: publication requested by a contributor
  preferLargeDisplay: prefer a large display
</i18n>

<script setup lang="ts">
import useApplicationStore from '~/composables/application/store'

const { t } = useI18n()
const { application, can, patch } = useApplicationStore()
const { account } = useSessionAuthenticated()

const owner = computed(() => application.value?.owner)
const publicationSitesFetch = useFetch<any[]>(() => {
  if (!owner.value) return null
  let path = `${$apiPath}/settings/${owner.value.type}/${owner.value.id}`
  if (owner.value.department) path += ':' + owner.value.department
  path += '/publication-sites'
  return path
}, { immediate: true })

const publicationSites = computed(() => {
  const sites = [...(publicationSitesFetch.data.value ?? [])]
  sites.sort((ps1, ps2) => {
    if (owner.value?.department && owner.value.department === ps1.department && ps1.department !== ps2.department) return -1
    if (owner.value?.department && owner.value.department === ps2.department && ps1.department !== ps2.department) return 1
    if (!owner.value?.department && !ps1.department && !!ps2.department) return -1
    if (!owner.value?.department && !!ps1.department && !ps2.department) return 1
    return 0
  })
  return sites
})

const isPublished = (site: any) => {
  return application.value?.publicationSites?.includes(`${site.type}:${site.id}`) ?? false
}

const isRequested = (site: any) => {
  return application.value?.requestedPublicationSites?.includes(`${site.type}:${site.id}`) ?? false
}

const canPublish = (site: any) => {
  return can('writePublicationSites') && (!account.value?.department || account.value.department === site.department)
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
