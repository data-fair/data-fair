<template>
  <v-container
    data-iframe-height
  >
    <settings-licenses
      v-if="settings"
      v-model="settings.licenses"
      @update:model-value="patch.execute({licenses: settings.licenses})"
    />
  </v-container>
</template>

<script setup lang="ts">
const route = useRoute<'/embed/settings/[type]/[id]/licenses'>()
const { patch, settings } = useSettingsStore(route.params.type, route.params.id)

</script>
