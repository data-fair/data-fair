<template>
  <div
    :id="id"
    class="mt-3 mb-10"
  >
    <div
      style="padding-top: 2px; padding-left: 2px; padding-bottom: 2px;"
      :style="`background: linear-gradient(172deg, ${theme.current.value.colors[color]} 0%, ${theme.current.value.colors.background} 55%);`"
    >
      <v-card
        :border="0"
        :rounded="0"
        :style="`background: linear-gradient(172deg, ${theme.current.value.colors.surface} 0%, ${theme.current.value.colors.surface} 30%, ${theme.current.value.colors.background} 60%);`"
      >
        <div
          class="d-flex flex-no-wrap"
          style="height: 112px; width: 100%;"
        >
          <div :class="`pa-${svgNoMargin ? 0 : 2} flex-grow-0`">
            <layout-themed-svg
              v-if="svg && display.mdAndUp"
              :source="svg"
              :color="color"
            />
          </div>
          <div class="pl-4 flex-grow-1">
            <v-toolbar
              extended
              flat
              style="background-color: transparent;"
            >
              <v-toolbar-title>
                {{ title }}
              </v-toolbar-title>
              <template #extension>
                <slot name="extension">
                  <v-tabs
                    v-model="tab"
                    :optional="false"
                    style="margin-bottom: 1px;"
                    show-arrows
                    :color="color"
                  >
                    <slot name="tabs">
                      <v-tab
                        v-for="tabInfo in tabs"
                        :key="tabInfo.key"
                      >
                        <v-icon
                          v-if="tabInfo.icon"
                          :icon="tabInfo.icon"
                        />&nbsp;&nbsp;{{ tabInfo.title }}
                      </v-tab>
                    </slot>
                  </v-tabs>
                </slot>
              </template>
            </v-toolbar>
          </div>
        </div>
      </v-card>
    </div>
    <v-tabs-window v-model="tab">
      <slot name="tabs-window" />
    </v-tabs-window>
  </div>
</template>

<script lang="ts" setup>
import { useDisplay } from 'vuetify/lib/composables/display.js'
import { useTheme } from 'vuetify/lib/composables/theme.js'

type TabInfo = { key: string, title: string, icon?: string }

const { title, tabs, svg, color = 'primary' } = defineProps<{
  id: string,
  title: string,
  tabs?: TabInfo[],
  svg?: string,
  svgNoMargin?: boolean,
  color?: string,
}>()
const tab = defineModel({ type: String })

const display = useDisplay()
const theme = useTheme()
</script>
