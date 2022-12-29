<template>
  <div style="font-size:14px;">
    <span
      v-for="char of chars"
      :key="char"
      style="width:auto;"
      class="char"
      :data-char="char"
      v-text="char"
    />
    <br>
    {{ charSizes }}
    <br>
    <span
      v-for="test of tests"
      :key="test[0]"
      class="test"
      :data-text="test[0]"
      :data-expect="test[1]"
    >{{ test[0] }}</span>
  </div>
</template>

<script>
export default {
  layout: 'embed',
  data () {
    return {
      charSizes: {},
      tests: [['2291E2379818A', 110]]
    }
  },
  computed: {
    chars () {
      const letters = 'abcdefghijklmnopqrstuvwxyzéèàçùâêôûîïüöëœ'
      const chars = [
        ...letters,
        ...letters.toUpperCase(),
        ...'0123456789 +=<>%*!/:.;,?&~@\'"_-|#()[]{}°²–\t'
      ]
      return chars
    }
  },
  async mounted () {
    await new Promise(resolve => setTimeout(resolve, 1000))
    document.querySelectorAll('.char').forEach(elem => {
      this.$set(this.charSizes, elem.getAttribute('data-char'), Math.ceil(elem.getBoundingClientRect().width * 100) / 100)
    })
    document.querySelectorAll('.test').forEach(elem => {
      let estimatedSize = 0
      for (const char of elem.getAttribute('data-text')) {
        estimatedSize += this.charSizes[char] || 9
      }
      console.log(`${elem.getAttribute('data-text')} - expected = ${elem.getAttribute('data-expect')}, estimated = ${estimatedSize}, actual=${elem.getBoundingClientRect().width}`)
    })
  }
}
</script>

<style>

</style>
