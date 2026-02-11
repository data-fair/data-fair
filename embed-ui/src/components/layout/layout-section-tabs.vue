<template>
  <div
    :id="id"
    class="mt-3 mb-10"
  >
    <v-card
      :style="cardStyle"
      color="primary"
      border="0"
    >
      <div
        class="d-flex flex-no-wrap"
        style="height: 112px; width: 100%;"
      >
        <div
          v-if="svg && display.mdAndUp.value"
          :class="`pa-${svgNoMargin ? 0 : 2} flex-grow-0`"
        >
          <layout-themed-svg
            :source="svg"
            :color="color"
          />
        </div>
        <div class="pl-4 flex-grow-1">
          <v-toolbar
            extended
            flat
            style="background-color:transparent"
          >
            <v-toolbar-title class="text-h5">
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
                  <template
                    v-for="(tabInfo, i) in tabs"
                    :key="i"
                  >
                    <v-tab
                      v-if="tabInfo"
                      :value="tabInfo.key"
                      :append-icon="tabInfo.appendIcon"
                      :base-color="tabInfo.color"
                      :color="tabInfo.color"
                    >
                      <v-icon
                        v-if="tabInfo.icon"
                        :icon="tabInfo.icon"
                      />&nbsp;&nbsp;{{ tabInfo.title }}
                    </v-tab>
                  </template>
                </v-tabs>
              </slot>
            </template>
          </v-toolbar>
        </div>
      </div>
    </v-card>
    <slot
      name="content"
      :tab="tab"
    />
  </div>
</template>

<script lang="ts" setup>
import { useDisplay } from 'vuetify/lib/composables/display.js'
import { useTheme } from 'vuetify/lib/composables/theme.mjs'

type TabInfo = { key: string, title: string, icon?: string, appendIcon?: string, color?: string } | null

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

const cardStyle = computed(() => `background: linear-gradient(90deg, ${theme.current.value.colors.surface} 0%, ${theme.current.value.colors.background} 20%`)
</script>
