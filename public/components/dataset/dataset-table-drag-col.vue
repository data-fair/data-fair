<template>
  <div
    class="drag-col"
    :style="{
      height: `${height}px`,
      left: `${left}px`,
      'border-right': (hover || dragging) ? `2px solid ${$vuetify.theme.themes.light.primary}` : '1px solid #D1D1D1'
    }"
    @mouseenter="e => {hover = true}"
    @mouseleave="e => {hover = false}"
    @mousedown="mousedown"
  />
</template>

<script>
import { throttle } from 'throttle-debounce'

export default {
  props: {
    height: { type: Number, required: true },
    left: { type: Number, required: true }
  },
  data () {
    return {
      hover: false,
      dragging: false,
      x: null
    }
  },
  mounted () {
    document.addEventListener('mousemove', this.mousemove)
    document.addEventListener('mouseup', this.mouseup)
  },
  destroyed () {
    document.removeEventListener('mousemove', this.mousemove)
    document.removeEventListener('mouseup', this.mouseup)
  },
  methods: {
    mousedown (e) {
      this.dragging = true
      this.x = e.pageX
    },
    mousemove (e) {
      if (!this.dragging) return
      this._throttleMove = this._throttleMove || throttle(20, (e) => {
        this.$emit('move', e.pageX - this.x)
        this.x = e.pageX
      }, { noLeading: true })
      this._throttleMove(e)
    },
    mouseup (e) {
      if (!this.dragging) return
      this.dragging = false
    }
  }
}
</script>

<style>
.drag-col {
  display: inline-block;
  position:absolute;
  bottom: 18px;
  cursor:col-resize;
  user-select:none;
  width: 5px;
  z-index: 3;
}
</style>
