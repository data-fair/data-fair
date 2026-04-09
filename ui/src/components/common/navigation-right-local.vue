<template>
  <!-- Right-side panel teleported into the layout's #nav-right-portal (sticky inside v-main scroll container) -->
  <Teleport
    v-if="display.lgAndUp.value"
    to="#nav-right-portal"
    defer
  >
    <v-list
      data-iframe-height
      bg-color="background"
      density="compact"
    >
      <v-defaults-provider :defaults="defaults">
        <slot />
      </v-defaults-provider>
    </v-list>
  </Teleport>

  <!-- Floating action button for smaller screens -->
  <v-fab
    v-else
    size="small"
    color="primary"
    location="top right"
    app
    icon
  >
    <v-icon
      :icon="mdiDotsVertical"
    />
    <v-menu
      activator="parent"
      :close-on-content-click="false"
    >
      <v-card
        max-width="300"
        class="mt-2"
      >
        <v-list
          data-iframe-height
          density="compact"
        >
          <v-defaults-provider :defaults="defaults">
            <slot />
          </v-defaults-provider>
        </v-list>
      </v-card>
    </v-menu>
  </v-fab>
</template>

<script setup lang="ts">
import { mdiDotsVertical } from '@mdi/js'
import { useDisplay } from 'vuetify'

const display = useDisplay()

const defaults = {
  VListItem: {
    rounded: true
  },
  VAutocomplete: {
    color: 'primary',
    density: 'compact',
    variant: 'outlined',
    clearable: true,
    hideDetails: true,
    rounded: true,
  },
  VSelect: {
    color: 'primary',
    density: 'compact',
    variant: 'outlined',
    clearable: true,
    hideDetails: true,
    rounded: true
  },
  VSwitch: {
    hideDetails: true
  }
}
</script>
