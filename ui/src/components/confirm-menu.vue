<template>
  <v-menu
    v-model="menu"
    max-width="500"
  >
    <template #activator="{ props }">
      <v-btn
        v-bind="{...props, ...btnProps}"
        :title="tooltip"
        :icon="mdiDelete"
      />
    </template>
    <v-card>
      <v-card-title
        v-if="title"
        primary-title
      >
        {{ title }}
      </v-card-title>
      <v-card-text>
        <v-alert
          v-if="alert"
          variant="outlined"
          :type="alert"
        >
          {{ text }}
        </v-alert>
        <template v-else>
          {{ text }}
        </template>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          variant="text"
          @click="menu = false"
        >
          {{ t("no") }}
        </v-btn>
        <v-btn
          variant="elevated"
          :color="yesColor"
          @click="emit('confirm')"
        >
          {{ t("yes") }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-menu>
</template>

<i18n lang="yaml">
fr:
  yes: Oui
  no: Non
en:
  yes: Yes
  no: No
</i18n>

<script lang="ts" setup>
import { mdiDelete } from '@mdi/js'

const { btnProps, title, text, tooltip, yesColor, alert } = defineProps({
  title: {
    type: String,
    default: ''
  },
  text: {
    type: String,
    default: 'Souhaitez-vous confirmer cette opération ?'
  },
  tooltip: {
    type: String,
    default: ''
  },
  yesColor: {
    type: String,
    default: 'primary'
  },
  btnProps: {
    type: Object,
    default: () => ({ color: 'warning', icon: true })
  },
  alert: {
    type: String as PropType<'warning' | 'success' | 'info' | 'error' | undefined>,
    default: undefined
  }
})

const emit = defineEmits(['confirm'])

const { t } = useI18n()
const menu = ref(false)
</script>

<style lang="css" scoped>
</style>
