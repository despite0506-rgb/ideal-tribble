import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  BookOpen,
  Bus,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Copy,
  ExternalLink,
  LayoutDashboard,
  List,
  Link2,
  Maximize2,
  Minimize2,
  MessageSquare,
  Palette,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  Trash2,
  UserPlus,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react'
import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  type GroupLessonSeries,
  STUDENT_COLORS,
  WEEKDAYS,
  createId,
  formatDuration,
  getStudentGradeGroup,
  gradeGroupSortValue,
  getScheduleColumns,
  getTodayWeekday,
  groupLessonsBySeries,
  layoutLessons,
  lessonsForStudent,
  minutesToTime,
  timeToMinutes,
  validateLesson,
} from './domain'
import { loadScheduleSettings, loadState, resetState, saveScheduleSettings, saveState } from './storage'
import type { AppState, FeedbackEntry, Lesson, LessonDraft, ScheduleSettings, Student, TeacherId, Transport, Weekday, WeekendMode } from './types'

type View = 'schedule' | 'groups' | 'students' | 'student'
type ScheduleDisplay = 'timeline' | 'list'
type Selection = 'all' | string

type LessonModalState = {
  open: boolean
  lessonId?: string
  presetStudentId?: string
  presetWeekday?: Weekday
  presetKind?: Lesson['kind']
}

type StudentModalState = {
  open: boolean
  studentId?: string
}

type LessonTimeValue = {
  start: string
  end: string
}

const PIXELS_PER_MINUTE = 1.05
const TEN_MINUTE_OPTIONS = Array.from({ length: 24 * 6 }, (_, index) => index * 10)
const DISPLAY_TIME_OPTIONS = Array.from({ length: 17 }, (_, index) => (7 + index) * 60)
const SIDEBAR_MIN_WIDTH = 190
const SIDEBAR_MAX_WIDTH = 360
const SIDEBAR_DEFAULT_WIDTH = 264
const TEACHERS: { id: TeacherId; index: 0 | 1 | 2 }[] = [
  { id: 'teacher-1', index: 0 },
  { id: 'teacher-2', index: 1 },
  { id: 'teacher-3', index: 2 },
]
const SCHOOL_GROUPS = [
  { label: '초등학교', schools: ['청운초', '북삼초', '북평초', '삼육초'] },
  { label: '중학교', schools: ['광희중', '북평중', '예람중', '삼육중'] },
  { label: '고등학교', schools: ['북여고', '북고', '광희고'] },
] as const

type BulkStudentRow = {
  id: string
  name: string
  school: string
  grade: string
}

function gradeOptionsForSchool(school: string): string[] {
  const count = school.endsWith('초') ? 6 : 3
  return Array.from({ length: count }, (_, index) => `${index + 1}학년`)
}

function createBulkStudentRow(): BulkStudentRow {
  return { id: createId('student-row'), name: '', school: '청운초', grade: '1학년' }
}

function timeOptionsFor(value: string): number[] {
  const minute = timeToMinutes(value)
  return Number.isFinite(minute) && !TEN_MINUTE_OPTIONS.includes(minute)
    ? [...TEN_MINUTE_OPTIONS, minute].sort((a, b) => a - b)
    : TEN_MINUTE_OPTIONS
}

function initials(name: string): string {
  return name.trim().slice(-2)
}

function transportText(transport: Transport): string {
  const rides = [
    transport.arrivalRide ? `등원${Number.isInteger(transport.arrivalMinute) ? ` ${minutesToTime(transport.arrivalMinute as number)}` : ''}` : '',
    transport.departureRide ? `하원${Number.isInteger(transport.departureMinute) ? ` ${minutesToTime(transport.departureMinute as number)}` : ''}` : '',
  ].filter(Boolean)
  return rides.length > 0 ? rides.join(', ') : '차량 미이용'
}

function isValidNotionUrl(value: string): boolean {
  if (!value) return true
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && (url.hostname.endsWith('notion.so') || url.hostname.endsWith('notion.site'))
  } catch {
    return false
  }
}

function studentById(students: Student[], id: string): Student | undefined {
  return students.find((student) => student.id === id)
}

function Avatar({ student, size = 'md' }: { student: Student; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span
      className={`avatar avatar-${size}`}
      style={{ '--avatar-color': student.color } as CSSProperties}
      aria-hidden="true"
    >
      {initials(student.name)}
    </span>
  )
}

function RidePills({ transport, compact = false }: { transport: Transport; compact?: boolean }) {
  if (!transport.arrivalRide && !transport.departureRide) return null
  return (
    <span className={`ride-pills${compact ? ' ride-pills-compact' : ''}`}>
      {transport.arrivalRide && (
        <span className="ride-pill ride-on arrival">
          <ArrowDown size={11} aria-hidden="true" />
          <span>{Number.isInteger(transport.arrivalMinute) ? `등원 ${minutesToTime(transport.arrivalMinute as number)}` : '등원'}</span>
        </span>
      )}
      {transport.departureRide && (
        <span className="ride-pill ride-on departure">
          <ArrowUp size={11} aria-hidden="true" />
          <span>{Number.isInteger(transport.departureMinute) ? `하원 ${minutesToTime(transport.departureMinute as number)}` : '하원'}</span>
        </span>
      )}
    </span>
  )
}

function LessonRideSummary({ lesson }: { lesson: Lesson }) {
  const arrivalCount = lesson.participants.filter((participant) => participant.transport.arrivalRide).length
  const departureCount = lesson.participants.filter((participant) => participant.transport.departureRide).length
  if (arrivalCount === 0 && departureCount === 0) return null
  return (
    <span className="lesson-ride-summary" aria-label={`등원차량 ${arrivalCount}명, 하원차량 ${departureCount}명`}>
      {arrivalCount > 0 && <span className="active arrival" title={`등원차량 ${arrivalCount}명`}><ArrowDown size={9} />{arrivalCount}</span>}
      {departureCount > 0 && <span className="active departure" title={`하원차량 ${departureCount}명`}><ArrowUp size={9} />{departureCount}</span>}
    </span>
  )
}

function LessonCardContent({
  lesson,
  students,
  dense = false,
}: {
  lesson: Lesson
  students: Student[]
  dense?: boolean
}) {
  const participants = lesson.participants
    .map((participant) => ({ participant, student: studentById(students, participant.studentId) }))
    .filter((entry): entry is { participant: Lesson['participants'][number]; student: Student } => Boolean(entry.student))

  return (
    <>
      <div className="lesson-card-topline">
        <span className="lesson-time">
          {minutesToTime(lesson.startMinute)}–{minutesToTime(lesson.endMinute)}
        </span>
        <span className="lesson-card-badges">
          <LessonRideSummary lesson={lesson} />
          {lesson.kind === 'group' && <span className="kind-badge">{lesson.participants.length}인</span>}
        </span>
      </div>
      <strong className="lesson-title">{lesson.label || '수업'}</strong>
      <div className="lesson-people">
        <span className="mini-avatars" aria-hidden="true">
          {participants.map(({ student }) => <Avatar key={student.id} student={student} size="sm" />)}
        </span>
        <span>{participants.map(({ student }) => student.name).join(' · ')}</span>
      </div>
      <div className={`lesson-rides${dense ? ' is-dense' : ''}`}>
        {participants.filter(({ participant }) => participant.transport.arrivalRide || participant.transport.departureRide).map(({ participant, student }) => (
          <span className="lesson-ride-row" key={student.id} title={`${student.name}: ${transportText(participant.transport)}`}>
            {participants.length > 1 && <span className="ride-name">{student.name.slice(-2)}</span>}
            <RidePills transport={participant.transport} compact />
          </span>
        ))}
      </div>
    </>
  )
}

function lessonAriaLabel(lesson: Lesson, students: Student[]): string {
  const day = WEEKDAYS.find((item) => item.value === lesson.weekday)?.long ?? ''
  const people = lesson.participants.map((participant) => {
    const student = studentById(students, participant.studentId)
    return `${student?.name ?? '학생'}, ${transportText(participant.transport)}`
  }).join(', ')
  return `${day} ${minutesToTime(lesson.startMinute)}부터 ${minutesToTime(lesson.endMinute)}, ${lesson.label}, ${lesson.kind === 'group' ? `${lesson.participants.length}인 그룹 수업` : '개인 수업'}, ${people}`
}

