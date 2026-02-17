<template lang="html">
  <v-container
    data-iframe-height
    fluid
  >
    <settings-webhooks
      v-if="settings"
      v-model="settings.webhooks"
      @update:model-value="patch.execute({webhooks: settings.webhooks})"
    />
  </v-container>
</template>

<script setup lang="ts">

const route = useRoute<'/settings/[type]/[id]/webhooks'>()
const { patch, settings } = useSettingsStore(route.params.type, route.params.id)

</script>
