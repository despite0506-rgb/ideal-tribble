import { getRosterTeachers } from './domain'
import type { Lesson, ScheduleBackup, Student, TeacherId } from './types'

function withParticipants(lesson: Lesson, participants: Lesson['participants']): Lesson {
  if (lesson.kind === 'group' && participants.length === 1) {
    return { ...lesson, kind: 'individual', groupSeriesId: undefined, participants }
  }
  return { ...lesson, participants }
}

export function moveStudentToTeacher(
  lessons: Lesson[],
  students: Student[],
  studentId: string,
  from: TeacherId | null,
  to: TeacherId,
  transferId: string,
): { lessons: Lesson[]; students: Student[] } | { error: string } {
  const student = students.find((item) => item.id === studentId)
  if (!student || from === to) return { error: '학생을 옮길 반을 확인해 주세요.' }
  const studentLessons = lessons.filter((lesson) => lesson.participants.some((member) => member.studentId === studentId))
  const source = studentLessons.filter((lesson) => lesson.teacherId === from)
  const rosterTeachers = { ...getRosterTeachers(student) }
  const movesAssignment = from === null
    ? studentLessons.length === 0 && !Object.values(rosterTeachers).some(Boolean)
    : rosterTeachers[from] === true
  if (source.length === 0 && !movesAssignment) return { error: '현재 반 배정이 변경되었습니다. 명단을 확인해 주세요.' }
  if (movesAssignment) {
    if (from !== null) delete rosterTeachers[from]
    rosterTeachers[to] = true
  }
  const updatedStudents = movesAssignment
    ? students.map((item) => item.id === studentId ? { ...item, rosterTeacherId: undefined, rosterTeachers } : item)
    : students
  if (source.length === 0) return { lessons, students: updatedStudents }
  const sourceIds = new Set(source.map((lesson) => lesson.id))
  return {
    students: updatedStudents,
    lessons: lessons.flatMap((lesson) => {
      if (!sourceIds.has(lesson.id)) return [lesson]
      if (lesson.kind === 'individual') return [{ ...lesson, teacherId: to }]
      const remaining = lesson.participants.filter((member) => member.studentId !== studentId)
      const moved = withParticipants(lesson, lesson.participants.filter((member) => member.studentId === studentId))
      return [
        withParticipants(lesson, remaining),
        { ...moved, id: `${transferId}-${lesson.id}`, teacherId: to },
      ]
    }),
  }
}

export function lessonsFromBackup(backup: ScheduleBackup, students: Student[]): Lesson[] {
  const studentIds = new Set(students.map((student) => student.id))
  return structuredClone(backup.lessons).flatMap((lesson) => {
    const participants = lesson.participants.filter(({ studentId }) => studentIds.has(studentId))
    return participants.length ? [withParticipants(lesson, participants)] : []
  })
}

export function appendAutomaticBackup(backups: ScheduleBackup[], backup: ScheduleBackup): ScheduleBackup[] {
  const retainedAutomaticIds = new Set(backups.filter((item) => item.kind !== 'term').slice(-4).map((item) => item.id))
  return [...backups.filter((item) => item.kind === 'term' || retainedAutomaticIds.has(item.id)), backup]
}
