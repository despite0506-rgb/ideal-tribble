import { describe, expect, it } from 'vitest'
import { DEMO_STATE } from './demoData'
import { validateState } from './domain'
import { appendAutomaticBackup, lessonsFromBackup, moveStudentToTeacher } from './scheduleManagement'
import type { ScheduleBackup } from './types'

describe('student transfers', () => {
  it('assigns and moves a student with no scheduled lessons', () => {
    const studentId = 'student-harin'
    const lessons = DEMO_STATE.lessons.filter((lesson) => lesson.participants.every((member) => member.studentId !== studentId))
    const assigned = moveStudentToTeacher(lessons, DEMO_STATE.students, studentId, null, 'teacher-2', 'assignment')
    if (!('lessons' in assigned)) throw new Error(assigned.error)
    expect(assigned.lessons).toBe(lessons)
    expect(assigned.students.find(({ id }) => id === studentId)?.rosterTeacherId).toBe('teacher-2')
    const moved = moveStudentToTeacher(assigned.lessons, assigned.students, studentId, 'teacher-2', 'teacher-3', 'transfer')
    if (!('lessons' in moved)) throw new Error(moved.error)
    expect(moved.students.find(({ id }) => id === studentId)?.rosterTeacherId).toBe('teacher-3')
    expect(validateState(JSON.parse(JSON.stringify({ ...DEMO_STATE, ...moved })))).toBe(true)
  })

  it('moves only the selected student and keeps valid two-person group remnants', () => {
    const { students, lessons } = DEMO_STATE
    const result = moveStudentToTeacher(lessons, students, 'student-harin', 'teacher-1', 'teacher-2', 'transfer')
    if (!('lessons' in result)) throw new Error(result.error)
    expect(result.lessons.find(({ id }) => id === 'lesson-tue-harin')?.teacherId).toBe('teacher-2')
    expect(result.lessons.find(({ id }) => id === 'lesson-tue-group')).toMatchObject({
      kind: 'individual', teacherId: 'teacher-1', participants: [{ studentId: 'student-jiho' }],
    })
    expect(result.lessons.find(({ id }) => id === 'transfer-lesson-tue-group')).toMatchObject({
      kind: 'individual', teacherId: 'teacher-2', weekday: 2, startMinute: 1020, participants: [{ studentId: 'student-harin' }],
    })
    expect(validateState({ ...DEMO_STATE, lessons: result.lessons })).toBe(true)
  })
})

describe('term backups', () => {
  const saved: ScheduleBackup = { id: 'semester', kind: 'term', label: '학기 시간표', createdAt: '2026-11-25', lessons: DEMO_STATE.lessons }

  it('retains a term backup after repeated automatic backups', () => {
    let backups = [saved]
    for (let index = 0; index < 7; index += 1) {
      backups = appendAutomaticBackup(backups, { ...saved, id: String(index), kind: undefined })
    }
    expect(backups.map(({ id }) => id)).toEqual(['semester', '2', '3', '4', '5', '6'])
    expect(validateState(JSON.parse(JSON.stringify({ ...DEMO_STATE, scheduleBackups: backups })))).toBe(true)
  })

  it('restores a valid schedule after a student has been deleted', () => {
    const students = DEMO_STATE.students.filter(({ id }) => id !== 'student-harin')
    const lessons = lessonsFromBackup(saved, students)
    expect(lessons.some(({ id }) => id === 'lesson-tue-harin')).toBe(false)
    expect(lessons.find(({ id }) => id === 'lesson-tue-group')?.kind).toBe('individual')
    expect(validateState({ ...DEMO_STATE, students, lessons })).toBe(true)
    expect(saved.lessons.find(({ id }) => id === 'lesson-tue-group')?.participants).toHaveLength(2)
  })
})
