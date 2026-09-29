import { posix } from 'node:path'
import { ReadWriteFs } from 'just-bash'
import { isSensitivePath } from '../../workspaces/WorkspaceToolScope.js'
import type { FileChangeTracker } from './ChatFileChangeJournal.js'

// Keep product path policy at the filesystem boundary, including native bash.
// Tool schemas, search, editing and execution remain owned by Pi/just-bash.
export function createWorkspaceFileSystem(
  root: string,
  options: { tracker?: FileChangeTracker } = {},
): ReadWriteFs {
  const fs = new ReadWriteFs({ root, allowSymlinks: false })
  const pathMethods = new Set([
    'readFile',
    'readFileBuffer',
    'writeFile',
    'appendFile',
    'exists',
    'stat',
    'lstat',
    'mkdir',
    'readdir',
    'readdirWithFileTypes',
    'rm',
    'cp',
    'mv',
    'chmod',
    'symlink',
    'link',
    'readlink',
    'realpath',
    'utimes',
  ])
  return new Proxy(fs, {
    get(target, key) {
      const value = Reflect.get(target, key, target)
      if (typeof value !== 'function') return value
      if (!pathMethods.has(String(key))) return value.bind(target)
      return async (...args: unknown[]) => {
        const paths = ['cp', 'mv', 'link', 'symlink'].includes(String(key))
          ? args.slice(0, 2)
          : args.slice(0, 1)
        for (const path of paths) {
          if (typeof path === 'string' && isSensitivePath(posix.normalize(path)))
            throw new Error('该路径可能包含敏感凭据，已拒绝访问。')
        }
        // Bulk native filesystem operations bypass per-file guards. Keep them
        // from moving/copying credential files hidden inside a directory.
        if (['cp', 'mv', 'rm'].includes(String(key)) && typeof args[0] === 'string') {
          const info = await target.lstat(args[0]).catch(() => undefined)
          if (info?.isDirectory) throw new Error('目录批量修改暂不支持，请逐个操作文件。')
        }
        const tracked =
          options.tracker && ['writeFile', 'appendFile', 'rm', 'cp', 'mv'].includes(String(key))
        const trackedPaths = tracked
          ? (['cp', 'mv'].includes(String(key)) ? args.slice(0, 2) : args.slice(0, 1)).filter(
              (path): path is string => typeof path === 'string',
            )
          : []
        const before = tracked ? await options.tracker!.before(trackedPaths) : undefined
        const result = await value.apply(target, args)
        if (tracked && before) await options.tracker!.after(trackedPaths, before)
        if (key === 'readdir') return result.filter((name: string) => !isSensitivePath(name))
        if (key === 'readdirWithFileTypes')
          return result.filter((entry: { name: string }) => !isSensitivePath(entry.name))
        return result
      }
    },
  })
}
