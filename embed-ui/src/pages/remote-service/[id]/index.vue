<template>
  <v-container v-if="remoteServiceFetch.data.value">
    <v-row class="remoteService">
      <v-col>
        <template
          v-for="section in sections"
          :key="section.id"
        >
          <layout-section-tabs
            v-if="section.id === 'metadata'"
            :id="section.id"
            :min-height="300"
            :svg="checklistSvg"
            svg-no-margin
            :title="section.title"
            :tabs="section.tabs"
          >
            <template #content="{tab}">
              <v-tabs-window :model-value="tab">
                <v-tabs-window-item value="info">
                  <v-container
                    fluid
                    class="pb-0"
                  >
                    <remote-service-info />
                  </v-container>
                </v-tabs-window-item>

                <v-tabs-window-item value="extensions">
                  <v-container
                    fluid
                    class="pb-0"
                  >
                    <remote-service-schema />
                  </v-container>
                </v-tabs-window-item>
              </v-tabs-window>
            </template>
          </layout-section-tabs>
          <layout-section-tabs
            v-if="section.id === 'configuration'"
            :id="section.id"
            :min-height="300"
            :svg="settingsSvg"
            svg-no-margin
            :title="section.title"
            :tabs="section.tabs"
          >
            <template #content="{tab}">
              <v-tabs-window :model-value="tab">
                <v-tabs-window-item value="params">
                  <v-container
                    fluid
                    class="pb-0"
                  >
                    <remote-service-config />
                  </v-container>
                </v-tabs-window-item>
              </v-tabs-window>
            </template>
          </layout-section-tabs>

          <layout-section-tabs
            v-if="section.id === 'share'"
            :id="section.id"
            :svg="shareSvg"
            svg-no-margin
            :min-height="200"
            :title="section.title"
            :tabs="section.tabs"
          >
            <template #content="{tab}">
              <v-container fluid>
                <tutorial-alert
                  id="dataset-share-portal"
                  :text="$t('permissions')"
                  persistent
                />
              </v-container>
              <v-tabs-window :model-value="tab">
                <v-tabs-window-item value="permissions">
                  <v-container fluid>
                    <remote-service-access />
                  </v-container>
                </v-tabs-window-item>

                <v-tabs-window-item value="virtual-datasets">
                  <v-container fluid>
                    <remote-service-virtual-datasets />
                  </v-container>
                </v-tabs-window-item>
              </v-tabs-window>
            </template>
          </layout-section-tabs>
        </template>
      </v-col>
    </v-row>
    <df-navigation-right>
      <remote-service-actions />
      <layout-toc :sections="sections" />
    </df-navigation-right>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  remoteServices: Services interopérables
  info: Informations
  extensions: Extensions supportées
  params: Paramètres
  visibility: Visibilité
  permissions: Contrôlez l'utilisation de ce service distant par vos utilisateurs.
  services: Services
  metadata: Métadonnées
  configuration: Configuration
  share: Partage
  virtualDatasets: Jeux virtuels
en:
  remoteServices: Interoperable services
  info: Informations
  extensions: Handled extensions
  params: Parameters
  visibility: Visibility
  permissions: Control the use of this service by your users.
  services: Services
  metadata: Metadata
  configuration: Configuration
  share: Share
  virtualDatasets: Virtual datasets
</i18n>

<script lang="ts" setup>
import dfNavigationRight from '@data-fair/lib-vuetify/navigation-right.vue'
import { mdiInformation, mdiMerge, mdiPencil, mdiPictureInPictureBottomRightOutline, mdiSecurity } from '@mdi/js'
import checklistSvg from '~/assets/svg/Checklist_Two Color.svg?raw'
import settingsSvg from '~/assets/svg/Settings_Two Color.svg?raw'
import shareSvg from '~/assets/svg/Share_Two Color.svg?raw'
import setBreadcrumbs from '~/utils/breadcrumbs'

const { t } = useI18n()
const route = useRoute<'/remote-service/[id]/'>()
const remoteServiceFetch = useFetch(`${$apiPath}/remote-services/${route.params.id}`)

watch(remoteServiceFetch.data, (reuse) => {
  if (!reuse) return
  setBreadcrumbs([
    { text: t('remoteServices'), to: '/remote-services' }
  ])
}, { immediate: true })

const sections = [
  { title: t('metadata'), id: 'metadata', tabs: [{ key: 'info', title: t('info'), icon: mdiInformation }, { key: 'extensions', title: t('extensions'), icon: mdiMerge }] },
  { title: t('configuration'), id: 'configuration', tabs: [{ key: 'params', title: t('params'), icon: mdiPencil }] },
  { title: t('share'), id: 'share', tabs: [{ key: 'permissions', title: t('visibility'), icon: mdiSecurity }, { key: 'virtual-datasets', title: t('virtualDatasets'), icon: mdiPictureInPictureBottomRightOutline }] }
]

</script>

<style>
.remoteService .v-tab {
  font-weight: bold;
}
</style>
