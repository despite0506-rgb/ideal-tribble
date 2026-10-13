import { describe, expect, it } from 'vitest'
import {
  intervalsOverlap,
  getScheduleColumns,
  layoutLessons,
  lessonsForStudent,
  minutesToTime,
  timeToMinutes,
  validateLesson,
  validateState,
} from './domain'
import type { AppState, Lesson, LessonDraft, Student } from './types'

const student = (id: string, name = id): Student => ({
  id,
  name,
  school: '',
  grade: '',
  color: '#146c63',
  defaultTransport: { arrivalRide: false, departureRide: false },
  notionUrl: '',
  feedbacks: [],
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
  }

  it('정상 상태를 허용한다', () => {
    expect(validateState(validState)).toBe(true)
    expect(validateState({ ...validState, lessons: [lesson('large-group', ['a', 'b', 'c'], 700, 760)] })).toBe(true)
  })

  it('연결이 끊긴 학생 참조와 중복 id를 거절한다', () => {
    expect(validateState({ ...validState, lessons: [lesson('orphan', ['missing'], 600, 660)] })).toBe(false)
    expect(validateState({ ...validState, students: [students[0], students[0]] })).toBe(false)
  })

  it('0분 수업과 잘못된 그룹 인원을 거절한다', () => {
    expect(validateState({ ...validState, lessons: [lesson('zero', ['a'], 600, 600)] })).toBe(false)
    expect(validateState({ ...validState, lessons: [{ ...lesson('bad', ['a'], 600, 660), kind: 'group' }] })).toBe(false)
  })
})
