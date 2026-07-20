import { z } from 'zod'

export const EnergyPointSchema = z.object({
  bar: z.number().min(0),
  value: z.number().min(0).max(1),
  label: z.string().optional(),
})

export const SongSectionSchema = z.object({
  id: z.string(),
  type: z.enum(['intro','verse','build','drop','break','bridge','outro','custom']),
  name: z.string(),
  startBar: z.number().min(0),
  lengthBars: z.number().min(1),
  energy: z.number().min(0).max(1),
  density: z.number().min(0).max(1),
  tension: z.number().min(0).max(1),
  instructions: z.array(z.string()),
})

export const InstrumentPlanSchema = z.object({
  trackId: z.string(),
  role: z.string(),
  instrument: z.string(),
  polyphony: z.number().min(1).max(16).optional().default(4),
  priority: z.number().min(0).max(10).optional().default(5),
})

export const MixIntentSchema = z.object({
  targetLUFS: z.number().min(-30).max(0).optional().default(-14),
  headroom: z.number().min(0).max(12).optional().default(6),
  stereoWidth: z.number().min(0).max(1).optional().default(0.8),
  reverbAmount: z.number().min(0).max(1).optional().default(0.2),
  subBassLevel: z.number().min(0).max(1).optional().default(0.7),
  kickLevel: z.number().min(0).max(1).optional().default(0.8),
  snareLevel: z.number().min(0).max(1).optional().default(0.6),
  leadLevel: z.number().min(0).max(1).optional().default(0.5),
  padLevel: z.number().min(0).max(1).optional().default(0.4),
  bassLevel: z.number().min(0).max(1).optional().default(0.7),
})

export const GenerationMetadataSchema = z.object({
  schemaVersion: z.number(),
  createdAt: z.string(),
  modelUsed: z.string().optional(),
  seed: z.number(),
  parentSeed: z.number().optional(),
  parentId: z.string().optional(),
  generationTimeMs: z.number().optional(),
  provider: z.string().optional(),
  prompt: z.string(),
})

export const SongBlueprintSchema = z.object({
  id: z.string(),
  version: z.number(),
  title: z.string(),
  prompt: z.string(),
  genre: z.array(z.string()),
  mood: z.array(z.string()),
  bpm: z.number().min(20).max(300),
  key: z.string(),
  scale: z.string(),
  timeSignature: z.tuple([z.number(), z.number()]),
  durationBars: z.number().min(1).max(256),
  seed: z.number(),
  energyCurve: z.array(EnergyPointSchema),
  sections: z.array(SongSectionSchema),
  instrumentation: z.array(InstrumentPlanSchema),
  mixIntent: MixIntentSchema,
  generationMetadata: GenerationMetadataSchema,
})

export function createBlueprint(data) {
  return SongBlueprintSchema.parse(data)
}

export function validateBlueprint(data) {
  const result = SongBlueprintSchema.safeParse(data)
  return result
}

export function repairBlueprint(data) {
  const result = SongBlueprintSchema.safeParse(data)
  if (result.success) return { data: result.data, repairs: [] }
  const repairs = []
  const repaired = { ...data }
  const defaults = {
    version: 1,
    genre: ['electronic'],
    mood: [],
    bpm: 140,
    key: 'C',
    scale: 'minor',
    timeSignature: [4, 4],
    durationBars: 32,
    seed: Date.now(),
    energyCurve: [],
    sections: [],
    instrumentation: [],
    mixIntent: { targetLUFS: -14, headroom: 6, stereoWidth: 0.8, reverbAmount: 0.2, subBassLevel: 0.7, kickLevel: 0.8, snareLevel: 0.6, leadLevel: 0.5, padLevel: 0.4, bassLevel: 0.7 },
    generationMetadata: { schemaVersion: 1, createdAt: new Date().toISOString(), seed: data.seed || Date.now(), prompt: data.prompt || '' },
  }
  for (const key of Object.keys(defaults)) {
    if (repaired[key] === undefined || repaired[key] === null) {
      repaired[key] = defaults[key]
      repairs.push(`Added missing field: ${key}`)
    }
  }
  if (!repaired.id) { repaired.id = crypto.randomUUID(); repairs.push('Generated missing id') }
  if (!repaired.title) { repaired.title = `Track ${repaired.id.slice(0, 8)}`; repairs.push('Generated missing title') }
  return { data: SongBlueprintSchema.parse(repaired), repairs }
}
