import type { WeeklyMemo, WeeklyStudentNote, WeeklyTodo } from './types'

export type WeeklyNotes = {
  schoolProgress: string
  studentNotes: WeeklyStudentNote[]
  note: string
}

export function weeklyNotes(memo?: WeeklyMemo): WeeklyNotes {
  return {
    schoolProgress: memo?.schoolProgress ?? '',
    studentNotes: memo?.studentNotes ?? [],
    note: memo?.note ?? '',
  }
}

export function fillFromPreviousWeek(current: WeeklyNotes, previous: WeeklyNotes): WeeklyNotes {
  const existingStudents = new Set(current.studentNotes.map(({ studentId }) => studentId))
  return {
    schoolProgress: current.schoolProgress.trim() ? current.schoolProgress : previous.schoolProgress,
    studentNotes: [...current.studentNotes, ...previous.studentNotes.filter(({ studentId }) => !existingStudents.has(studentId))],
    note: current.note.trim() ? current.note : previous.note,
  }
}

export function todosForWeek(todos: WeeklyTodo[], weekStart: string): WeeklyTodo[] {
  return todos.filter((todo) => todo.weekStart <= weekStart && (!todo.completedWeek || todo.completedWeek >= weekStart))
}

export function applyWeeklyNotesEdits(latest: WeeklyNotes, base: WeeklyNotes, draft: WeeklyNotes): WeeklyNotes {
  const studentNotes = new Map(latest.studentNotes.map((entry) => [entry.studentId, entry]))
  const original = new Map(base.studentNotes.map((entry) => [entry.studentId, entry.note]))
  const edited = new Map(draft.studentNotes.map((entry) => [entry.studentId, entry.note.trim()]))
  for (const studentId of new Set([...original.keys(), ...edited.keys()])) {
    const note = edited.get(studentId) ?? ''
    if (note === (original.get(studentId) ?? '')) continue
    if (note) studentNotes.set(studentId, { studentId, note })
    else studentNotes.delete(studentId)
  }
  return {
    schoolProgress: draft.schoolProgress.trim() === base.schoolProgress ? latest.schoolProgress : draft.schoolProgress.trim(),
    note: draft.note.trim() === base.note ? latest.note : draft.note.trim(),
    studentNotes: [...studentNotes.values()],
  }
}
