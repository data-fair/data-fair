export default {
  data: () => ({
    headerWidths: [],
    scrollHeader: 0,
    scrollTop: 0,
    scrolling: false,
    headerIndex: 0,
    nbVisibleHeaders: 0,
    totalHeaderWidth: 0
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
      return { first: index, last: index + nbRendered, index, nbRendered, topPadding, bottomPadding }
    },
    virtualScrollHorizontal () {
      if (!this.totalHeaderWidth) return
      let x = 0
      let before = 0
      let first = 0
      let last = 0
      let after = 0
      for (const header of this.selectedHeaders) {
        if (x < this.scrollLeft + this.windowWidth) {
          last++
        } else {
          after += this.headerWidths[header.value]
        }
        x += this.headerWidths[header.value]
        if (x < this.scrollLeft) {
          first++
          before += this.headerWidths[header.value]
        }
      }
      return { before, first, last, after, scrollLeft: this.scrollLeft, x }
    }
  },
  methods: {
    async syncHeader (resetIndex) {
      if (resetIndex) this.headerIndex = 0

      await this.$nextTick()

      // in table mode the header is outside the actual table so that we can have
      // infinite scroll, horizontal scroll and fixed header at the same time

      // sync cols widths
      const children = this.$el.querySelectorAll('.hidden-header th')
      let totalWidth = 0
      let nbVisibleHeaders = 1
      for (const child of children) {
        if (this.headerWidths[child.attributes['data-header'].value] !== child.clientWidth) {
          this.$set(this.headerWidths, child.attributes['data-header'].value, child.clientWidth)
        }
        totalWidth += child.clientWidth
        if (totalWidth < this.windowWidth) nbVisibleHeaders += 1
      }
      this.totalHeaderWidth = totalWidth
      this.nbVisibleHeaders = nbVisibleHeaders

      // sync horizontal scroll
      // if (this._tableWrapper) {
      // this._tableWrapper.removeEventListener('scroll', this.onTableScroll)
      // }
      const tableWrapper = document.querySelector('.real-data-table .v-data-table__wrapper')
      if (this.displayMode === 'table' && !this._tableWrapper !== tableWrapper) {
        this._tableWrapper = tableWrapper
        this.scrollHeader = this._tableWrapper.scrollLeft
        this._tableWrapper.addEventListener('scroll', this.onTableScroll)
      }
      await this.$nextTick()
    },
    onTableScroll (e) {
      this.scrollHeader = e.target.scrollLeft
      this.scrolling = true
      if (this._scrollTimeout) clearTimeout(this._scrollTimeout)
      this._scrollTimeout = setTimeout(() => {
        this.scrollTop = e.target.scrollTop
        this.scrollLeft = e.target.scrollLeft
        this.scrolling = false
        this.syncHeader()
      }, 20)
    }
  }
}
