declare module 'child-process-promise' {
  export const spawn: (command: string, args?: any, options?: any) => Promise<{ stdout: any, stderr: any }>
  export const exec: (command: string, options?: any) => Promise<{ stdout: any, stderr: any }>
  export const execFile: (file: string, args?: any, options?: any) => Promise<{ stdout: any, stderr: any }>
  export const fork: (modulePath: string, args?: any, options?: any) => Promise<{ stdout: any, stderr: any }>
}
