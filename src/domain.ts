import type {
  AppState,
  AttendanceRecord,
  AttendanceStatus,
  Lesson,
  LessonDraft,
  LessonLayout,
  Student,
  TeacherId,
  WeekendMode,
  Weekday,
} from './types'

export type MonthlyAttendanceSummary = {
  studentId: string
  scheduled: number
  present: number
  late: number
  absent: number
  excused: number
  unchecked: number
  attendanceRate: number | null
}

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
  '#d05d5d',
  '#d28635',
  '#bd9b2f',
  '#3f8c6c',
  '#3284a8',
  '#4c7fd1',
  '#7958bd',
  '#c0568b',
  '#8b6b52',
  '#596875',
]

export const DEFAULT_LESSON_COLORS = {
  elementary: '#e78fb1',
  middle: '#72b9e6',
  high: '#e3b84f',
} as const

export const DEFAULT_KOREAN_LESSON_COLORS = {
  elementary: '#ef6fa3',
  middle: '#45abe5',
  high: '#e8aa25',
} as const

export const LESSON_COLORS = [
  DEFAULT_LESSON_COLORS.elementary,
  DEFAULT_LESSON_COLORS.middle,
  DEFAULT_LESSON_COLORS.high,
  '#78b89a',
  '#9b87d3',
  '#e58b69',
  '#5f7eb8',
  '#c67ca4',
] as const

export type ScheduleColumn = {
  key: string
  short: string
  long: string
  weekdays: Weekday[]
}

export type GroupLessonSeries = {
  id: string
  lessons: Lesson[]
}

export function groupLessonsBySeries(lessons: Lesson[]): GroupLessonSeries[] {
  const series = new Map<string, Lesson[]>()
  lessons.filter((lesson) => lesson.kind === 'group').forEach((lesson) => {
    const id = lesson.groupSeriesId ?? lesson.id
    series.set(id, [...(series.get(id) ?? []), lesson])
  })
  return [...series.entries()]
    .map(([id, groupedLessons]) => ({
      id,
      lessons: [...groupedLessons].sort((first, second) => (
        first.weekday - second.weekday || first.startMinute - second.startMinute
      )),
    }))
    .sort((first, second) => {
      const firstLesson = first.lessons[0]
      const secondLesson = second.lessons[0]
      if (!firstLesson || !secondLesson) return 0
      return firstLesson.label.localeCompare(secondLesson.label, 'ko')
        || firstLesson.weekday - secondLesson.weekday
        || first.id.localeCompare(second.id)
    })
}

export function getScheduleColumns(weekendMode: WeekendMode): ScheduleColumn[] {
  const weekdays = WEEKDAYS.slice(0, 5).map((day) => ({
    key: String(day.value),
    short: day.short,
    long: day.long,
    weekdays: [day.value],
  }))
  if (weekendMode === 'hidden') return weekdays
  if (weekendMode === 'combined') {
    return [...weekdays, { key: 'weekend', short: '주말', long: '주말', weekdays: [6, 7] }]
  }
  return [
    ...weekdays,
    ...WEEKDAYS.slice(5).map((day) => ({
      key: String(day.value),
      short: day.short,
      long: day.long,
      weekdays: [day.value],
    })),
  ]
}

export function createId(prefix: string): string {
  const value = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `${prefix}-${value}`
}

