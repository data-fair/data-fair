<template>
  <v-card>
    <div
      class="d-flex flex-no-wrap justify-space-between"
      style="height: 112px"
    >
      <layout-themed-svg
        v-if="showSvg"
        :source="svg"
      />
      <v-toolbar
        extended
        flat
        :title="title"
        color="surface"
      >
        <template #extension>
          <slot name="extension">
            <v-tabs
              v-model="tab"
              :optional="false"
              style="margin-bottom: 1px;"
              show-arrows
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
  </v-card>
  <v-tabs-window v-model="tab">
    <slot name="tabs-window-items" />
  </v-tabs-window>
</template>

<script lang="ts" setup>
import { useDisplay } from 'vuetify/lib/composables/display.js'

type TabInfo = { key: string, title: string, icon?: string }

const { title, tabs, svg } = defineProps<{ title: string, tabs?: TabInfo[], svg?: string }>()
const tab = defineModel({ type: String })

const display = useDisplay()

const showSvg = computed(() => !!svg && display.mdAndUp)
</script>
