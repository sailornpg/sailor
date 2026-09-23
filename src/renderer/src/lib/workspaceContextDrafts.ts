import { useSyncExternalStore } from 'react'
import {
  validateWorkspaceContexts,
  type WorkspaceContextPart,
} from '@shared/workspaceContext'
const EMPTY: WorkspaceContextPart[] = []
export class WorkspaceContextDrafts {
  private entries = new Map<string, WorkspaceContextPart[]>()
  private listeners = new Set<() => void>()
  get = (chatId: string) => this.entries.get(chatId) ?? EMPTY
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  private publish(chatId: string, parts: WorkspaceContextPart[]) {
    this.entries.set(chatId, parts)
    this.listeners.forEach((fn) => fn())
  }
  add(chatId: string, part: WorkspaceContextPart) {
    const old = this.get(chatId)
    if (
      old.some(
        (p) =>
          p.data.projectId === part.data.projectId &&
          p.data.relativePath === part.data.relativePath &&
          p.data.sha256 === part.data.sha256 &&
          p.data.startOffset === part.data.startOffset &&
          p.data.endOffset === part.data.endOffset,
      )
    )
      return
    this.publish(
      chatId,
      validateWorkspaceContexts([...old, part], part.data.projectId),
    )
  }
  remove(chatId: string, id: string) {
    this.publish(
      chatId,
      this.get(chatId).filter((p) => p.data.id !== id),
    )
  }
  consume(chatId: string, ids: string[]) {
    this.publish(
      chatId,
      this.get(chatId).filter((p) => !ids.includes(p.data.id)),
    )
  }
  forget(chatId: string) {
    this.entries.delete(chatId)
    this.listeners.forEach((fn) => fn())
  }
}
export const workspaceContextDrafts = new WorkspaceContextDrafts()
export function useWorkspaceContexts(chatId: string) {
  return useSyncExternalStore(
    workspaceContextDrafts.subscribe,
    () => workspaceContextDrafts.get(chatId),
    () => EMPTY,
  )
}
