<!-- This page is a simple redirect: /datasets/[id] → /dataset/[id] -->
<script setup lang="ts">
const route = useRoute<'/datasets/[id]'>()
const router = useRouter()
router.replace(`/dataset/${route.params.id}`)
</script>
