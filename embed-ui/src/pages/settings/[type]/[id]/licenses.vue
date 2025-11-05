<template lang="html">
  <v-container
    data-iframe-height
    fluid
  >
    <settings-licenses
      v-if="settings"
      v-model="settings.licenses"
      @update:model-value="patch.execute({licenses: settings.licenses})"
    />
  </v-container>
</template>

<script setup lang="ts">
useFrameContent()
const route = useRoute<'/settings/[type]/[id]/licenses'>()
const { patch, settings } = useSettingsStore(route.params.type, route.params.id)

</script>
