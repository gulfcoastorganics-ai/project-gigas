import { z } from 'zod'

export const NoteEventSchema = z.object({
  id: z.string(),
  trackId: z.string(),
  clipId: z.string(),
  pitch: z.number().int().min(0).max(127),
  startBeat: z.number().min(0),
  durationBeats: z.number().min(0.25),
  velocity: z.number().min(0).max(1),
  probability: z.number().min(0).max(1).optional(),
  articulation: z.enum(['normal','staccato','legato','accent']).optional().default('normal'),
})

export const DrumEventSchema = z.object({
  id: z.string(),
  trackId: z.string(),
  sound: z.enum(['kick','snare','clap','closed_hat','open_hat','tom','ride','crash','fx','custom']),
  startBeat: z.number().min(0),
  durationBeats: z.number().min(0.0625),
  velocity: z.number().min(0).max(1),
  probability: z.number().min(0).max(1).optional(),
  microOffsetMs: z.number().optional(),
})

export const BassEventSchema = z.object({
  id: z.string(),
  trackId: z.string(),
  startBeat: z.number().min(0),
  durationBeats: z.number().min(0.25),
  rootNote: z.number().int().min(0).max(127),
  soundId: z.string(),
  articulation: z.enum(['growl','screech','wobble','stab','sub']),
  intensity: z.number().min(0).max(1),
  modulationShape: z.string().optional().default('sine'),
  pitchMovement: z.array(z.number()).optional(),
})

export const AutomationPointSchema = z.object({
  id: z.string(),
  trackId: z.string(),
  param: z.string(),
  beat: z.number().min(0),
  value: z.number(),
  curve: z.enum(['linear','step','easeIn','easeOut','sCurve']).optional().default('linear'),
})

export const ClipSchema = z.object({
  id: z.string(),
  trackId: z.string(),
  startBeat: z.number().min(0),
  durationBeats: z.number().min(0.25),
  name: z.string().optional(),
  color: z.string().optional(),
  locked: z.boolean().optional().default(false),
  muted: z.boolean().optional().default(false),
})

export const TrackSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['drum','bass','melody','harmony','fx','audio']),
  channel: z.number().int().min(0).max(15).optional().default(0),
  volume: z.number().min(0).max(2).optional().default(1),
  pan: z.number().min(-1).max(1).optional().default(0),
  muted: z.boolean().optional().default(false),
  solo: z.boolean().optional().default(false),
  locked: z.boolean().optional().default(false),
  instrumentId: z.string().optional(),
  color: z.string().optional(),
})
