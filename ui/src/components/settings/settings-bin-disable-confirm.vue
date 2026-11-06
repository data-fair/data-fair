<template>
  <v-dialog
    :model-value="!!confirmation"
    max-width="600"
    @update:model-value="confirmation = null"
  >
    <v-card
      v-if="confirmation"
      :title="t('confirmTitle')"
    >
      <v-card-text>
        <v-alert
          type="warning"
          variant="outlined"
        >
          {{ confirmation.count === null ? t('purgeUnknown') : t('purgeCount', { n: confirmation.count }, confirmation.count) }}
        </v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          variant="text"
          @click="confirmation = null"
        >
          {{ t('cancel') }}
        </v-btn>
        <v-btn
          color="warning"
          variant="flat"
          :loading="confirmation.edit.save.loading"
          @click="confirmSave()"
        >
          {{ t('confirm') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import type { Ref } from 'vue'
import type { Settings } from '#api/types'

// disabling the bin purges it at once: the save asks for confirmation when the bin holds something
type Edit = { save: { execute: () => Promise<unknown>, loading: Readonly<Ref<boolean>> } }

const { previous, current } = defineProps<{
  previous?: Settings | null
  current?: Settings | null
}>()

const { t } = useI18n()

const confirmation = ref<{ count: number | null, edit: Edit } | null>(null)

const save = useAsyncAction(async (edit: Edit) => {
  if (!(previous?.bin?.active && !current?.bin?.active)) return await edit.save.execute()
  let count: number | null
  try {
    count = (await $fetch<{ count: number }>('/bin')).count
  } catch {
    count = null
  }
  if (count === 0) return await edit.save.execute()
  confirmation.value = { count, edit }
})

async function confirmSave () {
  await confirmation.value!.edit.save.execute()
  confirmation.value = null
}

defineExpose({ save: save.execute, loading: save.loading })
</script>

<i18n lang="yaml">
fr:
  confirmTitle: Désactiver la corbeille
  purgeCount: "{n} élément dans la corbeille sera définitivement supprimé | {n} élément dans la corbeille sera définitivement supprimé | {n} éléments dans la corbeille seront définitivement supprimés"
  purgeUnknown: Les éléments de la corbeille seront définitivement supprimés.
  cancel: Annuler
  confirm: Confirmer
en:
  confirmTitle: Disable the bin
  purgeCount: "{n} item in the bin will be permanently deleted | {n} item in the bin will be permanently deleted | {n} items in the bin will be permanently deleted"
  purgeUnknown: The items in the bin will be permanently deleted.
  cancel: Cancel
  confirm: Confirm
</i18n>
