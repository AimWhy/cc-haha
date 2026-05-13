import type { Command } from '../../commands.js'

const goal = {
  type: 'local-jsx',
  supportsNonInteractive: true,
  name: 'goal',
  description: 'Set or manage a completion goal that keeps the session working until it is met',
  argumentHint: '[status|clear|pause|resume|--tokens <budget> <objective>|<objective>]',
  load: () => import('./goal.js'),
} satisfies Command

export default goal
