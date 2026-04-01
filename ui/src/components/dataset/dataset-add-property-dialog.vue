<template>
  <v-dialog
    :model-value="modelValue"
    max-width="500"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card>
      <v-card-title>{{ t('addProperty') }}</v-card-title>
      <v-card-text>
        <v-form
          ref="formRef"
          @submit.prevent="addProperty"
        >
          <v-text-field
            v-model="newPropertyKey"
            :label="t('propertyName')"
            :rules="[v => !!v || t('required'), v => validNewPropertyKey(v) || t('keyExists')]"
            autofocus
          />
          <v-select
            v-model="newPropertyType"
            :label="t('propertyType')"
            :items="typeItems"
            item-title="title"
            return-object
          />
        </v-form>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          variant="text"
          @click="emit('update:modelValue', false)"
        >
          {{ t('cancel') }}
        </v-btn>
        <v-btn
          color="primary"
          @click="addProperty"
        >
          {{ t('add') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<i18n lang="yaml">
fr:
  addProperty: Ajouter une propriété
  propertyName: Nom de la propriété
  propertyType: Type
  required: Champ requis
  keyExists: Cette clé existe déjà
  cancel: Annuler
  add: Ajouter
en:
  addProperty: Add a property
  propertyName: Property name
  propertyType: Type
  required: Required field
  keyExists: This key already exists
  cancel: Cancel
  add: Add
</i18n>

<script setup lang="ts">
import { escapeKey } from '~/utils/escape-key'
import { propertyTypes } from '~/utils/dataset'

const props = defineProps<{
  modelValue: boolean
  schema: any[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  add: [property: any]
}>()

const { t } = useI18n()
const formRef = ref()

const newPropertyKey = ref('')
const newPropertyType = ref(propertyTypes[0])

const typeItems = computed(() => propertyTypes.map(pt => ({
  ...pt,
  title: pt.title
})))

const validNewPropertyKey = (name: string) => {
  if (!name) return false
  const key = escapeKey(name)
  return !props.schema.find((p: any) => p.key === key)
}

const addProperty = async () => {
  const { valid } = await formRef.value.validate()
  if (!valid) return
  const key = escapeKey(newPropertyKey.value)
  const type = newPropertyType.value
  emit('add', {
    key,
    'x-originalName': newPropertyKey.value.trim(),
    type: type.type,
    ...(type.format ? { format: type.format } : {}),
    ...('x-display' in type ? { 'x-display': (type as any)['x-display'] } : {}),
    title: ''
  })
  newPropertyKey.value = ''
  emit('update:modelValue', false)
}
</script>
