<!-- This page is a simple redirect: /applications/[id] → /application/[id] -->
<script setup lang="ts">
const route = useRoute<'/applications/[id]'>()
const router = useRouter()
router.replace(`/application/${route.params.id}`)
</script>
