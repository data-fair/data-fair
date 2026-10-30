<template>
  <v-card>
    <v-card-item>
      <v-card-title class="d-flex align-center ga-2">
        <v-icon
          :icon="mdiWeb"
          color="primary"
        />
        {{ t('title') }}
      </v-card-title>
    </v-card-item>
    <v-list
      density="compact"
      lines="two"
      class="pt-0"
    >
      <v-list-item
        v-for="site in sites"
        :key="site.key"
        :title="site.title || site.host"
        :subtitle="site.subtitle"
        :prepend-gap="12"
      >
        <!-- the site favicon, a globe when it cannot load -->
        <template #prepend>
          <img
            v-if="!brokenFavicons.has(site.key)"
            :src="site.favicon"
            alt=""
            width="24"
            height="24"
            @error="brokenFavicons.add(site.key)"
          >
          <v-icon
            v-else
            :icon="mdiWeb"
            color="primary"
          />
        </template>
        <template #append>
          <v-btn
            :icon="mdiOpenInNew"
            :href="site.url"
            :title="t('open', { title: site.title || site.host })"
            target="_blank"
            variant="text"
            color="primary"
            size="small"
          />
        </template>
      </v-list-item>
    </v-list>
  </v-card>
</template>

<i18n lang="yaml">
fr:
  title: Vos portails
  open: Ouvrir {title} (nouvelle fenêtre)
  pages: aucune page | 1 page | {n} pages
  datasets: aucun jeu | 1 jeu | {n} jeux
en:
  title: Your portals
  open: Open {title} (new window)
  pages: no page | 1 page | {n} pages
  datasets: no dataset | 1 dataset | {n} datasets
</i18n>

<script lang="ts">
export type PublicationSite = { type: string, id: string, title?: string, url?: string }
</script>

<script setup lang="ts">
import { mdiWeb, mdiOpenInNew } from '@mdi/js'

const { publicationSites, pagesFacets } = defineProps<{
  publicationSites: PublicationSite[]
  pagesFacets?: { portals: Record<string, number> }
}>()

const { t } = useI18n()

const brokenFavicons = reactive(new Set<string>())

const datasetsFetch = useFetch<{ facets: { publicationSites: { value: string, count: number }[] } }>(`${$apiPath}/datasets?size=0&shared=false&facets=publicationSites`)

// sites without url cannot be opened
const sites = computed(() => publicationSites.filter(site => site.url).map(site => {
  const key = `${site.type}:${site.id}`
  const nbDatasets = datasetsFetch.data.value?.facets.publicationSites.find(f => f.value === key)?.count ?? 0
  // pages are counted per portal id, the id of a "data-fair-portals" publication site
  const nbPages = site.type === 'data-fair-portals' && pagesFacets ? pagesFacets.portals[site.id] ?? 0 : undefined
  const host = new URL(site.url!).host
  return {
    key,
    title: site.title,
    url: site.url,
    host,
    favicon: new URL('/favicon.ico', site.url).href,
    subtitle: [host, nbPages !== undefined && t('pages', nbPages), t('datasets', nbDatasets)].filter(Boolean).join(' · ')
  }
}))
</script>
