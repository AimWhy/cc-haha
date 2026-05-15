import { describe, expect, it } from 'bun:test'
import { translateCliMessage } from '../ws/handler.js'

describe('WebSocket memory events', () => {
  it('forwards CLI memory_saved system messages to the desktop client', () => {
    const messages = translateCliMessage(
      {
        type: 'system',
        subtype: 'memory_saved',
        writtenPaths: [
          '/Users/test/.claude/projects/example/memory/preferences.md',
          '/Users/test/.claude/projects/example/memory/team/MEMORY.md',
        ],
        teamCount: 1,
        verb: 'Saved',
      },
      'session-1',
    )

    expect(messages).toEqual([
      {
        type: 'system_notification',
        subtype: 'memory_saved',
        message: undefined,
        data: {
          writtenPaths: [
            '/Users/test/.claude/projects/example/memory/preferences.md',
            '/Users/test/.claude/projects/example/memory/team/MEMORY.md',
          ],
          teamCount: 1,
          verb: 'Saved',
        },
      },
    ])
  })
})

describe('WebSocket goal command events', () => {
  const goalStatusOutput = [
    'Goal created.',
    'Goal: active',
    'Objective: ship the smoke test',
    'Budget: 0 / 2,000 tokens',
    'Elapsed: 0s',
    'Continuations: 0',
  ].join('\n')

  const runGoalCommand = (sessionId: string, args: string, output: string, type: 'system' | 'user' = 'system') => {
    expect(translateCliMessage({
      type: 'system',
      subtype: 'local_command',
      content: [
        { text: '<command-name>/goal</command-name>' },
        { text: `<command-args>${args}</command-args>` },
      ],
    }, sessionId)).toEqual([])

    if (type === 'user') {
      return translateCliMessage({
        type: 'user',
        message: {
          content: [{
            type: 'text',
            text: `<local-command-stdout>${output}</local-command-stdout>`,
          }],
        },
      }, sessionId)
    }

    return translateCliMessage({
      type: 'system',
      subtype: 'local_command_output',
      content: `<local-command-stdout>${output}</local-command-stdout>`,
    }, sessionId)
  }

  it('turns confirmed /goal local command output into a desktop goal event', () => {
    const sessionId = `goal-event-${crypto.randomUUID()}`

    expect(translateCliMessage({
      type: 'system',
      subtype: 'local_command',
      content: '<command-name>/goal</command-name>\n<command-args>--tokens 2k ship the smoke test</command-args>',
    }, sessionId)).toEqual([])

    expect(translateCliMessage({
      type: 'system',
      subtype: 'local_command',
      content: [
        '<local-command-stdout>',
        goalStatusOutput,
        '</local-command-stdout>',
      ].join('\n'),
    }, sessionId)).toEqual([
      {
        type: 'system_notification',
        subtype: 'goal_event',
        message: goalStatusOutput,
        data: {
          action: 'created',
          status: 'active',
          objective: 'ship the smoke test',
          budget: '0 / 2,000 tokens',
          elapsed: '0s',
          continuations: '0',
          message: goalStatusOutput,
        },
      },
    ])
  })

  it('classifies /goal lifecycle subcommand output for the desktop client', () => {
    const statusOutput = goalStatusOutput.split('\n').slice(1).join('\n')

    expect(runGoalCommand(`goal-status-${crypto.randomUUID()}`, 'status', statusOutput)).toEqual([
      expect.objectContaining({
        type: 'system_notification',
        subtype: 'goal_event',
        data: expect.objectContaining({ action: 'status', status: 'active' }),
      }),
    ])

    expect(runGoalCommand(`goal-pause-${crypto.randomUUID()}`, 'pause', 'Goal: paused\nObjective: ship docs')).toEqual([
      expect.objectContaining({
        type: 'system_notification',
        subtype: 'goal_event',
        data: expect.objectContaining({ action: 'paused', status: 'paused' }),
      }),
    ])

    expect(runGoalCommand(`goal-resume-${crypto.randomUUID()}`, 'resume', statusOutput)).toEqual([
      expect.objectContaining({
        type: 'system_notification',
        subtype: 'goal_event',
        data: expect.objectContaining({ action: 'resumed', status: 'active' }),
      }),
    ])

    expect(runGoalCommand(`goal-complete-${crypto.randomUUID()}`, 'complete', 'Goal marked complete.')).toEqual([
      expect.objectContaining({
        type: 'system_notification',
        subtype: 'goal_event',
        data: { action: 'completed', message: 'Goal marked complete.' },
      }),
    ])

    expect(runGoalCommand(`goal-clear-${crypto.randomUUID()}`, 'clear', 'Goal cleared.')).toEqual([
      expect.objectContaining({
        type: 'system_notification',
        subtype: 'goal_event',
        data: { action: 'cleared', message: 'Goal cleared.' },
      }),
    ])
  })

  it('marks replacement output distinctly for the desktop client', () => {
    const output = [
      'Goal replaced.',
      'Goal: active',
      'Objective: ship the replacement target',
      'Budget: 0 / unlimited tokens',
      'Elapsed: 0s',
      'Continuations: 0',
    ].join('\n')

    expect(runGoalCommand(`goal-replaced-${crypto.randomUUID()}`, 'ship the replacement target', output)).toEqual([
      expect.objectContaining({
        type: 'system_notification',
        subtype: 'goal_event',
        message: output,
        data: expect.objectContaining({
          action: 'replaced',
          status: 'active',
          objective: 'ship the replacement target',
          budget: '0 / unlimited tokens',
          continuations: '0',
        }),
      }),
    ])
  })

  it('keeps negative /goal command output visible as a goal message event', () => {
    expect(runGoalCommand(`goal-empty-${crypto.randomUUID()}`, '', 'No active goal.', 'user')).toEqual([
      {
        type: 'system_notification',
        subtype: 'goal_event',
        message: 'No active goal.',
        data: { action: 'message', message: 'No active goal.' },
      },
    ])
  })

  it('does not turn unrelated local command output into a goal event', () => {
    const sessionId = `goal-unrelated-${crypto.randomUUID()}`

    expect(translateCliMessage({
      type: 'system',
      subtype: 'local_command',
      content: '<command-name>/status</command-name>',
    }, sessionId)).toEqual([])

    expect(translateCliMessage({
      type: 'system',
      subtype: 'local_command_output',
      content: '<local-command-stdout>Goal: active</local-command-stdout>',
    }, sessionId)).toEqual([
      { type: 'content_start', blockType: 'text' },
      { type: 'content_delta', text: 'Goal: active' },
    ])
  })
})

describe('WebSocket stream event translation', () => {
  it('keeps DeepSeek-style thinking blocks in thinking state until text starts', () => {
    const sessionId = `deepseek-thinking-${crypto.randomUUID()}`

    expect(translateCliMessage({
      type: 'stream_event',
      event: { type: 'message_start' },
    }, sessionId)).toEqual([
      { type: 'status', state: 'thinking' },
    ])

    expect(translateCliMessage({
      type: 'stream_event',
      event: {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'thinking', thinking: '' },
      },
    }, sessionId)).toEqual([
      { type: 'status', state: 'thinking', verb: 'Thinking' },
    ])

    expect(translateCliMessage({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'thinking_delta', thinking: 'Let me think' },
      },
    }, sessionId)).toEqual([
      { type: 'thinking', text: 'Let me think' },
    ])

    expect(translateCliMessage({
      type: 'stream_event',
      event: { type: 'content_block_stop', index: 0 },
    }, sessionId)).toEqual([])

    expect(translateCliMessage({
      type: 'stream_event',
      event: {
        type: 'content_block_start',
        index: 1,
        content_block: { type: 'text', text: '' },
      },
    }, sessionId)).toEqual([
      { type: 'content_start', blockType: 'text' },
    ])
  })
})
