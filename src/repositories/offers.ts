import { eq } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { offers } from '../db/schema.ts';
import { $offer, type Offer, type OfferInput } from '../models/offer.ts';

function toColumns(input: OfferInput) {
  return {
    seller: input.seller,
    url: input.url ?? null,
    priceCents: input.price ?? null,
    condition: input.condition ?? null,
    installments: input.installments ?? null,
    installmentCents: input.installmentValue ?? null,
    // "Sem juros" só tem sentido quando há parcelamento
    interestFree: input.installments === undefined ? null : input.interestFree,
    shippingCents: input.shipping ?? null,
    location: input.location ?? null,
    notes: input.notes ?? null,
  };
}

export async function listOffersByItem(itemId: number): Promise<Offer[]> {
  const rows = await db.select().from(offers).where(eq(offers.itemId, itemId)).orderBy(offers.id);

  return $offer.array().parse(rows);
}

export async function findOfferById(id: number): Promise<Offer | undefined> {
  const [row] = await db.select().from(offers).where(eq(offers.id, id));

  return row === undefined ? undefined : $offer.parse(row);
}

export async function createOffer(itemId: number, input: OfferInput): Promise<number> {
  const [result] = await db.insert(offers).values({ itemId, ...toColumns(input) });

  return result.insertId;
}

export async function updateOffer(id: number, input: OfferInput): Promise<boolean> {
  const [result] = await db.update(offers).set(toColumns(input)).where(eq(offers.id, id));

  return result.affectedRows > 0;
}

// Se era a oferta escolhida, a FK (ON DELETE SET NULL) limpa items.chosen_offer_id
export async function deleteOffer(id: number): Promise<boolean> {
  const [result] = await db.delete(offers).where(eq(offers.id, id));

  return result.affectedRows > 0;
}

export async function setOfferAvailable(id: number, available: boolean): Promise<boolean> {
  const [result] = await db.update(offers).set({ available }).where(eq(offers.id, id));

  return result.affectedRows > 0;
}
