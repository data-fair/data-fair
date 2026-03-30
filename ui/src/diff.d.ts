declare module 'diff' {
  export function createPatch (fileName: string, oldStr: string, newStr: string, oldHeader?: string, newHeader?: string): string
}
