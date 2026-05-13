import { describe, expect, it } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createOpenTargetService } from '../services/openTargetService.js'

async function makeDir(prefix = 'cc-haha-open-target-') {
  return mkdtemp(join(tmpdir(), prefix))
}

function createService(
  platform: NodeJS.Platform,
  options: {
    commands?: Record<string, boolean>
    paths?: Record<string, boolean>
    launchResult?: { code: number; stdout: string; stderr: string }
    ttlMs?: number
    now?: { value: number }
  } = {},
) {
  const launched: Array<{ command: string; args: string[] }> = []
  let commandProbes = 0
  let pathProbes = 0
  const now = options.now ?? { value: 100 }

  const service = createOpenTargetService({
    platform,
    ttlMs: options.ttlMs ?? 1_000,
    now: () => now.value,
    commandExists: async (command) => {
      commandProbes += 1
      return options.commands?.[command] === true
    },
    pathExists: async (targetPath) => {
      pathProbes += 1
      return options.paths?.[targetPath] === true
    },
    launch: async (command, args) => {
      launched.push({ command, args })
      return options.launchResult ?? { code: 0, stdout: '', stderr: '' }
    },
  })

  return {
    service,
    launched,
    now,
    get commandProbes() {
      return commandProbes
    },
    get pathProbes() {
      return pathProbes
    },
  }
}

describe('openTargetService', () => {
  it('returns only detected IDE targets plus Finder on macOS', async () => {
    const { service } = createService('darwin', {
      commands: { code: true },
      paths: {
        '/Applications/Sublime Text.app': true,
      },
    })

    const result = await service.listTargets()

    expect(result.platform).toBe('darwin')
    expect(result.targets.map((target) => target.id)).toEqual([
      'vscode',
      'sublime',
      'finder',
    ])
    expect(result.primaryTargetId).toBe('vscode')
    expect(result.targets.find((target) => target.id === 'finder')?.kind).toBe('file_manager')
  })

  it('falls back to Explorer when no Windows IDE is detected', async () => {
    const { service } = createService('win32')

    const result = await service.listTargets()

    expect(result.targets.map((target) => target.id)).toEqual(['explorer'])
    expect(result.primaryTargetId).toBe('explorer')
  })

  it('only includes the Linux file-manager fallback when xdg-open is available', async () => {
    const withoutXdg = createService('linux')
    expect((await withoutXdg.service.listTargets()).targets).toEqual([])

    const withXdg = createService('linux', {
      commands: { 'xdg-open': true },
    })
    expect((await withXdg.service.listTargets()).targets.map((target) => target.id)).toEqual([
      'file-manager',
    ])
  })

  it('caches detection results until the TTL expires', async () => {
    const now = { value: 100 }
    const state = createService('darwin', {
      commands: { code: true },
      now,
    })

    await state.service.listTargets()
    const initialProbes = state.commandProbes
    expect(initialProbes).toBeGreaterThan(0)

    await state.service.listTargets()
    expect(state.commandProbes).toBe(initialProbes)

    now.value = 5_000
    await state.service.listTargets()
    expect(state.commandProbes).toBeGreaterThan(initialProbes)
  })

  it('rejects unknown targets', async () => {
    const dir = await makeDir()
    const { service } = createService('darwin', { commands: { code: true } })

    try {
      await expect(service.openTarget({ targetId: 'terminal', path: dir }))
        .rejects.toMatchObject({ code: 'OPEN_TARGET_UNKNOWN' })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('rejects non-directory paths', async () => {
    const dir = await makeDir()
    const file = join(dir, 'note.txt')
    await writeFile(file, 'not a directory')
    const { service } = createService('darwin', { commands: { code: true } })

    try {
      await expect(service.openTarget({ targetId: 'vscode', path: file }))
        .rejects.toMatchObject({ code: 'OPEN_TARGET_PATH_NOT_DIRECTORY' })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('launches with argument arrays and the path as one argument', async () => {
    const dir = await makeDir('cc-haha open-target-')
    const { service, launched } = createService('darwin', {
      commands: { code: true },
    })

    try {
      await service.openTarget({ targetId: 'vscode', path: dir })

      expect(launched).toEqual([{ command: 'code', args: [dir] }])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('opens macOS app bundles through open -a when no command is present', async () => {
    const dir = await makeDir()
    const { service, launched } = createService('darwin', {
      paths: { '/Applications/Cursor.app': true },
    })

    try {
      await service.openTarget({ targetId: 'cursor', path: dir })

      expect(launched).toEqual([
        { command: 'open', args: ['-a', '/Applications/Cursor.app', dir] },
      ])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('reports launch failures instead of returning success', async () => {
    const dir = await makeDir()
    const { service } = createService('darwin', {
      commands: { code: true },
      launchResult: { code: 1, stdout: '', stderr: 'failed' },
    })

    try {
      await expect(service.openTarget({ targetId: 'vscode', path: dir }))
        .rejects.toMatchObject({ code: 'OPEN_TARGET_LAUNCH_FAILED' })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
