import { execFile as execFileCallback } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { ApiError } from '../middleware/errorHandler.js'

const execFile = promisify(execFileCallback)
const DEFAULT_TTL_MS = 30_000

export type OpenTargetPlatform = NodeJS.Platform

export type OpenTargetKind = 'ide' | 'file_manager'

export type OpenTarget = {
  id: string
  kind: OpenTargetKind
  label: string
  icon: string
  platform: OpenTargetPlatform
}

export type OpenTargetList = {
  platform: OpenTargetPlatform
  targets: OpenTarget[]
  primaryTargetId: string | null
  cachedAt: number
  ttlMs: number
}

export type OpenTargetLaunchResult = {
  code: number
  stdout: string
  stderr: string
}

type Runtime = {
  platform: OpenTargetPlatform
  ttlMs: number
  now: () => number
  commandExists: (command: string) => Promise<boolean>
  pathExists: (targetPath: string) => Promise<boolean>
  launch: (command: string, args: string[]) => Promise<OpenTargetLaunchResult>
}

type LaunchPlan = {
  command: string
  args: string[]
}

type TargetDefinition = {
  id: string
  kind: OpenTargetKind
  label: string
  icon: string
  platforms: OpenTargetPlatform[]
  commands?: Partial<Record<OpenTargetPlatform, string[]>>
  appPaths?: Partial<Record<OpenTargetPlatform, string[]>>
  fallback?: boolean
}

const TARGET_DEFINITIONS: TargetDefinition[] = [
  {
    id: 'vscode',
    kind: 'ide',
    label: 'VS Code',
    icon: 'vscode',
    platforms: ['darwin', 'win32', 'linux'],
    commands: {
      darwin: ['code'],
      win32: ['code.cmd', 'code.exe'],
      linux: ['code'],
    },
    appPaths: {
      darwin: [
        '/Applications/Visual Studio Code.app',
        join(homedir(), 'Applications', 'Visual Studio Code.app'),
      ],
    },
  },
  {
    id: 'cursor',
    kind: 'ide',
    label: 'Cursor',
    icon: 'cursor',
    platforms: ['darwin', 'win32', 'linux'],
    commands: {
      darwin: ['cursor'],
      win32: ['cursor.cmd', 'cursor.exe'],
      linux: ['cursor'],
    },
    appPaths: {
      darwin: ['/Applications/Cursor.app', join(homedir(), 'Applications', 'Cursor.app')],
    },
  },
  {
    id: 'sublime',
    kind: 'ide',
    label: 'Sublime Text',
    icon: 'sublime',
    platforms: ['darwin', 'win32', 'linux'],
    commands: {
      darwin: ['subl'],
      win32: ['subl.exe', 'subl'],
      linux: ['subl'],
    },
    appPaths: {
      darwin: ['/Applications/Sublime Text.app', join(homedir(), 'Applications', 'Sublime Text.app')],
    },
  },
  {
    id: 'antigravity',
    kind: 'ide',
    label: 'Antigravity',
    icon: 'antigravity',
    platforms: ['darwin'],
    commands: {
      darwin: ['antigravity'],
    },
    appPaths: {
      darwin: ['/Applications/Antigravity.app', join(homedir(), 'Applications', 'Antigravity.app')],
    },
  },
  {
    id: 'goland',
    kind: 'ide',
    label: 'GoLand',
    icon: 'goland',
    platforms: ['darwin', 'win32', 'linux'],
    commands: {
      darwin: ['goland'],
      win32: ['goland64.exe', 'goland.cmd'],
      linux: ['goland'],
    },
    appPaths: {
      darwin: ['/Applications/GoLand.app', join(homedir(), 'Applications', 'GoLand.app')],
    },
  },
  {
    id: 'pycharm',
    kind: 'ide',
    label: 'PyCharm',
    icon: 'pycharm',
    platforms: ['darwin', 'win32', 'linux'],
    commands: {
      darwin: ['pycharm'],
      win32: ['pycharm64.exe', 'pycharm.cmd'],
      linux: ['pycharm'],
    },
    appPaths: {
      darwin: ['/Applications/PyCharm.app', join(homedir(), 'Applications', 'PyCharm.app')],
    },
  },
  {
    id: 'finder',
    kind: 'file_manager',
    label: 'Finder',
    icon: 'finder',
    platforms: ['darwin'],
    fallback: true,
  },
  {
    id: 'explorer',
    kind: 'file_manager',
    label: 'Explorer',
    icon: 'folder',
    platforms: ['win32'],
    fallback: true,
  },
  {
    id: 'file-manager',
    kind: 'file_manager',
    label: 'File Manager',
    icon: 'folder',
    platforms: ['linux'],
    fallback: true,
  },
]

function openTargetError(statusCode: number, message: string, code: string): ApiError {
  return new ApiError(statusCode, message, code)
}

async function defaultCommandExists(command: string): Promise<boolean> {
  const probe = process.platform === 'win32' ? 'where' : 'which'
  try {
    await execFile(probe, [command], {
      timeout: 3_000,
      windowsHide: true,
    })
    return true
  } catch {
    return false
  }
}

async function defaultPathExists(targetPath: string): Promise<boolean> {
  try {
    const entry = await stat(targetPath)
    return entry.isFile() || entry.isDirectory()
  } catch {
    return false
  }
}

