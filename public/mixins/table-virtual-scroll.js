import { throttle, debounce } from 'throttle-debounce'

export default {
  data: () => ({
    originalHeaderWidths: {},
    headerWidths: {},
    totalHeaderWidth: 0,
    scrollTop: 0,
    scrollLeft: 0,
    scrollingHorizontal: false,
    scrollingVertical: false
  }),
  computed: {
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
      return { index, nbRendered, topPadding, bottomPadding }
    },
    virtualScrollHorizontal () {
      if (!this.totalHeaderWidth) return
      const pixelsBuffer = 1000
      let x = 0
      let leftPadding = 0
      let index = 0
      let rightPadding = 0
      let last = 0
      for (const header of this.selectedHeaders) {
        if (x < this.scrollLeft + this.windowWidth + pixelsBuffer) {
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

      return { leftPadding, index, nbRendered: last - index, rightPadding }
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
    }
  },
  watch: {
    scrollTop (value, previousValue) {
      if (this.virtualScrollVertical && this.virtualScrollVertical.bottomPadding <= 1000) {
        this.fetchMore()
      }
    }
  },
  methods: {
    async measureHeaders () {
      await this.$nextTick()

      // in table mode the header is outside the actual table so that we can have
      // infinite scroll, horizontal scroll and fixed header at the same time

      // sync cols widths
      const children = this.$el.querySelectorAll('th.dataset-table-header')
      let totalWidth = 0
      for (const child of children) {
        if (this.headerWidths[child.attributes['data-header'].value] !== child.clientWidth) {
          this.$set(this.headerWidths, child.attributes['data-header'].value, child.clientWidth)
        }
        totalWidth += child.clientWidth
      }
      this.originalHeaderWidths = { ...this.headerWidths }
      this.totalHeaderWidth = totalWidth
    },
    watchTableScroll () {
      this._headerWrapper = document.querySelector('.header-data-table .v-data-table__wrapper')
      const tableWrapper = document.querySelector('.real-data-table .v-data-table__wrapper')
      if (this.displayMode === 'table' && this._tableWrapper !== tableWrapper) {
        if (this._tableWrapper) this._tableWrapper.removeEventListener('scroll', this.onTableScroll)
        this._tableWrapper = tableWrapper
        this._tableWrapper.addEventListener('scroll', this.onTableScroll)
      }
    },
    onTableScroll (e) {
      this._headerWrapper.scrollTo(e.target.scrollLeft, 0)

      if (e.target.scrollLeft !== this.scrollLeft) this.scrollingHorizontal = true
      if (e.target.scrollTop !== this.scrollTop) this.scrollingVertical = true

      this._throttleScroll = this._throttleScroll || throttle(20, (e) => {
        this.scrollTop = e.target.scrollTop
        this.scrollLeft = e.target.scrollLeft
      }, { noLeading: true })
      this._throttleScroll(e)

      this._debounceScroll = this._debounceScroll || debounce(20, () => {
        this.scrollingHorizontal = false
        this.scrollingVertical = false
      })
      this._debounceScroll()
    }
  }
}
