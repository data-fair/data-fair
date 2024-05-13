<template>
  <div>
    <template v-if="isDigitalDocument">
      <!-- attachment_url is empty if the value is an external link -->
      <a :href="item._attachment_url || itemValue">{{ itemValue?.replace(item._id + '/', '') | truncate(truncate) }}</a>
    </template>
    <template v-else-if="isWebPage">
      <a
        v-if="itemValue"
        target="_blank"
        :href="itemValue"
      >{{ itemValue | truncate(truncate) }}</a>
    </template>
    <template v-else>
      <div
        v-if="field.type === 'string' && field.separator"
        :style="`max-height: ${lineHeight}px;`"
      >
        <v-chip-group
          v-if="itemValue"
          style="max-width:500px;"
          show-arrows
          :class="{'dense-value': dense}"
        >
          <v-chip
            v-for="(value, i) in itemValue.split(field.separator).map(v => v.trim())"
            :key="i"
            :class="{'my-0': true, 'pr-1': isFilterable(value) && dense, 'pr-2': isFilterable(value) && !dense}"
            :color="hovered[value] ? 'primary' : 'default'"
            :small="dense"
            @click="$emit('filter', value)"
            @mouseenter="hoverValue(value)"
            @mouseleave="leaveValue(value)"
          >
            <span>
              {{ value | cellValues(field, truncate) }}
              <v-icon
                v-if="isFilterable(value)"
                :style="{width: '14px'}"
                :size="dense ? 14 : 18"
              >{{ hovered[value] ? 'mdi-filter-variant' : '' }}</v-icon>
            </span>
          </v-chip>
        </v-chip-group>
      </div>

      <div
        v-else
        :style="`max-height:${lineHeight}px;max-width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;margin-left: ${(field['x-refersTo'] === 'https://schema.org/color' && itemValue) ? '12px;' : '0'}`"
        @mouseenter="hoverValue(itemValue)"
        @mouseleave="leaveValue(itemValue)"
      >
        <v-avatar
          v-if="field.key === '_updatedByName' && item._updatedBy && !item._updatedBy.startsWith('apiKey:')"
          :size="28"
        >
          <img :src="`${env.directoryUrl}/api/avatars/user/${item._updatedBy}/avatar.png`">
        </v-avatar>
        <div
          v-if="field['x-refersTo'] === 'https://schema.org/color' && itemValue"
          class="item-value-color-pin"
          :style="`background-color:${itemValue}`"
        />

        <span>
          {{ itemValue | cellValues(field, truncate) }}
        </span>
        <template v-if="hovered[itemValue] && !item._tmpState">
          <v-btn
            v-if="!filters.find(f => f.field.key === field.key) && isFilterable(itemValue)"
            :fab="!dense"
            :icon="dense"
            x-small
            color="primary"
            style="right: 4px;top: 50%;transform: translate(0, -50%);z-index:100;background-color:white;"
            absolute
            :title="$t('filterValue')"
            @click="$emit('filter', itemValue)"
          >
            <v-icon>mdi-filter-variant</v-icon>
          </v-btn>
          <v-btn
            v-else-if="shouldDisplayDetail"
            icon
            style="right: 4px;top: 50%;transform: translate(0, -50%);z-index:100;"
            absolute
            :title="$t('showFullValue')"
            @click="detailDialog = true; fetchFullValue()"
          >
            <v-icon>mdi-loupe</v-icon>
          </v-btn>
        </template>
      </div>
    </template>
    <v-dialog
      v-model="detailDialog"
      max-width="700"
      :overlay-opacity="0"
    >
      <v-card
        :loading="!fullValue"
        outlined
      >
        <v-toolbar
          dense
          flat
          color="transparent"
        >
          <v-spacer />
          <v-btn
            icon
            @click.native="detailDialog = false"
          >
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </v-toolbar>
        <v-card-text>
          <div
            v-if="field['x-display'] === 'textarea'"
            class="item-value-detail item-value-detail-textarea"
          >
            {{ detailValue }}
          </div>
          <div
            v-else-if="field['x-display'] === 'markdown' && !!fullValue"
            class="item-value-detail"
            v-html="fullValue"
          />
          <span v-else>{{ detailValue }}</span>
        </v-card-text>
      </v-card>
    </v-dialog>
  </div>
</template>

<i18n lang="yaml">
fr:
  filterValue: Filtrer les lignes qui ont la même valeur dans cette colonne
  showFullValue: Afficher la valeur entière
en:
  filterValue: Filter the lines that have the same value in this column
  showFullValue: Show full value
</i18n>

<script>
import { mapState, mapGetters } from 'vuex'

export default {
  props: {
    item: { type: Object, required: true },
    field: { type: Object, required: true },
    filters: { type: Array, required: false, default: () => ([]) },
    truncate: { type: Number, default: 50 },
    lineHeight: { type: Number, default: 40 },
    disableHover: { type: Boolean, default: false },
    dense: { type: Boolean, default: false },
    noInteraction: { type: Boolean, default: false }
  },
  data () {
    return {
      hovered: {},
      fullValue: null,
      detailDialog: false
    }
  },
  computed: {
    ...mapState(['env']),
    ...mapGetters('dataset', ['resourceUrl']),
    itemValue () {
      return this.item[this.field.key]
    },
    detailValue () {
      return this.fullValue ?? this.itemValue
    },
    isDigitalDocument () {
      return this.field['x-refersTo'] === 'http://schema.org/DigitalDocument'
    },
    isWebPage () {
      return this.field['x-refersTo'] === 'https://schema.org/WebPage'
    },
    shouldDisplayDetail () {
      if (this.noInteraction) return false
      return this.truncate < this.itemValue.length
    }
  },
  methods: {
    isFilterable (value) {
      if (this.noInteraction) return false
      if (this.field['x-capabilities'] && this.field['x-capabilities'].index === false) return false
      if (this.field['x-refersTo'] === 'https://purl.org/geojson/vocab#geometry') return false
      if (value === undefined || value === null || value === '') return false
      if (typeof value === 'string' && (value.length > 200 || value.startsWith('{'))) return false
      if (typeof value === 'string' && value.endsWith('...')) return false
      return true
    },
    hoverValue (value) {
      if (this.disableHover) return
      this._hoverTimeout = setTimeout(() => { this.$set(this.hovered, value, true) }, 60)
    },
    leaveValue (value) {
      if (this.disableHover) return
      if (this._hoverTimeout) {
        clearTimeout(this._hoverTimeout)
        delete this._hoverTimeout
      }
      this.$delete(this.hovered, value)
    },
    async fetchFullValue () {
      if (this.fullValue) return
      const data = await this.$axios.$get(this.resourceUrl + '/lines', {
        params: {
          qs: `_id:"${this.item._id}"`,
          select: this.field.key,
          html: true
        }
      })
      this.fullValue = data.results[0]?.[this.field.key]
    }
  }
}
</script>

<style>
.v-chip-group.dense-value .v-slide-group__content {
  padding-top: 0 !important;
  padding-bottom: 0 !important;
}
.item-value-color-pin {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: inline-block;
  position: absolute;
  top: 8px;
  left: 2px;
  border: 2px solid #ccc;
}
.item-value-detail-textarea {
  white-space: pre-line;
  overflow-wrap: break-word;
}
.item-value-detail p:last-child {
  margin-bottom: 0;
}
</style>
