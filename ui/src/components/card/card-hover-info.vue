<template>
  <!-- a footer element with its details in a card opened on hover -->
  <v-menu
    open-on-hover
    :open-delay="150"
    :location="end ? 'top end' : 'top start'"
    :close-on-content-click="false"
  >
    <template #activator="{ props: activator }">
      <!-- a text button for its native hover effect, as a span: a button cannot sit in the card link -->
      <v-btn
        v-bind="activator"
        tag="span"
        variant="text"
        size="small"
        min-width="0"
        :ripple="false"
        class="px-1 text-none font-weight-regular cursor-help"
        :class="shrink ? 'df-card-shrink flex-shrink-1 overflow-hidden' : 'flex-shrink-0'"
      >
        <span class="d-flex align-center ga-2 overflow-hidden">
          <slot />
        </span>
      </v-btn>
    </template>
    <v-card
      elevation="2"
      max-width="280"
      min-width="220"
      class="pa-3 text-body-medium"
    >
      <div
        v-if="title || icon"
        class="d-flex align-start ga-2 font-weight-bold mb-1"
      >
        <v-icon
          v-if="icon"
          :icon="icon"
          :color="iconColor"
          size="18"
          class="flex-shrink-0"
          style="margin-top: 1px"
        />
        <span>{{ title }}</span>
      </div>
      <slot name="help" />
    </v-card>
  </v-menu>
</template>

<script setup lang="ts">
defineProps<{ title?: string, icon?: string, iconColor?: string, end?: boolean, shrink?: boolean }>()
</script>
