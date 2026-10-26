// optional dev containers (dev/dev.json "optional"): the api only wires the ones running when it starts
export const serviceUp = (portVar: 'EVENTS_PORT' | 'AGENTS_PORT') =>
  fetch(`http://localhost:${process.env[portVar]}`).then(() => true, () => false)
