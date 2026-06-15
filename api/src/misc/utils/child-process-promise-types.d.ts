declare module 'child-process-promise' {
  export const spawn: (command: string, args?: any, options?: any) => Promise<{ stdout: any, stderr: any }>
}
