<template lang="html">
  <v-container
    data-iframe-height
    fluid
    class="bg-surface"
  >
    <settings-api-keys
      v-if="settings"
      v-model="settings.apiKeys"
      :restricted-scopes="scopes"
      @update:model-value="patch.execute({apiKeys: settings.apiKeys})"
    />
  </v-container>
</template>

<script setup lang="ts">
const route = useRoute<'/settings/[type]/[id]/api-keys'>()
const { patch, settings } = useSettingsStore(route.params.type, route.params.id)

const scopes = computed(() => {
  return (route.query.scopes && typeof route.query.scopes === 'string' && route.query.scopes.split(',')) || undefined
})
</script>
