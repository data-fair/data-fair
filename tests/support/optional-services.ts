// optional dev services: absent when their port variable is empty, otherwise present when they answer
export const serviceUp = async (portVar: 'EVENTS_PORT' | 'AGENTS_PORT') => {
  const port = process.env[portVar]
  if (!port) return false
  return fetch(`http://localhost:${port}`).then(() => true, () => false)
}
