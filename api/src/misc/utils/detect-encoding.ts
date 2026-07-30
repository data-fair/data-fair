import chardet from 'chardet'

// chardet only ever sees a sample taken from the start of the file (a 1MB
// fileSample when storing, a 32kb stream buffer when decoding). A file that is
// pure 7-bit ASCII within that sample but turns multi-byte deeper down is
// detected as "ASCII" — common for GeoJSON, where ASCII-only geometry
// coordinates dominate the head and accented text properties appear later. The
// stored/streamed "ASCII" codec then mangles every non-ASCII byte past the
// sample window (e.g. "à" 0xC3 0xA0 → "��").
//
// ASCII is a strict subset of UTF-8, so promoting an ASCII detection to UTF-8
// decodes genuine ASCII byte-identically while correctly handling the
// multi-byte tail. UTF-8 is also the natural fallback when detection fails.
export const detectEncoding = (buffer: Buffer): string => {
  const detected = chardet.detect(buffer)
  if (!detected || detected === 'ASCII') return 'UTF-8'
  return detected
}

export default detectEncoding
