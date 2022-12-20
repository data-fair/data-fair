import { debounce } from 'throttle-debounce'

let vuid = 0
let huid = 0

export default {
  data: () => ({
    headerWidths: {},
    scrollTop: 0,
    scrollLeft: 0,
    scrollingHorizontal: false,
    scrollingVertical: false,
    // try to optimize reuse of components in a way similar to
    // https://github.com/Akryum/vue-virtual-scroller/blob/master/packages/vue-virtual-scroller/src/components/RecycleScroller.vue
    horizontalKeys: {},
    freeHorizontalKeys: [],
    verticalKeys: {},
    freeVerticalKeys: []
  }),
  computed: {
    headerWidthsAdjusted () {
      return !this.selectedHeaders.find(header => !(header.value in this.headerWidths))
    },
    totalHeaderWidths () {
      if (!this.headerWidthsAdjusted) return 0
      return this.selectedHeaders.map(header => this.headerWidths[header.value]).reduce((sum, width) => sum + width, 0)
    },
    virtualScrollVertical () {
      const linesBuffer = 10

      // index is equivalent to the number of lines hidden at the top
      const index = Math.max(0, Math.floor(this.scrollTop / this.lineHeight) - linesBuffer)
      // number of lines available in memory
      const nbLoaded = this.data.results ? this.data.results.length : 0
      // number of lines visible on the screen
      const nbVisible = Math.ceil(this.tableHeight / this.lineHeight)
      // number of lines rendered by virtual scrolling
      const nbRendered = Math.min(nbLoaded - index, nbVisible + (linesBuffer * 2))

      // blank space on top of table matching the non-rendered lines
      const topPadding = index * this.lineHeight
      // blank space at bottom of table matching the non-rendered lines
      const bottomPadding = Math.max(nbLoaded - index - nbRendered, 0) * this.lineHeight

      const results = this.data.results ? this.data.results.slice(index, index + nbRendered) : []

      return { index, topPadding, bottomPadding, results, totalHeight: nbLoaded * this.lineHeight }
    },
    virtualScrollHorizontal () {
      if (!this.headerWidthsAdjusted) return
      const pixelsBuffer = 1000
      let x = 0
      let leftPadding = 0
      let index = 0
      let rightPadding = 0
      let last = 0
      for (const header of this.selectedHeaders) {
        if (x < this.scrollLeft + this.tableWidth + pixelsBuffer) {
          last++
        } else {
          rightPadding += this.headerWidths[header.value]
        }
        x += this.headerWidths[header.value]
        if (x < this.scrollLeft - pixelsBuffer) {
          index++
          leftPadding += this.headerWidths[header.value]
        }
      }
      rightPadding = Math.max(40, rightPadding)

      const headers = this.selectedHeaders.slice(index, last)

      return { index, leftPadding, rightPadding, headers }
    },
    headersPositions () {
      if (!this.headerWidths) return
      const headersPositions = {}
      let p = 0
      for (const header of this.selectedHeaders) {
        p += this.headerWidths[header.value]
        headersPositions[header.value] = p
      }
      return headersPositions
    },
    fixedColWidth () {
      if (!this.fixedCol) return 0
      return this.headerWidths[this.fixedCol]
    },
    tableWidth () {
      return this.windowWidth - this.fixedColWidth
    }
  },
  watch: {
    scrollTop (value, previousValue) {
      if (this.virtualScrollVertical && this.virtualScrollVertical.bottomPadding <= 1000) {
        this.fetchMore()
      }
    },
    data () {
      this.adjustColsWidths()
    },
    headerWidthsAdjusted (value) {
      if (!value) this.adjustColsWidths()
    },
    'virtualScrollHorizontal.headers' (value, previousValue) {
      if (previousValue) {
        for (const previousHeader of previousValue) {
          if (!value.find(header => header.value === previousHeader.value)) {
            this.freeHorizontalKeys.push(this.horizontalKeys[previousHeader.value])
            delete this.horizontalKeys[previousHeader.value]
          }
        }
      }
      for (const header of value) {
        if (!this.horizontalKeys[header.value]) {
          this.$set(this.horizontalKeys, header.value, this.freeHorizontalKeys.pop() || huid++)
        }
      }
    },
    'virtualScrollVertical.results' (value, previousValue) {
      if (previousValue) {
        for (const previousResult of previousValue) {
          if (!value.find(result => result._id === previousResult._id)) {
            this.freeVerticalKeys.push(this.verticalKeys[previousResult._id])
            delete this.verticalKeys[previousResult._id]
          }
        }
      }
      for (const result of value) {
        if (!this.verticalKeys[result._id]) {
          this.$set(this.verticalKeys, result._id, this.freeVerticalKeys.pop() || vuid++)
        }
      }
    }
  },
  methods: {
    async watchTableScroll () {
      await this.$nextTick()
      this._headerWrapper = document.querySelector('.header-data-table .v-data-table__wrapper')
      this._fixedTableWrapper = document.querySelector('.fixed-data-table .v-data-table__wrapper')
      const tableWrapper = document.querySelector('.real-data-table .v-data-table__wrapper')
      if (this.displayMode === 'table' && this._tableWrapper !== tableWrapper) {
        if (this._tableWrapper) this._tableWrapper.removeEventListener('scroll', this.onTableScroll)
        this._tableWrapper = tableWrapper
        this._tableWrapper.addEventListener('scroll', this.onTableScroll)
      }
    },
    async onTableScroll (e) {
      this._headerWrapper.scrollTo(e.target.scrollLeft, 0)
      this._fixedTableWrapper = this._fixedTableWrapper || document.querySelector('.fixed-data-table .v-data-table__wrapper')
      if (this._fixedTableWrapper) this._fixedTableWrapper.scrollTo(0, e.target.scrollTop)
      await this.$nextTick()
      if (e.target.scrollLeft !== this.scrollLeft) this.scrollingHorizontal = true
      if (e.target.scrollTop !== this.scrollTop) this.scrollingVertical = true

      this._debounceScroll = this._debounceScroll || debounce(60, (e) => {
        this.scrollTop = e.target.scrollTop
        this.scrollLeft = e.target.scrollLeft
        this.scrollingHorizontal = false
        this.scrollingVertical = false
      }, { noLeading: true })
      this._debounceScroll(e)
    },
    adjustColsWidths () {
      if (!this.data.results || !this.headers) return
      for (const header of this.headers) {
        if (this.headerWidths[header.value]) return
        const estimatedHeaderSize = ((header.text.length / 2) * 9) + 46
        this.$set(this.headerWidths, header.value, estimatedHeaderSize)
        for (const result of this.data.results) {
          if (!(header.value in result)) continue
          const estimatedSize = (Math.min(50, (result[header.value] + '').length) * 9) + 16
          if (estimatedSize > this.headerWidths[header.value]) this.headerWidths[header.value] = estimatedSize
        }
      }
    }
  }
}
