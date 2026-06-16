import { z } from 'zod';
import { EmailProviderKindSchema } from './enums.js';
import { emailSchema, timeHHmmSchema } from './primitives.js';

// ---------------------------------------------------------------------------
// Settings DTO — mirrors the single-row Settings model
// ---------------------------------------------------------------------------

export const UpdateSettingsSchema = z.object({
  autoSendEnabled: z.boolean().optional(),
  sendDayOfWeek: z
    .enum(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'])
    .optional(),
  sendTime: timeHHmmSchema.optional(),
  timezone: z.string().min(1).optional(),
  activeProvider: EmailProviderKindSchema.optional(),
  fromAddress: emailSchema.optional(),
  replyTo: emailSchema.optional(),
  pipelineLeadDays: z.number().int().min(0).max(14).optional(),
});
export type UpdateSettingsDto = z.infer<typeof UpdateSettingsSchema>;
