import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildSystemInitMessage } from './systemInit'

describe('buildSystemInitMessage', () => {
  const previousAnthropicApiKey = process.env.ANTHROPIC_API_KEY

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    ;(globalThis as typeof globalThis & { MACRO?: { VERSION: string } }).MACRO = { VERSION: 'test-version' }
  })

  afterEach(() => {
    if (previousAnthropicApiKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY
    } else {
      process.env.ANTHROPIC_API_KEY = previousAnthropicApiKey
    }
  })

  const baseInputs = {
    tools: [],
    mcpClients: [],
    model: 'test-model',
    permissionMode: 'default' as const,
    agents: [],
    skills: [],
    plugins: [],
    fastMode: false,
  }

  it('keeps slash command names compatible while exposing command descriptions and usage hints', () => {
    const message = buildSystemInitMessage({
      ...baseInputs,
      commands: [
        {
          name: 'goal',
          description: 'Create or manage an autonomous completion goal',
          argumentHint: '<objective>|status|pause|resume|clear',
          whenToUse: 'Use when the session should keep iterating until a concrete outcome is complete.',
        },
      ],
    })

    expect(message.slash_commands).toEqual(['goal'])
    expect(message.slash_commands_metadata).toEqual([
      {
        name: 'goal',
        description: 'Create or manage an autonomous completion goal',
        argumentHint: '<objective>|status|pause|resume|clear',
        whenToUse: 'Use when the session should keep iterating until a concrete outcome is complete.',
      },
    ])
  })
})
