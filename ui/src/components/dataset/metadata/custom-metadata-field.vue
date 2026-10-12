<template>
  <v-select
    v-if="definition.enum?.length && (definition.type ?? 'string') === 'string'"
    :model-value="multiple ? (value ?? []) : value"
    :items="definition.enum"
    :multiple="multiple"
    :chips="multiple"
    :closable-chips="multiple"
    v-bind="fieldProps"
    @update:model-value="(v: unknown) => emit('update:modelValue', v)"
  />
  <v-combobox
    v-else-if="multiple"
    :model-value="value ?? []"
    :items="suggestions"
    :loading="loadingSuggestions"
    multiple
    chips
    closable-chips
    v-bind="fieldProps"
    @update:search="fetchSuggestions"
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
    class="link-fields d-flex flex-column flex-grow-1"
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
      :error-messages="[]"
      :disabled="disabled || !value?.url"
      @update:model-value="(title: string) => emit('update:modelValue', { url: value?.url, title: title || undefined })"
    />
  </div>
  <v-number-input
    v-else-if="definition.type === 'integer' || definition.type === 'number'"
    :model-value="value ?? null"
    :precision="definition.type === 'integer' ? 0 : null"
    v-bind="fieldProps"
    @update:model-value="(v: number | null) => emit('update:modelValue', v)"
  />
  <v-combobox
    v-else
    :model-value="value"
    :items="suggestions"
    :loading="loadingSuggestions"
    v-bind="fieldProps"
    @update:search="fetchSuggestions"
    @update:model-value="(v: string) => emit('update:modelValue', v)"
  />
</template>

<i18n lang="yaml">
fr:
  url: URL
  linkTitle: Libellé du lien
  invalid: Valeur invalide pour ce type
en:
  url: URL
  linkTitle: Link label
  invalid: Invalid value for this type
</i18n>

<script setup lang="ts">
import { isCustomMetadataMultiple, type CustomMetadataDefinition } from '#api/types'
import { fitsDefinition } from '~/utils/custom-metadata'

const props = defineProps<{
  definition: CustomMetadataDefinition
  owner: { type: string, id: string }
  modelValue: unknown
  disabled: boolean
  modified: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: unknown] }>()

const { t } = useI18n()
const { dayjs } = useLocaleDayjs()

const fits = computed(() => fitsDefinition(props.definition, props.modelValue))
// only an untouched stale value is hidden: a value being typed stays visible, with an error until it fits
const value = computed(() => fits.value || props.modified ? props.modelValue as any : undefined)
const multiple = computed(() => isCustomMetadataMultiple(props.definition))

// values already entered on the owner's other datasets, fetched once like the keywords
const suggestions = ref<string[]>([])
const loadingSuggestions = ref(false)
let suggestionsFetched = false
const fetchSuggestions = async (search: string) => {
  if (suggestionsFetched || !search) return
  suggestionsFetched = true
  loadingSuggestions.value = true
  const facet = `custom-${props.definition.key}`
  try {
    const response = await $fetch<any>(`${$apiPath}/datasets`, {
      query: { size: 0, facets: facet, owner: `${props.owner.type}:${props.owner.id}` }
    })
    suggestions.value = (response?.facets?.[facet] ?? []).map((f: any) => f.value).filter((v: unknown) => typeof v === 'string')
  } catch (e) {
    console.error('Failed to fetch custom metadata suggestions', e)
  }
  loadingSuggestions.value = false
}
const fieldProps = computed(() => ({
  label: props.definition.title,
  disabled: props.disabled,
  baseColor: props.modified ? 'accent' : undefined,
  color: props.modified ? 'accent' : undefined,
  clearable: true,
  errorMessages: props.modified && props.modelValue != null && !fits.value ? t('invalid') : undefined,
  // the form hides details globally, the error must still show
  hideDetails: 'auto' as const,
  class: 'mb-4'
}))
</script>
