export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7
export type TeacherId = 'teacher-1' | 'teacher-2' | 'teacher-3'
export type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused'
export type PaymentStatus = 'paid' | 'unpaid'
export type PaymentMethod = 'card' | 'qr' | 'transfer' | 'cash'

export type Transport = {
  arrivalRide: boolean
  departureRide: boolean
  arrivalMinute?: number
  departureMinute?: number
}

export type FeedbackEntry = {
  id: string
  date: string
  content: string
  createdAt: string
}

export type Student = {
  id: string
  name: string
  school: string
  grade: string
  color: string
  defaultTransport: Transport
  notionUrl: string
  feedbacks: FeedbackEntry[]
  createdAt: string
}

export type Participant = {
  studentId: string
  transport: Transport
}

export type Lesson = {
  id: string
  kind: 'individual' | 'group'
  groupSeriesId?: string
  teacherId: TeacherId
  weekday: Weekday
  startMinute: number
  endMinute: number
  label: string
  color?: string
  colorMode?: 'auto' | 'custom'
  note: string
  participants: Participant[]
  createdAt: string
}

export type AttendanceRecord = {
  id: string
  lessonId: string
  lessonLabel: string
  teacherId: TeacherId
  studentId: string
  date: string
  status: AttendanceStatus
  note: string
  checkedAt?: string
  updatedAt: string
}

export type AttendanceSession = {
  id: string
  lessonId: string
  date: string
  actualEndMinute: number
  updatedAt: string
}

export type PaymentRecord = {
  id: string
  studentId: string
  month: string
  status: PaymentStatus
  amount: number
  dueDate: string
  paymentParts: PaymentPart[]
  updatedAt: string
}

export type PaymentPart = {
  id: string
  method: PaymentMethod
  amount: number
}

export type AppState = {
  schemaVersion: 1
  students: Student[]
  lessons: Lesson[]
  attendanceRecords: AttendanceRecord[]
  attendanceSessions: AttendanceSession[]
  paymentRecords: PaymentRecord[]
}

export type WeekendMode = 'hidden' | 'combined' | 'separate'

export type ScheduleSettings = {
  academyName: string
  teacherNames: [string, string, string]
  sidebarWidth: number
  startMinute: number
  endMinute: number
  weekendMode: WeekendMode
  transportEnabled: boolean
  showStudentAvatars: boolean
  showStudentNames: boolean
}

export type LessonDraft = Omit<Lesson, 'id' | 'createdAt'>

export type LessonLayout = Lesson & {
  column: number
  columnCount: number
}
