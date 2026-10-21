import { describe, expect, it } from 'vitest'
import {
  attendanceRecordId,
  attendanceSessionId,
  paymentRecordId,
  buildMonthlyAttendanceSummaries,
  dateForWeekdayInCurrentWeek,
  intervalsOverlap,
  getScheduleColumns,
  getKoreanInitials,
  getDefaultLessonColor,
  getDefaultTuition,
  getTuitionBreakdown,
  getLessonColor,
  getStudentGradeGroup,
  gradeGroupSortValue,
  groupLessonsBySeries,
  layoutLessons,
  lessonOccurrenceDates,
  lessonsForStudent,
  minutesToTime,
  matchesKoreanSearch,
  matchesDeletionConfirmation,
  timeToMinutes,
  validateLesson,
  validateState,
  DEFAULT_KOREAN_LESSON_COLORS,
  DEFAULT_LESSON_COLORS,
  DEFAULT_TUITION_AMOUNTS,
} from './domain'
import type { AppState, AttendanceRecord, Lesson, LessonDraft, Student } from './types'

const student = (id: string, name = id): Student => ({
  id,
  name,
  school: '',
  grade: '',
  subjects: ['math'],
  registrationDate: '2026-01-01',
  enrollmentStatus: 'active',
  guardianName: '',
  guardianPhone: '',
  color: '#146c63',
  defaultTransport: { arrivalRide: false, departureRide: false },
  notionUrl: '',
  feedbacks: [],
  learningRecords: [],
  createdAt: '2026-01-01T00:00:00.000Z',
})

const lesson = (
  id: string,
  studentIds: string[],
  startMinute: number,
  endMinute: number,
  weekday: Lesson['weekday'] = 1,
): Lesson => ({
  id,
  kind: studentIds.length >= 2 ? 'group' : 'individual',
  teacherId: 'teacher-1',
  weekday,
  startMinute,
  endMinute,
  label: '수학',
  note: '',
  participants: studentIds.map((studentId) => ({
    studentId,
    transport: { arrivalRide: studentId === 'a', departureRide: studentId === 'b' },
  })),
  createdAt: '2026-01-01T00:00:00.000Z',
})

const students = [student('a', '김민준'), student('b', '이서윤'), student('c', '박도윤')]

describe('시간 변환', () => {
  it.each([
    ['00:00', 0],
    ['09:05', 545],
    ['23:59', 1439],
  ])('%s를 분 단위로 왕복 변환한다', (value, minute) => {
    expect(timeToMinutes(value)).toBe(minute)
    expect(minutesToTime(minute)).toBe(value)
  })

  it('유효하지 않은 시간을 거절한다', () => {
    expect(timeToMinutes('24:00')).toBeNaN()
    expect(timeToMinutes('9:05')).toBeNaN()
    expect(timeToMinutes('hello')).toBeNaN()
  })
})

describe('표시 요일 설정', () => {
  it('주말을 숨기거나 한 칸으로 묶거나 분리한다', () => {
    expect(getScheduleColumns('hidden')).toHaveLength(5)
    expect(getScheduleColumns('combined').at(-1)?.weekdays).toEqual([6, 7])
    expect(getScheduleColumns('separate')).toHaveLength(7)
  })
})

describe('삭제 이름 확인', () => {
  it('대상 이름을 정확히 입력한 경우에만 삭제를 허용한다', () => {
    expect(matchesDeletionConfirmation('수학 · 심화', '수학 · 심화')).toBe(true)
    expect(matchesDeletionConfirmation('  김민준  ', '김민준')).toBe(true)
    expect(matchesDeletionConfirmation('수학', '수학 · 심화')).toBe(false)
    expect(matchesDeletionConfirmation('kim', 'Kim')).toBe(false)
    expect(matchesDeletionConfirmation('', '')).toBe(false)
  })
})

