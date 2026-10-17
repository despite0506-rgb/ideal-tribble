import { describe, expect, it } from 'vitest'
import { mergeCloudPayload } from './cloudMerge'
import { DEMO_STATE } from './demoData'
import { DEFAULT_SCHEDULE_SETTINGS } from './storage'
import type { CloudPayload } from './cloud'

const payload = (): CloudPayload => ({
  cloudVersion: 1,
  appState: structuredClone(DEMO_STATE),
  scheduleSettings: structuredClone(DEFAULT_SCHEDULE_SETTINGS),
})

describe('mergeCloudPayload', () => {
  it('keeps lessons added concurrently on different devices', () => {
    const base = payload()
    const local = structuredClone(base)
    const remote = structuredClone(base)
    const lesson = base.appState.lessons[0]!
    local.appState.lessons.push({ ...lesson, id: 'local-lesson', teacherId: 'teacher-2' })
    remote.appState.lessons.push({ ...lesson, id: 'remote-lesson', teacherId: 'teacher-3' })

    const merged = mergeCloudPayload(base, local, remote)

    expect(merged.appState.lessons.some((item) => item.id === 'local-lesson')).toBe(true)
    expect(merged.appState.lessons.some((item) => item.id === 'remote-lesson')).toBe(true)
  })

  it('keeps attendance checked concurrently on different devices', () => {
    const base = payload()
    const local = structuredClone(base)
    const remote = structuredClone(base)
    const lesson = base.appState.lessons[0]!
    const firstStudentId = lesson.participants[0]!.studentId
    const secondStudentId = base.appState.students.find((student) => student.id !== firstStudentId)!.id
    local.appState.attendanceRecords.push({
      id: `attendance:${lesson.id}:2026-10-16:${firstStudentId}`,
      lessonId: lesson.id,
      lessonLabel: lesson.label,
      teacherId: lesson.teacherId,
      studentId: firstStudentId,
      date: '2026-10-16',
      status: 'present',
      note: '',
      updatedAt: '2026-10-16T10:00:00.000Z',
    })
    remote.appState.attendanceRecords.push({
      id: `attendance:${lesson.id}:2026-10-17:${secondStudentId}`,
      lessonId: lesson.id,
      lessonLabel: lesson.label,
      teacherId: lesson.teacherId,
      studentId: secondStudentId,
      date: '2026-10-17',
      status: 'late',
      note: '10분 지각',
      updatedAt: '2026-10-17T10:00:00.000Z',
    })

    const merged = mergeCloudPayload(base, local, remote)

    expect(merged.appState.attendanceRecords).toHaveLength(2)
  })

  it('keeps monthly payments saved concurrently for different students', () => {
    const base = payload()
    const local = structuredClone(base)
    const remote = structuredClone(base)
    const firstStudent = base.appState.students[0]!
    const secondStudent = base.appState.students[1]!
    local.appState.paymentRecords.push({
      id: `payment:${firstStudent.id}:2026-10`,
      studentId: firstStudent.id,
      month: '2026-10',
      status: 'paid',
      amount: 300000,
      dueDate: '2026-10-10',
      paidDate: '2026-10-09',
      updatedAt: '2026-10-09T10:00:00.000Z',
    })
    remote.appState.paymentRecords.push({
      id: `payment:${secondStudent.id}:2026-10`,
      studentId: secondStudent.id,
      month: '2026-10',
      status: 'unpaid',
      amount: 280000,
      dueDate: '2026-10-12',
      paidDate: '',
      updatedAt: '2026-10-10T10:00:00.000Z',
    })

    const merged = mergeCloudPayload(base, local, remote)

    expect(merged.appState.paymentRecords).toHaveLength(2)
  })

  it('combines independent changes to the same student', () => {
    const base = payload()
    const local = structuredClone(base)
    const remote = structuredClone(base)
    local.appState.students[0]!.name = '로컬 이름'
    remote.appState.students[0]!.school = '원격 학교'

    const merged = mergeCloudPayload(base, local, remote)

    expect(merged.appState.students[0]!.name).toBe('로컬 이름')
    expect(merged.appState.students[0]!.school).toBe('원격 학교')
  })

  it('preserves a deletion when the other device left the item unchanged', () => {
    const base = payload()
    const local = structuredClone(base)
    const remote = structuredClone(base)
    const deletedId = base.appState.lessons[0]!.id
    local.appState.lessons = local.appState.lessons.filter((lesson) => lesson.id !== deletedId)

    const merged = mergeCloudPayload(base, local, remote)

    expect(merged.appState.lessons.some((lesson) => lesson.id === deletedId)).toBe(false)
  })

  it('combines cloud settings changed on separate devices', () => {
    const base = payload()
    const local = structuredClone(base)
    const remote = structuredClone(base)
    local.scheduleSettings.teacherNames[1] = '김 선생님'
    remote.scheduleSettings.academyName = '새 학원 이름'

    const merged = mergeCloudPayload(base, local, remote)

    expect(merged.scheduleSettings.teacherNames[1]).toBe('김 선생님')
    expect(merged.scheduleSettings.academyName).toBe('새 학원 이름')
  })
})
