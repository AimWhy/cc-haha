import * as React from 'react'
import { getSessionId } from '../../bootstrap/state.js'
import type { LocalJSXCommandContext } from '../../commands.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'
import {
  buildGoalStartPrompt,
  clearThreadGoal,
  formatGoalStatus,
  getThreadGoal,
  parseGoalCommand,
  setThreadGoal,
  updateThreadGoalStatus,
} from '../../goals/goalState.js'

export async function call(
  onDone: LocalJSXCommandOnDone,
  _context: LocalJSXCommandContext,
  args: string,
): Promise<React.ReactNode> {
  const threadId = getSessionId()
  try {
    const parsed = parseGoalCommand(args)
    if (parsed.type === 'status') {
      onDone(formatGoalStatus(getThreadGoal(threadId)), { display: 'system' })
      return null
    }
    if (parsed.type === 'clear') {
      const cleared = clearThreadGoal(threadId)
      onDone(cleared ? 'Goal cleared.' : 'No active goal.', { display: 'system' })
      return null
    }
    if (parsed.type === 'pause') {
      const goal = updateThreadGoalStatus(threadId, 'paused')
      onDone(goal ? formatGoalStatus(goal) : 'No active goal.', {
        display: 'system',
      })
      return null
    }
    if (parsed.type === 'resume') {
      const goal = updateThreadGoalStatus(threadId, 'active')
      onDone(goal ? formatGoalStatus(goal) : 'No goal to resume.', {
        display: 'system',
        shouldQuery: Boolean(goal),
        metaMessages: goal ? [buildGoalStartPrompt(goal)] : [],
      })
      return null
    }
    if (parsed.type === 'complete') {
      const goal = updateThreadGoalStatus(threadId, 'complete')
      onDone(goal ? 'Goal marked complete.' : 'No active goal.', {
        display: 'system',
      })
      return null
    }

    const replaced = Boolean(getThreadGoal(threadId))
    const goal = setThreadGoal(threadId, {
      objective: parsed.objective,
      tokenBudget: parsed.tokenBudget,
    })
    onDone(`${replaced ? 'Goal replaced.' : 'Goal created.'}\n${formatGoalStatus(goal)}`, {
      display: 'system',
      shouldQuery: true,
      metaMessages: [buildGoalStartPrompt(goal)],
    })
    return null
  } catch (error) {
    onDone(error instanceof Error ? error.message : String(error), {
      display: 'system',
    })
    return null
  }
}
