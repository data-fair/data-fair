<template>
  <v-autocomplete
    :model-value="modelValue"
    :items="filledMembers"
    :loading="loading"
    item-title="name"
    item-value="id"
    :label="t('member', { org: organization.name })"
    :no-data-text="t('noMemberFound')"
    :no-filter="true"
    required
    return-object
    clearable
    hide-details="auto"
    @update:model-value="$emit('update:modelValue', $event)"
    @update:search="onSearch"
  >
    <template #selection="{ item }">
      <div class="d-flex align-center">
        <v-avatar
          v-if="item.raw.id"
          :size="24"
          :image="`${$sdUrl}/api/avatars/user/${item.raw.id}/avatar.png`"
          class="mr-2"
        />
        <span>{{ item.raw.name }}</span>
      </div>
    </template>
    <template #item="{ item, props: itemProps }: any">
      <v-list-item
        v-bind="itemProps"
        :prepend-avatar="`${$sdUrl}/api/avatars/user/${item.raw.id}/avatar.png`"
      >
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
  noMemberFound: Aucun membre trouvé
en:
  member: Member of {org}
  noMemberFound: No member found
</i18n>

<script setup lang="ts">
import { $sdUrl } from '~/context'

const props = defineProps<{
  modelValue: { id: string, name: string, email?: string } | null
  organization: { id: string, name?: string }
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
  if (props.modelValue?.id && !members.value.some(m => m.id === props.modelValue?.id)) {
    result.push(props.modelValue)
  }
  return result.concat(members.value)
})

async function fetchMembers (search: string = '') {
  if (!props.organization?.id) return
  loading.value = true
  try {
    const url = search
      ? `${$sdUrl}/api/organizations/${props.organization.id}/members?q=${encodeURIComponent(search)}`
      : `${$sdUrl}/api/organizations/${props.organization.id}/members`
    const res = await fetch(url)
    const data = await res.json()
    members.value = data.results || []
  } catch {
    members.value = []
  } finally {
    loading.value = false
  }
}

async function onSearch (search: string) {
  if (search && props.modelValue && search === props.modelValue.name) return
  if (!search) {
    await fetchMembers('')
    return
  }
  await fetchMembers(search)
}

onMounted(() => {
  fetchMembers('')
})

watch(() => props.organization.id, () => {
  fetchMembers('')
})
</script>
