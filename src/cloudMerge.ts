import type { CloudPayload } from './cloud'

function valuesMatch(first: unknown, second: unknown): boolean {
  return JSON.stringify(first) === JSON.stringify(second)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function arrayItemKey(value: unknown): string | null {
  if (!isRecord(value)) return null
  if (typeof value.id === 'string') return `id:${value.id}`
  if (typeof value.studentId === 'string') return `student:${value.studentId}`
  return null
}

function mergeKeyedArrays(base: unknown[], local: unknown[], remote: unknown[]): unknown[] | null {
  const allItems = [...base, ...local, ...remote]
  if (allItems.some((item) => arrayItemKey(item) === null)) return null
  const toMap = (items: unknown[]) => new Map(items.map((item) => [arrayItemKey(item) as string, item]))
  const baseMap = toMap(base)
  const localMap = toMap(local)
  const remoteMap = toMap(remote)
  const keys = [...new Set([
    ...remoteMap.keys(),
    ...localMap.keys(),
    ...baseMap.keys(),
  ])]
  return keys.flatMap((key) => {
    const baseValue = baseMap.get(key)
    const localValue = localMap.get(key)
    const remoteValue = remoteMap.get(key)
    if (localValue === undefined && remoteValue === undefined) return []
    if (localValue === undefined) {
      return valuesMatch(remoteValue, baseValue) ? [] : [remoteValue]
    }
    if (remoteValue === undefined) {
      return valuesMatch(localValue, baseValue) ? [] : [localValue]
    }
    return [mergeConcurrentValue(baseValue, localValue, remoteValue)]
  })
}

function mergeConcurrentValue(base: unknown, local: unknown, remote: unknown): unknown {
  if (valuesMatch(local, base)) return remote
  if (valuesMatch(remote, base) || valuesMatch(local, remote)) return local
  if (Array.isArray(base) && Array.isArray(local) && Array.isArray(remote)) {
    return mergeKeyedArrays(base, local, remote) ?? local
  }
  if (isRecord(base) && isRecord(local) && isRecord(remote)) {
    const merged: Record<string, unknown> = {}
    const keys = new Set([...Object.keys(base), ...Object.keys(remote), ...Object.keys(local)])
    keys.forEach((key) => {
      merged[key] = mergeConcurrentValue(base[key], local[key], remote[key])
    })
    return merged
  }
  return local
}

export function mergeCloudPayload(base: CloudPayload, local: CloudPayload, remote: CloudPayload): CloudPayload {
  return mergeConcurrentValue(base, local, remote) as CloudPayload
}
