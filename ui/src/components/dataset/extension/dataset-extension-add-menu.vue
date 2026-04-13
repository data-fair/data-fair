<template>
  <v-menu
    v-model="addExtensionDialog"
    :max-height="450"
  >
    <template #activator="{ props: menuProps }">
      <v-btn
        v-bind="menuProps"
        :prepend-icon="mdiPlus"
        color="primary"
        variant="flat"
      >
        {{ t('addExtension') }}
      </v-btn>
    </template>

    <v-list>
      <template v-if="!availableExtensions">
        <v-skeleton-loader type="list-item-two-line" />
        <v-skeleton-loader type="list-item-two-line" />
        <v-skeleton-loader type="list-item-two-line" />
      </template>

      <template v-else>
        <v-list-item
          v-for="extension in availableExtensions.filter(e => !e.disabled)"
          :key="extension.id"
          @click="emit('add', {
            active: true,
            type: extension.type,
            remoteService: extension.remoteService,
            action: extension.action.id,
            select: defaultFields[extension.action.id] || [],
            overwrite: {}
          })"
        >
          <v-list-item-title>{{ extension.action.summary }}</v-list-item-title>
          <v-list-item-subtitle>{{ extension.linkInfo }}</v-list-item-subtitle>
        </v-list-item>
        <v-list-item
          v-for="extension in availableExtensions.filter(e => e.disabled)"
          :key="extension.id"
          disabled
        >
          <v-list-item-title>{{ extension.action.summary }}</v-list-item-title>
          <v-list-item-subtitle>{{ extension.disabled }}</v-list-item-subtitle>
        </v-list-item>
      </template>
    </v-list>
  </v-menu>
</template>

<i18n lang="yaml">
fr:
  addExtension: Ajouter des colonnes de données de référence
en:
  addExtension: Add columns from master-data sources
</i18n>

<script setup lang="ts">
import { mdiPlus } from '@mdi/js'

defineProps<{
  availableExtensions: any[] | null
}>()

const emit = defineEmits<{ add: [extension: any] }>()

const { t } = useI18n()

const addExtensionDialog = ref(false)

const defaultFields: Record<string, string[]> = {
  findEntreprisesBulk: ['NOMEN_LONG', 'bodacc.capital', 'TEFEN'],
  findEtablissementsBulk: ['NOMEN_LONG', 'bodacc.capital', 'TEFET'],
  postCoords: ['lat', 'lon'],
  findCityBulk: ['population.popMuni', 'DEP', 'REG'],
  findParcellesBulk: ['lat', 'lon']
}
</script>
