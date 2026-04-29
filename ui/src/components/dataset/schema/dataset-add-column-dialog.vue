<template>
  <v-dialog max-width="500">
    <template #activator="{ props: dialogProps }">
      <slot
        name="activator"
        :props="dialogProps"
      >
        <v-btn
          v-bind="dialogProps"
          :prepend-icon="mdiPlus"
          color="primary"
          variant="flat"
        >
          {{ props.buttonLabel ?? t('addColumn') }}
        </v-btn>
      </slot>
    </template>
    <template #default="{ isActive }">
      <v-card :title="t('addColumn')">
        <v-card-text>
          <v-form v-model="isFormValid">
            <v-text-field
              v-model="newColumnKey"
              :label="t('columnName')"
              :rules="[v => !!v || t('required'), v => validNewColumnKey(v) || t('keyExists')]"
              hide-details="auto"
              class="mb-4"
              autofocus
            />
            <v-select
              v-model="newColumnType"
              :label="t('columnType')"
              :items="propertyTypes"
              :item-title="(item: any) => item.title[locale]"
              return-object
              hide-details
            />
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="isActive.value = false">
            {{ t('cancel') }}
          </v-btn>
          <v-btn
            color="primary"
            variant="flat"
            :disabled="!isFormValid"
            @click="addColumn(); isActive.value = false"
          >
            {{ t('add') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </template>
  </v-dialog>
</template>

<i18n lang="yaml">
fr:
  addColumn: Ajouter une colonne
  columnName: Nom de la colonne
  columnType: Type
  required: Champ requis
  keyExists: Cette clé existe déjà
  cancel: Annuler
  add: Ajouter
en:
  addColumn: Add a column
  columnName: Column name
  columnType: Type
  required: Required field
  keyExists: This key already exists
  cancel: Cancel
  add: Add
</i18n>

<script setup lang="ts">
import { mdiPlus } from '@mdi/js'
import { escapeKey } from '~/utils/escape-key'
import { propertyTypes } from '~/utils/dataset'

const props = defineProps<{
  schema: any[]
  buttonLabel?: string
}>()

const emit = defineEmits<{
  add: [column: any]
}>()

const { t, locale } = useI18n()

const isFormValid = ref(false)
const newColumnKey = ref('')
const newColumnType = ref(propertyTypes[0])

const validNewColumnKey = (name: string) => {
  if (!name) return false
  const key = escapeKey(name)
  return !props.schema.find((p: any) => p.key === key)
}

const addColumn = () => {
  const key = escapeKey(newColumnKey.value)
  const type = newColumnType.value
  emit('add', {
    key,
    'x-originalName': newColumnKey.value.trim(),
    type: type.type,
    ...(type.format ? { format: type.format } : {}),
    ...('x-display' in type ? { 'x-display': (type as any)['x-display'] } : {}),
    title: ''
  })
  newColumnKey.value = ''
  isFormValid.value = false
}
</script>
