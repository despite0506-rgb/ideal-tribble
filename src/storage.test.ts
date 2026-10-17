import { describe, expect, it } from 'vitest'
import { DEMO_STATE } from './demoData'
import { DEFAULT_SCHEDULE_SETTINGS, parseAppState, parseScheduleSettings } from './storage'

describe('저장 자료 호환성', () => {
  it('출석 기능 추가 전 자료에는 빈 출석 기록을 채운다', () => {
    const {
      attendanceRecords: _attendanceRecords,
      attendanceSessions: _attendanceSessions,
      paymentRecords: _paymentRecords,
      ...legacyState
    } = structuredClone(DEMO_STATE)
    expect(parseAppState(legacyState)).toMatchObject({ attendanceRecords: [], attendanceSessions: [], paymentRecords: [] })
  })

  it('기존 수업은 자동 색상으로, 직접 지정한 색은 사용자 색상으로 구분한다', () => {
    const legacyState = structuredClone(DEMO_STATE)
    const customState = structuredClone(DEMO_STATE)
    customState.lessons[0]!.color = '#123456'
    expect(parseAppState(legacyState)?.lessons.every((lesson) => lesson.colorMode === 'auto')).toBe(true)
    expect(parseAppState(customState)?.lessons[0]?.colorMode).toBe('custom')
  })

  it('이전 결제 기록의 실제 결제일은 제거하고 필요한 항목만 유지한다', () => {
    const studentId = DEMO_STATE.students[0]!.id
    const legacyState = {
      ...structuredClone(DEMO_STATE),
      paymentRecords: [{
        id: `payment:${studentId}:2026-10`,
        studentId,
        month: '2026-10',
        status: 'paid',
        amount: 300000,
        dueDate: '2026-10-10',
        paidDate: '2026-10-09',
        updatedAt: '2026-10-09T10:00:00.000Z',
      }],
    }
    expect(parseAppState(legacyState)?.paymentRecords[0]).not.toHaveProperty('paidDate')
  })
})

describe('시간표 설정', () => {
  it('기존 저장 자료에는 차량 기능을 기본으로 유지한다', () => {
    const { transportEnabled: _transportEnabled, ...legacySettings } = DEFAULT_SCHEDULE_SETTINGS
    expect(parseScheduleSettings(legacySettings)?.transportEnabled).toBe(true)
  })

  it('차량 기능 사용 여부를 보존한다', () => {
    expect(parseScheduleSettings({ ...DEFAULT_SCHEDULE_SETTINGS, transportEnabled: false })?.transportEnabled).toBe(false)
  })

  it('기존 설정에는 학생 아이콘과 이름을 기본으로 표시한다', () => {
    const {
      showStudentAvatars: _showStudentAvatars,
      showStudentNames: _showStudentNames,
      ...legacySettings
    } = DEFAULT_SCHEDULE_SETTINGS
    expect(parseScheduleSettings(legacySettings)).toMatchObject({ showStudentAvatars: true, showStudentNames: true })
  })

  it('학생 아이콘과 이름 표시 여부를 각각 보존한다', () => {
    expect(parseScheduleSettings({
      ...DEFAULT_SCHEDULE_SETTINGS,
      showStudentAvatars: false,
      showStudentNames: false,
    })).toMatchObject({ showStudentAvatars: false, showStudentNames: false })
  })
})
