import { debounce } from 'throttle-debounce'
import PerfectScrollbar from 'perfect-scrollbar'
import 'perfect-scrollbar/css/perfect-scrollbar.css'

let vuid = 0
let huid = 0

export default {
  data: () => ({
    headerWidths: {},
    scrollTop: 0,
    scrollLeft: 0,
    scrollingHorizontal: false,
    // try to optimize reuse of components in a way similar to
    // https://github.com/Akryum/vue-virtual-scroller/blob/master/packages/vue-virtual-scroller/src/components/RecycleScroller.vue
    horizontalKeys: {},
    freeHorizontalKeys: [],
    verticalKeys: {},
    freeVerticalKeys: [],
    renderFullHeader: false
  }),
  computed: {
    headerWidthsAdjusted () {
      return !this.selectedHeaders.find(header => !(header.value in this.headerWidths))
    },
    totalHeaderWidths () {
      if (!this.headerWidthsAdjusted) return 0
      return this.selectedHeaders.map(header => this.headerWidths[header.value]).reduce((sum, width) => sum + width, 0) + 15
    },
    virtualScrollVertical () {
      const linesBuffer = 8

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

      return { index, topPadding, bottomPadding, results, totalHeight: (nbLoaded * this.lineHeight) + 15 }
    },
    virtualScrollHorizontal () {
      if (!this.headerWidthsAdjusted) return
      const pixelsBuffer = 500
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
    async selectedHeaders () {
      this.renderFullHeader = false
      this.debouncedRenderFullHeader()
      await this.$nextTick()
      if (this._perfectScrollbar) this._perfectScrollbar.update()
    },
    data () {
      this.adjustColsWidths()
    },
    async 'data.results' () {
      this.debouncedRenderFullHeader()
      await this.$nextTick()
      if (this._perfectScrollbar) this._perfectScrollbar.update()
    },
    headerWidthsAdjusted (value) {
      if (!value) this.adjustColsWidths()
    },
    'virtualScrollHorizontal.headers' (value, previousValue) {
      this.debouncedRenderFullHeader()
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
      this.debouncedRenderFullHeader()
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
        if (this._tableWrapper) {
          this._tableWrapper.removeEventListener('ps-scroll-x', this.onTableScrollX)
          this._tableWrapper.removeEventListener('ps-scroll-y', this.onTableScrollY)
        }
        this._tableWrapper = tableWrapper
        // eslint-disable-next-line no-new
        this._perfectScrollbar = new PerfectScrollbar(this._tableWrapper)
        // this._tableWrapper.addEventListener('scroll', this.onTableScroll)
        tableWrapper.addEventListener('ps-scroll-x', this.onTableScrollX)
        tableWrapper.addEventListener('ps-scroll-y', this.onTableScrollY)
      }
    },
    onTableScrollX (e) {
      this._headerWrapper.scrollTo(e.target.scrollLeft, 0)
      this.scrollingHorizontal = true
      this._debounceScrollX = this._debounceScrollX || debounce(60, (e) => {
        this.scrollLeft = e.target.scrollLeft
        this.scrollingHorizontal = false
      }, { noLeading: true })
      this._debounceScrollX(e)
    },
    onTableScrollY (e) {
      this._fixedTableWrapper = this._fixedTableWrapper || document.querySelector('.fixed-data-table .v-data-table__wrapper')
      if (this._fixedTableWrapper) this._fixedTableWrapper.scrollTo(0, e.target.scrollTop)
      this._debounceScrollY = this._debounceScrollY || debounce(60, (e) => {
        this.scrollTop = e.target.scrollTop
      }, { noLeading: true })
      this._debounceScrollY(e)
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
    },
    debouncedRenderFullHeader () {
      if (this.renderFullHeader) return
      this._debouncedRenderFullHeader = this._debouncedRenderFullHeader || debounce(2000, () => {
        this.renderFullHeader = true
      })
      this._debouncedRenderFullHeader()
    }
  }
}
