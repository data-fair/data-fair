<template lang="html">
  <v-dialog
    :value="value"
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
          @click.native="$emit('input', false)"
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
          v-else-if="(field['x-display'] === 'markdown' || field['x-refersTo'] === 'http://schema.org/description') && !!fullValue"
          class="item-value-detail"
          v-html="fullValue"
        />
        <span v-else>{{ detailValue }}</span>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script>
import { mapGetters } from 'vuex'

export default {
  props: {
    item: { type: Object, required: true },
    field: { type: Object, required: true },
    value: { type: Boolean, default: false }
  },
  data () {
    return {
      fullValue: null
    }
  },
  computed: {
    ...mapGetters('dataset', ['resourceUrl']),
    itemValue () {
      return this.item[this.field.key]
    },
    detailValue () {
      return this.fullValue ?? this.itemValue
    }
  },
  watch: {
    value (val) {
      if (val) this.fetchFullValue()
    }
  },
  methods: {
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