describe('수업 색상', () => {
  const elementary = { ...students[0]!, school: '청운초', grade: '5학년' }
  const middle = { ...students[1]!, school: '광희중', grade: '2학년' }
  const high = { ...students[2]!, school: '북고', grade: '3학년' }
  const levelStudents = [elementary, middle, high]

  it('학교급에 맞는 기본 색상을 적용한다', () => {
    expect(getDefaultLessonColor(['a'], levelStudents)).toBe(DEFAULT_LESSON_COLORS.elementary)
    expect(getDefaultLessonColor(['b'], levelStudents)).toBe(DEFAULT_LESSON_COLORS.middle)
    expect(getDefaultLessonColor(['c'], levelStudents)).toBe(DEFAULT_LESSON_COLORS.high)
  })

  it('수업명에 국어가 들어가면 같은 계열의 더 선명한 색을 적용한다', () => {
    expect(getDefaultLessonColor(['a'], levelStudents, '국어 · 독해')).toBe(DEFAULT_KOREAN_LESSON_COLORS.elementary)
    expect(getDefaultLessonColor(['b'], levelStudents, '중등 국어')).toBe(DEFAULT_KOREAN_LESSON_COLORS.middle)
    expect(getDefaultLessonColor(['c'], levelStudents, '고등 국어')).toBe(DEFAULT_KOREAN_LESSON_COLORS.high)
  })

  it('학교급이 섞인 그룹은 높은 학교급을 우선하고 직접 지정한 색은 유지한다', () => {
    expect(getDefaultLessonColor(['a', 'b'], levelStudents)).toBe(DEFAULT_LESSON_COLORS.middle)
    expect(getDefaultLessonColor(['a', 'c'], levelStudents)).toBe(DEFAULT_LESSON_COLORS.high)
    expect(getLessonColor({ ...lesson('custom', ['a'], 600, 660), color: '#123456' }, levelStudents)).toBe('#123456')
    expect(getLessonColor({
      ...lesson('auto', ['a'], 600, 660), label: '국어', color: '#123456', colorMode: 'auto',
    }, levelStudents)).toBe(DEFAULT_KOREAN_LESSON_COLORS.elementary)
  })
})

describe('기본 원비', () => {
  const elementary = { ...students[0]!, school: '청운초', grade: '5학년', subjects: [] }
  const middle = { ...students[1]!, school: '광희중', grade: '2학년', subjects: [] }
  const high = { ...students[2]!, school: '북고', grade: '3학년', subjects: [] }
  const tuitionLessons = [
    { ...lesson('elementary-math', ['a'], 600, 660), label: '초등 수학' },
    { ...lesson('middle-math', ['b'], 600, 660), label: '중등 수학' },
    { ...lesson('middle-korean', ['b'], 700, 760), label: '중등 국어' },
    { ...lesson('high-math', ['c'], 600, 660), label: '고등 수학' },
    { ...lesson('high-korean', ['c'], 700, 760), label: '고등 국어' },
  ]

  it('학교급과 등록 과목에 맞춰 기본 원비를 계산한다', () => {
    expect(getDefaultTuition(elementary, tuitionLessons)).toBe(DEFAULT_TUITION_AMOUNTS.elementaryMath)
    expect(getDefaultTuition(middle, tuitionLessons)).toBe(DEFAULT_TUITION_AMOUNTS.middleMath + DEFAULT_TUITION_AMOUNTS.middleKorean)
    expect(getDefaultTuition(high, tuitionLessons)).toBe(DEFAULT_TUITION_AMOUNTS.highMath + DEFAULT_TUITION_AMOUNTS.highKorean)
  })

  it('같은 과목 수업이 여러 개여도 기본 원비를 한 번만 적용한다', () => {
    expect(getDefaultTuition(elementary, [
      ...tuitionLessons,
      { ...lesson('elementary-math-2', ['a'], 700, 760), label: '수학 심화' },
    ])).toBe(DEFAULT_TUITION_AMOUNTS.elementaryMath)
  })

  it('수업명에서 과목을 찾지 못해도 학년에 맞는 수학 원비를 기본 적용한다', () => {
    expect(getDefaultTuition(elementary, [])).toBe(DEFAULT_TUITION_AMOUNTS.elementaryMath)
    expect(getDefaultTuition(middle, [{ ...lesson('middle-generic', ['b'], 600, 660), label: '중2 정규반' }])).toBe(DEFAULT_TUITION_AMOUNTS.middleMath)
    expect(getDefaultTuition(high, [])).toBe(DEFAULT_TUITION_AMOUNTS.highMath)
  })

  it('학생에게 저장한 수강과목을 수업명보다 우선 적용한다', () => {
    expect(getDefaultTuition({ ...middle, subjects: ['korean'] }, tuitionLessons)).toBe(DEFAULT_TUITION_AMOUNTS.middleKorean)
    expect(getDefaultTuition({ ...high, subjects: ['korean', 'math'] }, [])).toBe(DEFAULT_TUITION_AMOUNTS.highKorean + DEFAULT_TUITION_AMOUNTS.highMath)
  })

  it('원비 총액을 국어와 수학으로 나눠 보여줄 수 있다', () => {
    expect(getTuitionBreakdown({ ...middle, subjects: ['math', 'korean'] }, [])).toEqual([
      { subject: 'korean', label: '국어', amount: DEFAULT_TUITION_AMOUNTS.middleKorean },
      { subject: 'math', label: '수학', amount: DEFAULT_TUITION_AMOUNTS.middleMath },
    ])
  })
})

