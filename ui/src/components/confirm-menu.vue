<template>
  <component
    :is="variant === 'menu' ? VMenu : VDialog"
    v-model="dialog"
    max-width="500"
    :close-on-content-click="false"
  >
    <!-- Trigger button -->
    <template #activator="{ props: activatorProps }">
      <v-btn
        v-bind="{ ...activatorProps, ...filteredBtnProps }"
        :title="tooltip"
      >
        <template v-if="label">
          {{ label }}
        </template>
        <v-icon
          v-else
          :icon="icon"
        />
      </v-btn>
    </template>

    <!-- Confirmation content -->
    <v-card :title="title">
      <v-card-text>
        <v-alert
          v-if="alert"
          variant="outlined"
          :type="alert"
        >
          {{ text || t('defaultConfirmText') }}
        </v-alert>
        <template v-else>
          {{ text || t('defaultConfirmText') }}
        </template>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn @click="dialog = false">
          {{ cancelLabel || t('cancel') }}
        </v-btn>
        <v-btn
          variant="flat"
          :color="yesColor"
          @click="onConfirm"
        >
          {{ confirmLabel || t('confirm') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </component>
</template>

<i18n lang="yaml">
fr:
  cancel: Annuler
  confirm: Confirmer
  defaultConfirmText: Souhaitez-vous confirmer cette opération ?
en:
  cancel: Cancel
  confirm: Confirm
  defaultConfirmText: Do you want to confirm this operation?
</i18n>

<script setup lang="ts">
import { mdiDelete } from '@mdi/js'
import { VDialog, VMenu } from 'vuetify/components'

/** Props for the ConfirmMenu component */
interface Props {
  /** Title displayed at the top of the confirmation dialog */
  title?: string
  /** Confirmation text or question shown in the dialog body.
   *  Falls back to a default translated message if not provided. */
  text?: string
  /** Tooltip shown on hover of the trigger button */
  tooltip?: string
  /** Color of the confirmation button (e.g. `'warning'` for destructive actions) */
  yesColor?: string
  /** Extra props forwarded to the trigger `v-btn`.
   *  Note: the `icon` key is filtered out — use the `icon` prop instead. */
  btnProps?: Record<string, any>
  /** When set, wraps the confirmation text in a `v-alert` of this type */
  alert?: 'warning' | 'success' | 'info' | 'error'
  /** Icon displayed on the trigger button (defaults to `mdiDelete`) */
  icon?: string
  /** Text label for the trigger button. When set, replaces the icon with text */
  label?: string
  /** Custom label for the cancel button (defaults to translated "Annuler" / "Cancel") */
  cancelLabel?: string
  /** Custom label for the confirm button (defaults to translated "Confirmer" / "Confirm") */
  confirmLabel?: string
  /** Display mode of the confirmation UI: `'dialog'` opens a centered modal (default),
   *  `'menu'` opens a popup anchored to the trigger button — cleaner for embeds */
  variant?: 'dialog' | 'menu'
}

const props = withDefaults(defineProps<Props>(), {
  yesColor: 'primary',
  btnProps: () => ({ color: 'warning', icon: true }),
  icon: mdiDelete,
  variant: 'dialog',
})

const emit = defineEmits<{
  /** Emitted when the user clicks the confirm button */
  confirm: []
}>()

const { t } = useI18n()
const dialog = ref(false)

/** btnProps without `icon` when label is set, to avoid icon-button styling on text buttons */
const filteredBtnProps = computed(() => {
  if (!props.btnProps) return {}
  if (props.label) {
    const { icon: _, ...rest } = props.btnProps
    return rest
  }
  return props.btnProps
})

function onConfirm () {
  emit('confirm')
  dialog.value = false
}
</script>
