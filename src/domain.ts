import type {
  AppState,
  Lesson,
  LessonDraft,
  LessonLayout,
  Student,
  Weekday,
} from './types'

export const WEEKDAYS: { value: Weekday; short: string; long: string }[] = [
  { value: 1, short: '월', long: '월요일' },
  { value: 2, short: '화', long: '화요일' },
  { value: 3, short: '수', long: '수요일' },
  { value: 4, short: '목', long: '목요일' },
  { value: 5, short: '금', long: '금요일' },
  { value: 6, short: '토', long: '토요일' },
  { value: 7, short: '일', long: '일요일' },
]

export const STUDENT_COLORS = [
  '#2f6f68',
  '#5d6fb5',
  '#b56b50',
  '#8070ad',
  '#5f8754',
  '#b16f8f',
]

export function createId(prefix: string): string {
  const value = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `${prefix}-${value}`
}

export function timeToMinutes(value: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return Number.NaN
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return Number.NaN
  return hours * 60 + minutes
}

export function minutesToTime(value: number): string {
  const safe = Math.max(0, Math.min(1439, Math.floor(value)))
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}분`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours}시간 ${rest}분` : `${hours}시간`
}

export function intervalsOverlap(
  firstStart: number,
  firstEnd: number,
  secondStart: number,
  secondEnd: number,
): boolean {
  return firstStart < secondEnd && secondStart < firstEnd
}

export function validateLesson(
  draft: LessonDraft,
  students: Student[],
  lessons: Lesson[],
  editingId?: string,
): string[] {
  const errors: string[] = []
  const ids = draft.participants.map((participant) => participant.studentId)
  const expectedCount = draft.kind === 'group' ? 2 : 1

  if (!Number.isInteger(draft.weekday) || draft.weekday < 1 || draft.weekday > 7) {
    errors.push('요일을 선택해 주세요.')
  }
  if (!Number.isInteger(draft.startMinute) || !Number.isInteger(draft.endMinute)) {
    errors.push('시작 및 종료 시간을 입력해 주세요.')
  } else if (draft.startMinute < 0 || draft.endMinute > 1440 || draft.startMinute >= draft.endMinute) {
    errors.push('종료 시간은 시작 시간보다 늦어야 합니다.')
  }
  if (ids.length !== expectedCount) {
    errors.push(draft.kind === 'group' ? '그룹 수업은 서로 다른 학생 2명을 선택해야 합니다.' : '개인 수업은 학생 1명을 선택해야 합니다.')
  }
  if (new Set(ids).size !== ids.length) {
    errors.push('같은 학생을 두 번 선택할 수 없습니다.')
  }
  if (ids.some((id) => !students.some((student) => student.id === id))) {
    errors.push('등록되지 않은 학생이 포함되어 있습니다.')
  }

  if (errors.length === 0) {
    const conflict = lessons.find((lesson) => {
      if (lesson.id === editingId || lesson.weekday !== draft.weekday) return false
      const sharesStudent = lesson.participants.some((participant) => ids.includes(participant.studentId))
      return sharesStudent && intervalsOverlap(
        lesson.startMinute,
        lesson.endMinute,
        draft.startMinute,
        draft.endMinute,
      )
    })
    if (conflict) {
      const names = conflict.participants
        .map((participant) => students.find((student) => student.id === participant.studentId)?.name)
        .filter(Boolean)
        .join(' · ')
      errors.push(`${minutesToTime(conflict.startMinute)}–${minutesToTime(conflict.endMinute)} ${names} 수업과 겹칩니다.`)
    }
  }

  return errors
}

export function lessonsForStudent(lessons: Lesson[], studentId: string): Lesson[] {
  return lessons
    .filter((lesson) => lesson.participants.some((participant) => participant.studentId === studentId))
    .sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute || a.id.localeCompare(b.id))
}

export function layoutLessons(lessons: Lesson[]): LessonLayout[] {
  const sorted = [...lessons].sort(
    (a, b) => a.startMinute - b.startMinute || b.endMinute - a.endMinute || a.id.localeCompare(b.id),
  )
  const result: LessonLayout[] = []
  let cluster: { lesson: Lesson; column: number }[] = []
  let clusterEnd = -1
  let active: { end: number; column: number }[] = []

  const flushCluster = () => {
    if (cluster.length === 0) return
    const columnCount = Math.max(...cluster.map((item) => item.column)) + 1
    cluster.forEach(({ lesson, column }) => result.push({ ...lesson, column, columnCount }))
    cluster = []
    active = []
  }

  sorted.forEach((lesson) => {
    if (cluster.length > 0 && lesson.startMinute >= clusterEnd) flushCluster()
    active = active.filter((item) => item.end > lesson.startMinute)
    const usedColumns = new Set(active.map((item) => item.column))
    let column = 0
    while (usedColumns.has(column)) column += 1
    active.push({ end: lesson.endMinute, column })
    cluster.push({ lesson, column })
    clusterEnd = Math.max(clusterEnd, lesson.endMinute)
  })
  flushCluster()

  return result.sort((a, b) => a.startMinute - b.startMinute || a.column - b.column)
}

export function getTodayWeekday(date = new Date()): Weekday {
  const day = date.getDay()
  return (day === 0 ? 7 : day) as Weekday
}

export function validateState(value: unknown): value is AppState {
  if (!value || typeof value !== 'object') return false
  const state = value as Partial<AppState>
  if (state.schemaVersion !== 1 || !Array.isArray(state.students) || !Array.isArray(state.lessons)) return false
  const studentIds = new Set<string>()
  for (const student of state.students) {
    if (!student || typeof student !== 'object') return false
    if (typeof student.id !== 'string' || typeof student.name !== 'string' || student.name.trim() === '') return false
    if (studentIds.has(student.id)) return false
    studentIds.add(student.id)
  }
  const lessonIds = new Set<string>()
  for (const lesson of state.lessons) {
    if (!lesson || typeof lesson !== 'object') return false
    if (typeof lesson.id !== 'string' || lessonIds.has(lesson.id)) return false
    lessonIds.add(lesson.id)
    if (lesson.kind !== 'individual' && lesson.kind !== 'group') return false
    const expected = lesson.kind === 'group' ? 2 : 1
    if (!Array.isArray(lesson.participants) || lesson.participants.length !== expected) return false
    if (new Set(lesson.participants.map((participant) => participant.studentId)).size !== expected) return false
    if (lesson.participants.some((participant) => !studentIds.has(participant.studentId))) return false
    if (!Number.isInteger(lesson.weekday) || lesson.weekday < 1 || lesson.weekday > 7) return false
    if (!Number.isInteger(lesson.startMinute) || !Number.isInteger(lesson.endMinute)) return false
    if (lesson.startMinute < 0 || lesson.startMinute >= lesson.endMinute || lesson.endMinute > 1440) return false
  }
  return true
}
