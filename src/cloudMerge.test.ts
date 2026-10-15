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
