import type { Command } from '../../commands.js'

const goal = {
  type: 'local-jsx',
  supportsNonInteractive: true,
  name: 'goal',
  description: 'Create or manage an autonomous completion goal',
  argumentHint: '<objective>|status|pause|resume|clear|complete',
  whenToUse: 'Use when you want the session to keep iterating on a concrete objective until it is complete.',
  load: () => import('./goal.js'),
} satisfies Command

export default goal
