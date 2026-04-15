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
        style="min-height: 112px;"
      >
        <!-- SVG Image -->
        <div
          v-if="svg && display.mdAndUp.value"
          :class="`pa-${svgNoMargin ? 0 : 2} flex-grow-0`"
          style="height: 112px;"
        >
          <df-themed-svg
            :source="svg"
            :color="color"
          />
        </div>

        <div
          class="pl-4 flex-grow-1 d-flex flex-column"
          style="min-width: 0"
        >
          <!-- Title + actions row -->
          <div
            class="d-flex align-start flex-grow-1 py-2 pr-4"
            style="min-height: 64px;"
          >
            <div class="flex-grow-1 text-title-large">
              {{ title }}
              <div
                v-if="subtitle"
                class="text-body-medium"
              >
                {{ subtitle }}
              </div>
            </div>
            <!-- Slot for action buttons (save, discard, ...) -->
            <div
              v-if="$slots.actions"
              class="flex-shrink-0 align-self-center"
            >
              <slot name="actions" />
            </div>
          </div>

          <!-- Tab navigation -->
          <slot name="extension">
            <v-tabs
              v-if="tabs?.some(Boolean)"
              v-model="tab"
              :optional="false"
              :color="color"
              show-arrows
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
