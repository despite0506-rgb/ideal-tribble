import { DEMO_STATE } from './demoData'
import { validateState } from './domain'
import type { AppState, ScheduleSettings } from './types'

export const STORAGE_KEY = 'ideal-tribble:timetable:v1'
export const SETTINGS_STORAGE_KEY = 'ideal-tribble:schedule-settings:v1'

export const DEFAULT_SCHEDULE_SETTINGS: ScheduleSettings = {
  startMinute: 13 * 60,
  endMinute: 22 * 60,
  weekendMode: 'hidden',
}

const cloneDemo = (): AppState => JSON.parse(JSON.stringify(DEMO_STATE)) as AppState

export function loadState(): { state: AppState; warning: string | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { state: cloneDemo(), warning: null }
    const parsed: unknown = JSON.parse(raw)
    if (!validateState(parsed)) {
      return {
        state: cloneDemo(),
        warning: '저장된 데이터 형식을 읽을 수 없어 예시 데이터로 열었습니다. 기존 데이터는 덮어쓰지 않았습니다.',
      }
    }
    return { state: parsed, warning: null }
  } catch {
    return {
      state: cloneDemo(),
      warning: '저장된 데이터를 불러오지 못해 예시 데이터로 열었습니다.',
    }
  }
}

export function saveState(state: AppState): string | null {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    return null
  } catch {
    return '브라우저 저장 공간이 부족해 변경 내용을 저장하지 못했습니다.'
  }
}

export function resetState(): AppState {
  const state = cloneDemo()
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  return state
}

export function loadScheduleSettings(): ScheduleSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!raw) return DEFAULT_SCHEDULE_SETTINGS
    const value = JSON.parse(raw) as Partial<ScheduleSettings>
    const validWeekendMode = value.weekendMode === 'hidden' || value.weekendMode === 'combined' || value.weekendMode === 'separate'
    const validTimes = Number.isInteger(value.startMinute)
      && Number.isInteger(value.endMinute)
      && Number(value.startMinute) >= 0
      && Number(value.endMinute) <= 1440
      && Number(value.startMinute) < Number(value.endMinute)
    if (!validWeekendMode || !validTimes) return DEFAULT_SCHEDULE_SETTINGS
    return value as ScheduleSettings
  } catch {
    return DEFAULT_SCHEDULE_SETTINGS
  }
}

export function saveScheduleSettings(settings: ScheduleSettings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // The timetable can still be used when browser preference storage is unavailable.
  }
}
