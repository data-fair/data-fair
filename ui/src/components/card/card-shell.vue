<template>
  <!-- common frame of every resource card: the header, then the rest (body lines, chips, footer pinned to the bottom);
       in a df-card-grid these 2 blocks take the row tracks of the line, so titles of 1 and 2 lines keep the bodies aligned -->
  <v-card
    :to="to"
    :href="href"
    :target="target"
    class="h-100 df-card"
  >
    <div class="d-flex align-start ga-3 px-2 pt-2">
      <slot name="prepend" />
      <div
        class="df-card-title text-title-medium text-primary font-weight-bold flex-grow-1"
        :title="title"
      >
        {{ title }}
      </div>
      <slot name="append" />
      <!-- optical correction: a circle touches each edge at one point and looks further in than the straight title -->
      <span
        v-if="owner"
        class="d-inline-flex flex-shrink-0"
        style="margin: -3px -3px 0 0"
      >
        <owner-avatar
          :owner="owner"
          :omit-owner-name="omitOwnerName"
        />
      </span>
    </div>
    <div class="d-flex flex-column">
      <slot name="media" />
      <div
        v-if="$slots.default"
        class="d-flex flex-column ga-1 px-2 pt-3"
      >
        <slot />
      </div>
      <div
        class="flex-grow-1"
        style="min-height: 12px"
      />
      <div
        v-if="$slots.chips"
        class="d-flex flex-wrap ga-1 px-2 pb-2"
      >
        <slot name="chips" />
      </div>
      <v-divider />
      <!-- a v-spacer in the footer pushes what follows it to the right -->
      <!-- pa-1 here + px-1 on the footer text buttons: content at the 8px of the card, hover overlay off the edge -->
      <v-card-actions
        class="pa-1 ga-0 text-body-small"
        style="min-height: auto"
      >
        <slot name="footer" />
      </v-card-actions>
    </div>
  </v-card>
</template>

<script setup lang="ts">
import ownerAvatar from '@data-fair/lib-vuetify/owner-avatar.vue'

defineProps<{
  title: string
  to?: string
  href?: string
  target?: string
  // shown as an avatar top right, the caller decides when (usually a department seen from outside of it)
  owner?: Record<string, any>
  omitOwnerName?: boolean
}>()
</script>

<style>
.df-card { transition: border-color .15s; display: grid; grid-template-rows: auto 1fr; }
.df-card > * { min-width: 0; }
/* opt-in class on a v-row of cards (v-col cols=12 sm=6 md=4, vuetify 4 breakpoints): each line of cards shares
   2 row tracks through subgrid, the header one is as tall as the tallest title of the line */
/* vuetify 4 rows space their cols with a 24px gap: vertically it would split the title from the body, a margin replaces it */
.df-card-grid { display: grid !important; grid-template-columns: minmax(0, 1fr); row-gap: 0 !important; }
@media (min-width: 600px) { .df-card-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (min-width: 840px) { .df-card-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
.df-card-grid > .v-col { max-width: none; flex: none; grid-row: span 2; display: grid; grid-template-rows: subgrid; margin-bottom: 24px; }
.df-card-grid > .v-col > * { grid-row: span 2; }
/* the card, or the link wrapping it (portals custom-router-link) */
.df-card-grid > .v-col > .df-card, .df-card-grid > .v-col > :has(> .df-card) { display: grid; grid-template-rows: subgrid; }
.df-card-grid > .v-col > * > .df-card { grid-row: span 2; grid-template-rows: subgrid; }
.df-card:hover { border-color: rgb(var(--v-theme-primary)) !important; }
/* a shrinking footer button (card-hover-info) truncates its text: its content grid cell must be allowed to shrink */
.df-card-shrink > .v-btn__content { min-width: 0; }
/* vuetify has no line clamp class */
.df-card-title, .df-card-desc { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
</style>
