<template>
  <v-list>
    <v-list-item>
      <template #prepend>
        <v-list-item-title class="font-weight-medium">
          {{ t('history') }}
        </v-list-item-title>
      </template>
      <v-switch
        :model-value="rest?.history"
        density="compact"
        @update:model-value="updateRest({ history: $event })"
      />
    </v-list-item>
    <v-divider />

    <v-list-item>
      <v-list-item-title class="font-weight-medium">
        {{ t('ttl') }}
      </v-list-item-title>
      <template #append>
        <dataset-edit-ttl
          :ttl="rest?.ttl"
          :schema="dataset?.schema ?? []"
          @change="updateRest({ ttl: $event })"
        />
      </template>
    </v-list-item>

    <v-list-item>
      <v-list-item-title class="font-weight-medium">
        {{ t('historyTtl') }}
      </v-list-item-title>
      <template #append>
        <dataset-edit-ttl
          :ttl="rest?.historyTTL"
          :schema="dataset?.schema ?? []"
          :revisions="true"
          @change="updateRest({ historyTTL: $event })"
        />
      </template>
    </v-list-item>

    <v-list-item>
      <v-list-item-title class="font-weight-medium">
        {{ t('storeUpdatedBy') }}
      </v-list-item-title>
      <template #append>
        <dataset-edit-store-updated-by
          :store-updated-by="rest?.storeUpdatedBy"
          @change="updateRest({ storeUpdatedBy: $event })"
        />
      </template>
    </v-list-item>
  </v-list>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import DatasetEditTtl from './dataset-edit-ttl.vue'
import DatasetEditStoreUpdatedBy from './dataset-edit-store-updated-by.vue'

const messages = {
  fr: {
    history: 'Historique des révisions',
    ttl: 'Expiration des lignes',
    historyTtl: 'Expiration de l\'historique',
    storeUpdatedBy: 'Suivi des modifications'
  },
  en: {
    history: 'Revision history',
    ttl: 'Row expiration',
    historyTtl: 'History expiration',
    storeUpdatedBy: 'Track modifications'
  }
}

const props = defineProps<{
  rest?: any
  dataset?: any
}>()

const emit = defineEmits<{
  'update:rest': [value: any]
}>()

const { t } = useI18n({ messages })

function updateRest (updates: Record<string, any>) {
  emit('update:rest', { ...props.rest, ...updates })
}
</script>
