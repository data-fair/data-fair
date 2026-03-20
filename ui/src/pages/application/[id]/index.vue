<template>
  <v-container v-if="application">
    <v-row class="application">
      <v-col>
        <template
          v-for="section in sections"
          :key="section.id"
        >
          <!-- Metadata section -->
          <layout-section-tabs
            v-if="section.id === 'metadata'"
            :id="section.id"
            :min-height="300"
            :title="section.title"
            :tabs="section.tabs"
          >
            <template #content="{ tab }">
              <v-tabs-window :model-value="tab">
                <v-tabs-window-item value="info">
                  <v-container fluid>
                    <v-row>
                      <v-col
                        cols="12"
                        md="6"
                      >
                        <div class="text-h6 mb-2">
                          {{ application.title }}
                        </div>
                        <p
                          v-if="application.description"
                          class="text-body-2"
                        >
                          {{ application.description }}
                        </p>
                      </v-col>
                      <v-col
                        cols="12"
                        md="6"
                      >
                        <v-list density="compact">
                          <v-list-item v-if="baseAppFetch.data.value">
                            <template #prepend>
                              <v-icon>mdi-image</v-icon>
                            </template>
                            <v-list-item-title>
                              {{ baseAppFetch.data.value.title || application.url }}
                              <span v-if="baseAppFetch.data.value.version">
                                — {{ t('version') }} {{ baseAppFetch.data.value.version }}
                              </span>
                            </v-list-item-title>
                          </v-list-item>
                          <v-list-item v-if="application.updatedAt">
                            <template #prepend>
                              <v-icon>mdi-pencil</v-icon>
                            </template>
                            <v-list-item-title>
                              {{ application.updatedBy?.name }} {{ formatDate(application.updatedAt) }}
                            </v-list-item-title>
                          </v-list-item>
                          <v-list-item>
                            <template #prepend>
                              <v-icon>mdi-plus-circle-outline</v-icon>
                            </template>
                            <v-list-item-title>
                              {{ application.createdBy?.name }} {{ formatDate(application.createdAt) }}
                            </v-list-item-title>
                          </v-list-item>
                        </v-list>
                        <v-chip
                          v-for="topic in application.topics"
                          :key="topic.id"
                          size="small"
                          class="mr-1 mb-1"
                        >
                          {{ topic.title }}
                        </v-chip>
                      </v-col>
                    </v-row>
                  </v-container>
                </v-tabs-window-item>

                <v-tabs-window-item value="datasets">
                  <v-container fluid>
                    <v-row v-if="datasets.length">
                      <v-col
                        v-for="dataset in datasets"
                        :key="dataset.id"
                        cols="12"
                        md="6"
                        lg="4"
                      >
                        <v-card :to="`/dataset/${dataset.id}`">
                          <v-card-title class="text-body-1 font-weight-bold">
                            {{ dataset.title || dataset.id }}
                          </v-card-title>
                        </v-card>
                      </v-col>
                    </v-row>
                    <p v-else>
                      {{ t('noDatasets') }}
                    </p>
                  </v-container>
                </v-tabs-window-item>

                <v-tabs-window-item
                  v-if="childrenApps.length"
                  value="children-apps"
                >
                  <v-container fluid>
                    <v-row>
                      <v-col
                        v-for="app in childrenApps"
                        :key="app.id"
                        cols="12"
                        md="6"
                        lg="4"
                      >
                        <v-card :to="`/application/${app.id}`">
                          <v-card-title class="text-body-1 font-weight-bold">
                            {{ app.title || app.id }}
                          </v-card-title>
                        </v-card>
                      </v-col>
                    </v-row>
                  </v-container>
                </v-tabs-window-item>
              </v-tabs-window>
            </template>
          </layout-section-tabs>

          <!-- Render section -->
          <layout-section-tabs
            v-if="section.id === 'render'"
            :id="section.id"
            :min-height="390"
            :title="section.title"
            :tabs="section.tabs"
          >
            <template #content="{ tab }">
              <v-tabs-window :model-value="tab">
                <v-tabs-window-item value="config">
                  <v-container fluid>
                    <v-alert
                      v-if="application.errorMessage"
                      type="error"
                      variant="tonal"
                      class="mb-4"
                    >
                      <p v-html="t('validatedError')" />
                      <p
                        class="mb-0"
                        v-html="application.errorMessage"
                      />
                    </v-alert>
                    <v-btn
                      v-if="can('writeConfig')"
                      :to="`/application/${application.id}/config`"
                      color="primary"
                      class="mb-4"
                    >
                      {{ t('editConfig') }}
                    </v-btn>
                    <v-card
                      variant="outlined"
                      class="pa-0"
                    >
                      <d-frame
                        :src="`${applicationLink}?embed=true`"
                        resize="no"
                      />
                    </v-card>
                  </v-container>
                </v-tabs-window-item>
              </v-tabs-window>
            </template>
          </layout-section-tabs>

          <!-- Share section -->
          <layout-section-tabs
            v-if="section.id === 'share'"
            :id="section.id"
            :min-height="250"
            :title="section.title"
            :tabs="section.tabs"
          >
            <template #content="{ tab }">
              <v-tabs-window :model-value="tab">
                <v-tabs-window-item value="permissions">
                  <v-container fluid>
                    <private-access v-model="application" />
                  </v-container>
                </v-tabs-window-item>

                <v-tabs-window-item value="publication-sites">
                  <application-publication-sites />
                </v-tabs-window-item>
              </v-tabs-window>
            </template>
          </layout-section-tabs>

          <!-- Activity section -->
          <layout-section-tabs
            v-if="section.id === 'activity'"
            :id="section.id"
            :min-height="550"
            :title="section.title"
            :tabs="section.tabs"
          >
            <template #content="{ tab }">
              <v-tabs-window :model-value="tab">
                <v-tabs-window-item value="journal">
                  <v-container
                    fluid
                    class="pa-0"
                  >
                    <journal-view
                      v-if="journal"
                      :journal="journal"
                      type="application"
                    />
                  </v-container>
                </v-tabs-window-item>
              </v-tabs-window>
            </template>
          </layout-section-tabs>
        </template>
      </v-col>
    </v-row>

    <df-navigation-right>
      <application-actions />
      <layout-toc :sections="sections" />
    </df-navigation-right>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  applications: Applications
  info: Informations
  datasets: Jeux de données
  noDatasets: Aucun jeu de données utilisé.
  childrenApps: Applications utilisées
  metadata: Métadonnées
  render: Rendu
  config: Configuration
  editConfig: Éditer la configuration
  validatedError: "Erreur dans la <b>version validée</b>"
  share: Partage
  permissions: Permissions
  publicationSites: Portails
  activity: Activité
  journal: Journal
  version: version
