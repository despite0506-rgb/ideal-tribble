import { expect, it } from 'vitest'
import { applyWeeklyNotesEdits, fillFromPreviousWeek, todosForWeek, weeklyNotes } from './weeklyRecords'
import { parseAppState } from './storage'
import { DEMO_STATE } from './demoData'

it('fills empty fields and missing student notes from the previous week without duplicates', () => {
  const current = { ...weeklyNotes(), studentNotes: [{ studentId: 'a', note: 'Current' }] }
  const previous = {
    schoolProgress: 'Unit 2',
    note: 'Legacy note',
    studentNotes: [{ studentId: 'a', note: 'Old' }, { studentId: 'b', note: 'Follow up' }],
  }
  const filled = fillFromPreviousWeek(current, previous)
  expect(filled).toEqual({ ...previous, studentNotes: [current.studentNotes[0], previous.studentNotes[1]] })
  expect(fillFromPreviousWeek(filled, previous)).toEqual(filled)
})

it('saves the edited student notes without overwriting unrelated incoming changes', () => {
  const base = { ...weeklyNotes(), studentNotes: [{ studentId: 'a', note: 'Remove me' }] }
  const latest = { ...base, schoolProgress: 'New progress', studentNotes: [...base.studentNotes, { studentId: 'b', note: 'Incoming' }] }
  const draft = { ...base, studentNotes: [{ studentId: 'c', note: ' Add me ' }] }
  expect(applyWeeklyNotesEdits(latest, base, draft)).toEqual({
    ...latest,
    studentNotes: [{ studentId: 'b', note: 'Incoming' }, { studentId: 'c', note: 'Add me' }],
  })
})

it('carries open todos through skipped weeks and preserves the week of completion', () => {
  const open = { id: 'open', weekStart: '2026-10-19', text: 'Follow up' }
  const done = { ...open, id: 'done', completedWeek: '2026-11-02' }
  const future = { ...open, id: 'future', weekStart: '2026-11-16' }
  const todos = [open, done, future]
  expect(todosForWeek(todos, '2026-10-12')).toEqual([])
  expect(todosForWeek(todos, '2026-10-26')).toEqual([open, done])
  expect(todosForWeek(todos, '2026-11-02')).toEqual([open, done])
  expect(todosForWeek(todos, '2026-11-09')).toEqual([open])
  expect(todosForWeek([open], '2026-11-23')).toEqual([open])
})

it('preserves legacy weekly memos and round trips persisted todos', () => {
  const legacy = { id: 'memo', weekStart: '2026-10-19', note: 'Legacy note', updatedAt: '2026-10-19' }
  const todo = { id: 'todo', weekStart: '2026-10-19', text: 'Follow up', completedWeek: '2026-10-26' }
  const parsed = parseAppState({ ...DEMO_STATE, weeklyMemos: [legacy], weeklyTodos: [todo] })
  expect(parsed?.weeklyMemos).toEqual([{ ...legacy, schoolProgress: '', studentNotes: [] }])
  expect(parsed?.weeklyTodos).toEqual([todo])
  expect(parseAppState({ ...DEMO_STATE, weeklyTodos: [{ ...todo, completedWeek: '2026-10-12' }] })).toBeNull()
})
