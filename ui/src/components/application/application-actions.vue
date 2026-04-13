<template>
  <template v-if="application">
    <v-list-subheader class="text-uppercase">
      {{ t('navigation') }}
    </v-list-subheader>

    <v-list-item
      :href="applicationLink"
      target="_blank"
      link
    >
      <template #prepend>
        <v-icon
          color="primary"
          :icon="mdiExitToApp"
        />
      </template>
      {{ t('fullPage') }}
    </v-list-item>

    <v-list-item
      v-for="portalUrl in portalUrls"
      :key="portalUrl.url"
      :href="portalUrl.url"
      target="_blank"
      link
    >
      <template #prepend>
        <v-icon
          color="primary"
          :icon="mdiWeb"
        />
      </template>
      {{ t('viewOnPortal', { title: portalUrl.title }) }}
    </v-list-item>

    <v-list-subheader class="text-uppercase">
      {{ t('actions') }}
    </v-list-subheader>

    <v-list-item
      v-if="can('writeConfig')"
      :to="`/application/${application.id}/config`"
      link
    >
      <template #prepend>
        <v-icon
          color="primary"
          :icon="mdiSquareEditOutline"
        />
      </template>
      {{ t('editConfig') }}
    </v-list-item>

    <v-list-item
      v-if="can('readApiDoc')"
      :to="`/application/${application.id}/api-doc`"
      link
    >
      <template #prepend>
        <v-icon
          color="primary"
          :icon="mdiCloud"
        />
      </template>
      {{ t('useAPI') }}
    </v-list-item>

    <application-capture-dialog>
      <template #activator="{ props: activatorProps }">
        <v-list-item
          v-bind="activatorProps"
          link
        >
          <template #prepend>
            <v-icon
              color="primary"
              :icon="mdiCamera"
            />
          </template>
          {{ t('capture') }}
        </v-list-item>
      </template>
    </application-capture-dialog>
  </template>
</template>

<i18n lang="yaml">
fr:
  navigation: Navigation
  actions: Actions
  editConfig: Éditer la configuration
  capture: Capture d'écran
  fullPage: Ouvrir en pleine page
  viewOnPortal: "Voir sur {title}"
  useAPI: Utiliser l'API
en:
  navigation: Navigation
  actions: Actions
  editConfig: Edit configuration
  capture: Screenshot
  fullPage: Open fullscreen
  viewOnPortal: "View on {title}"
  useAPI: Use the API
</i18n>

<script setup lang="ts">
import { mdiCamera, mdiCloud, mdiExitToApp, mdiSquareEditOutline, mdiWeb } from '@mdi/js'
import useApplicationStore from '~/composables/application/application-store'

const { t } = useI18n()
const { application, applicationLink, can } = useApplicationStore()

const owner = computed(() => application.value?.owner)
const publicationSitesFetch = useFetch<any[]>(() => {
  if (!owner.value) return null
  let path = `${$apiPath}/settings/${owner.value.type}/${owner.value.id}`
  if (owner.value.department) path += ':' + owner.value.department
  path += '/publication-sites'
  return path
}, { immediate: true })

const portalUrls = computed(() => {
  if (!application.value || !publicationSitesFetch.data.value) return []
  const published = application.value.publicationSites ?? []
  return publicationSitesFetch.data.value
    .filter((site: any) => site.applicationUrlTemplate && published.includes(`${site.type}:${site.id}`))
    .map((site: any) => ({
      title: site.title || site.url || site.id,
      url: site.applicationUrlTemplate.replace('{id}', application.value!.id).replace('{slug}', application.value!.slug)
    }))
})
</script>
