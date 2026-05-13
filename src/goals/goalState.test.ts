import { describe, expect, test } from 'bun:test'
import {
  buildGoalContinuationPrompt,
  clearThreadGoal,
  formatGoalStatus,
  getThreadGoal,
  markThreadGoalComplete,
  parseGoalCommand,
  setThreadGoal,
  updateThreadGoalStatus,
} from './goalState.js'

describe('goalState', () => {
  test('parses token budget before the goal objective', () => {
    const parsed = parseGoalCommand(
      '--tokens 250K migrate auth to the new API until tests pass',
    )

    expect(parsed).toEqual({
      type: 'set',
      objective: 'migrate auth to the new API until tests pass',
      tokenBudget: 250_000,
    })
  })

  test('stores and formats the current thread goal', () => {
    const goal = setThreadGoal('thread-a', {
      objective: 'all provider tests pass',
      tokenBudget: 10_000,
      now: 1_000,
    })

    expect(goal.status).toBe('active')
    expect(getThreadGoal('thread-a')?.objective).toBe('all provider tests pass')
    expect(formatGoalStatus(goal, 61_000)).toContain('Goal: active')
    expect(formatGoalStatus(goal, 61_000)).toContain('Budget: 0 / 10,000 tokens')
    expect(formatGoalStatus(goal, 61_000)).toContain('Elapsed: 1m')
  })

  test('pause, resume, complete, and clear are scoped to the thread', () => {
    setThreadGoal('thread-a', { objective: 'ship feature', now: 1_000 })
    setThreadGoal('thread-b', { objective: 'different work', now: 1_000 })

    expect(updateThreadGoalStatus('thread-a', 'paused', 2_000)?.status).toBe(
      'paused',
    )
    expect(updateThreadGoalStatus('thread-a', 'active', 3_000)?.status).toBe(
      'active',
    )
    expect(
      markThreadGoalComplete('thread-a', {
        reason: 'Done according to the transcript.',
        now: 4_000,
      })?.status,
    ).toBe('complete')
    expect(formatGoalStatus(getThreadGoal('thread-a'), 4_000)).toContain(
      'Latest reason: Done according to the transcript.',
    )
    expect(getThreadGoal('thread-b')?.status).toBe('active')
    expect(clearThreadGoal('thread-a')).toBe(true)
    expect(getThreadGoal('thread-a')).toBeNull()
  })

  test('builds a native-style continuation prompt', () => {
    const goal = setThreadGoal('thread-c', {
      objective: 'PR is ready and all tests pass',
      now: 1_000,
    })

    expect(
      buildGoalContinuationPrompt(goal, 'Tests have not been run yet.'),
    ).toContain('Continue working toward the active /goal')
    expect(
      buildGoalContinuationPrompt(goal, 'Tests have not been run yet.'),
    ).toContain('<objective>PR is ready and all tests pass</objective>')
    expect(
      buildGoalContinuationPrompt(goal, 'Tests have not been run yet.'),
    ).toContain('Tests have not been run yet.')
  })
})
