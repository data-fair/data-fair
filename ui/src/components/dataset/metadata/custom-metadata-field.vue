<template>
  <v-select
    v-if="definition.enum?.length && (definition.type ?? 'string') === 'string'"
    :model-value="multiple ? (value ?? []).map((v: any) => v.code) : value?.code"
    :items="definition.enum"
    item-title="label"
    item-value="code"
    :multiple="multiple"
    :chips="multiple"
    :closable-chips="multiple"
    v-bind="fieldProps"
    @update:model-value="(codes: any) => emit('update:modelValue', multiple ? codes.map((code: string) => ({ code })) : codes && { code: codes })"
  />
  <v-combobox
    v-else-if="multiple"
    :model-value="value ?? []"
    multiple
    chips
    closable-chips
    v-bind="fieldProps"
    @update:model-value="(v: string[]) => emit('update:modelValue', v)"
  />
  <v-date-input
    v-else-if="definition.type === 'date'"
    :model-value="value ? dayjs(value).toDate() : null"
    prepend-icon=""
    v-bind="fieldProps"
    @update:model-value="(v: any) => emit('update:modelValue', v ? dayjs(v).format('YYYY-MM-DD') : null)"
    @click:clear="emit('update:modelValue', null)"
  />
  <div
    v-else-if="definition.type === 'link'"
    class="d-flex flex-wrap ga-2"
  >
    <v-text-field
      :model-value="value?.url"
      v-bind="fieldProps"
      :label="`${definition.title} - ${t('url')}`"
      type="url"
      @update:model-value="(url: string) => emit('update:modelValue', { url, title: value?.title })"
    />
    <v-text-field
      :model-value="value?.title"
      v-bind="fieldProps"
      :label="`${definition.title} - ${t('linkTitle')}`"
      :disabled="disabled || !value?.url"
      @update:model-value="(title: string) => emit('update:modelValue', { url: value?.url, title })"
    />
  </div>
  <v-text-field
    v-else-if="definition.type === 'integer' || definition.type === 'number'"
    :model-value="value"
    type="number"
    v-bind="fieldProps"
    @update:model-value="(v: any) => emit('update:modelValue', v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v))"
  />
  <v-text-field
    v-else
    :model-value="value"
    v-bind="fieldProps"
    @update:model-value="(v: string) => emit('update:modelValue', v)"
  />
</template>

<i18n lang="yaml">
fr:
  url: Adresse
  linkTitle: Titre du lien
en:
  url: Address
  linkTitle: Link title
</i18n>

<script setup lang="ts">
import { isCustomMetadataMultiple, type CustomMetadataDefinition } from '#api/types'
import { fitsDefinition } from '~/utils/custom-metadata'

const props = defineProps<{
  definition: CustomMetadataDefinition
  modelValue: unknown
  disabled: boolean
  modified: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: unknown] }>()

const { t } = useI18n()
const { dayjs } = useLocaleDayjs()

const value = computed(() => fitsDefinition(props.definition, props.modelValue) ? props.modelValue as any : undefined)
const multiple = computed(() => isCustomMetadataMultiple(props.definition))
const fieldProps = computed(() => ({
  label: props.definition.title,
  disabled: props.disabled,
  baseColor: props.modified ? 'accent' : undefined,
  color: props.modified ? 'accent' : undefined,
  clearable: true,
  class: 'mb-4'
}))
</script>
