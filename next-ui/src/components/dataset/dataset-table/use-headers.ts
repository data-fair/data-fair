export const useHeaders = (selectedCols: Ref<string[]>, results: Ref<any[]>) => {
  const { dataset } = useDatasetStore()

  const headerWidths = ref<Record<string, number>>({})

  const headers = computed(() => {
    return dataset.value?.schema?.filter(p => selectedCols.value.includes(p.key)).map(p => ({
      key: p.key,
      title: p.title || p['x-originalName'] || p.key,
      nowrap: true,
      width: headerWidths.value[p.key] ?? 50
    }))
  })

  /*
  adjustColsWidths () {
    if (!this.data.results || !this.headers) return
    const dense = this.displayMode === 'table-dense'
    for (const header of this.headers) {
      if (headerWidths[header.value]) continue
      if (header.value === '_thumbnail' || header.value === '_owner') {
        headerWidths[header.value] = 56
        continue
      }
      if (dense) {
        this.$set(headerWidths, header.value, 80)
      } else {
        let estimatedTextSize = estimateTextSize(header.text)
        if (header.text.match(/\s/) || estimateTextSize > 100) {
          // on 2 lines except for smalll title with no white spaces
          estimatedTextSize *= 0.7
        }
        const estimatedHeaderSize = estimatedTextSize + (dense ? 16 : 32) + 14
        this.$set(headerWidths, header.value, estimatedHeaderSize)
      }

      for (const result of this.data.results) {
        if (!(header.value in result)) continue
        const val = result[header.value] + ''
        let estimatedSize = 0
        if (header.field && header.field.separator) {
          for (const part of val.split(header.field.separator)) {
            estimatedSize += estimateTextSize(this.$root.$options.filters.cellValues(part, header.field), dense ? 12 : 14) + 40
          }
        } else {
          estimatedSize += estimateTextSize(header.field ? this.$root.$options.filters.cellValues(val, header.field) : val)
        }
        estimatedSize = Math.max(50, estimatedSize) + (dense ? 16 : 32)
        if (estimatedSize > headerWidths[header.value]) headerWidths[header.value] = estimatedSize
      }
    }
    if (this.windowWidth > this.totalRawHeaderWidths) {
      const fullWidthRatio = (this.windowWidth - 15) / this.totalRawHeaderWidths
      for (const header of this.selectedHeaders) {
        headerWidths[header.value] = Math.floor(headerWidths[header.value] * fullWidthRatio)
      }
    }
  }
    */

  return {
    headers
  }
}

export default useHeaders
