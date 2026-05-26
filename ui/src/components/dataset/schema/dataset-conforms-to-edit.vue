<template>
  <v-row
    v-if="active"
    class="ma-0 mb-4"
    dense
  >
    <v-col
      cols="12"
      md="8"
      lg="4"
    >
      <v-combobox
        v-model="localValue.title"
        :items="titleItems"
        :label="t('title')"
        :disabled="disabled"
        :base-color="fieldColor('title')"
        :color="fieldColor('title')"
        :loading="loading"
        clearable
        hide-details="auto"
        density="comfortable"
        variant="outlined"
        @update:focused="onAnyFocus"
        @update:model-value="emitChange"
      />
    </v-col>
    <v-col
      cols="12"
      md="4"
      lg="2"
    >
      <v-combobox
        v-model="localValue.version"
        :items="versionItems"
        :label="t('version')"
        :disabled="disabled"
        :base-color="fieldColor('version')"
        :color="fieldColor('version')"
        :loading="loading"
        hide-details="auto"
        density="comfortable"
        variant="outlined"
        @update:focused="onAnyFocus"
        @update:model-value="emitChange"
      />
    </v-col>
    <v-col
      cols="12"
      lg="6"
    >
      <v-combobox
        v-model="localValue.url"
        :items="urlItems"
        :label="t('url')"
        :disabled="disabled"
        :base-color="fieldColor('url')"
        :color="fieldColor('url')"
        :loading="loading"
        clearable
        hide-details="auto"
        density="comfortable"
        variant="outlined"
        type="url"
        @update:focused="onAnyFocus"
        @update:model-value="emitChange"
      />
    </v-col>
  </v-row>
</template>

<i18n lang="yaml">
fr:
  title: Titre du schéma de référence
  version: Version
  url: URL
en:
  title: Title of the reference schema
  version: Version
  url: URL
</i18n>

<script setup lang="ts">
import equal from 'fast-deep-equal'
import { $apiPath } from '~/context'

type Triple = { title?: string | null, version?: string | null, url?: string | null }

const props = defineProps<{
  modelValue?: Triple | null
  originalValue?: Triple | null
  owner?: { type: string, id: string } | null
  active: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: Triple | null): void
}>()

const { t } = useI18n()

const localValue = ref<Triple>({
  title: props.modelValue?.title ?? null,
  version: props.modelValue?.version ?? null,
  url: props.modelValue?.url ?? null
})

const toCanonical = (v: Triple): Triple | null => {
  const clean: Triple = {}
  if (v.title) clean.title = v.title
  if (v.version) clean.version = v.version
  if (v.url) clean.url = v.url
  return Object.keys(clean).length ? clean : null
}

watch(() => props.modelValue, (v) => {
  if (!equal(v, toCanonical(localValue.value))) {
    localValue.value = {
      title: v?.title ?? null,
      version: v?.version ?? null,
      url: v?.url ?? null
    }
  }
})

const emitChange = () => {
  emit('update:modelValue', toCanonical(localValue.value))
}

const fieldColor = (field: keyof Triple): string | undefined => {
  if (!props.originalValue && !localValue.value[field]) return undefined
  const original = props.originalValue?.[field] ?? ''
  const current = localValue.value[field] ?? ''
  return original !== current ? 'accent' : undefined
}

// --- Suggestions ---

const triples = ref<Triple[]>([])
const loading = ref(false)
let fetched = false

const onAnyFocus = async (focused: boolean) => {
  if (!focused || fetched || !props.owner) return
  fetched = true
  loading.value = true
  try {
    const ownerParam = `${props.owner.type}:${props.owner.id}`
    const res = await $fetch<{ facets?: { conformsTo?: { value: Triple, count: number }[] } }>(`${$apiPath}/datasets`, {
      query: { size: 0, facets: 'conformsTo', owner: ownerParam }
    })
    triples.value = (res?.facets?.conformsTo ?? []).map(f => f.value)
  } catch (e) {
    console.error('Failed to fetch conformsTo suggestions', e)
  }
  loading.value = false
}

const unique = (arr: (string | null | undefined)[]): string[] => {
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of arr) {
    if (v && !seen.has(v)) { seen.add(v); out.push(v) }
  }
  return out
}

const matchesTitle = (triple: Triple) => !localValue.value.title || triple.title === localValue.value.title
const matchesUrl = (triple: Triple) => !localValue.value.url || triple.url === localValue.value.url

const titleItems = computed(() => unique(triples.value.filter(matchesUrl).map(t => t.title)))
const urlItems = computed(() => unique(triples.value.filter(matchesTitle).map(t => t.url)))
const versionItems = computed(() => {
  if (!localValue.value.title && !localValue.value.url) return []
  return unique(triples.value.filter(matchesTitle).filter(matchesUrl).map(t => t.version))
})
</script>
