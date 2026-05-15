import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

vi.mock('../chat/CodeViewer', () => ({
  CodeViewer: ({ code, language }: { code: string; language?: string }) => (
    <div data-testid="code-viewer" data-language={language ?? ''}>
      {code}
    </div>
  ),
}))

vi.mock('../chat/MermaidRenderer', () => ({
  MermaidRenderer: ({ code }: { code: string }) => (
    <div data-testid="mermaid-renderer">{code}</div>
  ),
}))

import { MarkdownRenderer } from './MarkdownRenderer'

describe('MarkdownRenderer', () => {
  it('applies document prose classes and custom width classes', () => {
    const { container } = render(
      <MarkdownRenderer
        content={'# Skill Title\n\nReadable paragraph text.'}
        variant="document"
        className="mx-auto max-w-[72ch]"
      />,
    )

    const root = container.firstChild as HTMLDivElement
    expect(root).toBeInTheDocument()
    expect(root.className).toContain('prose-p:text-[15px]')
    expect(root.className).toContain('prose-h2:border-b')
    expect(root.className).toContain('mx-auto')
    expect(root.className).toContain('max-w-[72ch]')
    expect(screen.getByText('Skill Title')).toBeInTheDocument()
    expect(screen.getByText('Readable paragraph text.')).toBeInTheDocument()
  })

  it('keeps default variant free of document-only typography classes', () => {
    const { container } = render(
      <MarkdownRenderer content={'## Default Heading\n\nBody copy.'} />,
    )

    const root = container.firstChild as HTMLDivElement
    expect(root).toBeInTheDocument()
    expect(root.className).not.toContain('prose-p:text-[15px]')
    expect(root.className).not.toContain('prose-h2:border-b')
    expect(screen.getByText('Default Heading')).toBeInTheDocument()
    expect(screen.getByText('Body copy.')).toBeInTheDocument()
  })

  it('applies compact prose classes for dense surfaces', () => {
    const { container } = render(
      <MarkdownRenderer
        content={'**Done**\n\n- One\n- Two'}
        variant="compact"
      />,
    )

    const root = container.firstChild as HTMLDivElement
    expect(root).toBeInTheDocument()
    expect(root.className).toContain('prose-p:text-xs')
    expect(root.className).toContain('prose-li:text-xs')
    expect(screen.getByText('Done')).toBeInTheDocument()
    expect(screen.getByText('One')).toBeInTheDocument()
  })

  it('uses semantic code colors for inline code so both themes stay readable', () => {
    const { container } = render(
      <MarkdownRenderer content={'Use `claude-sonnet-4-6` for balanced speed.'} />,
    )

    const root = container.firstChild as HTMLDivElement
    expect(root).toBeInTheDocument()
    expect(root.className).toContain('prose-code:text-[var(--color-code-fg)]')
    expect(root.className).toContain('prose-code:bg-[var(--color-code-bg)]')
    expect(root.className).not.toContain('prose-code:text-[var(--color-primary-fixed)]')
    expect(screen.getByText('claude-sonnet-4-6')).toBeInTheDocument()
  })

  it('renders mermaid fenced blocks with the Mermaid renderer', () => {
    render(<MarkdownRenderer content={'```mermaid\ngraph TB\nA-->B\n```'} />)

    expect(screen.getByTestId('mermaid-renderer')).toHaveTextContent(
      /graph TB\s+A-->B/,
    )
    expect(screen.queryByTestId('code-viewer')).not.toBeInTheDocument()
  })

  it('detects mermaid diagrams even when the fence has no language tag', () => {
    render(<MarkdownRenderer content={'```\ngraph TB\nA-->B\n```'} />)

    expect(screen.getByTestId('mermaid-renderer')).toHaveTextContent(
      /graph TB\s+A-->B/,
    )
    expect(screen.queryByTestId('code-viewer')).not.toBeInTheDocument()
  })

  it('keeps non-mermaid code fences in the normal code viewer', () => {
    render(<MarkdownRenderer content={'```ts\nconst value = 1\n```'} />)

    expect(screen.getByTestId('code-viewer')).toHaveAttribute(
      'data-language',
      'ts',
    )
    expect(screen.queryByTestId('mermaid-renderer')).not.toBeInTheDocument()
  })

  it('wraps markdown tables for horizontal overflow handling', () => {
    const { container } = render(
      <MarkdownRenderer
        content={'| Name | Value |\n| --- | --- |\n| `index.html` | Ready |'}
      />,
    )

    expect(container.querySelector('.md-table-wrap')).toBeInTheDocument()
    expect(screen.getByText('index.html')).toBeInTheDocument()
  })

  it('opens markdown links in a new tab safely', () => {
    render(<MarkdownRenderer content={'[OpenAI](https://openai.com)'} />)

    const link = screen.getByRole('link', { name: 'OpenAI' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('lets callers intercept markdown link clicks', () => {
    const onLinkClick = vi.fn().mockReturnValue(true)
    render(
      <MarkdownRenderer
        content={'[Manual](notes/manual.md)'}
        onLinkClick={onLinkClick}
      />,
    )

    fireEvent.click(screen.getByRole('link', { name: 'Manual' }))

    expect(onLinkClick).toHaveBeenCalledWith(
      'notes/manual.md',
      expect.objectContaining({ type: 'click' }),
    )
  })

  it('copies enhanced markdown button text with the legacy clipboard fallback', async () => {
    const originalClipboard = navigator.clipboard
    const originalExecCommand = document.execCommand
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn().mockReturnValue(true),
    })
    const execCommand = vi.mocked(document.execCommand)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockRejectedValue(new Error('clipboard blocked')),
      },
    })
    const writeText = vi.mocked(navigator.clipboard.writeText)

    try {
      render(<MarkdownRenderer content={'<button data-copy-code="npm run verify">Copy</button>'} />)

      fireEvent.click(screen.getByRole('button', { name: 'Copy' }))

      await waitFor(() => {
        expect(execCommand).toHaveBeenCalledWith('copy')
      })
      expect(writeText).toHaveBeenCalledWith('npm run verify')
      expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
    } finally {
      Object.defineProperty(document, 'execCommand', {
        configurable: true,
        value: originalExecCommand,
      })
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: originalClipboard,
      })
    }
  })
})
