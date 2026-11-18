import * as z from 'zod';
import { optionalText } from './formFields.ts';

export const ITEM_STATUSES = ['researching', 'bought', 'gave_up'] as const;
export const $itemStatus = z.enum(ITEM_STATUSES);
export type ItemStatus = z.infer<typeof $itemStatus>;

export const ITEM_STATUS_LABELS = {
  researching: 'Pesquisando',
  bought: 'Comprado',
  gave_up: 'Desistiu',
} as const satisfies Record<ItemStatus, string>;

export type Item = z.infer<typeof $item>;
export const $item = z.object({
  id: z.int().positive(),
  name: z.string(),
  notes: z.string().nullable(),
  status: $itemStatus,
  chosenOfferId: z.int().positive().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type ItemInput = z.infer<typeof $itemInput>;
export const $itemInput = z.object({
  name: z.string().trim().min(1, 'Informe o nome do item').max(120),
  notes: optionalText(2000),
});