describe('출석 날짜와 월별 집계', () => {
  it('수업과 날짜로 실제 수업 회차 id를 만든다', () => {
    expect(attendanceSessionId('lesson-1', '2026-10-16')).toBe('attendance-session:lesson-1:2026-10-16')
  })

  it('현재 주에서 수업 요일에 맞는 날짜를 찾는다', () => {
    expect(dateForWeekdayInCurrentWeek(1, new Date(2026, 9, 16))).toBe('2026-10-12')
    expect(dateForWeekdayInCurrentWeek(5, new Date(2026, 9, 16))).toBe('2026-10-16')
  })

  it('한 달의 반복 수업 날짜를 계산한다', () => {
    expect(lessonOccurrenceDates(lesson('monday', ['a'], 600, 660, 1), '2026-10')).toEqual([
      '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26',
    ])
  })

  it('학생별 출결 수와 출석률을 집계한다', () => {
    const monday = lesson('monday', ['a'], 600, 660, 1)
    const records: AttendanceRecord[] = [
      {
        id: attendanceRecordId(monday.id, '2026-10-05', 'a'),
        lessonId: monday.id,
        lessonLabel: monday.label,
        teacherId: monday.teacherId,
        studentId: 'a',
        date: '2026-10-05',
        status: 'present',
        note: '',
        updatedAt: '2026-10-05T10:00:00.000Z',
      },
      {
        id: attendanceRecordId(monday.id, '2026-10-12', 'a'),
        lessonId: monday.id,
        lessonLabel: monday.label,
        teacherId: monday.teacherId,
        studentId: 'a',
        date: '2026-10-12',
        status: 'absent',
        note: '',
        updatedAt: '2026-10-12T10:00:00.000Z',
      },
    ]
    const summary = buildMonthlyAttendanceSummaries(
      [students[0]!], [monday], records, '2026-10', 'all', new Date(2026, 9, 31),
    )[0]
    expect(summary).toMatchObject({ scheduled: 4, present: 1, absent: 1, unchecked: 2, attendanceRate: 50 })
  })

  it('현재 달의 미래 수업은 미체크로 세지 않는다', () => {
    const monday = lesson('monday', ['a'], 600, 660, 1)
    const summary = buildMonthlyAttendanceSummaries(
      [students[0]!], [monday], [], '2026-10', 'all', new Date(2026, 9, 16),
    )[0]
    expect(summary).toMatchObject({ scheduled: 2, unchecked: 2 })
  })

  it('수업을 만든 날짜보다 앞선 반복 일정은 출석 대상에서 제외한다', () => {
    const monday = { ...lesson('monday', ['a'], 600, 660, 1), createdAt: '2026-10-10T09:00:00.000Z' }
    const summary = buildMonthlyAttendanceSummaries(
      [students[0]!], [monday], [], '2026-10', 'all', new Date(2026, 9, 31),
    )[0]
    expect(summary).toMatchObject({ scheduled: 3, unchecked: 3 })
  })
})

