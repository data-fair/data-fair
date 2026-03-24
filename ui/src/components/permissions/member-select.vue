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
    <template #item="{ item, props: itemProps }">
      <v-list-item v-bind="itemProps">
        <template #subtitle>
          {{ item.raw.email }}
          <span v-if="item.raw.role"> - {{ item.raw.role }}</span>
          <span v-if="item.raw.department"> - {{ item.raw.departmentName || item.raw.department }}</span>
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

<script lang="ts" setup>
import { $sdUrl } from '~/context'

const props = defineProps<{
  modelValue: { id: string, name: string, email?: string } | null
  organization: { id: string, name: string }
}>()

defineEmits<{
  'update:modelValue': [value: any]
}>()

const { t } = useI18n()

const members = ref<any[]>([])
const loading = ref(false)

const filledMembers = computed(() => {
  const result: any[] = []
  if (props.modelValue?.id) {
    result.push(props.modelValue)
  }
  return result.concat(members.value)
})

async function onSearch (search: string) {
  if (search && props.modelValue && search === props.modelValue.name) return
  loading.value = true
  if (search && search.length >= 3) {
    const res = await fetch(`${$sdUrl}/api/organizations/${props.organization.id}/members?q=${encodeURIComponent(search)}`)
    const data = await res.json()
    members.value = data.results
  } else {
    members.value = []
  }
  loading.value = false
}
</script>
