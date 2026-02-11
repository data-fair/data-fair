<template>
  <div
    :id="id"
    class="mt-3 mb-10"
  >
    <layout-gradient-box gradient="linear-gradient(180deg, {primary} 0%, {surface} 120%">
      <v-card :border="0">
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
              color="surface"
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
                    <v-tab
                      v-for="tabInfo in tabs"
                      :key="tabInfo.key"
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
                  </v-tabs>
                </slot>
              </template>
            </v-toolbar>
          </div>
        </div>
      </v-card>
    </layout-gradient-box>
    <slot
      name="content"
      :tab="tab"
    />
  </div>
</template>

<script lang="ts" setup>
import { useDisplay } from 'vuetify/lib/composables/display.js'

type TabInfo = { key: string, title: string, icon?: string, appendIcon?: string, color?: string }

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
</script>
