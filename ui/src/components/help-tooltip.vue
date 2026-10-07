<template>
  <!-- same look and behaviour as the help messages of vjsf forms -->
  <v-menu
    v-model="show"
    :location="location"
    offset="4"
    max-width="400"
    :close-on-content-click="false"
  >
    <template #activator="{ props }">
      <v-btn
        v-bind="{ ...props, ...$attrs }"
        color="info"
        :icon="mdiInformationSymbol"
        density="compact"
        variant="flat"
        :size="small ? 20 : 24"
        :title="show ? '' : t('showHelp')"
      />
    </template>
    <v-alert
      color="info"
      density="comfortable"
    >
      <slot>{{ text }}</slot>
    </v-alert>
  </v-menu>
</template>

<i18n lang="yaml">
fr:
  showHelp: Afficher l'aide
en:
  showHelp: Show help
</i18n>

<script setup lang="ts">
import { mdiInformationSymbol } from '@mdi/js'

// class and style go to the button, not to the menu overlay
defineOptions({ inheritAttrs: false })

withDefaults(defineProps<{
  small?: boolean
  location?: 'top end' | 'top start' | 'bottom end' | 'bottom start' | 'start' | 'end'
  text?: string
}>(), {
  small: false,
  location: 'top end',
})

const { t } = useI18n()
const show = ref(false)
</script>
