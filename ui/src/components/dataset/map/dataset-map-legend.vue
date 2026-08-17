<template>
  <v-card
    class="dataset-map-legend pa-2"
    style="position:absolute;bottom:24px;right:8px;z-index:2;max-height:50%;overflow-y:auto;max-width:280px;"
    density="compact"
  >
    <div
      class="text-subtitle-2 mb-1"
      style="line-height:1.2"
    >
      {{ title }}
    </div>
    <div
      v-for="item of items"
      :key="item.value"
      class="dataset-map-legend--item d-flex align-center"
      :style="{
        opacity: activeValues.length && !activeValues.includes(item.value) ? 0.4 : 1,
        cursor: clickable ? 'pointer' : 'default'
      }"
      @click="clickable && emit('toggle', item.value)"
    >
      <span
        class="mr-2 flex-shrink-0"
        :style="`display:inline-block;width:14px;height:14px;border-radius:3px;background-color:${item.color};`"
      />
      <span class="text-body-2 text-truncate">{{ item.label }}</span>
    </div>
    <div
      v-if="otherColor"
      class="d-flex align-center"
      style="opacity:0.8"
    >
      <span
        class="mr-2 flex-shrink-0"
        :style="`display:inline-block;width:14px;height:14px;border-radius:3px;background-color:${otherColor};`"
      />
      <span class="text-body-2 font-italic">{{ t('other') }}</span>
    </div>
  </v-card>
</template>

<i18n lang="yaml">
fr:
  other: Autres valeurs
en:
  other: Other values
</i18n>

<script setup lang="ts">
const { t } = useI18n()

defineProps({
  title: { type: String, required: true },
  items: { type: Array as () => { value: string, label: string, color: string }[], required: true },
  activeValues: { type: Array as () => string[], default: () => [] },
  otherColor: { type: String, default: '' },
  clickable: { type: Boolean, default: false }
})
const emit = defineEmits<{ toggle: [value: string] }>()
</script>
