export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7
export type TeacherId = 'teacher-1' | 'teacher-2' | 'teacher-3'
export type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused'
export type PaymentStatus = 'paid' | 'unpaid'
export type PaymentMethod = 'card' | 'qr' | 'transfer' | 'cash'
export type EnrollmentStatus = 'active' | 'paused' | 'withdrawn'
export type LearningRecordType = 'consultation' | 'score' | 'homework' | 'progress' | 'preparation'
export type MakeupStatus = 'pending' | 'scheduled' | 'completed'

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
  familyId?: string
  registrationDate: string
  enrollmentStatus: EnrollmentStatus
  guardianName: string
  guardianPhone: string
  color: string
  defaultTransport: Transport
  notionUrl: string
  feedbacks: FeedbackEntry[]
  learningRecords: LearningRecord[]
  createdAt: string
}

export type LearningRecord = {
  id: string
  type: LearningRecordType
  date: string
  title: string
  content: string
  score?: number
  targetScore?: number
  completed?: boolean
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
  familyPaymentId?: string
  updatedAt: string
}

export type PaymentPart = {
  id: string
  method: PaymentMethod
  amount: number
}

export type WeeklyMemo = {
  id: string
  weekStart: string
  note: string
  updatedAt: string
}

export type HolidayClosure = {
  id: string
  date: string
  name: string
  createdAt: string
}

export type MakeupRecord = {
  id: string
  studentId: string
  lessonId: string
  sourceAttendanceId: string
  absenceDate: string
  status: MakeupStatus
  scheduledDate?: string
  completedDate?: string
  note: string
  updatedAt: string
}

export type AppState = {
  schemaVersion: 1
  students: Student[]
  lessons: Lesson[]
  attendanceRecords: AttendanceRecord[]
  attendanceSessions: AttendanceSession[]
  paymentRecords: PaymentRecord[]
  weeklyMemos: WeeklyMemo[]
  holidayClosures: HolidayClosure[]
  makeupRecords: MakeupRecord[]
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
  density: 'compact' | 'comfortable'
}

export type LessonDraft = Omit<Lesson, 'id' | 'createdAt'>

export type LessonLayout = Lesson & {
  column: number
  columnCount: number
}
