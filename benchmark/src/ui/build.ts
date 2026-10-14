// Production builds of the UI for the A/B harness, written to benchmark/.cache and
// never to ui/dist (watched by the dev-api nodemon: writing it restarts the API).
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, rmSync, symlinkSync, mkdirSync, readdirSync, lstatSync, readlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '../../..')
const cacheRoot = path.join(repoRoot, 'benchmark/.cache')
const buildsDir = path.join(cacheRoot, 'ui-builds')
const srcDir = path.join(cacheRoot, 'ui-src')

export type DependencyStrategy = 'symlink' | 'install'

export function dependencyStrategy (baseLockHash: string, currentLockHash: string): DependencyStrategy {
  return baseLockHash === currentLockHash ? 'symlink' : 'install'
}

const git = (...args: string[]) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim()
// trimmed: git() output loses the file's trailing newline
export const lockfileHash = (content: string) => createHash('sha256').update(content.trimEnd()).digest('hex')

// build tools are verbose: keep their output, print it only when they fail
const quietly = (command: string, args: string[], opts: { cwd: string, env?: NodeJS.ProcessEnv }) => {
  try {
    execFileSync(command, args, { ...opts, stdio: 'pipe', encoding: 'utf8' })
  } catch (err: any) {
    process.stderr.write(`${err.stdout ?? ''}${err.stderr ?? ''}`)
    throw err
  }
}

const viteBuild = (uiDir: string, outDir: string) => {
  console.log(`[ui-table] building ${path.relative(repoRoot, uiDir) || '.'} → ${path.relative(repoRoot, outDir)}`)
  quietly('npx', ['vite', 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'warn'], {
    cwd: uiDir,
    env: { ...process.env, NODE_ENV: 'production' }
  })
  if (!existsSync(path.join(outDir, 'index.html'))) throw new Error(`build produced no index.html in ${outDir}`)
}

/**
 * Give a worktree the current install of dependencies without its workspace packages:
 * a real node_modules where every package is a symlink to the shared install, except the
 * workspace links (relative links back into the repo, e.g. @data-fair/data-fair-shared ->
 * ../../shared), which point at the worktree's own directories. Symlinking node_modules as
 * a whole would build the base ref with the current tree's workspace code.
 */
export function linkDependencies (sourceNodeModules: string, worktree: string): void {
  const target = path.join(worktree, 'node_modules')
  const linkDir = (sourceDir: string, targetDir: string, depth: number) => {
    mkdirSync(targetDir, { recursive: true })
    for (const name of readdirSync(sourceDir)) {
      const source = path.join(sourceDir, name)
      const dest = path.join(targetDir, name)
      if (lstatSync(source).isSymbolicLink()) {
        const link = readlinkSync(source)
        // a workspace link: same relative target, resolved inside the worktree
        if (!path.isAbsolute(link) && path.resolve(sourceDir, link).startsWith(path.resolve(sourceNodeModules, '..') + path.sep) &&
          !path.resolve(sourceDir, link).startsWith(sourceNodeModules)) {
          symlinkSync(link, dest)
          continue
        }
      }
      // scopes are walked one level down so their workspace links can be redirected
      if (depth === 0 && name.startsWith('@') && lstatSync(source).isDirectory()) linkDir(source, dest, 1)
      else symlinkSync(source, dest)
    }
  }
  linkDir(sourceNodeModules, target, 0)
}

/** Run fn, then put the file back as it was (or remove it if it did not exist). */
export async function withFileRestored (file: string, fn: () => Promise<void> | void): Promise<void> {
  const saved = existsSync(file) ? readFileSync(file) : undefined
  try {
    await fn()
  } finally {
    if (saved === undefined) rmSync(file, { force: true })
    else writeFileSync(file, saved)
  }
}

// node_modules directories of workspaces with dependencies of their own (no workspace links inside)
const workspaceNodeModulesDirs = ['ui/node_modules', 'api/node_modules']

export async function buildVariant (variant: { kind: 'current' } | { kind: 'ref', ref: string }): Promise<{ dir: string, label: string }> {
  mkdirSync(buildsDir, { recursive: true })
  if (variant.kind === 'current') {
    const dir = path.join(buildsDir, 'current')
    viteBuild(path.join(repoRoot, 'ui'), dir)
    const dirty = git('status', '--porcelain', '--', 'ui', 'api/types').length > 0
    return { dir, label: `current (${git('rev-parse', '--short', 'HEAD')}${dirty ? '+dirty' : ''})` }
  }

  const sha = git('rev-parse', `${variant.ref}^{commit}`)
  const label = `${variant.ref} (${sha.slice(0, 9)})`
  const dir = path.join(buildsDir, sha)
  if (existsSync(path.join(dir, 'index.html'))) {
    console.log(`[ui-table] ${label}: cached build`)
    return { dir, label }
  }

  const worktree = path.join(srcDir, sha)
  // a previous failed run may have left the worktree behind
  if (existsSync(worktree)) git('worktree', 'remove', '--force', worktree)
  git('worktree', 'prune')
  mkdirSync(srcDir, { recursive: true })
  git('worktree', 'add', '--detach', worktree, sha)
  try {
    const strategy = dependencyStrategy(
      lockfileHash(git('show', `${sha}:package-lock.json`)),
      lockfileHash(readFileSync(path.join(repoRoot, 'package-lock.json'), 'utf8'))
    )
    if (strategy === 'symlink') {
      linkDependencies(path.join(repoRoot, 'node_modules'), worktree)
      for (const d of workspaceNodeModulesDirs) {
        if (existsSync(path.join(repoRoot, d))) symlinkSync(path.join(repoRoot, d), path.join(worktree, d), 'dir')
      }
    } else {
      console.log(`[ui-table] ${label}: lockfile differs from the current one, installing its dependencies`)
      quietly('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: worktree })
    }
    // vite.config.ts bundles api/src/ui-config.ts, which needs the generated (gitignored) api types;
    // --no-cache: the builder's hash cache lives in the shared node_modules, which it still
    // writes: restore it so the current tree's next build-types does not trust the base's hashes
    await withFileRestored(path.join(repoRoot, 'node_modules/.cache/@data-fair/lib-types-builder/hashes.json'), () => {
      quietly('npx', ['df-build-types', './api/', '--no-cache'], { cwd: worktree })
    })
    viteBuild(path.join(worktree, 'ui'), dir)
  } catch (err) {
    rmSync(dir, { recursive: true, force: true })
    throw err
  } finally {
    // symlinks are removed with the worktree, their targets are untouched
    git('worktree', 'remove', '--force', worktree)
  }
  return { dir, label }
}
