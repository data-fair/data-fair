<template>
  <v-menu
    v-if="display.mdAndUp.value"
  >
    <template #activator="{ props }">
      <v-btn
        icon
        size="large"
        :title="t('selectDisplay')"
        v-bind="props"
      >
        <v-icon
          v-if="displayMode === 'table'"
          :icon="mdiTable"
        />
        <v-icon
          v-if="displayMode === 'table-dense'"
          :icon="mdiTableLarge"
        />
        <v-icon
          v-if="displayMode === 'list'"
          :icon="mdiViewGridOutline"
        />
      </v-btn>
    </template>
    <v-card :subtitle="t('displayTitle')">
      <v-list
        class="py-0"
        density="compact"
      >
        <v-list-item
          :active="displayMode === 'table'"
          :title="t('displayTable')"
          @click="displayMode = 'table'"
        >
          <template #prepend>
            <v-icon :icon="mdiTable" />
          </template>
        </v-list-item>
        <v-list-item
          :active="displayMode === 'table-dense'"
          :title="t('displayTableDense')"
          @click="displayMode = 'table-dense'"
        >
          <template #prepend>
            <v-icon :icon="mdiTableLarge" />
          </template>
        </v-list-item>
        <v-list-item
          v-if="!edit"
          :active="displayMode === 'list'"
          :title="t('displayList')"
          @click="displayMode = 'list'"
        >
          <template #prepend>
            <v-icon :icon="mdiViewGridOutline" />
          </template>
        </v-list-item>
      </v-list>
    </v-card>
  </v-menu>
</template>

<i18n lang="yaml">
fr:
  selectDisplay: Choisir le type d'affichage
  displayTitle: Type d'affichage
  displayTable: Table
  displayTableDense: Table dense
  displayList: Liste de vignettes
en:
  selectDisplay: Chose the type of display
  displayTitle: Type of display
  displayTable: Table
  displayTableDense: Dense table
  displayList: List of cards
</i18n>

<script setup lang="ts">
import { useDisplay } from 'vuetify'
import { mdiTable, mdiTableLarge, mdiViewGridOutline } from '@mdi/js'

defineProps({ edit: { type: Boolean, default: false } })

const displayMode = defineModel<string>()

const { t } = useI18n()
const display = useDisplay()
</script>