describe('결제 기록', () => {
  it('학생과 월로 결제 기록 id를 만든다', () => {
    expect(paymentRecordId('student-1', '2026-10')).toBe('payment:student-1:2026-10')
  })
})

describe('학생 학년 그룹', () => {
  it('학교급과 학년을 초5, 중1 형식으로 묶는다', () => {
    expect(getStudentGradeGroup({ school: '한빛초', grade: '5학년' })).toBe('초5')
    expect(getStudentGradeGroup({ school: '가온중', grade: '1학년' })).toBe('중1')
    expect(getStudentGradeGroup({ school: '새봄고', grade: '고2' })).toBe('고2')
    expect(getStudentGradeGroup({ school: '', grade: '' })).toBe('학년 미등록')
  })

  it('초등, 중등, 고등 순서로 정렬 값을 만든다', () => {
    expect(['고1', '초6', '중1'].sort((a, b) => gradeGroupSortValue(a) - gradeGroupSortValue(b))).toEqual(['초6', '중1', '고1'])
  })
})

describe('학생 이름 검색', () => {
  it('한글 이름의 초성을 만든다', () => {
    expect(getKoreanInitials('김민준')).toBe('ㄱㅁㅈ')
  })

  it('이름 일부와 초성으로 검색한다', () => {
    expect(matchesKoreanSearch('김민준', '김')).toBe(true)
    expect(matchesKoreanSearch('김민준', 'ㅁㅈ')).toBe(true)
    expect(matchesKoreanSearch('박도윤', 'ㄱ')).toBe(false)
  })
})

describe('수업 겹침', () => {
  it('완전 동일, 부분 겹침, 포함 관계를 감지한다', () => {
    expect(intervalsOverlap(600, 660, 600, 660)).toBe(true)
    expect(intervalsOverlap(600, 660, 630, 690)).toBe(true)
    expect(intervalsOverlap(600, 720, 630, 660)).toBe(true)
  })

  it('종료와 다음 시작이 같으면 겹치지 않는다', () => {
    expect(intervalsOverlap(600, 660, 660, 720)).toBe(false)
  })

  it('같은 학생의 겹치는 수업은 거절하고 다른 학생은 허용한다', () => {
    const existing = [lesson('existing', ['a'], 600, 660)]
    const sameStudent = lesson('draft', ['a'], 630, 690)
    const otherStudent = lesson('draft', ['b'], 630, 690)

    expect(validateLesson(sameStudent, students, existing).join(' ')).toContain('겹칩니다')
    expect(validateLesson(otherStudent, students, existing)).toEqual([])
  })

  it('같은 학생이어도 다른 요일 또는 인접 시간은 허용한다', () => {
    const existing = [lesson('existing', ['a'], 600, 660)]
    expect(validateLesson(lesson('next', ['a'], 660, 720), students, existing)).toEqual([])
    expect(validateLesson(lesson('tomorrow', ['a'], 630, 690, 2), students, existing)).toEqual([])
  })

  it('수업 시작과 종료는 10분 단위만 허용한다', () => {
    expect(validateLesson(lesson('ten', ['a'], 600, 650), students, [])).toEqual([])
    expect(validateLesson(lesson('odd', ['a'], 603, 653), students, []).join(' ')).toContain('10분 단위')
  })

  it('수정 중인 수업 자신을 충돌로 판단하지 않는다', () => {
    const existing = [lesson('editing', ['a'], 600, 660)]
    expect(validateLesson(existing[0] as LessonDraft, students, existing, 'editing')).toEqual([])
  })
})

