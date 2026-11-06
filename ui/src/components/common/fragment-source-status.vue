<template>
  <!-- a virtual parent: whether the fragment is one of its sources, adding it is an explicit step -->
  <div class="d-flex align-center flex-wrap ga-2">
    <v-chip
      v-if="isSource"
      :prepend-icon="mdiCheck"
      color="success"
      size="small"
      variant="tonal"
    >
      {{ t('isSource') }}
    </v-chip>
    <template v-else>
      <v-chip
        size="small"
        variant="tonal"
      >
        {{ t('notSource') }}
      </v-chip>
      <v-btn
        v-if="canAdd"
        :prepend-icon="mdiPlus"
        :loading="adding"
        :disabled="addDisabled"
        size="small"
        color="primary"
        variant="text"
        @click="emit('add')"
      >
        {{ t('addSource') }}
      </v-btn>
    </template>
  </div>
</template>

<i18n lang="yaml">
fr:
  isSource: Source du jeu de données
  notSource: Pas encore une source
  addSource: Ajouter aux sources
en:
  isSource: Source of the dataset
  notSource: Not a source yet
  addSource: Add to the sources
</i18n>

<script setup lang="ts">
import { mdiCheck, mdiPlus } from '@mdi/js'

defineProps<{
  isSource: boolean
  canAdd: boolean
  adding: boolean
  addDisabled: boolean
}>()
const emit = defineEmits<{ add: [] }>()
const { t } = useI18n()
</script>
