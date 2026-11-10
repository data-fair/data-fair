<template>
  <card-hover-info
    :title="t('dates')"
    shrink
  >
    <span class="text-truncate">{{ label ?? t('updatedAt') }} {{ dayjs(updatedAt).format('L') }}</span>
    <template #help>
      <div>{{ t('updated', { date: dayjs(updatedAt).format('lll') }) }}</div>
      <div v-if="dataUpdatedAt">
        {{ t('data', { date: dayjs(dataUpdatedAt).format('lll') }) }}
      </div>
      <div v-if="createdAt">
        {{ t('created', { date: dayjs(createdAt).format('lll') }) }}
      </div>
    </template>
  </card-hover-info>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useLocaleDayjs } from '@data-fair/lib-vue/locale-dayjs.js'
import cardHoverInfo from './card-hover-info.vue'

defineProps<{ updatedAt: string, dataUpdatedAt?: string, createdAt?: string, label?: string }>()
const { t } = useI18n()
const { dayjs } = useLocaleDayjs()
</script>

<i18n lang="yaml">
fr:
  dates: Dates
  updatedAt: Modifié le
  updated: "Modification : {date}"
  data: "Données : {date}"
  created: "Création : {date}"
en:
  dates: Dates
  updatedAt: Updated on
  updated: "Updated: {date}"
  data: "Data: {date}"
  created: "Created: {date}"
</i18n>
