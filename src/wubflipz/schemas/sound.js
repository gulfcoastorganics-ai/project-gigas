import { z } from 'zod'

export const EnvelopeRecipeSchema = z.object({
  attack: z.number().min(0).max(10),
  decay: z.number().min(0).max(10),
  sustain: z.number().min(0).max(1),
  release: z.number().min(0).max(10),
})

export const OscillatorRecipeSchema = z.object({
  type: z.enum(['sine','square','sawtooth','triangle','custom']),
  detune: z.number().min(-1200).max(1200).optional().default(0),
  gain: z.number().min(0).max(1).optional().default(1),
  pulseWidth: z.number().min(0).max(1).optional(),
  phase: z.number().min(0).max(360).optional().default(0),
})

export const FilterRecipeSchema = z.object({
  type: z.enum(['lowpass','highpass','bandpass','notch','peaking','allpass']),
  frequency: z.number().min(20).max(20000),
  Q: z.number().min(0.1).max(20).optional().default(1),
  gain: z.number().min(-40).max(40).optional().default(0),
  envelope: EnvelopeRecipeSchema.optional(),
})

export const ModulationRecipeSchema = z.object({
  type: z.enum(['lfo','envelope','step']),
  target: z.string(),
  source: z.string().optional(),
  amount: z.number().min(0).max(1),
  rate: z.number().min(0.01).max(100).optional(),
  shape: z.enum(['sine','square','triangle','sawtooth','random']).optional().default('sine'),
})

export const EffectRecipeSchema = z.object({
  type: z.enum(['delay','reverb','distortion','compression','bitcrush','ringmod','phaser','flanger','chorus','eq']),
  enabled: z.boolean().optional().default(true),
  params: z.record(z.number()).optional().default({}),
})

export const SoundRecipeSchema = z.object({
  id: z.string(),
  type: z.enum(['drum','bass','lead','pad','fx']),
  name: z.string().optional(),
  oscillators: z.array(OscillatorRecipeSchema),
  ampEnvelope: EnvelopeRecipeSchema,
  filter: FilterRecipeSchema.optional(),
  modulation: z.array(ModulationRecipeSchema).optional().default([]),
  effects: z.array(EffectRecipeSchema).optional().default([]),
  pitchRange: z.tuple([z.number(), z.number()]).optional().default([30, 90]),
})

export function validateSoundRecipe(data) {
  return SoundRecipeSchema.safeParse(data)
}

export function clampSoundRecipe(recipe) {
  return SoundRecipeSchema.parse({
    ...recipe,
    ampEnvelope: {
      attack: Math.max(0, Math.min(10, recipe.ampEnvelope?.attack ?? 0.01)),
      decay: Math.max(0, Math.min(10, recipe.ampEnvelope?.decay ?? 0.1)),
      sustain: Math.max(0, Math.min(1, recipe.ampEnvelope?.sustain ?? 0.5)),
      release: Math.max(0, Math.min(10, recipe.ampEnvelope?.release ?? 0.5)),
    },
    filter: recipe.filter ? {
      type: recipe.filter.type || 'lowpass',
      frequency: Math.max(20, Math.min(20000, recipe.filter.frequency ?? 20000)),
      Q: Math.max(0.1, Math.min(20, recipe.filter.Q ?? 1)),
      gain: Math.max(-40, Math.min(40, recipe.filter.gain ?? 0)),
    } : undefined,
    oscillators: (recipe.oscillators || []).map(osc => ({
      type: osc.type || 'sine',
      detune: Math.max(-1200, Math.min(1200, osc.detune ?? 0)),
      gain: Math.max(0, Math.min(1, osc.gain ?? 1)),
      phase: Math.max(0, Math.min(360, osc.phase ?? 0)),
    })),
  })
}