describe('그룹 수업 무결성', () => {
  it('서로 다른 학생을 2명 이상 선택한 그룹을 허용한다', () => {
    expect(validateLesson(lesson('group', ['a', 'b'], 700, 760), students, [])).toEqual([])
    expect(validateLesson(lesson('large-group', ['a', 'b', 'c'], 800, 860), students, [])).toEqual([])
    expect(validateLesson({ ...lesson('bad', ['a'], 700, 760), kind: 'group' }, students, []).join(' ')).toContain('2명 이상')
    expect(validateLesson({ ...lesson('bad', ['a', 'a'], 700, 760), kind: 'group' }, students, []).join(' ')).toContain('두 번')
  })

  it('그룹 참가자 한 명이라도 기존 수업과 겹치면 거절한다', () => {
    const existing = [lesson('existing', ['b'], 700, 760)]
    expect(validateLesson(lesson('group', ['a', 'b'], 720, 780), students, existing).join(' ')).toContain('겹칩니다')
  })

  it('그룹 수업은 참여 학생의 개인 시간표에 같은 id로 한 번씩 나타난다', () => {
    const group = lesson('group', ['a', 'b'], 700, 760)
    expect(lessonsForStudent([group], 'a').map((item) => item.id)).toEqual(['group'])
    expect(lessonsForStudent([group], 'b').map((item) => item.id)).toEqual(['group'])
  })

  it('참가자별 차량 설정을 독립적으로 유지한다', () => {
    const group = lesson('group', ['a', 'b'], 700, 760)
    expect(group.participants[0]?.transport).toEqual({ arrivalRide: true, departureRide: false })
    expect(group.participants[1]?.transport).toEqual({ arrivalRide: false, departureRide: true })
  })

  it('같은 시리즈의 요일별 수업을 하나의 그룹으로 묶는다', () => {
    const monday = { ...lesson('monday', ['a', 'b'], 700, 760, 1), groupSeriesId: 'series-a' }
    const thursday = { ...lesson('thursday', ['a', 'b'], 800, 870, 4), groupSeriesId: 'series-a' }
    const legacy = lesson('legacy', ['b', 'c'], 900, 960, 2)
    const grouped = groupLessonsBySeries([thursday, legacy, monday])

    expect(grouped).toHaveLength(2)
    expect(grouped.find((series) => series.id === 'series-a')?.lessons.map((item) => item.id)).toEqual(['monday', 'thursday'])
    expect(grouped.find((series) => series.id === 'legacy')?.lessons).toEqual([legacy])
  })
})

describe('겹침 레이아웃', () => {
  it('정확히 겹치는 세 수업을 세 열로 배치한다', () => {
    const laidOut = layoutLessons([
      lesson('a', ['a'], 600, 660),
      lesson('b', ['b'], 600, 660),
      lesson('c', ['c'], 600, 660),
    ])
    expect(laidOut.map((item) => item.columnCount)).toEqual([3, 3, 3])
    expect(new Set(laidOut.map((item) => item.column))).toEqual(new Set([0, 1, 2]))
  })

  it('연쇄 겹침에서 끝난 열을 재사용한다', () => {
    const laidOut = layoutLessons([
      lesson('a', ['a'], 540, 600),
      lesson('b', ['b'], 570, 630),
      lesson('c', ['c'], 600, 660),
    ])
    expect(laidOut.every((item) => item.columnCount === 2)).toBe(true)
    expect(laidOut.find((item) => item.id === 'a')?.column).toBe(0)
    expect(laidOut.find((item) => item.id === 'c')?.column).toBe(0)
  })

  it('인접하거나 떨어진 수업은 전체 폭을 사용한다', () => {
    const laidOut = layoutLessons([
      lesson('a', ['a'], 540, 600),
      lesson('b', ['b'], 600, 660),
      lesson('c', ['c'], 720, 780),
    ])
    expect(laidOut.every((item) => item.column === 0 && item.columnCount === 1)).toBe(true)
  })
})

