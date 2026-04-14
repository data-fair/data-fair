<template>
  <div
    :id="id"
    class="mt-2 mb-10"
  >
    <v-card
      class="rounded-lg"
      :style="`border-left: 3px solid rgb(var(--v-theme-${color}))`"
    >
      <div
        class="d-flex flex-no-wrap w-100"
        style="height: 112px;"
      >
        <!-- SVG Image -->
        <div
          v-if="svg && display.mdAndUp.value"
          :class="`pa-${svgNoMargin ? 0 : 2} flex-grow-0`"
        >
          <df-themed-svg
            :source="svg"
            :color="color"
          />
        </div>

        <div
          class="pl-4 flex-grow-1"
          style="min-width: 0"
        >
          <v-toolbar
            color="surface"
            extended
            flat
          >
            <v-toolbar-title class="text-title-large">
              {{ title }}
              <div
                v-if="subtitle"
                class="text-body-medium"
              >
                {{ subtitle }}
              </div>
            </v-toolbar-title>

            <!-- Slot for action buttons (save, discard, ...) -->
            <template
              v-if="$slots.actions"
              #append
            >
              <slot name="actions" />
            </template>

            <!-- Tab navigation -->
            <template #extension>
              <slot name="extension">
                <v-tabs
                  v-model="tab"
                  :optional="false"
                  show-arrows
                  :color="color"
                >
                  <template
                    v-for="(tabInfo, i) in tabs"
                    :key="i"
                  >
                    <v-tab
                      v-if="tabInfo"
                      :value="tabInfo.key"
                      :prepend-icon="tabInfo.icon"
                      :append-icon="tabInfo.appendIcon"
                      :base-color="tabInfo.color"
                      :color="tabInfo.color"
                      :text="tabInfo.title"
                    />
                  </template>
                </v-tabs>
              </slot>
            </template>
          </v-toolbar>
        </div>
      </div>
    </v-card>

    <!-- Tab windows (rendered below the card, in page flow) -->
    <v-tabs-window
      v-if="$slots.windows"
      :model-value="tab"
      class="pa-4"
    >
      <slot name="windows" />
    </v-tabs-window>

    <!--
      Content for tabs without windows
      (or compatibility with older versions)
    -->
    <slot
      name="content"
      :tab="tab"
    />
  </div>
</template>

<script lang="ts" setup>
import { useDisplay } from 'vuetify'
import DfThemedSvg from '@data-fair/lib-vuetify/themed-svg.vue'

type TabInfo = { key: string, title: string, icon?: string, appendIcon?: string, color?: string } | null

const { color = 'primary' } = defineProps<{
  id: string,
  title: string,
  subtitle?: string,
  tabs?: TabInfo[],
  svg?: string,
  svgNoMargin?: boolean,
  color?: string,
}>()
const tab = defineModel({ type: String })

const display = useDisplay()
</script>
