declare module 'ngeohash' {
  const ngeohash: {
    decode_bbox: (hash: string) => number[]
    decode: (hash: string) => { longitude: number, latitude: number }
  }
  export default ngeohash
}
