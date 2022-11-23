<template>
  <client-only>
    <pre
      class="mermaid"
      data-iframe-height
    >
      {{ code }}
    </pre>
  </client-only>
</template>

<script>
import 'iframe-resizer/js/iframeResizer.contentWindow'
import mermaid from 'mermaid/dist/mermaid.esm.min.mjs'

global.iFrameResizer = { heightCalculationMethod: 'taggedElement' }

mermaid.initialize({
  startOnLoad: true,
  fontFamily: '"Nunito sans-serif"',
  theme: 'base',
  themeVariables: {
    primaryColor: '#FFFFFF',
    primaryBorderColor: '#1E88E5'
  }
})

export default {
  layout: 'void',
  computed: {
    code () {
      return process.client && window.sessionStorage.getItem('mermaid-' + this.$route.query.key)
    }
  }
}
</script>

<style>
pre.mermaid {
  visibility: hidden;
}
pre.mermaid[data-processed="true"] {
  visibility: visible;
}
</style>
