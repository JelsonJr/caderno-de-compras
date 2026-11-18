import { sql } from 'drizzle-orm';
import { boolean, datetime, int, mysqlTable, text, tinyint, varchar } from 'drizzle-orm/mysql-core';
import { ITEM_STATUSES } from '../models/item.ts';
import { CONDITIONS } from '../models/offer.ts';

// Espelha as tabelas criadas pelas migrations (migrations/*.sql), que são a fonte da verdade do
// banco: chaves estrangeiras, CHECKs e índices ficam só lá.

const timestamps = {
  createdAt: datetime('created_at', { mode: 'date' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime('updated_at', { mode: 'date' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
};

export const items = mysqlTable('items', {
  id: int('id', { unsigned: true }).autoincrement().primaryKey(),
  name: varchar('name', { length: 120 }).notNull(),
  notes: text('notes'),
  status: varchar('status', { length: 20, enum: ITEM_STATUSES }).notNull().default('researching'),
  chosenOfferId: int('chosen_offer_id', { unsigned: true }),
  ...timestamps,
});

export const offers = mysqlTable('offers', {
  id: int('id', { unsigned: true }).autoincrement().primaryKey(),
  itemId: int('item_id', { unsigned: true }).notNull(),
  seller: varchar('seller', { length: 120 }).notNull(),
  url: varchar('url', { length: 2048 }),
  priceCents: int('price_cents'),
  condition: varchar('condition', { length: 20, enum: CONDITIONS }),
  installments: tinyint('installments', { unsigned: true }),
  installmentCents: int('installment_cents'),
  interestFree: boolean('interest_free'),
  shippingCents: int('shipping_cents'),
  location: varchar('location', { length: 120 }),
  notes: text('notes'),
  available: boolean('available').notNull().default(true),
  ...timestamps,
});

export const schemaMigrations = mysqlTable('schema_migrations', {
  version: varchar('version', { length: 20 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  appliedAt: datetime('applied_at', { mode: 'date' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