async function defaultLaunch(command: string, args: string[]): Promise<OpenTargetLaunchResult> {
  try {
    const { stdout, stderr } = await execFile(command, args, {
      timeout: 10_000,
      windowsHide: true,
    })
    return {
      code: 0,
      stdout: String(stdout ?? ''),
      stderr: String(stderr ?? ''),
    }
  } catch (error) {
    const err = error as {
      code?: unknown
      stdout?: unknown
      stderr?: unknown
      message?: string
    }
    return {
      code: typeof err.code === 'number' ? err.code : 1,
      stdout: String(err.stdout ?? ''),
      stderr: String(err.stderr ?? err.message ?? ''),
    }
  }
}

function buildOpenTarget(definition: TargetDefinition, platform: OpenTargetPlatform): OpenTarget {
  return {
    id: definition.id,
    kind: definition.kind,
    label: definition.label,
    icon: definition.icon,
    platform,
  }
}

function isSupportedOnPlatform(definition: TargetDefinition, platform: OpenTargetPlatform): boolean {
  return definition.platforms.includes(platform)
}

async function isDetected(definition: TargetDefinition, runtime: Runtime): Promise<boolean> {
  if (!isSupportedOnPlatform(definition, runtime.platform)) {
    return false
  }

  if (definition.fallback) {
    if (runtime.platform === 'linux') {
      return runtime.commandExists('xdg-open')
    }
    return true
  }

  for (const appPath of definition.appPaths?.[runtime.platform] ?? []) {
    if (await runtime.pathExists(appPath)) {
      return true
    }
  }

  for (const command of definition.commands?.[runtime.platform] ?? []) {
    if (await runtime.commandExists(command)) {
      return true
    }
  }

  return false
}

async function resolveLaunchPlan(
  definition: TargetDefinition,
  runtime: Runtime,
  targetPath: string,
): Promise<LaunchPlan | null> {
  if (!isSupportedOnPlatform(definition, runtime.platform)) {
    return null
  }

  if (definition.fallback) {
    switch (runtime.platform) {
      case 'darwin':
        return { command: 'open', args: [targetPath] }
      case 'win32':
        return { command: 'explorer.exe', args: [targetPath] }
      case 'linux':
        return { command: 'xdg-open', args: [targetPath] }
      default:
        return null
    }
  }

  for (const command of definition.commands?.[runtime.platform] ?? []) {
    if (await runtime.commandExists(command)) {
      return { command, args: [targetPath] }
    }
  }

  if (runtime.platform !== 'darwin') {
    return null
  }

  for (const appPath of definition.appPaths?.darwin ?? []) {
    if (await runtime.pathExists(appPath)) {
      return { command: 'open', args: ['-a', appPath, targetPath] }
    }
  }

  return null
}

async function validateDirectory(targetPath: string): Promise<string> {
  const resolvedPath = resolve(targetPath)
  let entry
  try {
    entry = await stat(resolvedPath)
  } catch {
    throw openTargetError(
      400,
      `Directory does not exist: ${resolvedPath}`,
      'OPEN_TARGET_PATH_MISSING',
    )
  }

  if (!entry.isDirectory()) {
    throw openTargetError(
      400,
      `Path is not a directory: ${resolvedPath}`,
      'OPEN_TARGET_PATH_NOT_DIRECTORY',
    )
  }

  return resolvedPath
}

export function createOpenTargetService(overrides: Partial<Runtime> = {}) {
  const runtime: Runtime = {
    platform: overrides.platform ?? process.platform,
    ttlMs: overrides.ttlMs ?? DEFAULT_TTL_MS,
    now: overrides.now ?? Date.now,
    commandExists: overrides.commandExists ?? defaultCommandExists,
    pathExists: overrides.pathExists ?? defaultPathExists,
    launch: overrides.launch ?? defaultLaunch,
  }

  let cache: OpenTargetList | null = null

  async function listTargets(forceRefresh = false): Promise<OpenTargetList> {
    if (!forceRefresh && cache && runtime.now() - cache.cachedAt < runtime.ttlMs) {
      return cache
    }

    const targets: OpenTarget[] = []
    for (const definition of TARGET_DEFINITIONS) {
      if (await isDetected(definition, runtime)) {
        targets.push(buildOpenTarget(definition, runtime.platform))
      }
    }

    cache = {
      platform: runtime.platform,
      targets,
      primaryTargetId: targets[0]?.id ?? null,
      cachedAt: runtime.now(),
      ttlMs: runtime.ttlMs,
    }

    return cache
  }

  async function openTarget(input: { targetId: string; path: string }) {
    const definition = TARGET_DEFINITIONS.find((candidate) => candidate.id === input.targetId)
    if (!definition) {
      throw openTargetError(
        400,
        `Unknown open target: ${input.targetId}`,
        'OPEN_TARGET_UNKNOWN',
      )
    }

    const targets = await listTargets()
    const target = targets.targets.find((candidate) => candidate.id === input.targetId)
    if (!target) {
      throw openTargetError(
        400,
        `Open target is not available on ${runtime.platform}: ${input.targetId}`,
        'OPEN_TARGET_UNAVAILABLE',
      )
    }

    const resolvedPath = await validateDirectory(input.path)
    const launchPlan = await resolveLaunchPlan(definition, runtime, resolvedPath)
    if (!launchPlan) {
      throw openTargetError(
        400,
        `Unable to launch open target: ${input.targetId}`,
        'OPEN_TARGET_UNAVAILABLE',
      )
    }

    const launchResult = await runtime.launch(launchPlan.command, launchPlan.args)
    if (launchResult.code !== 0) {
      throw openTargetError(
        500,
        `Failed to launch open target: ${input.targetId}`,
        'OPEN_TARGET_LAUNCH_FAILED',
      )
    }

    return {
      ok: true as const,
      targetId: target.id,
      path: resolvedPath,
    }
  }

  return {
    listTargets,
    openTarget,
  }
}

export const openTargetService = createOpenTargetService()
