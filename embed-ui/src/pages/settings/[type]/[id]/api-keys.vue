<template lang="html">
  <v-container
    data-iframe-height
    fluid
  >
    <settings-api-keys
      v-if="settings"
      :settings="settings"
      :restricted-scopes="scopes"
      @updated="save.execute($event)"
    />
  </v-container>
</template>

<script setup lang="ts">
import type { Settings } from '#api/types'

useFrameContent()
const route = useRoute<'/embed/settings/[type]/[id]/api-keys'>()
const settings = ref<Settings | null>(null)

const scopes = computed(() => {
  return (route.query.scopes && typeof route.query.scopes === 'string' && route.query.scopes.split(',')) || undefined
})

const save = useAsyncAction(async (updatedSettings: Settings) => {
  settings.value = await $fetch('/settings/' + route.params.type + '/' + route.params.id, {
    method: 'PUT',
    body: JSON.stringify(updatedSettings)
  })
}, {
  error: 'Erreur pendant la mise à jour des paramètres',
  success: 'Les paramètres ont été mis à jour'
})

onMounted(async () => {
  settings.value = await $fetch('/settings/' + route.params.type + '/' + route.params.id, {
    method: 'GET'
  })
})

</script>
