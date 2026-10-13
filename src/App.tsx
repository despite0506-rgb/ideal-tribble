import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Bus,
  CalendarDays,
  Check,
  Clock3,
  LayoutDashboard,
  List,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  UserPlus,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import {
  STUDENT_COLORS,
  WEEKDAYS,
  createId,
  formatDuration,
  getTodayWeekday,
  layoutLessons,
  lessonsForStudent,
  minutesToTime,
  timeToMinutes,
  validateLesson,
} from './domain'
import { loadState, resetState, saveState } from './storage'
import type { AppState, Lesson, LessonDraft, Student, Transport, Weekday } from './types'

type View = 'schedule' | 'students'
type ScheduleDisplay = 'timeline' | 'list'
type Selection = 'all' | string

type LessonModalState = {
  open: boolean
  lessonId?: string
  presetStudentId?: string
  presetWeekday?: Weekday
}

type StudentModalState = {
  open: boolean
  studentId?: string
}

const VIEW_START = 9 * 60
const VIEW_END = 21 * 60
const PIXELS_PER_MINUTE = 1.05

function initials(name: string): string {
  return name.trim().slice(-2)
}

function transportText(transport: Transport): string {
  return `등원 ${transport.arrivalRide ? '이용' : '미이용'}, 하원 ${transport.departureRide ? '이용' : '미이용'}`
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
  return (
    <span className={`ride-pills${compact ? ' ride-pills-compact' : ''}`}>
      <span className={`ride-pill ${transport.arrivalRide ? 'ride-on arrival' : 'ride-off'}`}>
        <ArrowDown size={11} aria-hidden="true" />
        <span>{compact ? '등원' : `등원 ${transport.arrivalRide ? 'O' : 'X'}`}</span>
      </span>
      <span className={`ride-pill ${transport.departureRide ? 'ride-on departure' : 'ride-off'}`}>
        <ArrowUp size={11} aria-hidden="true" />
        <span>{compact ? '하원' : `하원 ${transport.departureRide ? 'O' : 'X'}`}</span>
      </span>
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
        {lesson.kind === 'group' && <span className="kind-badge">2인 그룹</span>}
      </div>
      <strong className="lesson-title">{lesson.label || '수업'}</strong>
      <div className="lesson-people">
        <span className="mini-avatars" aria-hidden="true">
          {participants.map(({ student }) => <Avatar key={student.id} student={student} size="sm" />)}
        </span>
        <span>{participants.map(({ student }) => student.name).join(' · ')}</span>
      </div>
      {!dense && (
        <div className="lesson-rides">
          {participants.map(({ participant, student }) => (
            <span className="lesson-ride-row" key={student.id} title={`${student.name}: ${transportText(participant.transport)}`}>
              {participants.length > 1 && <span className="ride-name">{student.name.slice(-2)}</span>}
              <RidePills transport={participant.transport} compact />
            </span>
          ))}
        </div>
      )}
    </>
  )
}

function lessonAriaLabel(lesson: Lesson, students: Student[]): string {
  const day = WEEKDAYS.find((item) => item.value === lesson.weekday)?.long ?? ''
  const people = lesson.participants.map((participant) => {
    const student = studentById(students, participant.studentId)
    return `${student?.name ?? '학생'}, ${transportText(participant.transport)}`
  }).join(', ')
  return `${day} ${minutesToTime(lesson.startMinute)}부터 ${minutesToTime(lesson.endMinute)}, ${lesson.label}, ${lesson.kind === 'group' ? '2인 그룹 수업' : '개인 수업'}, ${people}`
}