function Timeline({
  lessons,
  students,
  selectedStudentId,
  settings,
  onOpenLesson,
  onAddAt,
}: {
  lessons: Lesson[]
  students: Student[]
  selectedStudentId: Selection
  settings: ScheduleSettings
  onOpenLesson: (lessonId: string) => void
  onAddAt: (weekday: Weekday) => void
}) {
  const columns = getScheduleColumns(settings.weekendMode)
  const start = settings.startMinute
  const end = settings.endMinute
  const height = (end - start) * PIXELS_PER_MINUTE
  const timeTicks = Array.from({ length: Math.floor((end - start) / 30) + 1 }, (_, index) => start + index * 30)
  const today = getTodayWeekday()
  const gridStyle = {
    '--day-count': columns.length,
    '--timeline-min-width': `${62 + columns.length * 120}px`,
  } as CSSProperties

  return (
    <div className="timeline-shell" style={gridStyle} aria-label="주간 시간표">
      <div className="timeline-header">
        <div className="time-heading">시간</div>
        {columns.map((column) => (
          <button
            className={`day-heading${column.weekdays.includes(today) ? ' is-today' : ''}`}
            key={column.key}
            type="button"
            onClick={() => onAddAt(column.weekdays[0] ?? 1)}
            aria-label={`${column.long}에 수업 추가`}
          >
            <span>{column.short}</span>
            {column.weekdays.includes(today) && <small>오늘</small>}
          </button>
        ))}
      </div>
      <div className="timeline-body" style={{ height }}>
        <div className="time-axis">
          {timeTicks.map((minute) => (
            <span className={minute % 60 === 0 ? 'is-hour' : 'is-half-hour'} key={minute} style={{ top: (minute - start) * PIXELS_PER_MINUTE }}>
              {minutesToTime(minute)}
            </span>
          ))}
        </div>
        <div className="days-grid">
          {columns.map((column) => {
            const dayLessons = layoutLessons(lessons.filter((lesson) => (
              column.weekdays.includes(lesson.weekday)
              && lesson.endMinute > start
              && lesson.startMinute < end
            )))
            return (
              <div className={`day-column${column.weekdays.includes(today) ? ' is-today' : ''}`} key={column.key}>
                {timeTicks.slice(0, -1).map((minute) => (
                  <span
                    className={`time-grid-line${minute % 60 === 0 ? ' is-hour' : ' is-half-hour'}`}
                    key={minute}
                    style={{ top: (minute - start) * PIXELS_PER_MINUTE }}
                    aria-hidden="true"
                  />
                ))}
                {dayLessons.map((lesson) => {
                  const width = 100 / lesson.columnCount
                  const firstStudent = studentById(students, lesson.participants[0]?.studentId ?? '')
                  const secondStudent = studentById(students, lesson.participants[1]?.studentId ?? '')
                  const clippedStart = Math.max(lesson.startMinute, start)
                  const clippedEnd = Math.min(lesson.endMinute, end)
                  const cardStyle = {
                    top: (clippedStart - start) * PIXELS_PER_MINUTE + 3,
                    height: Math.max((clippedEnd - clippedStart) * PIXELS_PER_MINUTE - 6, 34),
                    left: `calc(${lesson.column * width}% + 3px)`,
                    width: `calc(${width}% - 6px)`,
                    '--lesson-color': firstStudent?.color ?? '#2f6f68',
                    '--lesson-color-2': secondStudent?.color ?? firstStudent?.color ?? '#2f6f68',
                  } as CSSProperties
                  return (
                    <button
                      type="button"
                      className={`lesson-card ${lesson.kind}${selectedStudentId !== 'all' ? ' is-focused' : ''}`}
                      style={cardStyle}
                      onClick={() => onOpenLesson(lesson.id)}
                      key={lesson.id}
                      aria-label={lessonAriaLabel(lesson, students)}
                    >
                      <LessonCardContent lesson={lesson} students={students} dense={(lesson.endMinute - lesson.startMinute) < 45} />
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function LessonList({
  lessons,
  students,
  weekendMode,
  onOpenLesson,
  selectedDay,
  onSelectDay,
  mobileOnly = false,
}: {
  lessons: Lesson[]
  students: Student[]
  weekendMode: WeekendMode
  onOpenLesson: (lessonId: string) => void
  selectedDay: Weekday
  onSelectDay: (day: Weekday) => void
  mobileOnly?: boolean
}) {
  const columns = getScheduleColumns(weekendMode)
  const displayedColumns = mobileOnly
    ? columns.filter((column) => column.weekdays.includes(selectedDay))
    : columns
  return (
    <div className={mobileOnly ? 'mobile-schedule' : 'lesson-list-view'}>
      {mobileOnly && (
        <div className="weekday-strip" role="tablist" aria-label="요일 선택">
          {columns.map((column) => (
            <button
              key={column.key}
              type="button"
              role="tab"
              aria-selected={column.weekdays.includes(selectedDay)}
              className={column.weekdays.includes(selectedDay) ? 'active' : ''}
              onClick={() => onSelectDay(column.weekdays[0] ?? 1)}
            >
              <span>{column.short}</span>
              {column.weekdays.includes(getTodayWeekday()) && <small>오늘</small>}
            </button>
          ))}
        </div>
      )}
      {displayedColumns.map((column) => {
        const dayLessons = lessons
          .filter((lesson) => column.weekdays.includes(lesson.weekday))
          .sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute)
        return (
          <section className="lesson-list-day" key={column.key}>
            <header>
              <div>
                <span className="weekday-dot" />
                <h3>{column.long}</h3>
              </div>
              <span>{dayLessons.length}개 수업</span>
            </header>
            {dayLessons.length === 0 ? (
              <div className="empty-day">등록된 수업이 없습니다.</div>
            ) : (
              <div className="lesson-list-cards">
                {dayLessons.map((lesson) => {
                  const firstStudent = studentById(students, lesson.participants[0]?.studentId ?? '')
                  const secondStudent = studentById(students, lesson.participants[1]?.studentId ?? '')
                  const cardStyle = {
                    '--lesson-color': firstStudent?.color ?? '#2f6f68',
                    '--lesson-color-2': secondStudent?.color ?? firstStudent?.color ?? '#2f6f68',
                  } as CSSProperties
                  return (
                  <button
                    type="button"
                    className={`lesson-list-card ${lesson.kind}`}
                    style={cardStyle}
                    onClick={() => onOpenLesson(lesson.id)}
                    key={lesson.id}
                    aria-label={lessonAriaLabel(lesson, students)}
                  >
                    {column.weekdays.length > 1 && <span className="combined-day-label">{WEEKDAYS.find((day) => day.value === lesson.weekday)?.long}</span>}
                    <LessonCardContent lesson={lesson} students={students} />
                    <Pencil size={15} className="edit-hint" aria-hidden="true" />
                  </button>
                  )
                })}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

function StatCard({ icon, label, value, hint, tone }: { icon: React.ReactNode; label: string; value: string | number; hint: string; tone: string }) {
  return (
    <article className={`stat-card ${tone}`}>
      <span className="stat-icon">{icon}</span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{hint}</small>
      </div>
    </article>
  )
}

function StudentQuickLinks({
  students,
  assignedStudentIds,
  onOpenStudent,
}: {
  students: Student[]
  assignedStudentIds: Set<string>
  onOpenStudent: (studentId: string) => void
}) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set())
  const groups = useMemo(() => {
    const grouped = new Map<string, Student[]>()
    students.forEach((student) => {
      const label = getStudentGradeGroup(student)
      grouped.set(label, [...(grouped.get(label) ?? []), student])
    })
    return [...grouped.entries()]
      .map(([label, groupStudents]) => ({
        label,
        students: groupStudents.sort((a, b) => a.name.localeCompare(b.name, 'ko')),
      }))
      .sort((a, b) => gradeGroupSortValue(a.label) - gradeGroupSortValue(b.label) || a.label.localeCompare(b.label, 'ko'))
  }, [students])
  const toggleGroup = (label: string) => {
    setCollapsedGroups((current) => {
      const next = new Set(current)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  return (
    <section className="student-quick-panel" aria-labelledby="student-quick-title">
      <header>
        <div><span className="eyebrow">STUDENT PAGES</span><h2 id="student-quick-title">학년별 학생</h2></div>
        <span><i className="student-class-key" aria-hidden="true" />색상: 현재 선생님 반 · 흑백: 다른 반</span>
      </header>
      <div className="grade-groups">
        {groups.map((group) => (
          <section className="grade-group" key={group.label}>
            <header className="grade-group-head">
              <h3>{group.label}<span>{group.students.length}명</span></h3>
              <button type="button" className="grade-toggle" onClick={() => toggleGroup(group.label)} aria-expanded={!collapsedGroups.has(group.label)}>
                {collapsedGroups.has(group.label) ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
                {collapsedGroups.has(group.label) ? '펼쳐보기' : '접어보기'}
              </button>
            </header>
            {!collapsedGroups.has(group.label) && (
              <div>
                {group.students.map((student) => (
                  <button
                    type="button"
                    className={`student-quick-button${assignedStudentIds.has(student.id) ? ' is-assigned' : ' is-unassigned'}`}
                    style={{ '--student-color': student.color } as CSSProperties}
                    key={student.id}
                    onClick={() => onOpenStudent(student.id)}
                    aria-label={`${group.label} ${student.name}, ${assignedStudentIds.has(student.id) ? '현재 선생님 반' : '다른 선생님 반'}, 학생 페이지 열기`}
                  >
                    <span>{student.name}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </section>
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="toggle-ui" aria-hidden="true"><span /></span>
    </label>
  )
}

function ModalFrame({ title, eyebrow, onClose, children, wide = false }: { title: string; eyebrow: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    document.body.classList.add('modal-open')
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.classList.remove('modal-open')
    }
  }, [onClose])

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`modal-panel${wide ? ' modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <header className="modal-header">
          <div>
            <span className="eyebrow">{eyebrow}</span>
            <h2 id="modal-title">{title}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="닫기"><X size={20} /></button>
        </header>
        {children}
      </section>
    </div>
  )
}

function StudentModal({
  student,
  onClose,
  onSave,
  onDelete,
}: {
  student?: Student
  onClose: () => void
  onSave: (student: Student) => void
  onDelete: (studentId: string) => void
}) {
  const [name, setName] = useState(student?.name ?? '')
  const [school, setSchool] = useState(student?.school ?? '')
  const [grade, setGrade] = useState(student?.grade ?? '')
  const [color, setColor] = useState(student?.color ?? STUDENT_COLORS[0] ?? '#146c63')
  const [transport, setTransport] = useState<Transport>(student?.defaultTransport ?? { arrivalRide: false, departureRide: false })
  const [notionUrl, setNotionUrl] = useState(student?.notionUrl ?? '')
  const [error, setError] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) {
      setError('학생 이름을 입력해 주세요.')
      return
    }
    if (!isValidNotionUrl(notionUrl.trim())) {
      setError('notion.so 또는 notion.site로 시작하는 올바른 Notion 페이지 주소를 입력해 주세요.')
      return
    }
    onSave({
      id: student?.id ?? createId('student'),
      name: name.trim(),
      school: school.trim(),
      grade: grade.trim(),
      color,
      defaultTransport: transport,
      notionUrl: notionUrl.trim(),
      feedbacks: student?.feedbacks ?? [],
      createdAt: student?.createdAt ?? new Date().toISOString(),
    })
  }

  return (
    <ModalFrame title={student ? '학생 정보 수정' : '새 학생 등록'} eyebrow="학생 관리" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="modal-body">
          {error && <div className="form-error" role="alert">{error}</div>}
          <label className="field">
            <span>학생 이름 <em>필수</em></span>
            <input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="예: 김민준" />
          </label>
          <div className="field-row">
            <label className="field">
              <span>학교</span>
              <input value={school} onChange={(event) => setSchool(event.target.value)} placeholder="예: 한빛초" />
            </label>
            <label className="field">
              <span>학년</span>
              <input value={grade} onChange={(event) => setGrade(event.target.value)} placeholder="예: 5학년" />
            </label>
          </div>
          <fieldset className="color-field">
            <legend>학생 구분 색상</legend>
            <div className="color-options">
              {STUDENT_COLORS.map((option) => (
                <button
                  type="button"
                  key={option}
                  className={color === option ? 'selected' : ''}
                  style={{ '--swatch': option } as CSSProperties}
                  onClick={() => setColor(option)}
                  aria-label={`색상 ${option}`}
                  aria-pressed={color === option}
                >
                  {color === option && <Check size={15} />}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="transport-box">
            <legend><Bus size={16} /> 기본 차량 설정</legend>
            <p>수업을 만들 때 기본값으로 사용되며, 수업마다 바꿀 수 있습니다.</p>
            <Toggle label="등원차량 이용" checked={transport.arrivalRide} onChange={(arrivalRide) => setTransport((current) => ({ ...current, arrivalRide }))} />
            <Toggle label="하원차량 이용" checked={transport.departureRide} onChange={(departureRide) => setTransport((current) => ({ ...current, departureRide }))} />
          </fieldset>
          <label className="field">
            <span>Notion 학생 페이지 <small>선택</small></span>
            <div className="input-with-icon"><Link2 size={16} aria-hidden="true" /><input type="url" value={notionUrl} onChange={(event) => setNotionUrl(event.target.value)} placeholder="https://www.notion.so/..." /></div>
            <small>학생별 Notion 페이지 주소를 연결하면 상세 페이지에서 바로 열 수 있습니다.</small>
          </label>
        </div>
        <footer className="modal-footer">
          {student && (
            <button type="button" className="button danger-ghost" onClick={() => onDelete(student.id)}>
              <Trash2 size={16} /> 학생 삭제
            </button>
          )}
          <span className="footer-spacer" />
          <button type="button" className="button secondary" onClick={onClose}>취소</button>
          <button type="submit" className="button primary">{student ? '변경 저장' : '학생 등록'}</button>
        </footer>
      </form>
    </ModalFrame>
  )
}

function BulkStudentModal({
  existingStudents,
  onClose,
  onSave,
}: {
  existingStudents: Student[]
  onClose: () => void
  onSave: (students: Student[]) => void
}) {
  const [rows, setRows] = useState<BulkStudentRow[]>(() => (
    [createBulkStudentRow(), createBulkStudentRow(), createBulkStudentRow()]
  ))
  const [error, setError] = useState('')

  const updateRow = (rowId: string, patch: Partial<BulkStudentRow>) => {
    setError('')
    setRows((current) => current.map((row) => row.id === rowId ? { ...row, ...patch } : row))
  }
  const changeSchool = (row: BulkStudentRow, school: string) => {
    const grades = gradeOptionsForSchool(school)
    updateRow(row.id, { school, grade: grades.includes(row.grade) ? row.grade : grades[0] })
  }
  const removeRow = (rowId: string) => {
    setRows((current) => current.length === 1 ? current : current.filter((row) => row.id !== rowId))
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const completedRows = rows.filter((row) => row.name.trim())
    if (completedRows.length === 0) {
      setError('등록할 학생 이름을 한 명 이상 입력해 주세요.')
      return
    }
    const createdAt = new Date().toISOString()
    const schoolColors = new Map<string, string>()
    existingStudents.forEach((student) => {
      if (student.school && !schoolColors.has(student.school)) schoolColors.set(student.school, student.color)
    })
    let nextColorIndex = existingStudents.length
    onSave(completedRows.map((row) => ({
      id: createId('student'),
      name: row.name.trim(),
      school: row.school,
      grade: row.grade,
      color: schoolColors.get(row.school) ?? (() => {
        const color = STUDENT_COLORS[nextColorIndex % STUDENT_COLORS.length] ?? '#2f6f68'
        nextColorIndex += 1
        schoolColors.set(row.school, color)
        return color
      })(),
      defaultTransport: { arrivalRide: false, departureRide: false },
      notionUrl: '',
      feedbacks: [],
      createdAt,
    })))
  }

  return (
    <ModalFrame title="학생 일괄 등록" eyebrow="이름 · 학교 · 학년만 빠르게 입력" onClose={onClose} wide>
      <form onSubmit={submit}>
        <div className="modal-body">
          {error && <div className="form-error" role="alert"><strong>{error}</strong></div>}
          <div className="bulk-student-head" aria-hidden="true"><span>이름</span><span>학교</span><span>학년</span><span /></div>
          <div className="bulk-student-rows">
            {rows.map((row, index) => (
              <div className="bulk-student-row" key={row.id}>
                <label>
                  <span className="sr-only">{index + 1}번째 학생 이름</span>
                  <input value={row.name} onChange={(event) => updateRow(row.id, { name: event.target.value })} placeholder="학생 이름" autoFocus={index === 0} />
                </label>
                <label>
                  <span className="sr-only">{index + 1}번째 학생 학교</span>
                  <select value={row.school} onChange={(event) => changeSchool(row, event.target.value)}>
                    {SCHOOL_GROUPS.map((group) => (
                      <optgroup label={group.label} key={group.label}>
                        {group.schools.map((school) => <option value={school} key={school}>{school}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="sr-only">{index + 1}번째 학생 학년</span>
                  <select value={row.grade} onChange={(event) => updateRow(row.id, { grade: event.target.value })}>
                    {gradeOptionsForSchool(row.school).map((grade) => <option value={grade} key={grade}>{grade}</option>)}
                  </select>
                </label>
                <button type="button" className="icon-button" onClick={() => removeRow(row.id)} disabled={rows.length === 1} aria-label={`${index + 1}번째 입력 행 삭제`}><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
          <button type="button" className="bulk-add-row" onClick={() => setRows((current) => [...current, createBulkStudentRow()])}><Plus size={15} /> 입력 행 추가</button>
          <p className="bulk-student-help">차량 이용, 학생 색상, Notion 연결은 등록 후 학생 정보 수정에서 설정할 수 있습니다.</p>
        </div>
        <footer className="modal-footer">
          <span className="footer-spacer" />
          <button type="button" className="button secondary" onClick={onClose}>취소</button>
          <button type="submit" className="button primary">입력한 학생 등록</button>
        </footer>
      </form>
    </ModalFrame>
  )
}

function SchoolColorModal({
  students,
  onClose,
  onSave,
}: {
  students: Student[]
  onClose: () => void
  onSave: (colors: Record<string, string>) => void
}) {
  const schools = [...new Set(students.map((student) => student.school).filter(Boolean))].sort((first, second) => (
    first.localeCompare(second, 'ko')
  ))
  const [colors, setColors] = useState<Record<string, string>>(() => Object.fromEntries(
    schools.map((school) => [school, students.find((student) => student.school === school)?.color ?? '#2f6f68']),
  ))

  return (
    <ModalFrame title="학교별 학생 색상" eyebrow="같은 학교는 같은 색으로 일괄 적용" onClose={onClose} wide>
      <form onSubmit={(event) => { event.preventDefault(); onSave(colors) }}>
        <div className="modal-body">
          <p className="school-color-guide">학교마다 대표 색상을 하나씩 선택하세요. 저장하면 해당 학교 학생 전체의 색상이 함께 변경됩니다.</p>
          <div className="school-color-list">
            {schools.map((school) => (
              <fieldset key={school}>
                <legend><strong>{school}</strong><span>{students.filter((student) => student.school === school).length}명</span></legend>
                <div className="school-color-options">
                  {STUDENT_COLORS.map((color) => (
                    <button
                      type="button"
                      key={color}
                      className={colors[school] === color ? 'selected' : ''}
                      style={{ '--student-color': color } as CSSProperties}
                      onClick={() => setColors((current) => ({ ...current, [school]: color }))}
                      aria-label={`${school} 색상 ${color}`}
                      aria-pressed={colors[school] === color}
                    >
                      {colors[school] === color && <Check size={13} />}
                    </button>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        </div>
        <footer className="modal-footer">
          <span className="footer-spacer" />
          <button type="button" className="button secondary" onClick={onClose}>취소</button>
          <button type="submit" className="button primary">학교별 색상 적용</button>
        </footer>
      </form>
    </ModalFrame>
  )
}

function LessonModal({
  lesson,
  students,
  lessons,
  presetStudentId,
  presetWeekday,
  presetKind,
  teacherId,
  onClose,
  onSave,
  onDelete,
}: {
  lesson?: Lesson
  students: Student[]
  lessons: Lesson[]
  presetStudentId?: string
  presetWeekday?: Weekday
  presetKind?: Lesson['kind']
  teacherId: TeacherId
  onClose: () => void
  onSave: (lessons: Lesson[]) => void
  onDelete: (lessonId: string) => void
}) {
  const initialParticipantIds = lesson?.participants.map((participant) => participant.studentId)
    ?? [presetStudentId ?? students[0]?.id ?? ''].filter(Boolean)
  const initialRides = Object.fromEntries(
    (lesson?.participants ?? []).map((participant) => [participant.studentId, participant.transport]),
  ) as Record<string, Transport>
  const initialWeekday = lesson?.weekday ?? presetWeekday ?? getTodayWeekday()
  const initialStart = minutesToTime(lesson?.startMinute ?? 15 * 60)
  const initialEnd = minutesToTime(lesson?.endMinute ?? 15 * 60 + 50)
  const [kind, setKind] = useState<Lesson['kind']>(lesson?.kind ?? presetKind ?? 'individual')
  const [selectedWeekdays, setSelectedWeekdays] = useState<Weekday[]>([initialWeekday])
  const [start, setStart] = useState(initialStart)
  const [end, setEnd] = useState(initialEnd)
  const [weekdayTimes, setWeekdayTimes] = useState<Partial<Record<Weekday, LessonTimeValue>>>({
    [initialWeekday]: { start: initialStart, end: initialEnd },
  })
  const [label, setLabel] = useState(lesson?.label ?? '수학 · 정규')
  const [note, setNote] = useState(lesson?.note ?? '')
  const [participantIds, setParticipantIds] = useState<string[]>(initialParticipantIds)
  const [rides, setRides] = useState<Record<string, Transport>>(initialRides)
  const [weekdayRides, setWeekdayRides] = useState<Partial<Record<Weekday, Record<string, Transport>>>>({
    [initialWeekday]: initialRides,
  })
  const [errors, setErrors] = useState<string[]>([])

  const rideFor = (studentId: string, weekday?: Weekday): Transport => {
    const weekdayTransport = weekday === undefined ? undefined : weekdayRides[weekday]?.[studentId]
    return weekdayTransport
      ?? rides[studentId]
      ?? studentById(students, studentId)?.defaultTransport
      ?? { arrivalRide: false, departureRide: false }
  }
  const updateRide = (studentId: string, patch: Partial<Transport>, weekday?: Weekday) => {
    if (weekday !== undefined && kind === 'group') {
      setWeekdayRides((current) => ({
        ...current,
        [weekday]: {
          ...(current[weekday] ?? {}),
          [studentId]: { ...rideFor(studentId, weekday), ...patch },
        },
      }))
      return
    }
    setRides((current) => ({ ...current, [studentId]: { ...rideFor(studentId), ...patch } }))
  }

  const duration = timeToMinutes(end) - timeToMinutes(start)
  const changeKind = (nextKind: Lesson['kind']) => {
    setKind(nextKind)
    if (nextKind === 'individual') setParticipantIds((current) => current.slice(0, 1))
  }
  const toggleParticipant = (studentId: string) => {
    setParticipantIds((current) => current.includes(studentId)
      ? current.filter((id) => id !== studentId)
      : [...current, studentId])
  }
  const toggleWeekday = (weekday: Weekday) => {
    setErrors([])
    if (lesson) {
      setSelectedWeekdays([weekday])
      return
    }
    setSelectedWeekdays((current) => {
      if (current.includes(weekday)) return current.filter((day) => day !== weekday)
      setWeekdayTimes((times) => ({ ...times, [weekday]: times[weekday] ?? { start, end } }))
      return [...current, weekday].sort((first, second) => first - second)
    })
  }
  const updateWeekdayTime = (weekday: Weekday, patch: Partial<LessonTimeValue>) => {
    setWeekdayTimes((current) => ({
      ...current,
      [weekday]: { ...(current[weekday] ?? { start, end }), ...patch },
    }))
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const groupSeriesId = kind === 'group' ? (lesson?.groupSeriesId ?? createId('group')) : undefined
    const sharedDraft: Omit<LessonDraft, 'weekday' | 'startMinute' | 'endMinute' | 'participants'> = {
      kind,
      groupSeriesId,
      teacherId: lesson?.teacherId ?? teacherId,
      label: label.trim(),
      note: note.trim(),
    }
    const participantsForWeekday = (weekday: Weekday) => {
      const lessonTime = weekdayTimes[weekday] ?? { start, end }
      return participantIds.map((studentId) => {
        const transport = rideFor(studentId, kind === 'group' ? weekday : undefined)
        return {
          studentId,
          transport: kind === 'group' ? {
            ...transport,
            arrivalMinute: transport.arrivalRide
              ? transport.arrivalMinute ?? timeToMinutes(lessonTime.start)
              : transport.arrivalMinute,
            departureMinute: transport.departureRide
              ? transport.departureMinute ?? timeToMinutes(lessonTime.end)
              : transport.departureMinute,
          } : transport,
        }
      })
    }
    const nextErrors = selectedWeekdays.length === 0
      ? ['요일을 한 개 이상 선택해 주세요.']
      : [...new Set(selectedWeekdays.flatMap((weekday) => {
        const dayName = WEEKDAYS.find((day) => day.value === weekday)?.long ?? ''
        const time = kind === 'group' ? (weekdayTimes[weekday] ?? { start, end }) : { start, end }
        return validateLesson({
          ...sharedDraft,
          weekday,
          startMinute: timeToMinutes(time.start),
          endMinute: timeToMinutes(time.end),
          participants: participantsForWeekday(weekday),
        }, students, lessons, lesson?.id)
          .map((error) => error.includes('겹칩니다') ? `${dayName}: ${error}` : error)
      }))]
    if (!sharedDraft.label) nextErrors.unshift('수업 이름을 입력해 주세요.')
    if (nextErrors.length) {
      setErrors(nextErrors)
      return
    }
    const createdAt = lesson?.createdAt ?? new Date().toISOString()
    onSave(selectedWeekdays.map((weekday) => {
      const time = kind === 'group' ? (weekdayTimes[weekday] ?? { start, end }) : { start, end }
      return {
        ...sharedDraft,
        weekday,
        startMinute: timeToMinutes(time.start),
        endMinute: timeToMinutes(time.end),
        participants: participantsForWeekday(weekday),
        id: lesson?.id ?? createId('lesson'),
        createdAt,
      }
    }))
  }

  return (
    <ModalFrame title={lesson ? '수업 정보 수정' : '새 수업 등록'} eyebrow="주간 시간표" onClose={onClose} wide>
      <form onSubmit={submit}>
        <div className="modal-body">
          {errors.length > 0 && (
            <div className="form-error" role="alert">
              <strong>저장하기 전에 확인해 주세요.</strong>
              <ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul>
            </div>
          )}
          <fieldset className="segmented-field">
            <legend>수업 유형</legend>
            <div className="segmented-control">
              <button type="button" className={kind === 'individual' ? 'active' : ''} onClick={() => changeKind('individual')}>
                <UserRound size={17} /> 개인 수업
              </button>
              <button type="button" className={kind === 'group' ? 'active' : ''} onClick={() => changeKind('group')}>
                <UsersRound size={17} /> 그룹 수업
              </button>
            </div>
          </fieldset>
          {kind === 'individual' ? (
            <label className="field">
              <span>학생 <em>필수</em></span>
              <select value={participantIds[0] ?? ''} onChange={(event) => setParticipantIds(event.target.value ? [event.target.value] : [])}>
                <option value="">학생 선택</option>
                {students.map((student) => <option value={student.id} key={student.id}>{student.name} · {student.grade}</option>)}
              </select>
            </label>
          ) : (
            <fieldset className="group-student-picker">
              <legend>참여 학생 <em>2명 이상 · 인원 제한 없음</em><strong>{participantIds.length}명 선택</strong></legend>
              <div className="group-student-options">
                {students.map((student) => (
                  <label className={participantIds.includes(student.id) ? 'selected' : ''} key={student.id}>
                    <input type="checkbox" checked={participantIds.includes(student.id)} onChange={() => toggleParticipant(student.id)} />
                    <Avatar student={student} size="sm" />
                    <span><strong>{student.name}</strong><small>{student.grade || '학년 미등록'}</small></span>
                    <Check size={15} aria-hidden="true" />
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <label className="field">
            <span>수업 이름 <em>필수</em></span>
            <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="예: 수학 · 심화" />
          </label>
          <fieldset className="weekday-picker">
            <legend>
              요일 <em>필수 · {lesson ? '한 개 선택' : '여러 개 선택 가능'}</em>
              <strong>{selectedWeekdays.length}개 선택</strong>
            </legend>
            <div className="weekday-options">
              {WEEKDAYS.map((day) => (
                <button
                  type="button"
                  key={day.value}
                  className={selectedWeekdays.includes(day.value) ? 'selected' : ''}
                  aria-pressed={selectedWeekdays.includes(day.value)}
                  onClick={() => toggleWeekday(day.value)}
                >
                  {day.short}
                </button>
              ))}
            </div>
          </fieldset>
          {kind === 'group' ? (
            <fieldset className="group-weekday-times">
              <legend>요일별 수업 시간 <em>각 요일을 다르게 설정할 수 있어요</em></legend>
              <div className="group-weekday-time-list">
                {selectedWeekdays.map((weekday) => {
                  const day = WEEKDAYS.find((item) => item.value === weekday)
                  const time = weekdayTimes[weekday] ?? { start, end }
                  const dayDuration = timeToMinutes(time.end) - timeToMinutes(time.start)
                  return (
                    <div className="group-weekday-time-row" key={weekday}>
                      <strong>{day?.short}</strong>
                      <label>
                        <span className="sr-only">{day?.long} 시작 시간</span>
                        <select value={time.start} onChange={(event) => updateWeekdayTime(weekday, { start: event.target.value })}>
                          {timeOptionsFor(time.start).map((minute) => <option value={minutesToTime(minute)} key={minute}>{minutesToTime(minute)}</option>)}
                        </select>
                      </label>
                      <span aria-hidden="true">→</span>
                      <label>
                        <span className="sr-only">{day?.long} 종료 시간</span>
                        <select value={time.end} onChange={(event) => updateWeekdayTime(weekday, { end: event.target.value })}>
                          {timeOptionsFor(time.end).map((minute) => <option value={minutesToTime(minute)} key={minute}>{minutesToTime(minute)}</option>)}
                        </select>
                      </label>
                      <small>{Number.isFinite(dayDuration) && dayDuration > 0 ? formatDuration(dayDuration) : '시간 확인'}</small>
                    </div>
                  )
                })}
                {selectedWeekdays.length === 0 && <p>요일을 선택하면 시간 설정이 나타납니다.</p>}
              </div>
            </fieldset>
          ) : (
            <>
              <div className="time-fields">
                <label className="field">
                  <span>시작 시간 <small>10분 단위</small></span>
                  <select value={start} onChange={(event) => setStart(event.target.value)}>
                    {timeOptionsFor(start).map((minute) => <option value={minutesToTime(minute)} key={minute}>{minutesToTime(minute)}</option>)}
                  </select>
                </label>
                <span className="time-divider" aria-hidden="true">→</span>
                <label className="field">
                  <span>종료 시간 <small>10분 단위</small></span>
                  <select value={end} onChange={(event) => setEnd(event.target.value)}>
                    {timeOptionsFor(end).map((minute) => <option value={minutesToTime(minute)} key={minute}>{minutesToTime(minute)}</option>)}
                  </select>
                </label>
              </div>
              {Number.isFinite(duration) && duration > 0 && (
                <div className="duration-note"><Clock3 size={14} /> 총 {formatDuration(duration)} 수업</div>
              )}
            </>
          )}
          {participantIds.length > 0 && (
            <fieldset className="participant-rides">
              <legend><Bus size={16} /> 학생별 차량 이용</legend>
              <p>{kind === 'group' ? '요일마다 학생별 차량 이용과 실제 등원·하원 시간을 설정하세요.' : '이 수업에 적용할 등원·하원 차량을 각각 설정하세요.'}</p>
              {kind === 'group' ? selectedWeekdays.map((weekday) => {
                const day = WEEKDAYS.find((item) => item.value === weekday)
                const lessonTime = weekdayTimes[weekday] ?? { start, end }
                return (
                  <section className="participant-ride-day" key={weekday}>
                    <header><strong>{day?.long}</strong><span>{lessonTime.start}–{lessonTime.end}</span></header>
                    {participantIds.map((studentId) => {
                      const student = studentById(students, studentId)
                      if (!student) return null
                      const transport = rideFor(studentId, weekday)
                      return (
                        <div className="participant-ride-row group-ride-row" key={studentId}>
                          <div className="participant-name"><Avatar student={student} size="sm" /><span><strong>{student.name}</strong><small>{student.school}</small></span></div>
                          <div className="participant-ride-setting">
                            <Toggle
                              label="등원차량"
                              checked={transport.arrivalRide}
                              onChange={(arrivalRide) => updateRide(studentId, {
                                arrivalRide,
                                arrivalMinute: transport.arrivalMinute ?? timeToMinutes(lessonTime.start),
                              }, weekday)}
                            />
                            {transport.arrivalRide && (
                              <label><span>실제 등원</span><select value={transport.arrivalMinute ?? timeToMinutes(lessonTime.start)} onChange={(event) => updateRide(studentId, { arrivalMinute: Number(event.target.value) }, weekday)}>{TEN_MINUTE_OPTIONS.map((minute) => <option value={minute} key={minute}>{minutesToTime(minute)}</option>)}</select></label>
                            )}
                          </div>
                          <div className="participant-ride-setting">
                            <Toggle
                              label="하원차량"
                              checked={transport.departureRide}
                              onChange={(departureRide) => updateRide(studentId, {
                                departureRide,
                                departureMinute: transport.departureMinute ?? timeToMinutes(lessonTime.end),
                              }, weekday)}
                            />
                            {transport.departureRide && (
                              <label><span>실제 하원</span><select value={transport.departureMinute ?? timeToMinutes(lessonTime.end)} onChange={(event) => updateRide(studentId, { departureMinute: Number(event.target.value) }, weekday)}>{TEN_MINUTE_OPTIONS.map((minute) => <option value={minute} key={minute}>{minutesToTime(minute)}</option>)}</select></label>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </section>
                )
              }) : participantIds.map((studentId) => {
                const student = studentById(students, studentId)
                if (!student) return null
                const transport = rideFor(studentId)
                return (
                  <div className="participant-ride-row" key={studentId}>
                    <div className="participant-name"><Avatar student={student} size="sm" /><strong>{student.name}</strong></div>
                    <Toggle label="등원차량" checked={transport.arrivalRide} onChange={(arrivalRide) => updateRide(studentId, { arrivalRide })} />
                    <Toggle label="하원차량" checked={transport.departureRide} onChange={(departureRide) => updateRide(studentId, { departureRide })} />
                  </div>
                )
              })}
            </fieldset>
          )}
          <label className="field">
            <span>메모 <small>선택</small></span>
            <textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="준비물이나 진도 메모를 남겨보세요." />
          </label>
        </div>
        <footer className="modal-footer">
          {lesson && (
            <button type="button" className="button danger-ghost" onClick={() => onDelete(lesson.id)}>
              <Trash2 size={16} /> 수업 삭제
            </button>
          )}
          <span className="footer-spacer" />
          <button type="button" className="button secondary" onClick={onClose}>취소</button>
          <button type="submit" className="button primary">{lesson ? '변경 저장' : '수업 등록'}</button>
        </footer>
      </form>
    </ModalFrame>
  )
}

function GroupMembersModal({
  series,
  students,
  lessons,
  onClose,
  onSave,
}: {
  series: GroupLessonSeries
  students: Student[]
  lessons: Lesson[]
  onClose: () => void
  onSave: (studentIds: string[]) => void
}) {
  const initialIds = [...new Set(series.lessons.flatMap((lesson) => (
    lesson.participants.map((participant) => participant.studentId)
  )))]
  const [participantIds, setParticipantIds] = useState(initialIds)
  const [errors, setErrors] = useState<string[]>([])
  const representative = series.lessons[0]

  const toggleParticipant = (studentId: string) => {
    setErrors([])
    setParticipantIds((current) => current.includes(studentId)
      ? current.filter((id) => id !== studentId)
      : [...current, studentId])
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (participantIds.length < 2) {
      setErrors(['그룹 수업은 학생을 2명 이상 선택해야 합니다.'])
      return
    }
    const nextErrors = [...new Set(series.lessons.flatMap((lesson) => {
      const dayName = WEEKDAYS.find((day) => day.value === lesson.weekday)?.long ?? ''
      const participants = participantIds.map((studentId) => ({
        studentId,
        transport: lesson.participants.find((participant) => participant.studentId === studentId)?.transport
          ?? studentById(students, studentId)?.defaultTransport
          ?? { arrivalRide: false, departureRide: false },
      }))
      return validateLesson({ ...lesson, participants }, students, lessons, lesson.id)
        .map((error) => error.includes('겹칩니다') ? `${dayName}: ${error}` : error)
    }))]
    if (nextErrors.length > 0) {
      setErrors(nextErrors)
      return
    }
    onSave(participantIds)
  }

  return (
    <ModalFrame title="그룹 인원 관리" eyebrow={representative?.label ?? '그룹 수업'} onClose={onClose} wide>
      <form onSubmit={submit}>
        <div className="modal-body">
          {errors.length > 0 && (
            <div className="form-error" role="alert">
              <strong>저장하기 전에 확인해 주세요.</strong>
              <ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul>
            </div>
          )}
          <div className="group-modal-summary">
            <div><strong>{representative?.label}</strong><span>{series.lessons.length}개 요일 일정</span></div>
            <div className="group-schedule-chips">
              {series.lessons.map((lesson) => (
                <span key={lesson.id}>
                  {WEEKDAYS.find((day) => day.value === lesson.weekday)?.short} {minutesToTime(lesson.startMinute)}–{minutesToTime(lesson.endMinute)}
                </span>
              ))}
            </div>
          </div>
          <fieldset className="group-student-picker group-member-editor">
            <legend>참여 학생 <em>2명 이상 · 전체 일정에 적용</em><strong>{participantIds.length}명 선택</strong></legend>
            <div className="group-student-options">
              {students.map((student) => (
                <label className={participantIds.includes(student.id) ? 'selected' : ''} key={student.id}>
                  <input type="checkbox" checked={participantIds.includes(student.id)} onChange={() => toggleParticipant(student.id)} />
                  <Avatar student={student} size="sm" />
                  <span><strong>{student.name}</strong><small>{student.grade || '학년 미등록'}</small></span>
                  <Check size={15} aria-hidden="true" />
                </label>
              ))}
            </div>
          </fieldset>
          <p className="group-member-help">새로 추가한 학생의 차량 설정은 학생 정보에 저장된 기본값으로 적용됩니다. 각 요일의 차량 설정은 해당 수업을 열어 변경할 수 있어요.</p>
        </div>
        <footer className="modal-footer">
          <span className="footer-spacer" />
          <button type="button" className="button secondary" onClick={onClose}>취소</button>
          <button type="submit" className="button primary">인원 변경 저장</button>
        </footer>
      </form>
    </ModalFrame>
  )
}

function GroupManagementPage({
  series,
  students,
  onManageMembers,
  onOpenLesson,
  onAddGroup,
}: {
  series: GroupLessonSeries[]
  students: Student[]
  onManageMembers: (seriesId: string) => void
  onOpenLesson: (lessonId: string) => void
  onAddGroup: () => void
}) {
  if (series.length === 0) {
    return (
      <section className="groups-page">
        <div className="empty-state card">
          <span><UsersRound size={28} /></span>
          <h3>등록된 그룹 수업이 없습니다</h3>
          <p>요일별 시간과 참여 학생을 정해 첫 그룹 수업을 만들어 보세요.</p>
          <button type="button" className="button primary" onClick={onAddGroup}><Plus size={16} /> 그룹 수업 추가</button>
        </div>
      </section>
    )
  }

  return (
    <section className="groups-page">
      <div className="groups-summary">
        <div><span>운영 중인 그룹</span><strong>{series.length}</strong></div>
        <p>그룹별 요일 일정과 참여 학생을 한곳에서 관리하세요.</p>
      </div>
      <div className="group-card-grid">
        {series.map((group) => {
          const representative = group.lessons[0]
          const participantIds = [...new Set(group.lessons.flatMap((lesson) => (
            lesson.participants.map((participant) => participant.studentId)
          )))]
          return (
            <article className="group-card" key={group.id}>
              <header>
                <span className="group-card-icon"><UsersRound size={19} /></span>
                <div><h2>{representative?.label}</h2><p>주 {group.lessons.length}회 · {participantIds.length}명</p></div>
                <button type="button" className="button secondary" onClick={() => onManageMembers(group.id)}><UsersRound size={15} /> 인원 관리</button>
              </header>
              <div className="group-member-list" aria-label="참여 학생">
                {participantIds.map((studentId) => {
                  const student = studentById(students, studentId)
                  return student ? <span key={studentId}><Avatar student={student} size="sm" />{student.name}</span> : null
                })}
              </div>
              <div className="group-schedule-list">
                {group.lessons.map((lesson) => (
                  <button type="button" key={lesson.id} onClick={() => onOpenLesson(lesson.id)}>
                    <strong>{WEEKDAYS.find((day) => day.value === lesson.weekday)?.long}</strong>
                    <span>{minutesToTime(lesson.startMinute)}–{minutesToTime(lesson.endMinute)}</span>
                    <small>일정 수정</small>
                    <Pencil size={14} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function StudentDetail({
  student,
  lessons,
  allStudents,
  teacherNames,
  onBack,
  onEdit,
  onAddLesson,
  onOpenLesson,
  onAddFeedback,
  onDeleteFeedback,
  onNotice,
}: {
  student: Student
  lessons: Lesson[]
  allStudents: Student[]
  teacherNames: ScheduleSettings['teacherNames']
  onBack: () => void
  onEdit: () => void
  onAddLesson: () => void
  onOpenLesson: (lessonId: string) => void
  onAddFeedback: (feedback: FeedbackEntry) => void
  onDeleteFeedback: (feedbackId: string) => void
  onNotice: (message: string) => void
}) {
  const [feedbackDate, setFeedbackDate] = useState(new Date().toISOString().slice(0, 10))
  const [feedbackContent, setFeedbackContent] = useState('')
  const feedbacks = [...student.feedbacks].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
  const groupLessons = lessons.filter((lesson) => lesson.kind === 'group')

  const submitFeedback = (event: FormEvent) => {
    event.preventDefault()
    if (!feedbackContent.trim()) {
      onNotice('피드백 내용을 입력해 주세요.')
      return
    }
    onAddFeedback({
      id: createId('feedback'),
      date: feedbackDate,
      content: feedbackContent.trim(),
      createdAt: new Date().toISOString(),
    })
    setFeedbackContent('')
  }

  const copyFeedbacks = async () => {
    if (feedbacks.length === 0) {
      onNotice('복사할 피드백이 없습니다.')
      return
    }
    const markdown = [
      `# ${student.name} 피드백`,
      '',
      ...feedbacks.flatMap((feedback) => [`## ${feedback.date}`, feedback.content, '']),
    ].join('\n')
    try {
      await navigator.clipboard.writeText(markdown)
      onNotice('Notion에 붙여넣을 피드백을 복사했습니다.')
    } catch {
      onNotice('브라우저에서 복사를 허용하지 않았습니다.')
    }
  }

  return (
    <section className="student-detail-page">
      <button type="button" className="detail-back" onClick={onBack}><ArrowLeft size={16} /> 학생 목록</button>
      <div className="student-detail-hero">
        <div className="student-detail-profile">
          <Avatar student={student} size="lg" />
          <div>
            <span className="eyebrow">STUDENT PAGE</span>
            <h2>{student.name}</h2>
            <p>{[student.school, student.grade].filter(Boolean).join(' · ') || '학교 정보 미등록'}</p>
          </div>
        </div>
        <div className="student-detail-actions">
          {student.notionUrl && <a className="button notion-button" href={student.notionUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Notion 열기</a>}
          <button type="button" className="button secondary" onClick={onEdit}><Pencil size={15} /> 정보 수정</button>
          <button type="button" className="button primary" onClick={onAddLesson}><Plus size={15} /> 수업 추가</button>
        </div>
      </div>

      <div className="student-detail-stats">
        <div><strong>{lessons.length}</strong><span>주간 수업</span></div>
        <div><strong>{groupLessons.length}</strong><span>그룹 수업</span></div>
        <div><strong>{feedbacks.length}</strong><span>피드백 기록</span></div>
        <div><RidePills transport={student.defaultTransport} /></div>
      </div>

      <div className="student-detail-layout">
        <section className="detail-card student-schedule-card">
          <header><div><CalendarDays size={18} /><h3>개인 시간표</h3></div><span>그룹 수업도 함께 표시됩니다.</span></header>
          {lessons.length === 0 ? (
            <div className="detail-empty">등록된 수업이 없습니다.</div>
          ) : (
            <div className="student-lesson-list">
              {lessons.map((lesson) => {
                const participant = lesson.participants.find((item) => item.studentId === student.id)
                const teacherIndex = TEACHERS.find((teacher) => teacher.id === lesson.teacherId)?.index ?? 0
                const people = lesson.participants
                  .map((item) => studentById(allStudents, item.studentId)?.name)
                  .filter(Boolean)
                  .join(' · ')
                return (
                  <button type="button" key={lesson.id} onClick={() => onOpenLesson(lesson.id)}>
                    <span className="student-lesson-day">{WEEKDAYS.find((day) => day.value === lesson.weekday)?.short}</span>
                    <span className="student-lesson-main"><strong>{lesson.label}</strong><small>{teacherNames[teacherIndex]} · {minutesToTime(lesson.startMinute)}–{minutesToTime(lesson.endMinute)} · {people}</small></span>
                    {lesson.kind === 'group' && <span className="student-group-badge">그룹 {lesson.participants.length}인</span>}
                    {participant && <RidePills transport={participant.transport} compact />}
                    <Pencil size={14} aria-hidden="true" />
                  </button>
                )
              })}
            </div>
          )}
        </section>

        <section className="detail-card feedback-card">
          <header>
            <div><MessageSquare size={18} /><h3>피드백 기록</h3></div>
            <button type="button" className="copy-feedback" onClick={copyFeedbacks}><Copy size={14} /> Notion용 복사</button>
          </header>
          <form className="feedback-form" onSubmit={submitFeedback}>
            <input type="date" value={feedbackDate} onChange={(event) => setFeedbackDate(event.target.value)} aria-label="피드백 날짜" />
            <textarea value={feedbackContent} onChange={(event) => setFeedbackContent(event.target.value)} placeholder="수업 태도, 진도, 숙제 등 피드백을 기록하세요." rows={3} />
            <button type="submit" className="button primary">기록 저장</button>
          </form>
          <div className="notion-connection">
            <Link2 size={16} />
            <div><strong>{student.notionUrl ? 'Notion 페이지 연결됨' : 'Notion 페이지를 연결하세요'}</strong><span>{student.notionUrl ? '복사한 피드백을 연결된 학생 페이지에 붙여넣을 수 있습니다.' : '학생 정보 수정에서 Notion 페이지 주소를 입력할 수 있습니다.'}</span></div>
          </div>
          {feedbacks.length === 0 ? (
            <div className="detail-empty compact">아직 기록한 피드백이 없습니다.</div>
          ) : (
            <div className="feedback-list">
              {feedbacks.map((feedback) => (
                <article key={feedback.id}>
                  <header><time dateTime={feedback.date}>{feedback.date}</time><button type="button" onClick={() => onDeleteFeedback(feedback.id)} aria-label={`${feedback.date} 피드백 삭제`}><Trash2 size={14} /></button></header>
                  <p>{feedback.content}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  )
}

export default function App() {
  const initial = useMemo(() => loadState(), [])
  const [appState, setAppState] = useState<AppState>(initial.state)
  const [storageEnabled, setStorageEnabled] = useState(!initial.warning)
  const [storageWarning, setStorageWarning] = useState(initial.warning)
  const [view, setView] = useState<View>('schedule')
  const [activeTeacherId, setActiveTeacherId] = useState<TeacherId>('teacher-1')
  const [detailStudentId, setDetailStudentId] = useState<string | null>(null)
  const [selectedStudentId, setSelectedStudentId] = useState<Selection>('all')
  const [studentQuery, setStudentQuery] = useState('')
  const [studentPageQuery, setStudentPageQuery] = useState('')
  const [scheduleDisplay, setScheduleDisplay] = useState<ScheduleDisplay>('timeline')
  const [selectedDay, setSelectedDay] = useState<Weekday>(getTodayWeekday())
  const [scheduleSettings, setScheduleSettings] = useState<ScheduleSettings>(() => loadScheduleSettings())
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [scheduleFullscreen, setScheduleFullscreen] = useState(false)
  const [lessonModal, setLessonModal] = useState<LessonModalState>({ open: false })
  const [studentModal, setStudentModal] = useState<StudentModalState>({ open: false })
  const [groupMembersModalId, setGroupMembersModalId] = useState<string | null>(null)
  const [bulkStudentModalOpen, setBulkStudentModalOpen] = useState(false)
  const [schoolColorModalOpen, setSchoolColorModalOpen] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!storageEnabled) return
    const error = saveState(appState)
    if (error) setStorageWarning(error)
  }, [appState, storageEnabled])

  useEffect(() => {
    if (!notice) return
    const timeout = window.setTimeout(() => setNotice(''), 3200)
    return () => window.clearTimeout(timeout)
  }, [notice])

  useEffect(() => {
    saveScheduleSettings(scheduleSettings)
    document.title = `${scheduleSettings.academyName} · 학원 시간표`
    const availableColumns = getScheduleColumns(scheduleSettings.weekendMode)
    if (!availableColumns.some((column) => column.weekdays.includes(selectedDay))) {
      setSelectedDay(availableColumns[0]?.weekdays[0] ?? 1)
    } else if (scheduleSettings.weekendMode === 'combined' && selectedDay === 7) {
      setSelectedDay(6)
    }
  }, [scheduleSettings, selectedDay])

  useEffect(() => {
    document.body.classList.toggle('schedule-fullscreen-open', scheduleFullscreen)
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setScheduleFullscreen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.classList.remove('schedule-fullscreen-open')
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [scheduleFullscreen])

  const filteredStudents = appState.students.filter((student) => {
    const normalized = studentQuery.trim().toLocaleLowerCase('ko')
    return !normalized || `${student.name} ${student.school} ${student.grade}`.toLocaleLowerCase('ko').includes(normalized)
  })
  const pageStudents = appState.students.filter((student) => {
    const normalized = studentPageQuery.trim().toLocaleLowerCase('ko')
    return !normalized || `${student.name} ${student.school} ${student.grade}`.toLocaleLowerCase('ko').includes(normalized)
  })
  const teacherLessons = useMemo(() => (
    appState.lessons.filter((lesson) => lesson.teacherId === activeTeacherId)
  ), [appState.lessons, activeTeacherId])
  const activeTeacherStudentIds = useMemo(() => new Set(
    teacherLessons.flatMap((lesson) => lesson.participants.map((participant) => participant.studentId)),
  ), [teacherLessons])
  const groupSeries = useMemo(() => groupLessonsBySeries(teacherLessons), [teacherLessons])
  const selectedStudent = selectedStudentId === 'all' ? undefined : studentById(appState.students, selectedStudentId)
  const detailStudent = detailStudentId ? studentById(appState.students, detailStudentId) : undefined
  const activeTeacherName = scheduleSettings.teacherNames[TEACHERS.find((teacher) => teacher.id === activeTeacherId)?.index ?? 0]
  const visibleLessons = selectedStudent ? lessonsForStudent(teacherLessons, selectedStudent.id) : teacherLessons
  const displayedWeekdays = getScheduleColumns(scheduleSettings.weekendMode).flatMap((column) => column.weekdays)
  const outsideDisplayCount = visibleLessons.filter((lesson) => (
    !displayedWeekdays.includes(lesson.weekday)
    || lesson.endMinute <= scheduleSettings.startMinute
    || lesson.startMinute >= scheduleSettings.endMinute
  )).length
  const today = getTodayWeekday()
  const todayLessons = teacherLessons.filter((lesson) => lesson.weekday === today)
  const todayRideCount = todayLessons.reduce(
    (count, lesson) => count + lesson.participants.filter((participant) => participant.transport.arrivalRide || participant.transport.departureRide).length,
    0,
  )

  const openNewLesson = (presetWeekday?: Weekday, presetStudentId?: string, presetKind?: Lesson['kind']) => {
    if (appState.students.length === 0) {
      setNotice('수업을 등록하려면 학생을 먼저 추가해 주세요.')
      setBulkStudentModalOpen(true)
      return
    }
    setLessonModal({
      open: true,
      presetWeekday,
      presetKind,
      presetStudentId: presetStudentId ?? (selectedStudentId === 'all' ? undefined : selectedStudentId),
    })
  }

  const saveLessons = (savedLessons: Lesson[]) => {
    setAppState((current) => {
      const savedById = new Map(savedLessons.map((lesson) => [lesson.id, lesson]))
      const currentIds = new Set(current.lessons.map((lesson) => lesson.id))
      return {
        ...current,
        lessons: [
          ...current.lessons.map((lesson) => savedById.get(lesson.id) ?? lesson),
          ...savedLessons.filter((lesson) => !currentIds.has(lesson.id)),
        ],
      }
    })
    setLessonModal({ open: false })
    setNotice(savedLessons.length > 1
      ? `${savedLessons.length}개 요일에 수업을 저장했습니다.`
      : '수업을 시간표에 저장했습니다.')
  }

  const deleteLesson = (lessonId: string) => {
    if (!window.confirm('이 수업을 삭제할까요? 그룹 수업은 모든 참여 학생의 시간표에서 함께 삭제됩니다.')) return
    setAppState((current) => ({ ...current, lessons: current.lessons.filter((lesson) => lesson.id !== lessonId) }))
    setLessonModal({ open: false })
    setNotice('수업을 삭제했습니다.')
  }

  const saveStudent = (student: Student) => {
    setAppState((current) => ({
      ...current,
      students: current.students.some((item) => item.id === student.id)
        ? current.students.map((item) => item.id === student.id ? student : item)
        : [...current.students, student],
    }))
    setStudentModal({ open: false })
    setNotice(studentModal.studentId ? '학생 정보를 수정했습니다.' : '새 학생을 등록했습니다.')
  }

  const saveBulkStudents = (students: Student[]) => {
    setAppState((current) => ({ ...current, students: [...current.students, ...students] }))
    setBulkStudentModalOpen(false)
    setNotice(`${students.length}명의 학생을 등록했습니다.`)
  }

  const saveSchoolColors = (colors: Record<string, string>) => {
    setAppState((current) => ({
      ...current,
      students: current.students.map((student) => ({
        ...student,
        color: colors[student.school] ?? student.color,
      })),
    }))
    setSchoolColorModalOpen(false)
    setNotice('학교별 학생 색상을 일괄 적용했습니다.')
  }

  const saveGroupMembers = (seriesId: string, studentIds: string[]) => {
    setAppState((current) => ({
      ...current,
      lessons: current.lessons.map((lesson) => {
        const lessonSeriesId = lesson.groupSeriesId ?? lesson.id
        if (lesson.kind !== 'group' || lessonSeriesId !== seriesId) return lesson
        return {
          ...lesson,
          participants: studentIds.map((studentId) => ({
            studentId,
            transport: lesson.participants.find((participant) => participant.studentId === studentId)?.transport
              ?? studentById(current.students, studentId)?.defaultTransport
              ?? { arrivalRide: false, departureRide: false },
          })),
        }
      }),
    }))
    setGroupMembersModalId(null)
    setNotice(`${studentIds.length}명으로 그룹 인원을 변경했습니다.`)
  }

  const deleteStudent = (studentId: string) => {
    const relatedCount = appState.lessons.filter((lesson) => lesson.participants.some((participant) => participant.studentId === studentId)).length
    if (!window.confirm(`학생을 삭제하면 연결된 수업 ${relatedCount}개도 함께 삭제됩니다. 계속할까요?`)) return
    setAppState((current) => ({
      ...current,
      students: current.students.filter((student) => student.id !== studentId),
      lessons: current.lessons.filter((lesson) => !lesson.participants.some((participant) => participant.studentId === studentId)),
    }))
    if (selectedStudentId === studentId) setSelectedStudentId('all')
    if (detailStudentId === studentId) {
      setDetailStudentId(null)
      setView('students')
    }
    setStudentModal({ open: false })
    setNotice('학생과 연결된 수업을 삭제했습니다.')
  }

  const showStudentSchedule = (studentId: string) => {
    setSelectedStudentId(studentId)
    setView('schedule')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const showStudentDetail = (studentId: string) => {
    setDetailStudentId(studentId)
    setView('student')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const addFeedback = (studentId: string, feedback: FeedbackEntry) => {
    setAppState((current) => ({
      ...current,
      students: current.students.map((student) => student.id === studentId
        ? { ...student, feedbacks: [feedback, ...student.feedbacks] }
        : student),
    }))
    setNotice('피드백을 학생 페이지에 저장했습니다.')
  }

  const deleteFeedback = (studentId: string, feedbackId: string) => {
    if (!window.confirm('이 피드백 기록을 삭제할까요?')) return
    setAppState((current) => ({
      ...current,
      students: current.students.map((student) => student.id === studentId
        ? { ...student, feedbacks: student.feedbacks.filter((feedback) => feedback.id !== feedbackId) }
        : student),
    }))
    setNotice('피드백 기록을 삭제했습니다.')
  }

  const handleReset = () => {
    if (!window.confirm('모든 변경 내용을 지우고 처음 예시 데이터로 되돌릴까요?')) return
    setAppState(resetState())
    setStorageEnabled(true)
    setStorageWarning(null)
    setSelectedStudentId('all')
    setDetailStudentId(null)
    setActiveTeacherId('teacher-1')
    setNotice('예시 데이터로 초기화했습니다.')
  }

  const resizeSidebar = (width: number) => {
    setScheduleSettings((current) => ({
      ...current,
      sidebarWidth: Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, Math.round(width))),
    }))
  }

  const updateTeacherName = (index: 0 | 1 | 2, name: string) => {
    setScheduleSettings((current) => {
      const teacherNames = [...current.teacherNames] as [string, string, string]
      teacherNames[index] = name
      return { ...current, teacherNames }
    })
  }

  const startSidebarResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    const startX = event.clientX
    const startWidth = scheduleSettings.sidebarWidth

    const finishResize = () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', finishResize)
      window.removeEventListener('pointercancel', finishResize)
      document.body.classList.remove('sidebar-resizing')
    }
    const handlePointerMove = (moveEvent: PointerEvent) => {
      resizeSidebar(startWidth + moveEvent.clientX - startX)
    }

    document.body.classList.add('sidebar-resizing')
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', finishResize)
    window.addEventListener('pointercancel', finishResize)
  }

  const handleSidebarResizeKey = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      resizeSidebar(scheduleSettings.sidebarWidth - 10)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      resizeSidebar(scheduleSettings.sidebarWidth + 10)
    } else if (event.key === 'Home') {
      event.preventDefault()
      resizeSidebar(SIDEBAR_DEFAULT_WIDTH)
    }
  }

  const activeLesson = lessonModal.lessonId
    ? appState.lessons.find((lesson) => lesson.id === lessonModal.lessonId)
    : undefined
  const activeEditStudent = studentModal.studentId
    ? studentById(appState.students, studentModal.studentId)
    : undefined
  const activeGroupSeries = groupMembersModalId
    ? groupSeries.find((series) => series.id === groupMembersModalId)
    : undefined

  return (
    <div
      className="app-shell"
      style={{ '--sidebar-width': `${scheduleSettings.sidebarWidth}px` } as CSSProperties}
    >
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">{scheduleSettings.academyName.trim().slice(0, 1) || '학'}</span>
          <div><strong>{scheduleSettings.academyName}</strong><small>Academy Planner</small></div>
        </div>
        <nav className="main-nav" aria-label="주 메뉴">
          <button type="button" className={view === 'schedule' ? 'active' : ''} onClick={() => setView('schedule')}>
            <LayoutDashboard size={18} /> 시간표
          </button>
          <button type="button" className={view === 'groups' ? 'active' : ''} onClick={() => setView('groups')}>
            <UsersRound size={18} /> 그룹 수업 <span>{groupSeries.length}</span>
          </button>
          <button type="button" className={view === 'students' ? 'active' : ''} onClick={() => setView('students')}>
            <UsersRound size={18} /> 학생 관리 <span>{appState.students.length}</span>
          </button>
        </nav>
        <div className="sidebar-section-head">
          <span>학생별 시간표</span>
          <button type="button" onClick={() => setBulkStudentModalOpen(true)} aria-label="학생 등록"><Plus size={16} /></button>
        </div>
        <label className="sidebar-search">
          <Search size={15} aria-hidden="true" />
          <input value={studentQuery} onChange={(event) => setStudentQuery(event.target.value)} placeholder="학생 검색" aria-label="학생 검색" />
        </label>
        <div className="student-filter-list">
          <button
            type="button"
            className={selectedStudentId === 'all' ? 'active' : ''}
            onClick={() => { setSelectedStudentId('all'); setView('schedule') }}
          >
            <span className="all-avatar"><CalendarDays size={15} /></span>
            <span><strong>전체 시간표</strong><small>{teacherLessons.length}개 수업</small></span>
            {selectedStudentId === 'all' && <Check size={15} />}
          </button>
          {filteredStudents.map((student) => {
            const count = lessonsForStudent(teacherLessons, student.id).length
            return (
              <button
                type="button"
                key={student.id}
                className={selectedStudentId === student.id ? 'active' : ''}
                onClick={() => showStudentSchedule(student.id)}
              >
                <Avatar student={student} size="sm" />
                <span><strong>{student.name}</strong><small>{student.grade || '학년 미등록'} · {count}개</small></span>
                {selectedStudentId === student.id && <Check size={15} />}
              </button>
            )
          })}
          {filteredStudents.length === 0 && <p className="sidebar-empty">검색 결과가 없습니다.</p>}
        </div>
        <div className="sidebar-footer">
          <button type="button" onClick={handleReset}><RotateCcw size={15} /> 예시 데이터로 초기화</button>
          <small>이 브라우저에 자동 저장됩니다.</small>
        </div>
        <button
          type="button"
          className="sidebar-resizer"
          onPointerDown={startSidebarResize}
          onDoubleClick={() => resizeSidebar(SIDEBAR_DEFAULT_WIDTH)}
          onKeyDown={handleSidebarResizeKey}
          role="separator"
          aria-orientation="vertical"
          aria-valuemin={SIDEBAR_MIN_WIDTH}
          aria-valuemax={SIDEBAR_MAX_WIDTH}
          aria-valuenow={scheduleSettings.sidebarWidth}
          aria-label={`메뉴바 너비 ${scheduleSettings.sidebarWidth}px. 좌우 방향키로 조절`}
          title="드래그해서 메뉴바 너비 조절 · 더블클릭으로 초기화"
        />
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="mobile-brand"><span>{scheduleSettings.academyName.trim().slice(0, 1) || '학'}</span><strong>{scheduleSettings.academyName}</strong></div>
          <div className="topbar-title">
            <span className="eyebrow">ACADEMY SCHEDULE</span>
            <h1>{view === 'schedule'
              ? (selectedStudent ? `${selectedStudent.name} · ${activeTeacherName}` : `${activeTeacherName} 시간표`)
              : view === 'groups'
                ? `${activeTeacherName} 그룹 수업`
                : view === 'student' ? `${detailStudent?.name ?? ''} 학생 페이지` : '학생 관리'}</h1>
            <p>{view === 'schedule'
              ? '매주 반복되는 수업과 차량 이용을 한눈에 확인하세요.'
              : view === 'groups'
                ? '그룹 일정과 참여 인원을 한곳에서 관리하세요.'
                : view === 'student' ? '수업 현황과 피드백, Notion 연결을 관리하세요.' : '학생 정보와 개인별 수업 현황을 관리하세요.'}</p>
          </div>
          <button type="button" className="button primary top-add" onClick={() => {
            if (view === 'students') setBulkStudentModalOpen(true)
            else if (view === 'groups') openNewLesson(undefined, undefined, 'group')
            else openNewLesson(undefined, view === 'student' ? detailStudent?.id : undefined)
          }}>
            {view === 'students' ? <UserPlus size={17} /> : view === 'groups' ? <UsersRound size={17} /> : <CalendarDays size={17} />}
            {view === 'students' ? '학생 등록' : view === 'groups' ? '그룹 추가' : '수업 추가'}
          </button>
        </header>

        {storageWarning && (
          <div className="warning-banner" role="alert">
            <span>{storageWarning}</span>
            {!storageEnabled && (
              <button type="button" onClick={() => { setStorageEnabled(true); setStorageWarning(null); setNotice('예시 데이터로 새로 시작했습니다.') }}>
                예시 데이터로 새로 시작
              </button>
            )}
            <button type="button" className="banner-close" onClick={() => setStorageWarning(null)} aria-label="알림 닫기"><X size={16} /></button>
          </div>
        )}

        <section className="teacher-switcher" aria-label="선생님 시간표 선택">
          <div className="teacher-switcher-label">
            <CalendarDays size={16} />
            <span><strong>선생님 시간표</strong><small>학생 목록은 3명이 함께 사용</small></span>
          </div>
          <div className="teacher-switcher-buttons">
            {TEACHERS.map((teacher) => {
              const lessonCount = appState.lessons.filter((lesson) => lesson.teacherId === teacher.id).length
              return (
                <button
                  type="button"
                  key={teacher.id}
                  className={activeTeacherId === teacher.id ? 'active' : ''}
                  onClick={() => setActiveTeacherId(teacher.id)}
                  aria-pressed={activeTeacherId === teacher.id}
                >
                  <span>{scheduleSettings.teacherNames[teacher.index]}</span>
                  <small>{lessonCount}개 수업</small>
                </button>
              )
            })}
          </div>
        </section>

        {view === 'schedule' ? (
          <>
            <StudentQuickLinks
              students={appState.students}
              assignedStudentIds={activeTeacherStudentIds}
              onOpenStudent={showStudentDetail}
            />

            <section className={`schedule-panel${scheduleFullscreen ? ' is-fullscreen' : ''}`}>
              <header className="panel-toolbar">
                <div>
                  <h2>{selectedStudent ? `${selectedStudent.name}의 주간 시간표` : '주간 수업 현황'}</h2>
                  <p>
                    {selectedStudent
                      ? `${selectedStudent.school} ${selectedStudent.grade} · 수업 ${visibleLessons.length}개`
                      : `공유 학생 ${appState.students.length}명 · 수업 ${teacherLessons.length}개`}
                  </p>
                </div>
                <div className="toolbar-actions">
                  {selectedStudent && <RidePills transport={selectedStudent.defaultTransport} />}
                  <button
                    type="button"
                    className={`schedule-settings-button${settingsOpen ? ' active' : ''}`}
                    onClick={() => setSettingsOpen((open) => !open)}
                    aria-expanded={settingsOpen}
                  >
                    <Settings2 size={15} /> <span>표시 설정</span>
                  </button>
                  <button
                    type="button"
                    className="schedule-settings-button fullscreen-button"
                    onClick={() => setScheduleFullscreen((fullscreen) => !fullscreen)}
                    aria-pressed={scheduleFullscreen}
                    title={scheduleFullscreen ? '전체화면 나가기 (Esc)' : '시간표 전체화면으로 보기'}
                  >
                    {scheduleFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                    <span>{scheduleFullscreen ? '나가기' : '전체화면'}</span>
                  </button>
                  <div className="view-switch" aria-label="보기 방식">
                    <button type="button" className={scheduleDisplay === 'timeline' ? 'active' : ''} onClick={() => setScheduleDisplay('timeline')} aria-label="시간표 보기"><CalendarDays size={16} /> 시간표</button>
                    <button type="button" className={scheduleDisplay === 'list' ? 'active' : ''} onClick={() => setScheduleDisplay('list')} aria-label="목록 보기"><List size={16} /> 목록</button>
                  </div>
                </div>
              </header>
              {settingsOpen && (
                <div className="schedule-settings" aria-label="시간표 표시 설정">
                  <label className="academy-name-setting">
                    <span className="settings-label">학원 이름</span>
                    <input
                      value={scheduleSettings.academyName}
                      maxLength={24}
                      onChange={(event) => setScheduleSettings((current) => ({ ...current, academyName: event.target.value }))}
                      onBlur={() => setScheduleSettings((current) => ({ ...current, academyName: current.academyName.trim() || '우리 학원' }))}
                      aria-label="학원 이름"
                    />
                  </label>
                  <fieldset className="teacher-name-settings">
                    <legend className="settings-label">선생님 이름</legend>
                    <div>
                      {TEACHERS.map((teacher) => (
                        <input
                          key={teacher.id}
                          value={scheduleSettings.teacherNames[teacher.index]}
                          maxLength={12}
                          onChange={(event) => updateTeacherName(teacher.index, event.target.value)}
                          onBlur={(event) => updateTeacherName(
                            teacher.index,
                            event.target.value.trim() || `선생님 ${teacher.index + 1}`,
                          )}
                          aria-label={`${teacher.index + 1}번 선생님 이름`}
                        />
                      ))}
                    </div>
                  </fieldset>
                  <div className="settings-time-range">
                    <span className="settings-label">보이는 시간</span>
                    <label>
                      <span className="sr-only">표시 시작 시간</span>
                      <select
                        value={scheduleSettings.startMinute}
                        onChange={(event) => setScheduleSettings((current) => ({ ...current, startMinute: Number(event.target.value) }))}
                      >
                        {DISPLAY_TIME_OPTIONS.filter((minute) => minute < scheduleSettings.endMinute).map((minute) => (
                          <option value={minute} key={minute}>{minutesToTime(minute)}</option>
                        ))}
                      </select>
                    </label>
                    <span>부터</span>
                    <label>
                      <span className="sr-only">표시 종료 시간</span>
                      <select
                        value={scheduleSettings.endMinute}
                        onChange={(event) => setScheduleSettings((current) => ({ ...current, endMinute: Number(event.target.value) }))}
                      >
                        {DISPLAY_TIME_OPTIONS.filter((minute) => minute > scheduleSettings.startMinute).map((minute) => (
                          <option value={minute} key={minute}>{minutesToTime(minute)}</option>
                        ))}
                      </select>
                    </label>
                    <span>까지</span>
                  </div>
                  <fieldset className="weekend-setting">
                    <legend>주말 표시</legend>
                    <div>
                      {([
                        ['hidden', '숨김'],
                        ['combined', '주말 한 칸'],
                        ['separate', '토·일 분리'],
                      ] as const).map(([mode, label]) => (
                        <button
                          type="button"
                          key={mode}
                          className={scheduleSettings.weekendMode === mode ? 'active' : ''}
                          onClick={() => setScheduleSettings((current) => ({ ...current, weekendMode: mode }))}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  {outsideDisplayCount > 0 && (
                    <p className="hidden-lessons-note">현재 설정에서 {outsideDisplayCount}개 수업이 시간표 밖에 있습니다. 목록 보기에서는 모두 확인할 수 있어요.</p>
                  )}
                </div>
              )}
              {visibleLessons.length === 0 ? (
                <div className="empty-state">
                  <span><CalendarDays size={28} /></span>
                  <h3>등록된 수업이 없습니다</h3>
                  <p>{selectedStudent ? `${selectedStudent.name} 학생의 첫 수업을 추가해 보세요.` : '학생을 등록하고 첫 수업을 추가해 보세요.'}</p>
                  <button type="button" className="button primary" onClick={() => openNewLesson()}><Plus size={16} /> 수업 추가</button>
                </div>
              ) : (
                <>
                  <div className="desktop-schedule">
                    {scheduleDisplay === 'timeline' ? (
                      <Timeline lessons={visibleLessons} students={appState.students} selectedStudentId={selectedStudentId} settings={scheduleSettings} onOpenLesson={(lessonId) => setLessonModal({ open: true, lessonId })} onAddAt={(weekday) => openNewLesson(weekday)} />
                    ) : (
                      <LessonList lessons={visibleLessons} students={appState.students} weekendMode={scheduleSettings.weekendMode} selectedDay={selectedDay} onSelectDay={setSelectedDay} onOpenLesson={(lessonId) => setLessonModal({ open: true, lessonId })} />
                    )}
                  </div>
                  <LessonList mobileOnly lessons={visibleLessons} students={appState.students} weekendMode={scheduleSettings.weekendMode} selectedDay={selectedDay} onSelectDay={setSelectedDay} onOpenLesson={(lessonId) => setLessonModal({ open: true, lessonId })} />
                </>
              )}
            </section>
            <section className="stats-grid stats-grid-bottom" aria-label="오늘의 요약">
              <StatCard icon={<UsersRound size={20} />} label="등록 학생" value={appState.students.length} hint="현재 관리 중" tone="mint" />
              <StatCard icon={<BookOpen size={20} />} label="오늘 수업" value={todayLessons.length} hint={`${WEEKDAYS.find((day) => day.value === today)?.long} 일정`} tone="blue" />
              <StatCard icon={<UsersRound size={20} />} label="그룹 수업" value={teacherLessons.filter((lesson) => lesson.kind === 'group').length} hint="선택 시간표" tone="purple" />
              <StatCard icon={<Bus size={20} />} label="오늘 차량" value={todayRideCount} hint="이용 학생" tone="amber" />
            </section>
          </>
        ) : view === 'groups' ? (
          <GroupManagementPage
            series={groupSeries}
            students={appState.students}
            onManageMembers={setGroupMembersModalId}
            onOpenLesson={(lessonId) => setLessonModal({ open: true, lessonId })}
            onAddGroup={() => openNewLesson(undefined, undefined, 'group')}
          />
        ) : view === 'students' ? (
          <section className="students-page">
            <div className="students-toolbar">
              <label className="page-search"><Search size={17} /><input value={studentPageQuery} onChange={(event) => setStudentPageQuery(event.target.value)} placeholder="이름, 학교, 학년으로 검색" aria-label="학생 목록 검색" /></label>
              <div className="students-toolbar-actions">
                <span>{pageStudents.length}명의 공유 학생</span>
                <button type="button" className="button secondary" onClick={() => setSchoolColorModalOpen(true)}><Palette size={15} /> 학교별 색상</button>
              </div>
            </div>
            {pageStudents.length === 0 ? (
              <div className="empty-state card"><span><UsersRound size={28} /></span><h3>학생이 없습니다</h3><p>새 학생을 등록해 시간표 관리를 시작하세요.</p><button type="button" className="button primary" onClick={() => setBulkStudentModalOpen(true)}><Plus size={16} /> 학생 등록</button></div>
            ) : (
              <div className="student-card-grid">
                {pageStudents.map((student) => {
                  const studentLessons = lessonsForStudent(appState.lessons, student.id)
                  const nextLesson = studentLessons[0]
                  return (
                    <article className="student-card" key={student.id}>
                      <header>
                        <Avatar student={student} size="lg" />
                        <div><h2>{student.name}</h2><p>{[student.school, student.grade].filter(Boolean).join(' · ') || '학교 정보 미등록'}</p></div>
                        <button type="button" className="icon-button" onClick={() => setStudentModal({ open: true, studentId: student.id })} aria-label={`${student.name} 정보 수정`}><Pencil size={17} /></button>
                      </header>
                      <div className="student-transport">
                        <span>기본 차량</span>
                        <RidePills transport={student.defaultTransport} />
                      </div>
                      <div className="student-card-stats">
                        <div><strong>{studentLessons.length}</strong><span>주간 수업</span></div>
                        <div><strong>{studentLessons.filter((lesson) => lesson.kind === 'group').length}</strong><span>그룹 수업</span></div>
                      </div>
                      <div className="next-lesson">
                        <span>첫 수업</span>
                        {nextLesson ? <strong>{WEEKDAYS.find((day) => day.value === nextLesson.weekday)?.short} {minutesToTime(nextLesson.startMinute)} · {nextLesson.label}</strong> : <strong>등록된 수업 없음</strong>}
                      </div>
                      <footer>
                        <button type="button" className="button secondary" onClick={() => openNewLesson(undefined, student.id)}><Plus size={15} /> 수업 추가</button>
                        <button type="button" className="button text-button" onClick={() => showStudentDetail(student.id)}>학생 페이지 <span>→</span></button>
                      </footer>
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        ) : detailStudent ? (
          <StudentDetail
            student={detailStudent}
            lessons={lessonsForStudent(appState.lessons, detailStudent.id)}
            allStudents={appState.students}
            teacherNames={scheduleSettings.teacherNames}
            onBack={() => setView('students')}
            onEdit={() => setStudentModal({ open: true, studentId: detailStudent.id })}
            onAddLesson={() => openNewLesson(undefined, detailStudent.id)}
            onOpenLesson={(lessonId) => setLessonModal({ open: true, lessonId })}
            onAddFeedback={(feedback) => addFeedback(detailStudent.id, feedback)}
            onDeleteFeedback={(feedbackId) => deleteFeedback(detailStudent.id, feedbackId)}
            onNotice={setNotice}
          />
        ) : (
          <div className="empty-state"><h3>학생 정보를 찾을 수 없습니다.</h3><button type="button" className="button primary" onClick={() => setView('students')}>학생 목록으로</button></div>
        )}
      </main>

      <nav className="mobile-bottom-nav" aria-label="모바일 메뉴">
        <button type="button" className={view === 'schedule' ? 'active' : ''} onClick={() => setView('schedule')}><CalendarDays size={20} /><span>시간표</span></button>
        <button type="button" className={view === 'groups' ? 'active' : ''} onClick={() => setView('groups')}><UsersRound size={20} /><span>그룹</span></button>
        <button type="button" className="mobile-add" onClick={() => {
          if (view === 'schedule') openNewLesson(selectedDay)
          else if (view === 'groups') openNewLesson(undefined, undefined, 'group')
          else if (view === 'student') openNewLesson(undefined, detailStudent?.id)
          else setBulkStudentModalOpen(true)
        }}><Plus size={23} /><span>추가</span></button>
        <button type="button" className={view === 'students' || view === 'student' ? 'active' : ''} onClick={() => setView('students')}><UsersRound size={20} /><span>학생</span></button>
      </nav>

      {lessonModal.open && (
        <LessonModal
          key={lessonModal.lessonId ?? `new-${lessonModal.presetStudentId ?? ''}-${lessonModal.presetWeekday ?? ''}-${lessonModal.presetKind ?? ''}`}
          lesson={activeLesson}
          students={appState.students}
          lessons={appState.lessons}
          presetStudentId={lessonModal.presetStudentId}
          presetWeekday={lessonModal.presetWeekday}
          presetKind={lessonModal.presetKind}
          teacherId={activeTeacherId}
          onClose={() => setLessonModal({ open: false })}
          onSave={saveLessons}
          onDelete={deleteLesson}
        />
      )}
      {studentModal.open && (
        <StudentModal
          key={studentModal.studentId ?? 'new'}
          student={activeEditStudent}
          onClose={() => setStudentModal({ open: false })}
          onSave={saveStudent}
          onDelete={deleteStudent}
        />
      )}
      {bulkStudentModalOpen && (
        <BulkStudentModal
          existingStudents={appState.students}
          onClose={() => setBulkStudentModalOpen(false)}
          onSave={saveBulkStudents}
        />
      )}
      {schoolColorModalOpen && (
        <SchoolColorModal
          students={appState.students}
          onClose={() => setSchoolColorModalOpen(false)}
          onSave={saveSchoolColors}
        />
      )}
      {activeGroupSeries && (
        <GroupMembersModal
          key={activeGroupSeries.id}
          series={activeGroupSeries}
          students={appState.students}
          lessons={appState.lessons}
          onClose={() => setGroupMembersModalId(null)}
          onSave={(studentIds) => saveGroupMembers(activeGroupSeries.id, studentIds)}
        />
      )}
      <div className={`toast${notice ? ' show' : ''}`} role="status" aria-live="polite"><Check size={17} />{notice}</div>
    </div>
  )
}
