import { and, eq, getTableColumns, inArray } from 'drizzle-orm';
import { orderBy } from 'es-toolkit';
import * as z from 'zod';
import { db } from '../db/client.ts';
import { items, offers } from '../db/schema.ts';
import {
  $item,
  ITEM_STATUSES,
  type Item,
  type ItemInput,
  type ItemStatus,
} from '../models/item.ts';
import { $offer, lowestAvailableCost, type Offer } from '../models/offer.ts';

export type ItemSummary = Item & { offerCount: number; lowestCostCents: number | null };

const $itemWithCount = $item.extend({ offerCount: z.int().nonnegative() });

const $offerCost = $offer.pick({
  itemId: true,
  priceCents: true,
  installments: true,
  installmentCents: true,
  shippingCents: true,
  available: true,
});

// O menor custo é calculado em JS (computeOfferCost) para seguir a mesma regra da página do item
export async function listItems(status?: ItemStatus): Promise<ItemSummary[]> {
  const rows = await db
    .select({
      ...getTableColumns(items),
      offerCount: db.$count(offers, eq(offers.itemId, items.id)),
    })
    .from(items)
    .where(status === undefined ? undefined : eq(items.status, status));

  const list = $itemWithCount.array().parse(rows);

  if (list.length === 0) {
    return [];
  }

  const costRows = await db
    .select({
      itemId: offers.itemId,
      priceCents: offers.priceCents,
      installments: offers.installments,
      installmentCents: offers.installmentCents,
      shippingCents: offers.shippingCents,
      available: offers.available,
    })
    .from(offers)
    .where(
      and(
        eq(offers.available, true),
        inArray(
          offers.itemId,
          list.map((item) => item.id),
        ),
      ),
    );

  const costsByItem = Map.groupBy($offerCost.array().parse(costRows), (offer) => offer.itemId);

  const summaries = list.map((item) => ({
    ...item,
    lowestCostCents: lowestAvailableCost(costsByItem.get(item.id) ?? []),
  }));

  return orderBy(summaries, [(item) => ITEM_STATUSES.indexOf(item.status), 'id'], ['asc', 'desc']);
}

export async function findItemById(id: number): Promise<Item | undefined> {
  const [row] = await db.select().from(items).where(eq(items.id, id));

  return row === undefined ? undefined : $item.parse(row);
}

export async function createItem(input: ItemInput): Promise<number> {
  const [result] = await db.insert(items).values({ name: input.name, notes: input.notes ?? null });

  return result.insertId;
}

export async function updateItem(id: number, input: ItemInput): Promise<boolean> {
  const [result] = await db
    .update(items)
    .set({ name: input.name, notes: input.notes ?? null })
    .where(eq(items.id, id));

  return result.affectedRows > 0;
}

// As ofertas saem junto (ON DELETE CASCADE)
export async function deleteItem(id: number): Promise<boolean> {
  const [result] = await db.delete(items).where(eq(items.id, id));

  return result.affectedRows > 0;
}

export async function setItemStatus(id: number, status: ItemStatus): Promise<boolean> {
  const [result] = await db.update(items).set({ status }).where(eq(items.id, id));

  return result.affectedRows > 0;
}

// O item vem da própria oferta, então ela é sempre deste item; a FK garante que ela existe
export async function chooseOffer(
  offer: Pick<Offer, 'id' | 'itemId'>,
  options: { markBought: boolean },
): Promise<boolean> {
  const changes = options.markBought
    ? { chosenOfferId: offer.id, status: 'bought' as const }
    : { chosenOfferId: offer.id };

  const [result] = await db.update(items).set(changes).where(eq(items.id, offer.itemId));

  return result.affectedRows > 0;
}

export async function clearChosenOffer(itemId: number): Promise<boolean> {
  const [result] = await db.update(items).set({ chosenOfferId: null }).where(eq(items.id, itemId));

  return result.affectedRows > 0;
}
