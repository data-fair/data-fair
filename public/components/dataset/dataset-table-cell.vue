<template>
  <td
    class="pr-0 dataset-table-cell"
    :class="{'pl-2': dense}"
    :style="`height: ${lineHeight}px;position:relative;`"
  >
    <template v-if="header.value === '_thumbnail'">
      <v-avatar
        v-if="item._thumbnail"
        tile
        :size="lineHeight"
      >
        <img :src="item._thumbnail">
      </v-avatar>
    </template>
    <template v-else-if="header.value === '_owner'">
      <v-tooltip top>
        <template #activator="{on}">
          <span
            class="text-body-2"
            v-on="on"
          >
            <v-avatar :size="28">
              <img :src="`${env.directoryUrl}/api/avatars/${item._owner.split(':').join('/')}/avatar.png`">
            </v-avatar>
          </span>
        </template>
        {{ item._owner }}
      </v-tooltip>
    </template>
    <dataset-item-value
      v-else
      :item="item"
      :field="header.field"
      :filters="filters"
      :truncate="truncate"
      :dense="dense"
      :line-height="lineHeight"
      :no-interaction="noInteraction"
      @filter="f => $emit('filter', f)"
    />
  </td>
</template>

<script>
import { mapState } from 'vuex'

export default {
  props: {
    item: { type: Object, required: true },
    header: { type: Object, required: true },
    lineHeight: { type: Number, required: true },
    filters: { type: Array, required: true },
    truncate: { type: Number, required: true },
    dense: { type: Boolean, default: false },
    noInteraction: { type: Boolean, default: false }
  },
  computed: {
    ...mapState(['env'])
  }
}
</script>

<style>
.dataset-table-cell {
  overflow-x: hidden;
}
</style>