describe('저장 데이터 검증', () => {
  const validState: AppState = {
    schemaVersion: 1,
    students,
    lessons: [lesson('one', ['a'], 600, 660), lesson('group', ['b', 'c'], 700, 760)],
    attendanceRecords: [],
    attendanceSessions: [],
    paymentRecords: [],
    weeklyMemos: [],
    holidayClosures: [],
    makeupRecords: [],
    labDrafts: [],
    scheduleBackups: [],
  }

  it('정상 상태를 허용한다', () => {
    expect(validateState(validState)).toBe(true)
    expect(validateState({ ...validState, lessons: [lesson('large-group', ['a', 'b', 'c'], 700, 760)] })).toBe(true)
  })

  it('시간표 시안과 실제 시간표 백업을 검증한다', () => {
    const draftLesson = lesson('draft-lesson', ['virtual-a'], 780, 840)
    const labDrafts = [{
      id: 'draft-a',
      name: '겨울방학 A안',
      visibility: 'shared' as const,
      lessons: [draftLesson],
      virtualStudents: [{ id: 'virtual-a', name: '신규 A', school: '광희중', grade: '1학년', color: '#72b9e6' }],
      virtualMappings: {},
      createdAt: '2026-10-21T09:00:00.000Z',
      updatedAt: '2026-10-21T09:00:00.000Z',
    }]
    const scheduleBackups = [{ id: 'backup-a', label: '반영 전', lessons: validState.lessons, createdAt: '2026-10-21T09:00:00.000Z' }]
    expect(validateState({ ...validState, labDrafts, scheduleBackups })).toBe(true)
    expect(validateState({ ...validState, labDrafts: [{ ...labDrafts[0]!, visibility: 'public' }] })).toBe(false)
    expect(validateState({ ...validState, labDrafts: [{ ...labDrafts[0]!, lessons: [{ ...draftLesson, endMinute: 1500 }] }] })).toBe(false)
    expect(validateState({ ...validState, scheduleBackups: [scheduleBackups[0]!, scheduleBackups[0]!] })).toBe(false)
  })

  it('가족 그룹 연결을 허용하고 빈 가족 id는 거절한다', () => {
    expect(validateState({ ...validState, students: students.map((item, index) => index < 2 ? { ...item, familyId: 'family-one' } : item) })).toBe(true)
    expect(validateState({ ...validState, students: [{ ...students[0]!, familyId: '' }, ...students.slice(1)] })).toBe(false)
  })

  it('학생 수강과목 조합을 검증한다', () => {
    expect(validateState({ ...validState, students: [{ ...students[0]!, subjects: ['korean', 'math'] }, ...students.slice(1)] })).toBe(true)
    expect(validateState({ ...validState, students: [{ ...students[0]!, subjects: ['math', 'math'] }, ...students.slice(1)] })).toBe(false)
    expect(validateState({ ...validState, students: [{ ...students[0]!, subjects: ['english'] }, ...students.slice(1)] })).toBe(false)
  })

  it('연결이 끊긴 학생 참조와 중복 id를 거절한다', () => {
    expect(validateState({ ...validState, lessons: [lesson('orphan', ['missing'], 600, 660)] })).toBe(false)
    expect(validateState({ ...validState, students: [students[0], students[0]] })).toBe(false)
  })

  it('0분 수업과 잘못된 그룹 인원을 거절한다', () => {
    expect(validateState({ ...validState, lessons: [lesson('zero', ['a'], 600, 600)] })).toBe(false)
    expect(validateState({ ...validState, lessons: [{ ...lesson('bad', ['a'], 600, 660), kind: 'group' }] })).toBe(false)
  })

  it('세 선생님 시간표 id만 허용하고 기존 데이터의 누락은 마이그레이션용으로 허용한다', () => {
    const { teacherId: _teacherId, ...legacyLesson } = lesson('legacy', ['a'], 600, 660)
    expect(validateState({ ...validState, lessons: [legacyLesson] })).toBe(true)
    expect(validateState({ ...validState, lessons: [{ ...lesson('bad-teacher', ['a'], 600, 660), teacherId: 'teacher-4' }] })).toBe(false)
  })

  it('올바른 수업 색상만 허용한다', () => {
    expect(validateState({ ...validState, lessons: [{ ...lesson('color', ['a'], 600, 660), color: '#72b9e6' }] })).toBe(true)
    expect(validateState({ ...validState, lessons: [{ ...lesson('bad-color', ['a'], 600, 660), color: 'skyblue' }] })).toBe(false)
  })

  it('실제 종료 시간이 담긴 출석 회차를 검증한다', () => {
    const attendanceSessions = [{
      id: attendanceSessionId('one', '2026-10-16'),
      lessonId: 'one',
      date: '2026-10-16',
      actualEndMinute: 675,
      updatedAt: '2026-10-16T10:00:00.000Z',
    }]
    expect(validateState({ ...validState, attendanceSessions })).toBe(true)
    expect(validateState({ ...validState, attendanceSessions: [{ ...attendanceSessions[0], actualEndMinute: 1440 }] })).toBe(false)
  })

  it('학생별 월 결제 기록을 검증한다', () => {
    const paymentRecords = [{
      id: paymentRecordId('a', '2026-10'),
      studentId: 'a',
      month: '2026-10',
      status: 'paid' as const,
      amount: 320000,
      subjectAmounts: { math: 160000, korean: 160000 },
      dueDate: '2026-10-10',
      paymentParts: [{ id: 'payment:a:2026-10:card', method: 'card' as const, amount: 320000 }],
      familyPaymentId: 'family-payment-one',
      updatedAt: '2026-10-09T10:00:00.000Z',
    }]
    expect(validateState({ ...validState, paymentRecords })).toBe(true)
    expect(validateState({ ...validState, paymentRecords: [{ ...paymentRecords[0], status: 'unpaid', dueDate: '', paymentParts: [] }] })).toBe(true)
    expect(validateState({ ...validState, paymentRecords: [{ ...paymentRecords[0], dueDate: '' }] })).toBe(false)
    expect(validateState({ ...validState, paymentRecords: [{ ...paymentRecords[0], amount: -1 }] })).toBe(false)
    expect(validateState({ ...validState, paymentRecords: [{ ...paymentRecords[0], subjectAmounts: { math: 300000 } }] })).toBe(false)
    expect(validateState({
      ...validState,
      paymentRecords: [{
        ...paymentRecords[0],
        paymentParts: [
          paymentRecords[0]!.paymentParts[0]!,
          { id: 'payment:a:2026-10:card-2', method: 'card', amount: 10000 },
        ],
      }],
    })).toBe(false)
    expect(validateState({ ...validState, paymentRecords: [{ ...paymentRecords[0], familyPaymentId: '' }] })).toBe(false)
  })

  it('주간 메모, 공휴일 휴강과 보강 연결 기록을 검증한다', () => {
    const attendanceId = attendanceRecordId('one', '2026-10-19', 'a')
    const extended = {
      ...validState,
      weeklyMemos: [{ id: 'memo-one', weekStart: '2026-10-19', note: '시험 기간', updatedAt: '2026-10-19T01:00:00.000Z' }],
      holidayClosures: [{ id: 'holiday-one', date: '2026-10-20', name: '휴일', createdAt: '2026-10-19T01:00:00.000Z' }],
      makeupRecords: [{ id: 'makeup-one', studentId: 'a', lessonId: 'one', sourceAttendanceId: attendanceId, absenceDate: '2026-10-19', status: 'scheduled' as const, scheduledDate: '2026-10-24', note: '감기', updatedAt: '2026-10-19T01:00:00.000Z' }],
    }
    expect(validateState(extended)).toBe(true)
    expect(validateState({ ...extended, makeupRecords: [{ ...extended.makeupRecords[0], studentId: 'missing' }] })).toBe(false)
  })
})
