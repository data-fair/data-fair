<template>
  <v-autocomplete
    :model-value="modelValue"
    :items="filledMembers"
    :loading="loading"
    item-title="name"
    item-value="id"
    :label="t('member', {org: organization.name})"
    :no-filter="true"
    required
    return-object
    clearable
    @update:model-value="$emit('update:modelValue', $event)"
    @update:search="onSearch"
  >
    <template #item="{ item, props: itemProps }: any">
      <v-list-item v-bind="itemProps">
        <!--
          item.raw is transiently undefined while Vuetify's virtual-scroll list is
          re-measuring rows during the 0 -> N items transition (e.g. right after the
          search results resolve): guard with optional chaining rather than crashing.
        -->
        <template #subtitle>
          {{ item.raw?.email }}
          <span v-if="item.raw?.role"> - {{ item.raw.role }}</span>
          <span v-if="item.raw?.department"> - {{ item.raw.departmentName || item.raw.department }}</span>
        </template>
      </v-list-item>
    </template>
  </v-autocomplete>
</template>

<i18n lang="yaml">
fr:
  member: Membre de {org}
en:
  member: Member of {org}
</i18n>

<script setup lang="ts">
import { $sdUrl } from '~/context'

const props = defineProps<{
  modelValue: { id: string, name: string, email?: string } | null
  organization: { id: string, name?: string }
  department?: string
}>()

type Member = { id: string, name: string, email?: string, role?: string, department?: string, departmentName?: string }

defineEmits<{
  'update:modelValue': [value: Member | null]
}>()

const { t } = useI18n()

const members = ref<Member[]>([])
const loading = ref(false)

const filledMembers = computed(() => {
  const result: Member[] = []
  if (props.modelValue?.id) {
    result.push(props.modelValue)
  }
  return result.concat(members.value)
})

async function onSearch (search: string) {
  if (search && props.modelValue && search === props.modelValue.name) return
  loading.value = true
  if (search && search.length >= 3) {
    let url = `${$sdUrl}/api/organizations/${props.organization.id}/members?q=${encodeURIComponent(search)}`
    if (props.department) url += `&department=${encodeURIComponent(props.department)}`
    const res = await fetch(url)
    const data = await res.json()
    members.value = data.results
  } else {
    members.value = []
  }
  loading.value = false
}
</script>
