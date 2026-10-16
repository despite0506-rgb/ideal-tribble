import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import {
  CloudConflictError,
  SHARED_ACADEMY_EMAIL,
  createCloudRow,
  fetchCloudRow,
  parseCloudPayload,
  subscribeToCloudRow,
  supabase,
  updateCloudRow,
  type CloudPayload,
  type CloudRow,
} from './cloud'
import { mergeCloudPayload } from './cloudMerge'
import { DEFAULT_SCHEDULE_SETTINGS } from './storage'
import type { AppState, ScheduleSettings } from './types'

export type CloudPhase = 'checking' | 'signed-out' | 'loading' | 'needs-initialization' | 'ready' | 'error'
export type CloudSaveStatus = 'idle' | 'saving' | 'synced' | 'error'

type CloudSyncOptions = {
  appState: AppState
  setAppState: Dispatch<SetStateAction<AppState>>
  scheduleSettings: ScheduleSettings
  setScheduleSettings: Dispatch<SetStateAction<ScheduleSettings>>
}

const EMPTY_STATE: AppState = { schemaVersion: 1, students: [], lessons: [], attendanceRecords: [], attendanceSessions: [] }

function withCloudTimeout<T>(operation: PromiseLike<T>, timeoutMs = 12000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('클라우드 연결 시간 초과')), timeoutMs)
    void Promise.resolve(operation).then(
      (value) => {
        window.clearTimeout(timeout)
        resolve(value)
      },
      (operationError) => {
        window.clearTimeout(timeout)
        reject(operationError)
      },
    )
  })
}

function cloudErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/invalid login credentials/i.test(message)) return '공용 비밀번호가 맞지 않습니다.'
  if (/failed to fetch|network|시간 초과|timed out/i.test(message)) return '클라우드에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.'
  if (/timetable_state|relation/i.test(message)) return '클라우드 데이터 테이블을 찾지 못했습니다. Supabase SQL 설정을 확인해 주세요.'
  return `클라우드 처리 중 문제가 생겼습니다. (${message})`
}

