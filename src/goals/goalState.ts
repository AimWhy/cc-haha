import { randomUUID } from 'crypto'

export type ThreadGoalStatus = 'active' | 'paused' | 'complete' | 'budget_limited'

export type ThreadGoal = {
  goalId: string
  threadId: string
  objective: string
  status: ThreadGoalStatus
  tokenBudget: number | null
  tokensUsed: number
  continuationCount: number
  lastReason: string | null
  createdAt: number
  updatedAt: number
}

export type ParsedGoalCommand =
  | { type: 'status' }
  | { type: 'clear' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'complete' }
  | { type: 'set'; objective: string; tokenBudget?: number | null }

const goalsByThread = new Map<string, ThreadGoal>()

export function parseGoalCommand(args: string): ParsedGoalCommand {
  const trimmed = args.trim()
  if (!trimmed || trimmed === 'status') return { type: 'status' }
  if (['clear', 'stop', 'off', 'reset', 'none', 'cancel'].includes(trimmed)) {
    return { type: 'clear' }
  }
  if (trimmed === 'pause') return { type: 'pause' }
  if (trimmed === 'resume') return { type: 'resume' }
  if (trimmed === 'complete') return { type: 'complete' }

  const parts = trimmed.split(/\s+/)
  let tokenBudget: number | null | undefined
  let objectiveStart = 0
  if (parts[0] === '--tokens') {
    const rawBudget = parts[1]
    if (!rawBudget) {
      throw new Error('Usage: /goal --tokens <budget> <objective>')
    }
    tokenBudget = parseTokenBudget(rawBudget)
    objectiveStart = 2
  }

  const objective = parts.slice(objectiveStart).join(' ').trim()
  if (!objective) {
    throw new Error('Usage: /goal [--tokens <budget>] <objective>')
  }

  return { type: 'set', objective, tokenBudget }
}

export function setThreadGoal(
  threadId: string,
  input: {
    objective: string
    tokenBudget?: number | null
    now?: number
  },
): ThreadGoal {
  const now = input.now ?? Date.now()
  const existing = goalsByThread.get(threadId)
  const goal: ThreadGoal = {
    goalId: existing?.goalId ?? randomUUID(),
    threadId,
    objective: input.objective.trim(),
    status: 'active',
    tokenBudget:
      input.tokenBudget !== undefined
        ? input.tokenBudget
        : (existing?.tokenBudget ?? null),
    tokensUsed: existing?.tokensUsed ?? 0,
    continuationCount: 0,
    lastReason: null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  goalsByThread.set(threadId, goal)
  return goal
}

export function getThreadGoal(threadId: string): ThreadGoal | null {
  return goalsByThread.get(threadId) ?? null
}

export function clearThreadGoal(threadId: string): boolean {
  return goalsByThread.delete(threadId)
}

export function updateThreadGoalStatus(
  threadId: string,
  status: ThreadGoalStatus,
  now = Date.now(),
): ThreadGoal | null {
  const goal = goalsByThread.get(threadId)
  if (!goal) return null
  const updated = { ...goal, status, updatedAt: now }
  goalsByThread.set(threadId, updated)
  return updated
}

export function markThreadGoalComplete(
  threadId: string,
  input: { reason?: string; now?: number } = {},
): ThreadGoal | null {
  const goal = goalsByThread.get(threadId)
  if (!goal) return null
  const updated = {
    ...goal,
    status: 'complete' as const,
    lastReason: input.reason ?? goal.lastReason,
    updatedAt: input.now ?? Date.now(),
  }
  goalsByThread.set(threadId, updated)
  return updated
}

export function accountThreadGoalUsage(
  threadId: string,
  tokens: number,
  now = Date.now(),
): ThreadGoal | null {
  const goal = goalsByThread.get(threadId)
  if (!goal || tokens <= 0) return goal ?? null
  const updated = {
    ...goal,
    tokensUsed: goal.tokensUsed + tokens,
    updatedAt: now,
  }
  goalsByThread.set(threadId, updated)
  return updated
}

export function incrementThreadGoalContinuation(
  threadId: string,
  input: { reason?: string; now?: number } = {},
): ThreadGoal | null {
  const goal = goalsByThread.get(threadId)
  if (!goal) return null
  const updated = {
    ...goal,
    continuationCount: goal.continuationCount + 1,
    lastReason: input.reason ?? goal.lastReason,
    updatedAt: input.now ?? Date.now(),
  }
  goalsByThread.set(threadId, updated)
  return updated
}

export function formatGoalStatus(goal: ThreadGoal | null, now = Date.now()): string {
  if (!goal) return 'No active goal.'
  return [
    `Goal: ${goal.status}`,
    `Objective: ${goal.objective}`,
    `Budget: ${goal.tokensUsed.toLocaleString()} / ${
      goal.tokenBudget === null ? 'unlimited' : goal.tokenBudget.toLocaleString()
    } tokens`,
    `Elapsed: ${formatElapsed(Math.max(0, now - goal.createdAt))}`,
    `Continuations: ${goal.continuationCount.toLocaleString()}`,
    goal.lastReason ? `Latest reason: ${goal.lastReason}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join('\n')
}

export function buildGoalStartPrompt(goal: ThreadGoal): string {
  return [
    'You are now pursuing this /goal until the completion condition is met.',
    '',
    `<objective>${goal.objective}</objective>`,
    '',
    'Work autonomously. Research, implement, test, and review as needed.',
    'Before claiming completion, perform a concrete completion audit against the objective.',
  ].join('\n')
}

export function buildGoalContinuationPrompt(
  goal: ThreadGoal,
  reason: string,
): string {
  return [
    'Continue working toward the active /goal.',
    '',
    `<objective>${goal.objective}</objective>`,
    '',
    'The goal evaluator says the objective is not complete yet.',
    `Reason: ${reason || 'No reason provided.'}`,
    '',
    'Resume directly from the current state. Do not ask the user to continue. Do the next concrete step, then test or review before stopping.',
  ].join('\n')
}

function parseTokenBudget(raw: string): number {
  const match = raw.trim().match(/^(\d+(?:\.\d+)?)([kKmM])?$/)
  if (!match) throw new Error(`Invalid token budget: ${raw}`)
  const value = Number(match[1])
  const suffix = match[2]?.toLowerCase()
  const multiplier = suffix === 'm' ? 1_000_000 : suffix === 'k' ? 1_000 : 1
  const budget = Math.floor(value * multiplier)
  if (!Number.isFinite(budget) || budget <= 0) {
    throw new Error(`Invalid token budget: ${raw}`)
  }
  return budget
}

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m`
  return `${seconds}s`
}
