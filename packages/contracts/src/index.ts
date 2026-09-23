import { z } from 'zod';

export const apiMessageSchema = z.object({ message: z.string() });
export type ApiMessage = z.infer<typeof apiMessageSchema>;
