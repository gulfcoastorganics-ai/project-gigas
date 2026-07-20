import { z } from 'zod'
import { SongBlueprintSchema } from './blueprint.js'

export const RegenerationScopeSchema = z.enum([
  'entire_song', 'section', 'track', 'clip', 'sound', 'automation', 'mix', 'transition',
])

export const RegenerationRequestSchema = z.object({
  scope: RegenerationScopeSchema,
  targetId: z.string().optional(),
  instruction: z.string(),
  preserve: z.array(z.string()),
  change: z.array(z.string()),
  seed: z.number().optional(),
})

export const EditIntentSchema = z.object({
  command: z.string(),
  confidence: z.number().min(0).max(1),
  scope: RegenerationScopeSchema,
  targetId: z.string().optional(),
  parameters: z.record(z.unknown()).optional(),
  description: z.string(),
  preserve: z.array(z.string()).optional().default([]),
  change: z.array(z.string()).optional().default([]),
})

export const CritiqueIssueSchema = z.object({
  id: z.string(),
  type: z.string(),
  severity: z.number().min(0).max(10),
  message: z.string(),
  targetIds: z.array(z.string()),
  suggestedRepair: RegenerationRequestSchema.optional(),
})

export const GenerationLineageSchema = z.object({
  version: z.number(),
  parentVersion: z.number().optional(),
  seed: z.number(),
  parentSeed: z.number().optional(),
  timestamp: z.string(),
  prompt: z.string(),
  changes: z.array(z.string()).optional().default([]),
  blueprint: z.any().optional(),
})
