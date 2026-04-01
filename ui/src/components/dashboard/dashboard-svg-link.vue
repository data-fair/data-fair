<template>
  <v-card
    v-bind="cardProps"
    variant="outlined"
  >
    <v-card-title
      class="text-center justify-center text-title-medium pt-4"
      style="word-break: normal; line-height: 1.4rem;"
      :class="{ [`text-${color}`]: !!to, 'pb-0': !!svg }"
    >
      {{ title }}
    </v-card-title>
    <df-themed-svg
      v-if="svg && smAndUp"
      :source="svg"
      :color="color"
      style="width: 100%; padding-left: 34px; padding-right: 34px; margin-top: -16px; margin-bottom: -20px;"
    />
  </v-card>
</template>

<script setup lang="ts">
import { useDisplay } from 'vuetify'

const props = defineProps<{
  to?: string | Record<string, any> | null
  svg?: string
  title: string
  color?: string
}>()

const { smAndUp } = useDisplay()

const color = computed(() => props.color ?? 'primary')

const cardProps = computed(() => {
  if (!props.to) return {}
  return { to: props.to, hover: true }
})
</script>