function Timeline({
  lessons,
  students,
  selectedStudentId,
  onOpenLesson,
  onAddAt,
}: {
  lessons: Lesson[]
  students: Student[]
  selectedStudentId: Selection
  onOpenLesson: (lessonId: string) => void
  onAddAt: (weekday: Weekday) => void
}) {
  const earliest = lessons.length ? Math.min(...lessons.map((lesson) => lesson.startMinute)) : VIEW_START
  const latest = lessons.length ? Math.max(...lessons.map((lesson) => lesson.endMinute)) : VIEW_END
  const start = Math.max(6 * 60, Math.min(VIEW_START, Math.floor(earliest / 60) * 60))
  const end = Math.min(24 * 60, Math.max(VIEW_END, Math.ceil(latest / 60) * 60))
  const height = (end - start) * PIXELS_PER_MINUTE
  const hours = Array.from({ length: Math.floor((end - start) / 60) + 1 }, (_, index) => start + index * 60)
  const today = getTodayWeekday()

  return (
    <div className="timeline-shell" aria-label="주간 시간표">
      <div className="timeline-header">
        <div className="time-heading">시간</div>
        {WEEKDAYS.map((day) => (
          <button
            className={`day-heading${day.value === today ? ' is-today' : ''}`}
            key={day.value}
            type="button"
            onClick={() => onAddAt(day.value)}
            aria-label={`${day.long}에 수업 추가`}
          >
            <span>{day.short}</span>
            {day.value === today && <small>오늘</small>}
          </button>
        ))}
      </div>
      <div className="timeline-body" style={{ height }}>
        <div className="time-axis">
          {hours.map((minute) => (
            <span key={minute} style={{ top: (minute - start) * PIXELS_PER_MINUTE }}>
              {minutesToTime(minute)}
            </span>
          ))}
        </div>
        <div className="days-grid">
          {WEEKDAYS.map((day) => {
            const dayLessons = layoutLessons(lessons.filter((lesson) => lesson.weekday === day.value))
            return (
              <div className={`day-column${day.value === today ? ' is-today' : ''}`} key={day.value}>
                {hours.slice(0, -1).map((minute) => (
                  <span
                    className="hour-line"
                    key={minute}
                    style={{ top: (minute - start) * PIXELS_PER_MINUTE }}
                    aria-hidden="true"
                  />
                ))}
                {dayLessons.map((lesson) => {
                  const width = 100 / lesson.columnCount
                  const cardStyle = {
                    top: (lesson.startMinute - start) * PIXELS_PER_MINUTE + 3,
                    height: Math.max((lesson.endMinute - lesson.startMinute) * PIXELS_PER_MINUTE - 6, 34),
                    left: `calc(${lesson.column * width}% + 3px)`,
                    width: `calc(${width}% - 6px)`,
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
  onOpenLesson,
  selectedDay,
  onSelectDay,
  mobileOnly = false,
}: {
  lessons: Lesson[]
  students: Student[]
  onOpenLesson: (lessonId: string) => void
  selectedDay: Weekday
  onSelectDay: (day: Weekday) => void
  mobileOnly?: boolean
}) {
  const displayedDays = mobileOnly ? WEEKDAYS.filter((day) => day.value === selectedDay) : WEEKDAYS
  return (
    <div className={mobileOnly ? 'mobile-schedule' : 'lesson-list-view'}>
      {mobileOnly && (
        <div className="weekday-strip" role="tablist" aria-label="요일 선택">
          {WEEKDAYS.map((day) => (
            <button
              key={day.value}
              type="button"
              role="tab"
              aria-selected={selectedDay === day.value}
              className={selectedDay === day.value ? 'active' : ''}
              onClick={() => onSelectDay(day.value)}
            >
              <span>{day.short}</span>
              {day.value === getTodayWeekday() && <small>오늘</small>}
            </button>
          ))}
        </div>
      )}
      {displayedDays.map((day) => {
        const dayLessons = lessons
          .filter((lesson) => lesson.weekday === day.value)
          .sort((a, b) => a.startMinute - b.startMinute)
        return (
          <section className="lesson-list-day" key={day.value}>
            <header>
              <div>
                <span className="weekday-dot" />
                <h3>{day.long}</h3>
              </div>
              <span>{dayLessons.length}개 수업</span>
            </header>
            {dayLessons.length === 0 ? (
              <div className="empty-day">등록된 수업이 없습니다.</div>
            ) : (
              <div className="lesson-list-cards">
                {dayLessons.map((lesson) => (
                  <button
                    type="button"
                    className={`lesson-list-card ${lesson.kind}`}
                    onClick={() => onOpenLesson(lesson.id)}
                    key={lesson.id}
                    aria-label={lessonAriaLabel(lesson, students)}
                  >
                    <LessonCardContent lesson={lesson} students={students} />
                    <Pencil size={15} className="edit-hint" aria-hidden="true" />
                  </button>
                ))}
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
  const [error, setError] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) {
      setError('학생 이름을 입력해 주세요.')
      return
    }
    onSave({
      id: student?.id ?? createId('student'),
      name: name.trim(),
      school: school.trim(),
      grade: grade.trim(),
      color,
      defaultTransport: transport,
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

function LessonModal({
  lesson,
  students,
  lessons,
  presetStudentId,
  presetWeekday,
  onClose,
  onSave,
  onDelete,
}: {
  lesson?: Lesson
  students: Student[]
  lessons: Lesson[]
  presetStudentId?: string
  presetWeekday?: Weekday
  onClose: () => void
  onSave: (lesson: Lesson) => void
  onDelete: (lessonId: string) => void
}) {
  const defaultPrimary = lesson?.participants[0]?.studentId ?? presetStudentId ?? students[0]?.id ?? ''
  const defaultSecondary = lesson?.participants[1]?.studentId ?? ''
  const initialRides = Object.fromEntries(
    (lesson?.participants ?? []).map((participant) => [participant.studentId, participant.transport]),
  ) as Record<string, Transport>
  const [kind, setKind] = useState<Lesson['kind']>(lesson?.kind ?? 'individual')
  const [weekday, setWeekday] = useState<Weekday>(lesson?.weekday ?? presetWeekday ?? getTodayWeekday())
  const [start, setStart] = useState(minutesToTime(lesson?.startMinute ?? 15 * 60))
  const [end, setEnd] = useState(minutesToTime(lesson?.endMinute ?? 15 * 60 + 50))
  const [label, setLabel] = useState(lesson?.label ?? '수학 · 정규')
  const [note, setNote] = useState(lesson?.note ?? '')
  const [primaryId, setPrimaryId] = useState(defaultPrimary)
  const [secondaryId, setSecondaryId] = useState(defaultSecondary)
  const [rides, setRides] = useState<Record<string, Transport>>(initialRides)
  const [errors, setErrors] = useState<string[]>([])

  const rideFor = (studentId: string): Transport => {
    return rides[studentId] ?? studentById(students, studentId)?.defaultTransport ?? { arrivalRide: false, departureRide: false }
  }
  const updateRide = (studentId: string, patch: Partial<Transport>) => {
    setRides((current) => ({ ...current, [studentId]: { ...rideFor(studentId), ...patch } }))
  }

  const participantIds = kind === 'group' ? [primaryId, secondaryId].filter(Boolean) : [primaryId].filter(Boolean)
  const duration = timeToMinutes(end) - timeToMinutes(start)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const draft: LessonDraft = {
      kind,
      weekday,
      startMinute: timeToMinutes(start),
      endMinute: timeToMinutes(end),
      label: label.trim(),
      note: note.trim(),
      participants: participantIds.map((studentId) => ({ studentId, transport: rideFor(studentId) })),
    }
    const nextErrors = validateLesson(draft, students, lessons, lesson?.id)
    if (!draft.label) nextErrors.unshift('수업 이름을 입력해 주세요.')
    if (nextErrors.length) {
      setErrors(nextErrors)
      return
    }
    onSave({
      ...draft,
      id: lesson?.id ?? createId('lesson'),
      createdAt: lesson?.createdAt ?? new Date().toISOString(),
    })
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
              <button type="button" className={kind === 'individual' ? 'active' : ''} onClick={() => setKind('individual')}>
                <UserRound size={17} /> 개인 수업
              </button>
              <button type="button" className={kind === 'group' ? 'active' : ''} onClick={() => setKind('group')}>
                <UsersRound size={17} /> 2인 그룹
              </button>
            </div>
          </fieldset>
          <div className="field-row">
            <label className="field">
              <span>{kind === 'group' ? '첫 번째 학생' : '학생'} <em>필수</em></span>
              <select value={primaryId} onChange={(event) => setPrimaryId(event.target.value)}>
                <option value="">학생 선택</option>
                {students.map((student) => <option value={student.id} key={student.id}>{student.name} · {student.grade}</option>)}
              </select>
            </label>
            {kind === 'group' && (
              <label className="field">
                <span>두 번째 학생 <em>필수</em></span>
                <select value={secondaryId} onChange={(event) => setSecondaryId(event.target.value)}>
                  <option value="">학생 선택</option>
                  {students.map((student) => <option value={student.id} key={student.id} disabled={student.id === primaryId}>{student.name} · {student.grade}</option>)}
                </select>
              </label>
            )}
          </div>
          <label className="field">
            <span>수업 이름 <em>필수</em></span>
            <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="예: 수학 · 심화" />
          </label>
          <div className="time-fields">
            <label className="field day-select">
              <span>요일</span>
              <select value={weekday} onChange={(event) => setWeekday(Number(event.target.value) as Weekday)}>
                {WEEKDAYS.map((day) => <option value={day.value} key={day.value}>{day.long}</option>)}
              </select>
            </label>
            <label className="field">
              <span>시작 시간</span>
              <input type="time" step="60" value={start} onChange={(event) => setStart(event.target.value)} />
            </label>
            <span className="time-divider" aria-hidden="true">→</span>
            <label className="field">
              <span>종료 시간</span>
              <input type="time" step="60" value={end} onChange={(event) => setEnd(event.target.value)} />
            </label>
          </div>
          {Number.isFinite(duration) && duration > 0 && (
            <div className="duration-note"><Clock3 size={14} /> 총 {formatDuration(duration)} 수업</div>
          )}
          {participantIds.length > 0 && (
            <fieldset className="participant-rides">
              <legend><Bus size={16} /> 학생별 차량 이용</legend>
              <p>이 수업에 적용할 등원·하원 차량을 각각 설정하세요.</p>
              {participantIds.map((studentId) => {
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

export default function App() {
  const initial = useMemo(() => loadState(), [])
  const [appState, setAppState] = useState<AppState>(initial.state)
  const [storageEnabled, setStorageEnabled] = useState(!initial.warning)
  const [storageWarning, setStorageWarning] = useState(initial.warning)
  const [view, setView] = useState<View>('schedule')
  const [selectedStudentId, setSelectedStudentId] = useState<Selection>('all')
  const [studentQuery, setStudentQuery] = useState('')
  const [studentPageQuery, setStudentPageQuery] = useState('')
  const [scheduleDisplay, setScheduleDisplay] = useState<ScheduleDisplay>('timeline')
  const [selectedDay, setSelectedDay] = useState<Weekday>(getTodayWeekday())
  const [lessonModal, setLessonModal] = useState<LessonModalState>({ open: false })
  const [studentModal, setStudentModal] = useState<StudentModalState>({ open: false })
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

  const filteredStudents = appState.students.filter((student) => {
    const normalized = studentQuery.trim().toLocaleLowerCase('ko')
    return !normalized || `${student.name} ${student.school} ${student.grade}`.toLocaleLowerCase('ko').includes(normalized)
  })
  const pageStudents = appState.students.filter((student) => {
    const normalized = studentPageQuery.trim().toLocaleLowerCase('ko')
    return !normalized || `${student.name} ${student.school} ${student.grade}`.toLocaleLowerCase('ko').includes(normalized)
  })
  const selectedStudent = selectedStudentId === 'all' ? undefined : studentById(appState.students, selectedStudentId)
  const visibleLessons = selectedStudent ? lessonsForStudent(appState.lessons, selectedStudent.id) : appState.lessons
  const today = getTodayWeekday()
  const todayLessons = appState.lessons.filter((lesson) => lesson.weekday === today)
  const todayRideCount = todayLessons.reduce(
    (count, lesson) => count + lesson.participants.filter((participant) => participant.transport.arrivalRide || participant.transport.departureRide).length,
    0,
  )

  const openNewLesson = (presetWeekday?: Weekday, presetStudentId?: string) => {
    if (appState.students.length === 0) {
      setNotice('수업을 등록하려면 학생을 먼저 추가해 주세요.')
      setStudentModal({ open: true })
      return
    }
    setLessonModal({ open: true, presetWeekday, presetStudentId: presetStudentId ?? (selectedStudentId === 'all' ? undefined : selectedStudentId) })
  }

  const saveLesson = (lesson: Lesson) => {
    setAppState((current) => ({
      ...current,
      lessons: current.lessons.some((item) => item.id === lesson.id)
        ? current.lessons.map((item) => item.id === lesson.id ? lesson : item)
        : [...current.lessons, lesson],
    }))
    setLessonModal({ open: false })
    setNotice('수업을 시간표에 저장했습니다.')
  }

  const deleteLesson = (lessonId: string) => {
    if (!window.confirm('이 수업을 삭제할까요? 그룹 수업은 두 학생의 시간표에서 함께 삭제됩니다.')) return
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

  const deleteStudent = (studentId: string) => {
    const relatedCount = appState.lessons.filter((lesson) => lesson.participants.some((participant) => participant.studentId === studentId)).length
    if (!window.confirm(`학생을 삭제하면 연결된 수업 ${relatedCount}개도 함께 삭제됩니다. 계속할까요?`)) return
    setAppState((current) => ({
      ...current,
      students: current.students.filter((student) => student.id !== studentId),
      lessons: current.lessons.filter((lesson) => !lesson.participants.some((participant) => participant.studentId === studentId)),
    }))
    if (selectedStudentId === studentId) setSelectedStudentId('all')
    setStudentModal({ open: false })
    setNotice('학생과 연결된 수업을 삭제했습니다.')
  }

  const showStudentSchedule = (studentId: string) => {
    setSelectedStudentId(studentId)
    setView('schedule')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleReset = () => {
    if (!window.confirm('모든 변경 내용을 지우고 처음 예시 데이터로 되돌릴까요?')) return
    setAppState(resetState())
    setStorageEnabled(true)
    setStorageWarning(null)
    setSelectedStudentId('all')
    setNotice('예시 데이터로 초기화했습니다.')
  }

  const activeLesson = lessonModal.lessonId
    ? appState.lessons.find((lesson) => lesson.id === lessonModal.lessonId)
    : undefined
  const activeEditStudent = studentModal.studentId
    ? studentById(appState.students, studentModal.studentId)
    : undefined

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">온</span>
          <div><strong>온길</strong><small>Academy Planner</small></div>
        </div>
        <nav className="main-nav" aria-label="주 메뉴">
          <button type="button" className={view === 'schedule' ? 'active' : ''} onClick={() => setView('schedule')}>
            <LayoutDashboard size={18} /> 시간표
          </button>
          <button type="button" className={view === 'students' ? 'active' : ''} onClick={() => setView('students')}>
            <UsersRound size={18} /> 학생 관리 <span>{appState.students.length}</span>
          </button>
        </nav>
        <div className="sidebar-section-head">
          <span>학생별 시간표</span>
          <button type="button" onClick={() => setStudentModal({ open: true })} aria-label="학생 추가"><Plus size={16} /></button>
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
            <span><strong>전체 시간표</strong><small>{appState.lessons.length}개 수업</small></span>
            {selectedStudentId === 'all' && <Check size={15} />}
          </button>
          {filteredStudents.map((student) => {
            const count = lessonsForStudent(appState.lessons, student.id).length
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
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="mobile-brand"><span>온</span><strong>온길</strong></div>
          <div className="topbar-title">
            <span className="eyebrow">ACADEMY SCHEDULE</span>
            <h1>{view === 'schedule' ? (selectedStudent ? `${selectedStudent.name} 시간표` : '전체 시간표') : '학생 관리'}</h1>
            <p>{view === 'schedule' ? '매주 반복되는 수업과 차량 이용을 한눈에 확인하세요.' : '학생 정보와 개인별 수업 현황을 관리하세요.'}</p>
          </div>
          <button type="button" className="button primary top-add" onClick={() => view === 'schedule' ? openNewLesson() : setStudentModal({ open: true })}>
            {view === 'schedule' ? <CalendarDays size={17} /> : <UserPlus size={17} />}
            {view === 'schedule' ? '수업 추가' : '학생 추가'}
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

        {view === 'schedule' ? (
          <>
            <section className="stats-grid" aria-label="오늘의 요약">
              <StatCard icon={<UsersRound size={20} />} label="등록 학생" value={appState.students.length} hint="현재 관리 중" tone="mint" />
              <StatCard icon={<BookOpen size={20} />} label="오늘 수업" value={todayLessons.length} hint={`${WEEKDAYS.find((day) => day.value === today)?.long} 일정`} tone="blue" />
              <StatCard icon={<UsersRound size={20} />} label="그룹 수업" value={appState.lessons.filter((lesson) => lesson.kind === 'group').length} hint="주간 2인 수업" tone="purple" />
              <StatCard icon={<Bus size={20} />} label="오늘 차량" value={todayRideCount} hint="이용 학생" tone="amber" />
            </section>

            <section className="schedule-panel">
              <header className="panel-toolbar">
                <div>
                  <h2>{selectedStudent ? `${selectedStudent.name}의 주간 시간표` : '주간 수업 현황'}</h2>
                  <p>
                    {selectedStudent
                      ? `${selectedStudent.school} ${selectedStudent.grade} · 수업 ${visibleLessons.length}개`
                      : `전체 ${appState.students.length}명 · 수업 ${appState.lessons.length}개`}
                  </p>
                </div>
                <div className="toolbar-actions">
                  {selectedStudent && <RidePills transport={selectedStudent.defaultTransport} />}
                  <div className="view-switch" aria-label="보기 방식">
                    <button type="button" className={scheduleDisplay === 'timeline' ? 'active' : ''} onClick={() => setScheduleDisplay('timeline')} aria-label="시간표 보기"><CalendarDays size={16} /> 시간표</button>
                    <button type="button" className={scheduleDisplay === 'list' ? 'active' : ''} onClick={() => setScheduleDisplay('list')} aria-label="목록 보기"><List size={16} /> 목록</button>
                  </div>
                </div>
              </header>
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
                      <Timeline lessons={visibleLessons} students={appState.students} selectedStudentId={selectedStudentId} onOpenLesson={(lessonId) => setLessonModal({ open: true, lessonId })} onAddAt={(weekday) => openNewLesson(weekday)} />
                    ) : (
                      <LessonList lessons={visibleLessons} students={appState.students} selectedDay={selectedDay} onSelectDay={setSelectedDay} onOpenLesson={(lessonId) => setLessonModal({ open: true, lessonId })} />
                    )}
                  </div>
                  <LessonList mobileOnly lessons={visibleLessons} students={appState.students} selectedDay={selectedDay} onSelectDay={setSelectedDay} onOpenLesson={(lessonId) => setLessonModal({ open: true, lessonId })} />
                </>
              )}
            </section>
          </>
        ) : (
          <section className="students-page">
            <div className="students-toolbar">
              <label className="page-search"><Search size={17} /><input value={studentPageQuery} onChange={(event) => setStudentPageQuery(event.target.value)} placeholder="이름, 학교, 학년으로 검색" aria-label="학생 목록 검색" /></label>
              <span>{pageStudents.length}명의 학생</span>
            </div>
            {pageStudents.length === 0 ? (
              <div className="empty-state card"><span><UsersRound size={28} /></span><h3>학생이 없습니다</h3><p>새 학생을 등록해 시간표 관리를 시작하세요.</p><button type="button" className="button primary" onClick={() => setStudentModal({ open: true })}><Plus size={16} /> 학생 추가</button></div>
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
                        <button type="button" className="button text-button" onClick={() => showStudentSchedule(student.id)}>시간표 보기 <span>→</span></button>
                      </footer>
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        )}
      </main>

      <nav className="mobile-bottom-nav" aria-label="모바일 메뉴">
        <button type="button" className={view === 'schedule' ? 'active' : ''} onClick={() => setView('schedule')}><CalendarDays size={20} /><span>시간표</span></button>
        <button type="button" className="mobile-add" onClick={() => view === 'schedule' ? openNewLesson(selectedDay) : setStudentModal({ open: true })}><Plus size={23} /><span>추가</span></button>
        <button type="button" className={view === 'students' ? 'active' : ''} onClick={() => setView('students')}><UsersRound size={20} /><span>학생</span></button>
      </nav>

      {lessonModal.open && (
        <LessonModal
          key={lessonModal.lessonId ?? `new-${lessonModal.presetStudentId ?? ''}-${lessonModal.presetWeekday ?? ''}`}
          lesson={activeLesson}
          students={appState.students}
          lessons={appState.lessons}
          presetStudentId={lessonModal.presetStudentId}
          presetWeekday={lessonModal.presetWeekday}
          onClose={() => setLessonModal({ open: false })}
          onSave={saveLesson}
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
      <div className={`toast${notice ? ' show' : ''}`} role="status" aria-live="polite"><Check size={17} />{notice}</div>
    </div>
  )
}
