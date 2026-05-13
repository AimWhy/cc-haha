import { useEffect, useMemo, useState } from 'react'
import { FileText, Plus, Search, X } from 'lucide-react'
import { Button } from '../components/shared/Button'
import { MarkdownRenderer } from '../components/markdown/MarkdownRenderer'
import { useTranslation } from '../i18n'
import { formatBytes } from '../lib/formatBytes'
import { useMemoryStore } from '../stores/memoryStore'
import { useSessionStore } from '../stores/sessionStore'
import { useUIStore } from '../stores/uiStore'
import type { MemoryFile, MemoryProject } from '../types/memory'

const DEFAULT_MEMORY_PATH = 'MEMORY.md'

export function MemorySettings() {
  const t = useTranslation()
  const {
    projects,
    files,
    selectedProjectId,
    selectedFile,
    draftContent,
    isLoadingProjects,
    isLoadingFiles,
    isLoadingFile,
    isSaving,
    error,
    lastSavedAt,
    fetchProjects,
    selectProject,
    fetchFiles,
    openFile,
    updateDraft,
    saveFile,
    createFile,
  } = useMemoryStore()
  const sessions = useSessionStore((s) => s.sessions)
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const pendingMemoryPath = useUIStore((s) => s.pendingMemoryPath)
  const setPendingMemoryPath = useUIStore((s) => s.setPendingMemoryPath)
  const [newPath, setNewPath] = useState('')
  const [newPathError, setNewPathError] = useState<string | null>(null)
  const [projectQuery, setProjectQuery] = useState('')
  const [fileQuery, setFileQuery] = useState('')

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId),
    [activeSessionId, sessions],
  )
  const activeCwd = activeSession?.workDir || activeSession?.projectPath || undefined
  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null
  const isDirty = Boolean(selectedFile && draftContent !== selectedFile.content)
  const filteredProjects = useMemo(
    () => filterProjects(projects, projectQuery),
    [projectQuery, projects],
  )
  const filteredFiles = useMemo(
    () => filterFiles(files, fileQuery),
    [fileQuery, files],
  )
  const previewContent = stripMarkdownFrontmatter(draftContent)

  useEffect(() => {
    void fetchProjects(activeCwd)
  }, [activeCwd, fetchProjects])

  useEffect(() => {
    if (!selectedProjectId) return
    void fetchFiles(selectedProjectId)
  }, [fetchFiles, selectedProjectId])

  useEffect(() => {
    if (!projectQuery.trim() || filteredProjects.length === 0) return
    if (selectedProjectId && filteredProjects.some((project) => project.id === selectedProjectId)) return
    selectProject(filteredProjects[0]!.id)
  }, [filteredProjects, projectQuery, selectProject, selectedProjectId])

  useEffect(() => {
    if (!selectedProjectId || selectedFile || isLoadingFiles || isLoadingFile) return
    if (pendingMemoryPath) return
    const firstFile = files[0]
    if (firstFile) {
      void openFile(selectedProjectId, firstFile.path)
    }
  }, [files, isLoadingFile, isLoadingFiles, openFile, pendingMemoryPath, selectedFile, selectedProjectId])

  useEffect(() => {
    if (!pendingMemoryPath || isLoadingProjects || projects.length === 0) return
    const target = resolveMemoryFileTarget(projects, pendingMemoryPath)
    if (!target) {
      setPendingMemoryPath(null)
      return
    }
    if (selectedProjectId !== target.projectId) {
      selectProject(target.projectId)
      return
    }
    if (selectedFile?.path === target.path && !isLoadingFile) {
      setPendingMemoryPath(null)
      return
    }
    void openFile(target.projectId, target.path).then(() => {
      setPendingMemoryPath(null)
    })
  }, [
    isLoadingFile,
    isLoadingProjects,
    openFile,
    pendingMemoryPath,
    projects,
    selectProject,
    selectedFile?.path,
    selectedProjectId,
    setPendingMemoryPath,
  ])

  const handleRefresh = () => {
    void fetchProjects(activeCwd)
    if (selectedProjectId) {
      void fetchFiles(selectedProjectId)
    }
  }

  const handleProjectSelect = (projectId: string) => {
    if (projectId === selectedProjectId) return
    selectProject(projectId)
  }

  const handleFileOpen = (file: MemoryFile) => {
    if (!selectedProjectId || file.path === selectedFile?.path) return
    void openFile(selectedProjectId, file.path)
  }

  const handleCreate = () => {
    if (!selectedProjectId) return
    const path = normalizeMemoryPath(newPath || DEFAULT_MEMORY_PATH)
    if (!isValidMemoryPath(path)) {
      setNewPathError(t('settings.memory.invalidPath'))
      return
    }
    if (files.some((file) => file.path === path)) {
      setNewPathError(t('settings.memory.fileExists'))
      return
    }
    setNewPath('')
    setNewPathError(null)
    void createFile(selectedProjectId, path, buildMemoryTemplate(path))
  }

  return (
    <div className="flex h-full min-h-[640px] flex-col gap-5">
      <header className="flex flex-col gap-4 border-b border-[var(--color-border)] pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
            {t('settings.memory.title')}
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--color-text-secondary)]">
            {t('settings.memory.description')}
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleRefresh}
          loading={isLoadingProjects || isLoadingFiles}
          icon={<span className="material-symbols-outlined text-[16px]">refresh</span>}
        >
          {t('settings.memory.refresh')}
        </Button>
      </header>

      {error && (
        <div className="rounded-[var(--radius-md)] border border-[var(--color-error)]/30 bg-[var(--color-error)]/10 px-3 py-2 text-sm text-[var(--color-error)]">
          {error}
        </div>
      )}

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="grid min-h-0 content-start gap-4">
          <section className="min-h-0 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)]">
            <PanelHeader
              title={t('settings.memory.projects')}
              meta={isLoadingProjects ? t('common.loading') : String(projects.length)}
            />
            <div className="border-b border-[var(--color-border)] p-3">
              <SearchField
                value={projectQuery}
                onChange={setProjectQuery}
                placeholder={t('settings.memory.projectSearchPlaceholder')}
                ariaLabel={t('settings.memory.projectSearchPlaceholder')}
                clearLabel={t('settings.memory.clearSearch')}
              />
            </div>
            <div className="max-h-[320px] overflow-y-auto p-2">
              {projects.length === 0 && !isLoadingProjects ? (
                <EmptyState text={t('settings.memory.emptyProjects')} />
              ) : filteredProjects.length === 0 ? (
                <EmptyState text={t('settings.memory.noProjectMatches')} />
              ) : (
                filteredProjects.map((project) => (
                  <ProjectRow
                    key={project.id}
                    project={project}
                    active={project.id === selectedProjectId}
                    onSelect={() => handleProjectSelect(project.id)}
                  />
                ))
              )}
            </div>
          </section>

          <section className="min-h-0 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)]">
            <PanelHeader
              title={t('settings.memory.files')}
              meta={isLoadingFiles ? t('common.loading') : `${files.length}`}
            />
            <div className="grid gap-3 border-b border-[var(--color-border)] p-3">
              <CreateFileControl
                value={newPath}
                onChange={(value) => {
                  setNewPath(value)
                  setNewPathError(null)
                }}
                onCreate={handleCreate}
                disabled={!selectedProjectId}
                loading={isSaving && !selectedFile}
                placeholder={t('settings.memory.newPathPlaceholder')}
                label={t('settings.memory.createMemoryFile')}
              />
              {newPathError && (
                <p className="mt-2 text-xs text-[var(--color-error)]">{newPathError}</p>
              )}
              {files.length > 3 ? (
                <SearchField
                  value={fileQuery}
                  onChange={setFileQuery}
                  placeholder={t('settings.memory.fileSearchPlaceholder')}
                  ariaLabel={t('settings.memory.fileSearchPlaceholder')}
                  clearLabel={t('settings.memory.clearSearch')}
                />
              ) : null}
            </div>
            <div className="max-h-[420px] overflow-y-auto p-2">
              {files.length === 0 && !isLoadingFiles ? (
                <EmptyState text={t('settings.memory.emptyFiles')} />
              ) : filteredFiles.length === 0 ? (
                <EmptyState text={t('settings.memory.noFileMatches')} />
              ) : (
                filteredFiles.map((file) => (
                  <FileRow
                    key={file.path}
                    file={file}
                    active={file.path === selectedFile?.path}
                    onSelect={() => handleFileOpen(file)}
                  />
                ))
              )}
            </div>
          </section>
        </div>

        <section className="min-h-0 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] shadow-[0_12px_36px_rgba(15,23,42,0.04)]">
          <div className="flex flex-col gap-3 border-b border-[var(--color-border)] p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-base font-semibold text-[var(--color-text-primary)]">
                  {selectedFile?.path ?? t('settings.memory.noFileSelected')}
                </h3>
                {isDirty && <Badge>{t('settings.memory.unsaved')}</Badge>}
                {lastSavedAt && !isDirty && <Badge>{t('settings.memory.saved')}</Badge>}
              </div>
              <p className="mt-1 truncate text-xs text-[var(--color-text-tertiary)]">
                {selectedProject?.memoryDir ?? t('settings.memory.selectProject')}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!selectedFile || !isDirty || isSaving}
                onClick={() => selectedFile && updateDraft(selectedFile.content)}
              >
                {t('settings.memory.revert')}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!selectedFile || !isDirty}
                loading={isSaving}
                onClick={() => void saveFile()}
                icon={<span className="material-symbols-outlined text-[16px]">save</span>}
              >
                {t('common.save')}
              </Button>
            </div>
          </div>

          {selectedFile ? (
            <div className="grid min-h-[520px] grid-rows-[minmax(300px,1fr)_minmax(240px,0.85fr)] 2xl:grid-cols-2 2xl:grid-rows-1">
              <div className="min-h-0 border-b border-[var(--color-border)] 2xl:border-b-0 2xl:border-r">
                <div className="flex h-9 items-center justify-between border-b border-[var(--color-border)] px-3 text-xs font-medium uppercase tracking-normal text-[var(--color-text-tertiary)]">
                  <span>{t('settings.memory.editor')}</span>
                  <span>{formatBytes(selectedFile.bytes)}</span>
                </div>
                <textarea
                  aria-label={t('settings.memory.editor')}
                  value={draftContent}
                  onChange={(event) => updateDraft(event.target.value)}
                  spellCheck={false}
                  className="h-[calc(100%-36px)] w-full resize-none overflow-auto bg-transparent p-5 font-mono text-[13px] leading-6 text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-tertiary)]"
                />
              </div>
              <div className="min-h-0 overflow-y-auto">
                <div className="flex h-9 items-center justify-between border-b border-[var(--color-border)] px-3 text-xs font-medium uppercase tracking-normal text-[var(--color-text-tertiary)]">
                  <span>{t('settings.memory.preview')}</span>
                  <span>{selectedFile.updatedAt ? formatDate(selectedFile.updatedAt) : ''}</span>
                </div>
                <div className="p-6">
                  <MarkdownRenderer content={previewContent || ' '} variant="document" />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[520px] items-center justify-center p-8">
              <EmptyState text={isLoadingFile ? t('common.loading') : t('settings.memory.selectFile')} />
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function SearchField({
  value,
  onChange,
  placeholder,
  ariaLabel,
  clearLabel,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  ariaLabel: string
  clearLabel: string
}) {
  return (
    <div className="relative">
      <Search
        size={15}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]"
        aria-hidden="true"
      />
      <input
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] pl-9 pr-9 text-sm text-[var(--color-text-primary)] outline-none transition-colors duration-150 placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-border-focus)] focus:shadow-[var(--shadow-focus-ring)]"
      />
      {value ? (
        <button
          type="button"
          aria-label={clearLabel}
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]"
        >
          <X size={14} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}