export function useCloudSync({
  appState,
  setAppState,
  scheduleSettings,
  setScheduleSettings,
}: CloudSyncOptions) {
  const [phase, setPhase] = useState<CloudPhase>('checking')
  const [saveStatus, setSaveStatus] = useState<CloudSaveStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [ownerId, setOwnerId] = useState<string | null>(null)
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [saveRetry, setSaveRetry] = useState(0)
  const lastSyncedJson = useRef('')
  const basePayload = useRef<CloudPayload | null>(null)
  const revision = useRef(0)
  const saveTimer = useRef<number | null>(null)
  const saveSequence = useRef(0)

  const payload = useMemo<CloudPayload>(() => ({
    cloudVersion: 1,
    appState,
    scheduleSettings,
  }), [appState, scheduleSettings])
  const payloadJson = useMemo(() => JSON.stringify(payload), [payload])
  const currentPayload = useRef(payload)
  currentPayload.current = payload

  const applyCloudRow = useCallback((row: CloudRow): boolean => {
    const parsed = parseCloudPayload(row.payload)
    if (!parsed) {
      setError('클라우드에 저장된 자료 형식을 읽을 수 없습니다. 기존 브라우저 자료는 그대로 보존되어 있습니다.')
      setPhase('error')
      return false
    }
    lastSyncedJson.current = JSON.stringify(parsed)
    basePayload.current = parsed
    revision.current = row.revision
    setAppState(parsed.appState)
    setScheduleSettings(parsed.scheduleSettings)
    setLastSavedAt(row.updated_at)
    setSaveStatus('synced')
    return true
  }, [setAppState, setScheduleSettings])

  const integrateRemoteRow = useCallback((row: CloudRow): boolean => {
    const remote = parseCloudPayload(row.payload)
    if (!remote) {
      setSaveStatus('error')
      setError('다른 기기에서 잘못된 형식의 자료가 전송되어 반영하지 않았습니다.')
      return false
    }
    if (row.revision < revision.current) return true
    const local = currentPayload.current
    const merged = basePayload.current
      ? mergeCloudPayload(basePayload.current, local, remote)
      : remote
    const remoteJson = JSON.stringify(remote)
    const mergedJson = JSON.stringify(merged)
    basePayload.current = remote
    revision.current = row.revision
    lastSyncedJson.current = remoteJson
    setAppState(merged.appState)
    setScheduleSettings(merged.scheduleSettings)
    setLastSavedAt(row.updated_at)
    setSaveStatus(mergedJson === remoteJson ? 'synced' : 'saving')
    setError(null)
    return true
  }, [setAppState, setScheduleSettings])

  const loadForUser = useCallback(async (userId: string) => {
    setOwnerId(userId)
    setPhase('loading')
    setError(null)
    setSaveStatus('idle')
    try {
      const row = await withCloudTimeout(fetchCloudRow(userId))
      if (!row) {
        lastSyncedJson.current = ''
        basePayload.current = null
        revision.current = 0
        setPhase('needs-initialization')
        return
      }
      if (applyCloudRow(row)) setPhase('ready')
    } catch (loadError) {
      setError(cloudErrorMessage(loadError))
      setPhase('error')
    }
  }, [applyCloudRow])

  useEffect(() => {
    let cancelled = false
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (cancelled) return
      if (sessionError) {
        setError(cloudErrorMessage(sessionError))
        setPhase('error')
      } else if (data.session) {
        void loadForUser(data.session.user.id)
      } else {
        setPhase('signed-out')
      }
    })
    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        lastSyncedJson.current = ''
        basePayload.current = null
        revision.current = 0
        setOwnerId(null)
        setLastSavedAt(null)
        setSaveStatus('idle')
        setError(null)
        setPhase('signed-out')
      }
    })
    return () => {
      cancelled = true
      authListener.subscription.unsubscribe()
    }
  }, [loadForUser])

  useEffect(() => {
    if (!ownerId || phase !== 'ready') return
    return subscribeToCloudRow(
      ownerId,
      (row) => {
        integrateRemoteRow(row)
      },
      (message) => {
        setSaveStatus('error')
        setError(message)
      },
    )
  }, [integrateRemoteRow, ownerId, phase])

  useEffect(() => {
    if (!ownerId || phase !== 'ready' || payloadJson === lastSyncedJson.current) return
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current)
    const sequence = ++saveSequence.current
    const expectedRevision = revision.current
    setSaveStatus('saving')
    saveTimer.current = window.setTimeout(() => {
      void withCloudTimeout(updateCloudRow(ownerId, payload, expectedRevision))
        .then((row) => {
          if (sequence !== saveSequence.current) return
          basePayload.current = payload
          revision.current = row.revision
          lastSyncedJson.current = payloadJson
          setLastSavedAt(row.updated_at)
          setSaveStatus('synced')
          setError(null)
        })
        .catch(async (saveError) => {
          if (sequence !== saveSequence.current) return
          if (saveError instanceof CloudConflictError) {
            try {
              const latestRow = await withCloudTimeout(fetchCloudRow(ownerId))
              if (latestRow) {
                integrateRemoteRow(latestRow)
                return
              }
            } catch (refreshError) {
              setSaveStatus('error')
              setError(cloudErrorMessage(refreshError))
              return
            }
          }
          setSaveStatus('error')
          setError(cloudErrorMessage(saveError))
        })
    }, 650)
    return () => {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current)
      saveTimer.current = null
      saveSequence.current += 1
    }
  }, [integrateRemoteRow, ownerId, payload, payloadJson, phase, saveRetry])

  const login = async (password: string): Promise<boolean> => {
    setPhase('loading')
    setError(null)
    try {
      const { data, error: loginError } = await withCloudTimeout(supabase.auth.signInWithPassword({
        email: SHARED_ACADEMY_EMAIL,
        password,
      }))
      if (loginError || !data.user) {
        setError(cloudErrorMessage(loginError ?? new Error('로그인 정보를 확인할 수 없습니다.')))
        setPhase('signed-out')
        return false
      }
      await loadForUser(data.user.id)
      return true
    } catch (loginFailure) {
      setError(cloudErrorMessage(loginFailure))
      setPhase('signed-out')
      return false
    }
  }

  const logout = async () => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current)
    saveSequence.current += 1
    await supabase.auth.signOut({ scope: 'local' })
    lastSyncedJson.current = ''
    basePayload.current = null
    revision.current = 0
    setOwnerId(null)
    setLastSavedAt(null)
    setSaveStatus('idle')
    setError(null)
    setPhase('signed-out')
  }

  const initialize = async (useLocalData: boolean) => {
    if (!ownerId) return
    setPhase('loading')
    setError(null)
    const initialPayload: CloudPayload = useLocalData
      ? payload
      : {
          cloudVersion: 1,
          appState: EMPTY_STATE,
          scheduleSettings: { ...DEFAULT_SCHEDULE_SETTINGS, teacherNames: [...DEFAULT_SCHEDULE_SETTINGS.teacherNames] },
        }
    try {
      const row = await withCloudTimeout(createCloudRow(ownerId, initialPayload))
      if (applyCloudRow(row)) setPhase('ready')
    } catch (initializeError) {
      try {
        const existingRow = await withCloudTimeout(fetchCloudRow(ownerId))
        if (existingRow && applyCloudRow(existingRow)) {
          setPhase('ready')
          return
        }
      } catch {
        // Report the original initialization error below.
      }
      setError(cloudErrorMessage(initializeError))
      setPhase('error')
    }
  }

  const retry = async () => {
    setPhase('checking')
    setError(null)
    const { data, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) {
      setError(cloudErrorMessage(sessionError))
      setPhase('error')
    } else if (data.session) {
      await loadForUser(data.session.user.id)
    } else {
      setPhase('signed-out')
    }
  }

  const retrySave = () => {
    lastSyncedJson.current = ''
    setError(null)
    setSaveStatus('idle')
    setSaveRetry((current) => current + 1)
  }

  return {
    phase,
    saveStatus,
    error,
    lastSavedAt,
    login,
    logout,
    initializeWithLocalData: () => initialize(true),
    initializeEmpty: () => initialize(false),
    retry,
    retrySave,
  }
}
