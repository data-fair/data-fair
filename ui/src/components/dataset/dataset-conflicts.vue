<template>
  <div v-if="conflicts && conflicts.length">
    <v-alert
      :title="t('conflicts')"
      color="warning"
      variant="outlined"
      density="compact"
      max-width="800"
    >
      <v-list bg-color="background">
        <v-list-item
          v-for="(conflict, i) in conflicts"
          :key="i"
        >
          <v-list-item-title>
            <a
              :href="`/data-fair/dataset/${conflict.dataset.id}`"
              target="_blank"
            >
              {{ conflict.dataset.title }}
            </a>
          </v-list-item-title>

          <v-list-item-subtitle>
            {{ t('conflict_' + conflict.conflict) }}
          </v-list-item-subtitle>
        </v-list-item>
      </v-list>
    </v-alert>

    <v-checkbox
      v-model="ignoreConflicts"
      :label="t('ignoreConflicts')"
      color="warning"
      hide-details
    />
  </div>
</template>

<script setup lang="ts">
import type { AccountKeys } from '@data-fair/lib-vue/session'

interface Conflict {
  dataset: { id: string, title: string }
  conflict: 'filename' | 'title'
}

const props = defineProps<{
  title?: string
  filename?: string
  owner: AccountKeys
}>()

const conflictsOk = defineModel<boolean>({ default: false })

const { t } = useI18n()

const conflicts = ref<Conflict[] | null>(null)
const ignoreConflicts = ref(false)

const ownerStr = computed(() => {
  let str = `${props.owner.type}:${props.owner.id}`
  if (props.owner.department) str += `:${props.owner.department}`
  return str
})

const updateConflictsOk = () => {
  conflictsOk.value = ignoreConflicts.value || (conflicts.value !== null && conflicts.value.length === 0)
}

watch(ignoreConflicts, updateConflictsOk)
watch(conflicts, updateConflictsOk)

const getConflicts = async () => {
  const results: Conflict[] = []
  const seenIds = new Set<string>()

  if (props.filename) {
    const res = await $fetch<{ results: Array<{ id: string, title: string }> }>(
      `${$apiPath}/datasets`,
      { query: { filename: props.filename, owner: ownerStr.value, select: 'id,title', size: 5 } }
    )
    for (const dataset of res.results) {
      if (!seenIds.has(dataset.id)) {
        seenIds.add(dataset.id)
        results.push({ dataset, conflict: 'filename' })
      }
    }
  }

  if (props.title) {
    const res = await $fetch<{ results: Array<{ id: string, title: string }> }>(
      `${$apiPath}/datasets`,
      { query: { title: props.title, owner: ownerStr.value, select: 'id,title', size: 5 } }
    )
    for (const dataset of res.results) {
      if (!seenIds.has(dataset.id)) {
        seenIds.add(dataset.id)
        results.push({ dataset, conflict: 'title' })
      }
    }
  }

  conflicts.value = results
}

watch(() => [props.title, props.filename, ownerStr.value], () => {
  ignoreConflicts.value = false
  getConflicts()
}, { immediate: true })
</script>

<i18n lang="yaml">
fr:
  conflicts: Doublons potentiels
  ignoreConflicts: Ignorer ces doublons potentiels
  conflict_filename: Le nom de fichier est identique
  conflict_title: Le titre du jeu de données est identique
en:
  conflicts: Potential duplicates
  ignoreConflicts: Ignore these potential duplicates
  conflict_filename: The filename is the same
  conflict_title: The dataset title is the same
</i18n>
