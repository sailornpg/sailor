// shadcn CLI launcher.
//
// Two environment facts force this wrapper:
//  - `~/.npm` is not writable in the DSH file sandbox, so npm_config_cache must
//    point inside the workspace (the caller sets it).
//  - The bundled CLI reads the command from `process.argv[1]` (it slices one
//    element, not the usual two), so launching it through the npx .bin shim
//    makes it treat the shim path as the command. argv is normalized here.
//
// Usage:
//   npm_config_cache="$PWD/.npm-cache" \
//   node .agent-harness/scripts/shadcn-add.mjs <abs path to shadcn/dist/index.js> \
//     add "@assistant-ui/elements-context-breakdown" --dry-run
const [entry, ...args] = process.argv.slice(2)
if (!entry || args.length === 0) {
  console.error('usage: node scripts/shadcn-add.mjs <abs path to shadcn/dist/index.js> <shadcn args...>')
  process.exit(1)
}

process.argv = [process.argv[0], ...args]
await import(entry)