en:
  applications: Applications
  info: Information
  datasets: Datasets
  noDatasets: No datasets used.
  childrenApps: Used applications
  metadata: Metadata
  render: Render
  config: Configuration
  editConfig: Edit configuration
  validatedError: "Error in the <b>validated version</b>"
  share: Share
  permissions: Permissions
  publicationSites: Portals
  activity: Activity
  journal: Journal
  version: version
</i18n>

<script lang="ts" setup>
import dfNavigationRight from '@data-fair/lib-vuetify/navigation-right.vue'
import { mdiInformation, mdiDatabase, mdiImageMultiple, mdiSquareEditOutline, mdiSecurity, mdiPresentation, mdiCalendarText } from '@mdi/js'
import { provideApplicationStore } from '~/composables/application-store'
import { useApplicationWatch } from '~/composables/application-watch'
import setBreadcrumbs from '~/utils/breadcrumbs'

const { t, locale } = useI18n()
const route = useRoute<'/application/[id]/'>()

const store = provideApplicationStore(route.params.id)
const { application, applicationLink, can, journal, journalFetch, configFetch, datasetsFetch, childrenAppsFetch, baseAppFetch } = store

useApplicationWatch(['journal', 'draft-error'])

// Fetch additional data once application is loaded
watch(application, (app) => {
  if (!app) return
  setBreadcrumbs([
    { text: t('applications'), to: '/applications' },
    { text: app.title || app.id }
  ])
  if (!configFetch.initialized.value) configFetch.refresh()
  if (can('readJournal') && !journalFetch.initialized.value) journalFetch.refresh()
  if (!baseAppFetch.initialized.value) baseAppFetch.refresh()
}, { immediate: true })

// Fetch datasets and children apps once config is loaded
watch(() => store.config.value, (conf) => {
  if (!conf) return
  if (!datasetsFetch.initialized.value) datasetsFetch.refresh()
  if (!childrenAppsFetch.initialized.value) childrenAppsFetch.refresh()
}, { immediate: true })

const datasets = computed(() => datasetsFetch.data.value?.results ?? [])
const childrenApps = computed(() => childrenAppsFetch.data.value?.results ?? [])

const formatDate = (dateStr?: string) => {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString(locale.value, { dateStyle: 'medium' })
}

const sections = computedDeepDiff(() => {
  if (!application.value) return []

  const metadataTabs = [
    { key: 'info', title: t('info'), icon: mdiInformation },
    { key: 'datasets', title: t('datasets'), icon: mdiDatabase }
  ]
  if (childrenApps.value.length) {
    metadataTabs.push({ key: 'children-apps', title: t('childrenApps'), icon: mdiImageMultiple })
  }

  const result: any[] = [
    { title: t('metadata'), id: 'metadata', tabs: metadataTabs },
    { title: t('render'), id: 'render', tabs: [{ key: 'config', title: t('config'), icon: mdiSquareEditOutline }] }
  ]

  const shareTabs = []
  if (can('getPermissions')) {
    shareTabs.push({ key: 'permissions', title: t('permissions'), icon: mdiSecurity })
  }
  shareTabs.push({ key: 'publication-sites', title: t('publicationSites'), icon: mdiPresentation })
  if (shareTabs.length) {
    result.push({ title: t('share'), id: 'share', tabs: shareTabs })
  }

  if (can('readJournal')) {
    result.push({ title: t('activity'), id: 'activity', tabs: [{ key: 'journal', title: t('journal'), icon: mdiCalendarText }] })
  }

  return result
})
</script>

<style>
.application .v-tab {
  font-weight: bold;
}
</style>
