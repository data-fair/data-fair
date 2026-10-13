// Production builds of the UI for the A/B harness, written to benchmark/.cache and
// never to ui/dist (watched by the dev-api nodemon: writing it restarts the API).
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, rmSync, symlinkSync, mkdirSync } from 'node:fs'
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

const viteBuild = (uiDir: string, outDir: string) => {
  console.log(`[ui-table] building ${path.relative(repoRoot, uiDir) || '.'} → ${path.relative(repoRoot, outDir)}`)
  execFileSync('npx', ['vite', 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'warn'], {
    cwd: uiDir,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' }
  })
  if (!existsSync(path.join(outDir, 'index.html'))) throw new Error(`build produced no index.html in ${outDir}`)
}

// node_modules directories of the workspaces involved in a UI build
const nodeModulesDirs = ['node_modules', 'ui/node_modules', 'api/node_modules']

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
      for (const d of nodeModulesDirs) {
        if (existsSync(path.join(repoRoot, d))) symlinkSync(path.join(repoRoot, d), path.join(worktree, d), 'dir')
      }
    } else {
      console.log(`[ui-table] ${label}: lockfile differs from the current one, installing its dependencies`)
      execFileSync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: worktree, stdio: 'inherit' })
    }
    // vite.config.ts bundles api/src/ui-config.ts, which needs the generated (gitignored) api types;
    // --no-cache: the builder's hash cache lives in the (symlinked, shared) node_modules
    execFileSync('npx', ['df-build-types', './api/', '--no-cache'], { cwd: worktree, stdio: 'inherit' })
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
