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
  from: TeacherId,
  to: TeacherId,
  transferId: string,
): { lessons: Lesson[] } | { error: string } {
  const source = lessons.filter((lesson) => lesson.teacherId === from && lesson.participants.some((member) => member.studentId === studentId))
  if (from === to || !students.some((student) => student.id === studentId) || source.length === 0) {
    return { error: '이동할 수업이 없습니다.' }
  }
  const sourceIds = new Set(source.map((lesson) => lesson.id))
  return {
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
