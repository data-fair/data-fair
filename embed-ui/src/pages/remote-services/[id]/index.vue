<template>
  <v-container v-if="remoteServiceEditFetch.data.value">
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
            :color="section.color"
          >
            <template #content="{tab}">
              <v-tabs-window :model-value="tab">
                <v-tabs-window-item value="info">
                  <v-container fluid>
                    <remote-service-info v-model="remoteServiceEditFetch.data.value" />
                  </v-container>
                </v-tabs-window-item>

                <v-tabs-window-item value="extensions">
                  <v-container fluid>
                    <remote-service-schema :remote-service="remoteServiceEditFetch.data.value" />
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
            :color="section.color"
          >
            <template #content="{tab}">
              <v-tabs-window :model-value="tab">
                <v-tabs-window-item value="params">
                  <v-container fluid>
                    <remote-service-config v-model="remoteServiceEditFetch.data.value" />
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
            :color="section.color"
          >
            <template #content="{tab}">
              <v-container
                fluid
                class="pb-0"
              >
                <tutorial-alert
                  id="dataset-share-portal"
                  :text="t('permissions')"
                  persistent
                />
              </v-container>
              <v-tabs-window :model-value="tab">
                <v-tabs-window-item value="permissions">
                  <v-container fluid>
                    <v-row>
                      <v-col
                        cols="12"
                        md="6"
                        order-md="2"
                      >
                        <private-access v-model="remoteServiceEditFetch.data.value" />
                      </v-col>
                    </v-row>
                  </v-container>
                </v-tabs-window-item>

                <v-tabs-window-item value="virtual-datasets">
                  <v-container fluid>
                    <remote-service-virtual-datasets v-model="remoteServiceEditFetch.data.value" />
                  </v-container>
                </v-tabs-window-item>
              </v-tabs-window>
            </template>
          </layout-section-tabs>
        </template>
      </v-col>
    </v-row>
    <df-navigation-right>
      <v-list
        v-if="remoteServiceEditFetch.hasDiff.value"
        bg-color="background"
      >
        <v-list-item>
          <v-btn
            width="100%"
            color="accent"
            :loading="remoteServiceEditFetch.save.loading.value"
            @click="remoteServiceEditFetch.save.execute()"
          >
            enregistrer
          </v-btn>
        </v-list-item>
      </v-list>
      <remote-service-actions v-model="remoteServiceEditFetch.data.value" />
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
  save: Enregistrer
  saved: les modifications ont été enregistrées
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
  save: Save
  saved: changes were saved
</i18n>

<script lang="ts" setup>
import type { RemoteService } from '#api/types'
import dfNavigationRight from '@data-fair/lib-vuetify/navigation-right.vue'
import { mdiAlert, mdiInformation, mdiMerge, mdiPencil, mdiPictureInPictureBottomRightOutline, mdiSecurity } from '@mdi/js'
import checklistSvg from '~/assets/svg/Checklist_Two Color.svg?raw'
import settingsSvg from '~/assets/svg/Settings_Two Color.svg?raw'
import shareSvg from '~/assets/svg/Share_Two Color.svg?raw'
import setBreadcrumbs from '~/utils/breadcrumbs'
import equal from 'fast-deep-equal'

const { t, locale } = useI18n()
const route = useRoute<'/remote-services/[id]/'>()
const remoteServiceEditFetch = useEditFetch<RemoteService>(`${$apiPath}/remote-services/${route.params.id}`, {
  patch: true,
  saveOptions: {
    success: t('saved')
  }
})
useLeaveGuard(remoteServiceEditFetch.hasDiff, { locale })

watch(remoteServiceEditFetch.data, (remoteService) => {
  if (!remoteService) return
  setBreadcrumbs([
    { text: t('remoteServices'), to: '/remote-services' },
    { text: remoteService.title, to: '/remote-services/' + remoteService.id }
  ])
}, { immediate: true })

const infoHasDiff = computed(() => remoteServiceEditFetch.data.value?.title !== remoteServiceEditFetch.serverData.value?.title || remoteServiceEditFetch.data.value?.description !== remoteServiceEditFetch.serverData.value?.description)
const configHasDiff = computed(() => remoteServiceEditFetch.data.value?.server !== remoteServiceEditFetch.serverData.value?.server || !equal(remoteServiceEditFetch.data.value?.apiKey, remoteServiceEditFetch.serverData.value?.apiKey))
const privateAccessHasDiff = computed(() => remoteServiceEditFetch.data.value?.public !== remoteServiceEditFetch.serverData.value?.public || !equal(remoteServiceEditFetch.data.value?.privateAccess, remoteServiceEditFetch.serverData.value?.privateAccess))
const virtualDatasetsHasDiff = computed(() => remoteServiceEditFetch.data.value?.virtualDatasets?.storageRatio !== remoteServiceEditFetch.serverData.value?.virtualDatasets?.storageRatio)

const sections = computedDeepDiff(() => {
  return [
    {
      title: t('metadata'),
      id: 'metadata',
      color: infoHasDiff.value ? 'accent' : undefined,
      tabs: [
        { key: 'info', title: t('info'), icon: mdiInformation, appendIcon: infoHasDiff.value ? mdiAlert : undefined, color: infoHasDiff.value ? 'accent' : undefined },
        { key: 'extensions', title: t('extensions'), icon: mdiMerge }]
    },
    {
      title: t('configuration'),
      id: 'configuration',
      color: configHasDiff.value ? 'accent' : undefined,
      tabs: [
        { key: 'params', title: t('params'), icon: mdiPencil, appendIcon: configHasDiff.value ? mdiAlert : undefined, color: configHasDiff.value ? 'accent' : undefined }
      ]
    },
    {
      title: t('share'),
      id: 'share',
      color: (privateAccessHasDiff.value || virtualDatasetsHasDiff.value) ? 'accent' : undefined,
      tabs: [
        { key: 'permissions', title: t('visibility'), icon: mdiSecurity, appendIcon: privateAccessHasDiff.value ? mdiAlert : undefined, color: privateAccessHasDiff.value ? 'accent' : undefined },
        remoteServiceEditFetch.data.value?.virtualDatasets ? { key: 'virtual-datasets', title: t('virtualDatasets'), icon: mdiPictureInPictureBottomRightOutline, appendIcon: virtualDatasetsHasDiff.value ? mdiAlert : undefined, color: virtualDatasetsHasDiff.value ? 'accent' : undefined } : null
      ]
    }
  ]
})

</script>

<style>
.remoteService .v-tab {
  font-weight: bold;
}
</style>
