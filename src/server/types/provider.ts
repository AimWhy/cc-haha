/**
 * Provider types — preset-based provider configuration.
 *
 * Providers are stored in ~/.claude/cc-haha/providers.json as a lightweight index.
 * The active provider's env vars are written to ~/.claude/settings.json.
 */

import { z } from 'zod'

export const ModelMappingSchema = z.object({
  main: z.string(),
  haiku: z.string(),
  sonnet: z.string(),
  opus: z.string(),
})

export const SavedProviderSchema = z.object({
  id: z.string(),
  presetId: z.string(),
  name: z.string().min(1),
  apiKey: z.string(),
  baseUrl: z.string(),
  models: ModelMappingSchema,
  notes: z.string().optional(),
})

export const ProvidersIndexSchema = z.object({
  activeId: z.string().nullable(),
  providers: z.array(SavedProviderSchema),
})

export const CreateProviderSchema = z.object({
  presetId: z.string().min(1),
  name: z.string().min(1),
  apiKey: z.string(),
  baseUrl: z.string(),
  models: ModelMappingSchema,
  notes: z.string().optional(),
})

export const UpdateProviderSchema = z.object({
  name: z.string().min(1).optional(),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  models: ModelMappingSchema.optional(),
  notes: z.string().optional(),
})

export const TestProviderSchema = z.object({
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  modelId: z.string().min(1),
})

// TypeScript types
export type ModelMapping = z.infer<typeof ModelMappingSchema>
export type SavedProvider = z.infer<typeof SavedProviderSchema>
export type ProvidersIndex = z.infer<typeof ProvidersIndexSchema>
export type CreateProviderInput = z.infer<typeof CreateProviderSchema>
export type UpdateProviderInput = z.infer<typeof UpdateProviderSchema>
export type TestProviderInput = z.infer<typeof TestProviderSchema>

export interface ProviderTestResult {
  success: boolean
  latencyMs: number
  error?: string
  modelUsed?: string
  httpStatus?: number
}
