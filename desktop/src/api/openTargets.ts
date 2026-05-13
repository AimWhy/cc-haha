import { api } from './client'

export type OpenTargetKind = 'ide' | 'file_manager'

export type OpenTarget = {
  id: string
  kind: OpenTargetKind
  label: string
  icon: string
  platform: string
}

export type OpenTargetList = {
  platform: string
  targets: OpenTarget[]
  primaryTargetId: string | null
  cachedAt: number
  ttlMs: number
}

export type OpenTargetOpenResponse = {
  ok: true
  targetId: string
  path: string
}

export const openTargetsApi = {
  list() {
    return api.get<OpenTargetList>('/api/open-targets')
  },
  open(targetId: string, path: string) {
    return api.post<OpenTargetOpenResponse>('/api/open-targets/open', { targetId, path })
  },
}
