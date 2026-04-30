<template>
  <v-dialog
    v-model="dialog"
    fullscreen
    transition="dialog-bottom-transition"
  >
    <template #activator="{ props: activatorProps }">
      <v-btn
        v-bind="activatorProps"
        :icon="mdiTextBoxOutline"
        color="primary"
        :disabled="disabled"
        :title="t('extensionReport')"
      />
    </template>
    <v-card>
      <v-toolbar
        density="compact"
        color="transparent"
      >
        <v-toolbar-title>
          {{ remoteServicesMap[extension.remoteService]?.actions[extension.action]?.summary }}
        </v-toolbar-title>
        <v-spacer />
        <v-btn
          :icon="mdiClose"
          @click="dialog = false"
        />
      </v-toolbar>
      <v-card-text>
        <dataset-extension-details
          v-if="dialog"
          :remote-service="extension.remoteService"
          :action="extension.action"
          :dataset="dataset"
          :remote-services-map="remoteServicesMap"
          :resource-url="resourceUrl"
        />
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<i18n lang="yaml">
fr:
  extensionReport: Rapport d'enrichissement
en:
  extensionReport: Extension report
</i18n>

<script setup lang="ts">
import { mdiClose, mdiTextBoxOutline } from '@mdi/js'
import DatasetExtensionDetails from './dataset-extension-details.vue'

defineProps<{
  extension: any
  disabled?: boolean
  dataset: any
  remoteServicesMap: Record<string, any>
  resourceUrl: string
}>()

const { t } = useI18n()

const dialog = ref(false)
</script>
