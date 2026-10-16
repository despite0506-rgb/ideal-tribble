import { describe, expect, it } from 'vitest'
import { DEFAULT_SCHEDULE_SETTINGS, parseScheduleSettings } from './storage'

describe('시간표 설정', () => {
  it('기존 저장 자료에는 차량 기능을 기본으로 유지한다', () => {
    const { transportEnabled: _transportEnabled, ...legacySettings } = DEFAULT_SCHEDULE_SETTINGS
    expect(parseScheduleSettings(legacySettings)?.transportEnabled).toBe(true)
  })

  it('차량 기능 사용 여부를 보존한다', () => {
    expect(parseScheduleSettings({ ...DEFAULT_SCHEDULE_SETTINGS, transportEnabled: false })?.transportEnabled).toBe(false)
  })
})
