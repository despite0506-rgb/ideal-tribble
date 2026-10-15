import { createClient } from '@supabase/supabase-js'
import { parseAppState, parseScheduleSettings } from './storage'
import type { AppState, ScheduleSettings } from './types'

const SUPABASE_URL = 'https://ennadoncgnjmshaqtzmw.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_gFp2uWzKqChHlhFTmRNzLQ_dhosr4Zf'
export const SHARED_ACADEMY_EMAIL = 'academy@timetable.local'

export type CloudPayload = {
  cloudVersion: 1
  appState: AppState
  scheduleSettings: ScheduleSettings
}

export type CloudRow = {
  owner_id: string
  payload: unknown
  revision: number
  updated_at: string
}

export class CloudConflictError extends Error {
  constructor() {
    super('클라우드 자료가 다른 기기에서 먼저 변경되었습니다.')
    this.name = 'CloudConflictError'
  }
}

export function parseCloudPayload(value: unknown): CloudPayload | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<CloudPayload>
  const appState = parseAppState(candidate.appState)
  const scheduleSettings = parseScheduleSettings(candidate.scheduleSettings)
  if (candidate.cloudVersion !== 1 || !appState || !scheduleSettings) return null
  return { cloudVersion: 1, appState, scheduleSettings }
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storageKey: 'ideal-tribble:cloud-session',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})

export async function fetchCloudRow(ownerId: string): Promise<CloudRow | null> {
  const { data, error } = await supabase
    .from('timetable_state')
    .select('owner_id,payload,revision,updated_at')
    .eq('owner_id', ownerId)
    .maybeSingle()
  if (error) throw error
  return data as CloudRow | null
}

export async function createCloudRow(ownerId: string, payload: CloudPayload): Promise<CloudRow> {
  const { data, error } = await supabase
    .from('timetable_state')
    .insert({
      owner_id: ownerId,
      payload,
      revision: 1,
      updated_at: new Date().toISOString(),
    })
    .select('owner_id,payload,revision,updated_at')
    .single()
  if (error) throw error
  return data as CloudRow
}

export async function updateCloudRow(
  ownerId: string,
  payload: CloudPayload,
  expectedRevision: number,
): Promise<CloudRow> {
  const { data, error } = await supabase
    .from('timetable_state')
    .update({
      payload,
      revision: expectedRevision + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('owner_id', ownerId)
    .eq('revision', expectedRevision)
    .select('owner_id,payload,revision,updated_at')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new CloudConflictError()
  return data as CloudRow
}

export function subscribeToCloudRow(
  ownerId: string,
  onChange: (row: CloudRow) => void,
  onError: (message: string) => void,
): () => void {
  const channel = supabase
    .channel(`timetable-state-${ownerId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'timetable_state', filter: `owner_id=eq.${ownerId}` },
      (event) => onChange(event.new as CloudRow),
    )
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        onError('실시간 연결이 잠시 끊겼습니다. 저장은 계속 재시도됩니다.')
      }
    })

  return () => {
    void supabase.removeChannel(channel)
  }
}
