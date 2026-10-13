import type { AppState, Lesson, Participant, Student, Transport, Weekday } from './types'

const createdAt = '2026-10-13T00:00:00.000Z'

const student = (
  id: string,
  name: string,
  school: string,
  grade: string,
  color: string,
  defaultTransport: Transport,
): Student => ({ id, name, school, grade, color, defaultTransport, createdAt })

const participant = (
  studentId: string,
  arrivalRide: boolean,
  departureRide: boolean,
): Participant => ({ studentId, transport: { arrivalRide, departureRide } })

const lesson = (
  id: string,
  kind: Lesson['kind'],
  weekday: Weekday,
  startMinute: number,
  endMinute: number,
  label: string,
  participants: Participant[],
  note = '',
): Lesson => ({ id, kind, weekday, startMinute, endMinute, label, participants, note, createdAt })

export const DEMO_STATE: AppState = {
  schemaVersion: 1,
  students: [
    student('student-minjun', '김민준', '한빛초', '5학년', '#2f6f68', { arrivalRide: true, departureRide: false }),
    student('student-seoyun', '이서윤', '새봄초', '6학년', '#5d6fb5', { arrivalRide: false, departureRide: true }),
    student('student-doyun', '박도윤', '가온중', '1학년', '#b56b50', { arrivalRide: true, departureRide: true }),
    student('student-harin', '최하린', '나래초', '4학년', '#8070ad', { arrivalRide: false, departureRide: false }),
    student('student-jiho', '정지호', '한빛초', '6학년', '#5f8754', { arrivalRide: true, departureRide: true }),
  ],
  lessons: [
    lesson('lesson-mon-minjun', 'individual', 1, 14 * 60 + 3, 15 * 60, '수학 · 개념', [participant('student-minjun', true, false)]),
    lesson('lesson-mon-seoyun', 'individual', 1, 14 * 60 + 20, 15 * 60 + 10, '영어 · 독해', [participant('student-seoyun', false, true)]),
    lesson('lesson-mon-group', 'group', 1, 16 * 60 + 7, 17 * 60 + 2, '수학 · 심화 그룹', [
      participant('student-minjun', true, false),
      participant('student-seoyun', false, true),
    ], '이번 주 오답 노트 확인'),
    lesson('lesson-tue-doyun', 'individual', 2, 15 * 60 + 10, 16 * 60 + 5, '과학 · 내신', [participant('student-doyun', true, true)]),
    lesson('lesson-tue-harin', 'individual', 2, 15 * 60 + 25, 16 * 60 + 15, '수학 · 연산', [participant('student-harin', false, false)]),
    lesson('lesson-tue-group', 'group', 2, 17 * 60 + 3, 17 * 60 + 48, '영어 · 회화 그룹', [
      participant('student-harin', false, false),
      participant('student-jiho', true, true),
    ]),
    lesson('lesson-wed-minjun', 'individual', 3, 14 * 60 + 30, 15 * 60 + 20, '영어 · 문법', [participant('student-minjun', true, false)]),
    lesson('lesson-thu-seoyun', 'individual', 4, 16 * 60, 17 * 60, '수학 · 심화', [participant('student-seoyun', false, true)]),
    lesson('lesson-fri-doyun', 'individual', 5, 18 * 60 + 10, 19 * 60 + 5, '수학 · 내신', [participant('student-doyun', true, true)]),
    lesson('lesson-sat-group', 'group', 6, 11 * 60 + 5, 12 * 60, '주말 · 문제풀이', [
      participant('student-doyun', true, true),
      participant('student-jiho', true, false),
    ]),
  ],
}
