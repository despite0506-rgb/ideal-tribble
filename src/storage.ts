import { DEMO_STATE } from './demoData'
import { validateState } from './domain'
import type { AppState, ScheduleSettings, TeacherId } from './types'

export const STORAGE_KEY = 'ideal-tribble:timetable:v1'
export const SETTINGS_STORAGE_KEY = 'ideal-tribble:schedule-settings:v1'

export const DEFAULT_SCHEDULE_SETTINGS: ScheduleSettings = {
  academyName: '우리 학원',
  teacherNames: ['선생님 1', '선생님 2', '선생님 3'],
  sidebarWidth: 264,
  startMinute: 13 * 60,
  endMinute: 22 * 60,
  weekendMode: 'hidden',
  transportEnabled: true,
  showStudentAvatars: true,
  showStudentNames: true,
  density: 'comfortable',
}

const cloneDemo = (): AppState => JSON.parse(JSON.stringify(DEMO_STATE)) as AppState

export const normalizeState = (state: AppState): AppState => ({
  ...state,
  students: state.students.map((student) => ({
    ...student,
    familyId: typeof student.familyId === 'string' && student.familyId ? student.familyId : undefined,
    registrationDate: typeof student.registrationDate === 'string' ? student.registrationDate : typeof student.createdAt === 'string' ? student.createdAt.slice(0, 10) : '',
    enrollmentStatus: ['active', 'paused', 'withdrawn'].includes(student.enrollmentStatus) ? student.enrollmentStatus : 'active',
    guardianName: typeof student.guardianName === 'string' ? student.guardianName : '',
    guardianPhone: typeof student.guardianPhone === 'string' ? student.guardianPhone : '',
    notionUrl: typeof student.notionUrl === 'string' ? student.notionUrl : '',
    feedbacks: Array.isArray(student.feedbacks) ? student.feedbacks : [],
    learningRecords: Array.isArray(student.learningRecords) ? student.learningRecords : [],
  })),
  lessons: state.lessons.map((lesson) => ({
    ...lesson,
    colorMode: lesson.colorMode === 'auto' || lesson.colorMode === 'custom'
      ? lesson.colorMode
      : lesson.color ? 'custom' : 'auto',
    teacherId: (['teacher-1', 'teacher-2', 'teacher-3'] as TeacherId[]).includes(lesson.teacherId)
      ? lesson.teacherId
      : 'teacher-1',
  })),
  attendanceRecords: Array.isArray(state.attendanceRecords) ? state.attendanceRecords : [],
  attendanceSessions: Array.isArray(state.attendanceSessions) ? state.attendanceSessions : [],
  paymentRecords: Array.isArray(state.paymentRecords) ? state.paymentRecords.map((record) => ({
    id: record.id,
    studentId: record.studentId,
    month: record.month,
    status: record.status,
    amount: record.amount,
    dueDate: record.dueDate,
    paymentParts: Array.isArray(record.paymentParts) ? record.paymentParts : [],
    familyPaymentId: typeof record.familyPaymentId === 'string' && record.familyPaymentId ? record.familyPaymentId : undefined,
    updatedAt: record.updatedAt,
  })) : [],
  weeklyMemos: Array.isArray(state.weeklyMemos) ? state.weeklyMemos : [],
  holidayClosures: Array.isArray(state.holidayClosures) ? state.holidayClosures : [],
  makeupRecords: Array.isArray(state.makeupRecords) ? state.makeupRecords : [],
})

export function parseAppState(value: unknown): AppState | null {
  return validateState(value) ? normalizeState(value) : null
}

export function loadState(): { state: AppState; warning: string | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { state: cloneDemo(), warning: null }
    const parsed: unknown = JSON.parse(raw)
    const state = parseAppState(parsed)
    if (!state) {
      return {
        state: cloneDemo(),
        warning: '저장된 데이터 형식을 읽을 수 없어 예시 데이터로 열었습니다. 기존 데이터는 덮어쓰지 않았습니다.',
      }
    }
    return { state, warning: null }
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

export function parseScheduleSettings(value: unknown): ScheduleSettings | null {
  if (!value || typeof value !== 'object') return null
  const settings = value as Partial<ScheduleSettings>
  const validWeekendMode = settings.weekendMode === 'hidden' || settings.weekendMode === 'combined' || settings.weekendMode === 'separate'
  const validTimes = Number.isInteger(settings.startMinute)
    && Number.isInteger(settings.endMinute)
    && Number(settings.startMinute) >= 0
    && Number(settings.endMinute) <= 1440
    && Number(settings.startMinute) < Number(settings.endMinute)
  if (!validWeekendMode || !validTimes) return null
  return {
    academyName: typeof settings.academyName === 'string' && settings.academyName.trim()
      ? settings.academyName.trim()
      : DEFAULT_SCHEDULE_SETTINGS.academyName,
    teacherNames: Array.isArray(settings.teacherNames) && settings.teacherNames.length === 3
      ? settings.teacherNames.map((name, index) => (
        typeof name === 'string' && name.trim() ? name.trim() : DEFAULT_SCHEDULE_SETTINGS.teacherNames[index]
      )) as [string, string, string]
      : DEFAULT_SCHEDULE_SETTINGS.teacherNames,
    sidebarWidth: Number.isInteger(settings.sidebarWidth)
      ? Math.max(190, Math.min(360, Number(settings.sidebarWidth)))
      : DEFAULT_SCHEDULE_SETTINGS.sidebarWidth,
    startMinute: Number(settings.startMinute),
    endMinute: Number(settings.endMinute),
    weekendMode: settings.weekendMode as ScheduleSettings['weekendMode'],
    transportEnabled: typeof settings.transportEnabled === 'boolean' ? settings.transportEnabled : true,
    showStudentAvatars: typeof settings.showStudentAvatars === 'boolean' ? settings.showStudentAvatars : true,
    showStudentNames: typeof settings.showStudentNames === 'boolean' ? settings.showStudentNames : true,
    density: settings.density === 'compact' ? 'compact' : 'comfortable',
  }
}

export function loadScheduleSettings(): ScheduleSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!raw) return DEFAULT_SCHEDULE_SETTINGS
    return parseScheduleSettings(JSON.parse(raw)) ?? DEFAULT_SCHEDULE_SETTINGS
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
