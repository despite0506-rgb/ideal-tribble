export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

export type Transport = {
  arrivalRide: boolean
  departureRide: boolean
}

export type Student = {
  id: string
  name: string
  school: string
  grade: string
  color: string
  defaultTransport: Transport
  createdAt: string
}

export type Participant = {
  studentId: string
  transport: Transport
}

export type Lesson = {
  id: string
  kind: 'individual' | 'group'
  weekday: Weekday
  startMinute: number
  endMinute: number
  label: string
  note: string
  participants: Participant[]
  createdAt: string
}

export type AppState = {
  schemaVersion: 1
  students: Student[]
  lessons: Lesson[]
}

export type LessonDraft = Omit<Lesson, 'id' | 'createdAt'>

export type LessonLayout = Lesson & {
  column: number
  columnCount: number
}