function CreateFileControl({
  value,
  onChange,
  onCreate,
  disabled,
  loading,
  placeholder,
  label,
}: {
  value: string
  onChange: (value: string) => void
  onCreate: () => void
  disabled: boolean
  loading: boolean
  placeholder: string
  label: string
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_44px] gap-2">
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onCreate()
        }}
        placeholder={placeholder}
        aria-label={label}
        className="h-11 min-w-0 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text-primary)] outline-none transition-colors duration-150 placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-border-focus)] focus:shadow-[var(--shadow-focus-ring)]"
      />
      <button
        type="button"
        aria-label={label}
        disabled={disabled || loading}
        onClick={onCreate}
        className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] transition-colors duration-150 hover:bg-[var(--color-surface-hover)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus size={18} aria-hidden="true" />
      </button>
    </div>
  )
}

function PanelHeader({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="flex h-12 items-center justify-between border-b border-[var(--color-border)] px-3">
      <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h3>
      <span className="text-xs text-[var(--color-text-tertiary)]">{meta}</span>
    </div>
  )
}

function ProjectRow({
  project,
  active,
  onSelect,
}: {
  project: MemoryProject
  active: boolean
  onSelect: () => void
}) {
  const t = useTranslation()
  const display = projectDisplayName(project.label)
  return (
    <button
      type="button"
      onClick={onSelect}
      title={project.label}
      className={`mb-1 w-full rounded-[var(--radius-md)] px-3 py-2.5 text-left transition-colors ${
        active
          ? 'bg-[var(--color-surface-selected)] text-[var(--color-text-primary)] shadow-[inset_3px_0_0_var(--color-brand)]'
          : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-semibold">{display}</span>
        {project.isCurrent && <Badge>{t('settings.memory.current')}</Badge>}
      </div>
      <p className="mt-1 truncate text-xs text-[var(--color-text-tertiary)]">{project.label}</p>
      <div className="mt-1.5 flex items-center gap-2 text-xs text-[var(--color-text-tertiary)]">
        <span>{t('settings.memory.fileCount', { count: project.fileCount })}</span>
      </div>
    </button>
  )
}

function FileRow({
  file,
  active,
  onSelect,
}: {
  file: MemoryFile
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`mb-1 w-full rounded-[var(--radius-md)] px-3 py-2.5 text-left transition-colors ${
        active
          ? 'bg-[var(--color-surface-selected)] text-[var(--color-text-primary)] shadow-[inset_3px_0_0_var(--color-brand)]'
          : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <FileText size={14} className="shrink-0 text-[var(--color-text-tertiary)]" aria-hidden="true" />
          <span className="min-w-0 truncate text-sm font-semibold">{file.title}</span>
        </span>
        {file.type && <Badge>{file.type}</Badge>}
      </div>
      <p className="mt-1 truncate text-xs text-[var(--color-text-tertiary)]">{file.path}</p>
      {file.description && (
        <p className="mt-1 truncate text-xs leading-5 text-[var(--color-text-secondary)]">
          {file.description}
        </p>
      )}
    </button>
  )
}

function Badge({ children }: { children: string }) {
  return (
    <span className="shrink-0 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--color-text-secondary)]">
      {children}
    </span>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="px-3 py-8 text-center text-sm text-[var(--color-text-tertiary)]">
      {text}
    </div>
  )
}

function normalizeMemoryPath(value: string): string {
  return value.trim().replace(/\\/g, '/').replace(/^\/+/, '')
}

function normalizeSearch(value: string): string {
  return value.toLowerCase().replace(/\\/g, '/').replace(/\/+/g, '/').trim()
}

function filterProjects(projects: MemoryProject[], query: string): MemoryProject[] {
  const normalized = normalizeSearch(query)
  if (!normalized) return projects
  return projects.filter((project) =>
    normalizeSearch(`${project.label} ${project.memoryDir} ${project.id}`).includes(normalized),
  )
}

function filterFiles(files: MemoryFile[], query: string): MemoryFile[] {
  const normalized = normalizeSearch(query)
  if (!normalized) return files
  return files.filter((file) =>
    normalizeSearch(`${file.title} ${file.path} ${file.description ?? ''} ${file.type ?? ''}`).includes(normalized),
  )
}

function projectDisplayName(label: string): string {
  const normalized = label.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '')
  const parts = normalized.split('/').filter(Boolean)
  if (parts.length >= 2) return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`
  return parts[0] ?? label
}

function stripMarkdownFrontmatter(content: string): string {
  if (!content.startsWith('---')) return content
  const end = content.indexOf('\n---', 3)
  if (end < 0) return content
  const after = content.indexOf('\n', end + 4)
  return after < 0 ? '' : content.slice(after + 1).trimStart()
}

function normalizeFsPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/, '')
}

function resolveMemoryFileTarget(projects: MemoryProject[], absolutePath: string): { projectId: string; path: string } | null {
  const target = normalizeFsPath(absolutePath)
  for (const project of projects) {
    const memoryDir = normalizeFsPath(project.memoryDir)
    if (!memoryDir) continue
    if (target === memoryDir) {
      return { projectId: project.id, path: DEFAULT_MEMORY_PATH }
    }
    if (target.startsWith(`${memoryDir}/`)) {
      return {
        projectId: project.id,
        path: target.slice(memoryDir.length + 1),
      }
    }
  }
  return null
}

function isValidMemoryPath(path: string): boolean {
  return (
    path.length > 0 &&
    path.endsWith('.md') &&
    !path.includes('\0') &&
    !path.split('/').some((part) => part === '' || part === '.' || part === '..')
  )
}

function buildMemoryTemplate(path: string): string {
  const parts = path.split('/')
  const title = parts[parts.length - 1]?.replace(/\.md$/, '') || 'Memory'
  return `---
type: project
description: Manually curated project memory.
---

# ${title}

`
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
