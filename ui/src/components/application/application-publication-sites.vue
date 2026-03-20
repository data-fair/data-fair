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
                :model-value="isPublished(site)"
                :disabled="!can('writePublicationSites')"
                color="primary"
                hide-details
                density="compact"
                @update:model-value="(val: boolean | null) => togglePublish(site, !!val)"
              />
            </template>
          </v-list-item>
        </v-list>
      </v-card>
    </template>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  noPublicationSite: Aucun portail de publication n'est configuré.
  publishThisApp: Publiez cette application sur vos portails.
en:
  noPublicationSite: No publication site is configured.
  publishThisApp: Publish this application on your portals.
</i18n>

<script lang="ts" setup>
import useApplicationStore from '~/composables/application-store'

const { t } = useI18n()
const { application, can, patch } = useApplicationStore()

const owner = computed(() => application.value?.owner)
const publicationSitesFetch = useFetch<any[]>(() => {
  if (!owner.value) return null
  return `${$apiPath}/settings/${owner.value.type}/${owner.value.id}/publication-sites`
}, { immediate: true })

const publicationSites = computed(() => publicationSitesFetch.data.value ?? [])

const isPublished = (site: any) => {
  return application.value?.publicationSites?.includes(`${site.type}:${site.id}`) ?? false
}

const togglePublish = async (site: any, publish: boolean) => {
  if (!application.value) return
  const siteKey = `${site.type}:${site.id}`
  const currentSites = application.value.publicationSites || []
  const newSites = publish
    ? [...currentSites, siteKey]
    : currentSites.filter((s: string) => s !== siteKey)
  await patch({ publicationSites: newSites })
  application.value.publicationSites = newSites
}
</script>
