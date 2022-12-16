export default {
  data: () => ({
    headerWidths: {},
    totalHeaderWidth: 0,
    scrollHeader: 0,
    scrollTop: 0,
    scrollLeft: 0,
    scrolling: false
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
    }
  },
  methods: {
    async measureHeaders (resetIndex) {
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
      this.totalHeaderWidth = totalWidth
    },
    watchTableScroll () {
      const tableWrapper = document.querySelector('.real-data-table .v-data-table__wrapper')
      if (this.displayMode === 'table' && this._tableWrapper !== tableWrapper) {
        if (this._tableWrapper) this._tableWrapper.removeEventListener('scroll', this.onTableScroll)
        this._tableWrapper = tableWrapper
        this.scrollHeader = this._tableWrapper.scrollLeft
        this._tableWrapper.addEventListener('scroll', this.onTableScroll)
      }
    },
    onTableScroll (e) {
      this.scrollHeader = e.target.scrollLeft
      this.scrolling = true
      if (this._scrollTimeout) clearTimeout(this._scrollTimeout)
      this._scrollTimeout = setTimeout(() => {
        this.scrollTop = e.target.scrollTop
        this.scrollLeft = e.target.scrollLeft
        this.scrolling = false
      }, 20)
    }
  }
}