export function matchesDeletionConfirmation(input: string, targetName: string): boolean {
  const normalizedTarget = targetName.trim()
  return normalizedTarget.length > 0 && input.trim() === normalizedTarget
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
  const hasValidParticipantCount = draft.kind === 'group' ? ids.length >= 2 : ids.length === 1

  if (!Number.isInteger(draft.weekday) || draft.weekday < 1 || draft.weekday > 7) {
    errors.push('요일을 선택해 주세요.')
  }
  if (!Number.isInteger(draft.startMinute) || !Number.isInteger(draft.endMinute)) {
    errors.push('시작 및 종료 시간을 입력해 주세요.')
  } else if (draft.startMinute < 0 || draft.endMinute > 1440 || draft.startMinute >= draft.endMinute) {
    errors.push('종료 시간은 시작 시간보다 늦어야 합니다.')
  } else if (draft.startMinute % 10 !== 0 || draft.endMinute % 10 !== 0) {
    errors.push('수업 시간은 10분 단위로 설정해 주세요.')
  }
  if (!hasValidParticipantCount) {
    errors.push(draft.kind === 'group' ? '그룹 수업은 서로 다른 학생을 2명 이상 선택해야 합니다.' : '개인 수업은 학생 1명을 선택해야 합니다.')
  }
  if (new Set(ids).size !== ids.length) {
    errors.push('같은 학생을 두 번 선택할 수 없습니다.')
  }
  if (ids.some((id) => !students.some((student) => student.id === id))) {
    errors.push('등록되지 않은 학생이 포함되어 있습니다.')
  }
  if (draft.color !== undefined && !/^#[0-9a-f]{6}$/i.test(draft.color)) {
    errors.push('수업 색상을 다시 선택해 주세요.')
  }
  if (draft.colorMode !== undefined && draft.colorMode !== 'auto' && draft.colorMode !== 'custom') {
    errors.push('수업 색상 설정을 다시 선택해 주세요.')
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

export function dateToInputValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function dateForWeekdayInCurrentWeek(weekday: Weekday, reference = new Date()): string {
  const monday = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate())
  const referenceDay = reference.getDay() === 0 ? 7 : reference.getDay()
  monday.setDate(monday.getDate() - referenceDay + 1 + weekday - 1)
  return dateToInputValue(monday)
}

export function attendanceRecordId(lessonId: string, date: string, studentId: string): string {
  return `attendance:${lessonId}:${date}:${studentId}`
}

export function attendanceSessionId(lessonId: string, date: string): string {
  return `attendance-session:${lessonId}:${date}`
}

export function paymentRecordId(studentId: string, month: string): string {
  return `payment:${studentId}:${month}`
}

export function lessonOccurrenceDates(lesson: Pick<Lesson, 'weekday'>, month: string): string[] {
  if (!/^\d{4}-\d{2}$/.test(month)) return []
  const [yearText, monthText] = month.split('-')
  const year = Number(yearText)
  const monthIndex = Number(monthText) - 1
  if (!Number.isInteger(year) || monthIndex < 0 || monthIndex > 11) return []
  const lastDate = new Date(year, monthIndex + 1, 0).getDate()
  return Array.from({ length: lastDate }, (_, index) => new Date(year, monthIndex, index + 1))
    .filter((date) => getTodayWeekday(date) === lesson.weekday)
    .map(dateToInputValue)
}

export function buildMonthlyAttendanceSummaries(
  students: Student[],
  lessons: Lesson[],
  records: AttendanceRecord[],
  month: string,
  teacherId: TeacherId | 'all' = 'all',
  referenceDate = new Date(),
): MonthlyAttendanceSummary[] {
  const cutoffDate = dateToInputValue(referenceDate)
  const relevantLessons = lessons.filter((lesson) => teacherId === 'all' || lesson.teacherId === teacherId)
  const relevantRecords = records.filter((record) => (
    record.date.startsWith(`${month}-`) && (teacherId === 'all' || record.teacherId === teacherId)
  ))

  return students.map((student) => {
    const sessionKeys = new Set<string>()
    relevantLessons.forEach((lesson) => {
      if (!lesson.participants.some((participant) => participant.studentId === student.id)) return
      const createdDate = new Date(lesson.createdAt)
      const firstScheduledDate = Number.isNaN(createdDate.getTime()) ? '' : dateToInputValue(createdDate)
      lessonOccurrenceDates(lesson, month)
        .filter((date) => date >= firstScheduledDate && date <= cutoffDate)
        .forEach((date) => sessionKeys.add(`${lesson.id}|${date}`))
    })
    const studentRecords = relevantRecords.filter((record) => record.studentId === student.id)
    studentRecords.forEach((record) => sessionKeys.add(`${record.lessonId}|${record.date}`))
    const counts: Record<AttendanceStatus, number> = { present: 0, late: 0, absent: 0, excused: 0 }
    studentRecords.forEach((record) => { counts[record.status] += 1 })
    const checkedForRate = counts.present + counts.late + counts.absent
    return {
      studentId: student.id,
      scheduled: sessionKeys.size,
      ...counts,
      unchecked: Math.max(0, sessionKeys.size - studentRecords.length),
      attendanceRate: checkedForRate > 0 ? Math.round(((counts.present + counts.late) / checkedForRate) * 100) : null,
    }
  })
}

export function getStudentGradeGroup(student: Pick<Student, 'school' | 'grade'>): string {
  const grade = student.grade.trim()
  if (!grade) return '학년 미등록'
  const compact = grade.replace(/\s+/g, '')
  const explicit = /^(초|중|고)(?:등학교)?([1-6])(?:학년)?$/.exec(compact)
  if (explicit) return `${explicit[1]}${explicit[2]}`
  const number = /([1-6])\s*학년/.exec(grade)?.[1]
  if (!number) return grade
  const school = student.school.replace(/\s+/g, '')
  if (school.includes('초')) return `초${number}`
  if (school.includes('중')) return `중${number}`
  if (school.includes('고')) return `고${number}`
  return `${number}학년`
}

export const DEFAULT_TUITION_AMOUNTS = {
  elementaryMath: 200000,
  middleMath: 250000,
  highMath: 300000,
  middleKorean: 160000,
  highKorean: 270000,
} as const

export function getDefaultTuition(student: Student, lessons: Lesson[]): number {
  const gradeGroup = getStudentGradeGroup(student)
  const studentLessons = lessonsForStudent(lessons, student.id)
  const hasMath = studentLessons.some((lesson) => lesson.label.includes('수학'))
  const hasKorean = studentLessons.some((lesson) => lesson.label.includes('국어'))
  let amount = 0
  if (hasMath) {
    if (gradeGroup.startsWith('고')) amount += DEFAULT_TUITION_AMOUNTS.highMath
    else if (gradeGroup.startsWith('중')) amount += DEFAULT_TUITION_AMOUNTS.middleMath
    else if (gradeGroup.startsWith('초')) amount += DEFAULT_TUITION_AMOUNTS.elementaryMath
  }
  if (hasKorean) {
    if (gradeGroup.startsWith('고')) amount += DEFAULT_TUITION_AMOUNTS.highKorean
    else if (gradeGroup.startsWith('중')) amount += DEFAULT_TUITION_AMOUNTS.middleKorean
  }
  return amount
}

export function getDefaultLessonColor(studentIds: string[], students: Student[], lessonLabel = ''): string {
  const highestLevel = studentIds.reduce((highest, studentId) => {
    const student = students.find((item) => item.id === studentId)
    if (!student) return highest
    const gradeGroup = getStudentGradeGroup(student)
    const level = gradeGroup.startsWith('고') ? 3 : gradeGroup.startsWith('중') ? 2 : 1
    return Math.max(highest, level)
  }, 1)
  const colors = lessonLabel.includes('국어') ? DEFAULT_KOREAN_LESSON_COLORS : DEFAULT_LESSON_COLORS
  if (highestLevel === 3) return colors.high
  if (highestLevel === 2) return colors.middle
  return colors.elementary
}

export function getLessonColor(lesson: Pick<Lesson, 'color' | 'colorMode' | 'label' | 'participants'>, students: Student[]): string {
  if (lesson.color && lesson.colorMode !== 'auto') return lesson.color
  return getDefaultLessonColor(
    lesson.participants.map((participant) => participant.studentId),
    students,
    lesson.label,
  )
}

export function gradeGroupSortValue(label: string): number {
  const match = /^(초|중|고)([1-6])$/.exec(label)
  if (!match) return label === '학년 미등록' ? 999 : 900
  const base = match[1] === '초' ? 0 : match[1] === '중' ? 100 : 200
  return base + Number(match[2])
}

const KOREAN_INITIALS = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ']

export function getKoreanInitials(value: string): string {
  return [...value.normalize('NFC')].map((character) => {
    const code = character.charCodeAt(0) - 0xac00
    if (code < 0 || code > 11171) return character
    return KOREAN_INITIALS[Math.floor(code / 588)] ?? character
  }).join('')
}

export function matchesKoreanSearch(value: string, query: string): boolean {
  const normalizedValue = value.toLocaleLowerCase('ko').replace(/\s+/g, '')
  const normalizedQuery = query.toLocaleLowerCase('ko').replace(/\s+/g, '')
  if (!normalizedQuery) return true
  if (normalizedValue.includes(normalizedQuery)) return true
  return /^[ㄱ-ㅎ]+$/.test(normalizedQuery) && getKoreanInitials(normalizedValue).includes(normalizedQuery)
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
    if (lesson.groupSeriesId !== undefined && typeof lesson.groupSeriesId !== 'string') return false
    if (lesson.color !== undefined && (typeof lesson.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(lesson.color))) return false
    if (lesson.colorMode !== undefined && lesson.colorMode !== 'auto' && lesson.colorMode !== 'custom') return false
    if (lesson.teacherId !== undefined && !['teacher-1', 'teacher-2', 'teacher-3'].includes(lesson.teacherId)) return false
    if (!Array.isArray(lesson.participants)) return false
    if (lesson.kind === 'individual' && lesson.participants.length !== 1) return false
    if (lesson.kind === 'group' && lesson.participants.length < 2) return false
    if (new Set(lesson.participants.map((participant) => participant.studentId)).size !== lesson.participants.length) return false
    if (lesson.participants.some((participant) => !studentIds.has(participant.studentId))) return false
    if (!Number.isInteger(lesson.weekday) || lesson.weekday < 1 || lesson.weekday > 7) return false
    if (!Number.isInteger(lesson.startMinute) || !Number.isInteger(lesson.endMinute)) return false
    if (lesson.startMinute < 0 || lesson.startMinute >= lesson.endMinute || lesson.endMinute > 1440) return false
  }
  if (state.attendanceRecords !== undefined) {
    if (!Array.isArray(state.attendanceRecords)) return false
    const attendanceIds = new Set<string>()
    for (const record of state.attendanceRecords) {
      if (!record || typeof record !== 'object') return false
      if (typeof record.id !== 'string' || attendanceIds.has(record.id)) return false
      attendanceIds.add(record.id)
      if (typeof record.lessonId !== 'string' || typeof record.lessonLabel !== 'string') return false
      if (!['teacher-1', 'teacher-2', 'teacher-3'].includes(record.teacherId)) return false
      if (typeof record.studentId !== 'string' || !studentIds.has(record.studentId)) return false
      if (!/^\d{4}-\d{2}-\d{2}$/.test(record.date)) return false
      if (!['present', 'late', 'absent', 'excused'].includes(record.status)) return false
      if (record.checkedAt !== undefined && typeof record.checkedAt !== 'string') return false
      if (typeof record.note !== 'string' || typeof record.updatedAt !== 'string') return false
    }
  }
  if (state.attendanceSessions !== undefined) {
    if (!Array.isArray(state.attendanceSessions)) return false
    const sessionIds = new Set<string>()
    for (const session of state.attendanceSessions) {
      if (!session || typeof session !== 'object') return false
      if (typeof session.id !== 'string' || sessionIds.has(session.id)) return false
      sessionIds.add(session.id)
      if (typeof session.lessonId !== 'string') return false
      if (!/^\d{4}-\d{2}-\d{2}$/.test(session.date)) return false
      if (!Number.isInteger(session.actualEndMinute) || session.actualEndMinute < 0 || session.actualEndMinute >= 1440) return false
      if (typeof session.updatedAt !== 'string') return false
    }
  }
  if (state.paymentRecords !== undefined) {
    if (!Array.isArray(state.paymentRecords)) return false
    const paymentIds = new Set<string>()
    const paymentKeys = new Set<string>()
    for (const payment of state.paymentRecords) {
      if (!payment || typeof payment !== 'object') return false
      if (typeof payment.id !== 'string' || paymentIds.has(payment.id)) return false
      paymentIds.add(payment.id)
      if (typeof payment.studentId !== 'string' || !studentIds.has(payment.studentId)) return false
      if (!/^\d{4}-\d{2}$/.test(payment.month)) return false
      const paymentKey = `${payment.studentId}:${payment.month}`
      if (paymentKeys.has(paymentKey)) return false
      paymentKeys.add(paymentKey)
      if (payment.status !== 'paid' && payment.status !== 'unpaid') return false
      if (!Number.isInteger(payment.amount) || payment.amount < 0) return false
      if (!/^\d{4}-\d{2}-\d{2}$/.test(payment.dueDate)) return false
      if (payment.paymentParts !== undefined) {
        if (!Array.isArray(payment.paymentParts)) return false
        const partIds = new Set<string>()
        const methods = new Set<string>()
        for (const part of payment.paymentParts) {
          if (!part || typeof part !== 'object') return false
          if (typeof part.id !== 'string' || partIds.has(part.id)) return false
          partIds.add(part.id)
          if (!['card', 'qr', 'transfer', 'cash'].includes(part.method) || methods.has(part.method)) return false
          methods.add(part.method)
          if (!Number.isInteger(part.amount) || part.amount <= 0) return false
        }
      }
      if (typeof payment.updatedAt !== 'string') return false
    }
  }
  return true
}
