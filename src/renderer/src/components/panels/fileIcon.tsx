import { Icon } from '@iconify/react/offline'
import { icons } from '@iconify-json/vscode-icons'
import type { IconifyIcon } from '@iconify/react'

const ICON_SET = 'vscode-icons'

const extensionIcons: Record<string, string> = {
  ts: 'file-type-typescript',
  tsx: 'file-type-reactts',
  js: 'file-type-js',
  jsx: 'file-type-reactjs',
  mjs: 'file-type-js',
  cjs: 'file-type-js',
  json: 'file-type-json',
  jsonc: 'file-type-json',
  css: 'file-type-css',
  scss: 'file-type-scss',
  less: 'file-type-less',
  html: 'file-type-html',
  md: 'file-type-markdown',
  mdx: 'file-type-mdx',
  txt: 'file-type-text',
  yaml: 'file-type-yaml',
  yml: 'file-type-yaml',
  xml: 'file-type-xml',
  svg: 'file-type-svg',
  png: 'file-type-image',
  jpg: 'file-type-image',
  jpeg: 'file-type-image',
  gif: 'file-type-image',
  webp: 'file-type-image',
  pdf: 'file-type-pdf2',
  sh: 'file-type-shell',
  bash: 'file-type-shell',
  py: 'file-type-python',
  go: 'file-type-go',
  rs: 'file-type-rust',
  java: 'file-type-java',
  lock: 'file-type-text',
}

const fileNameIcons: Record<string, string> = {
  'package.json': 'file-type-npm',
  'package-lock.json': 'file-type-npm',
  'pnpm-lock.yaml': 'file-type-pnpm',
  'yarn.lock': 'file-type-yarn',
  dockerfile: 'file-type-docker',
  '.gitignore': 'file-type-git',
  'readme.md': 'file-type-markdown',
}

function iconName(name: string, directory: boolean, expanded: boolean): string {
  if (directory) return `${ICON_SET}:default-folder${expanded ? '-opened' : ''}`

  const normalized = name.toLowerCase()
  const special = fileNameIcons[normalized]
  if (special) return `${ICON_SET}:${special}`

  const extension = normalized.split('.').pop() ?? ''
  return `${ICON_SET}:${extensionIcons[extension] ?? 'default-file'}`
}

export interface FileIconProps {
  name: string
  directory?: boolean
  expanded?: boolean
  className?: string
}

/** VS Code's icon theme rendered through Iconify; no local SVG copies are needed. */
export function FileIcon({
  name,
  directory = false,
  expanded = false,
  className,
}: FileIconProps) {
  return (
    <Icon
      aria-hidden="true"
      className={className}
      icon={{
        width: icons.width,
        height: icons.height,
        ...((icons.icons as Record<string, IconifyIcon>)[
          iconName(name, directory, expanded).split(':')[1]
        ] ?? icons.icons['default-file']),
      }}
      height="16"
      width="16"
    />
  )
}
