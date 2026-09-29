function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * assistant-ui moves metadata keys it does not own into `metadata.custom`.
 * Persisted AI SDK messages can still keep the same key at the top level.
 */
export function getTurnIdFromMessageMetadata(metadata: unknown): string | null {
  if (!isRecord(metadata)) return null
  if (typeof metadata.turnId === 'string' && metadata.turnId.length > 0) return metadata.turnId
  const custom = metadata.custom
  return isRecord(custom) && typeof custom.turnId === 'string' && custom.turnId.length > 0
    ? custom.turnId
    : null
}
