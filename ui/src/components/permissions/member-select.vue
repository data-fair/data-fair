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
    <template #selection="{ item, internalItem }: any">
      <div
        v-if="getRaw(item, internalItem)?.id"
        class="d-flex align-center"
      >
        <v-avatar
          :size="24"
          :image="`${$sdUrl}/api/avatars/user/${getRaw(item, internalItem).id}/avatar.png`"
          class="mr-2"
        />
        <span>{{ getRaw(item, internalItem).name || getRaw(item, internalItem).id }}</span>
      </div>
    </template>
    <template #item="{ item, internalItem, props: itemProps }: any">
      <v-list-item
        v-bind="itemProps"
        :title="getRaw(item, internalItem).name || getRaw(item, internalItem).id"
      >
        <template #prepend>
          <v-avatar
            v-if="getRaw(item, internalItem).id"
            :size="32"
            :image="`${$sdUrl}/api/avatars/user/${getRaw(item, internalItem).id}/avatar.png`"
            class="mr-3"
          />
        </template>
        <template
          v-if="getRaw(item, internalItem)"
          #subtitle
        >
          {{ getRaw(item, internalItem).email }}
          <span v-if="getRaw(item, internalItem).role"> - {{ roleLabel(getRaw(item, internalItem).role) }}</span>
          <span v-if="getRaw(item, internalItem).department"> - {{ getRaw(item, internalItem).departmentName || getRaw(item, internalItem).department }}</span>
        </template>
      </v-list-item>
    </template>
  </v-autocomplete>
</template>

<i18n lang="yaml">
fr:
  member: Membre de {org}
  noMemberFound: Aucun membre trouvé
  roles:
    admin: Administrateur
    contrib: Contributeur
    user: Utilisateur
en:
  member: Member of {org}
  noMemberFound: No member found
  roles:
    admin: Administrator
    contrib: Contributor
    user: User
</i18n>

<script setup lang="ts">
import { $sdUrl } from '~/context'

const props = defineProps<{
  modelValue: { id: string, name: string, email?: string } | null
  organization: { id: string, name?: string }
  rolesLabels?: Record<string, string>
}>()

type Member = { id: string, name: string, email?: string, role?: string, department?: string, departmentName?: string }

defineEmits<{
  'update:modelValue': [value: Member | null]
}>()

const { t, te } = useI18n()

const roleLabel = (role?: string) => {
  if (!role) return ''
  if (props.rolesLabels?.[role]) return props.rolesLabels[role]
  if (te('roles.' + role)) return t('roles.' + role)
  return role
}

const getRaw = (item: any, internalItem?: any): Member => {
  return (internalItem?.raw ?? item?.raw ?? item ?? {}) as Member
}

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
