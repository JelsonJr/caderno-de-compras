import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import * as z from 'zod';
import { HttpError } from '../errors.ts';
import {
  fieldErrors,
  formValues,
  parseId,
  redirectAfterPost,
  render,
  wantsPartial,
} from '../http.ts';
import { checkbox } from '../models/formFields.ts';
import type { Item } from '../models/item.ts';
import { $offerInput, type Offer } from '../models/offer.ts';
import { chooseOffer } from '../repositories/items.ts';
import {
  createOffer,
  deleteOffer,
  findOfferById,
  setOfferAvailable,
  updateOffer,
} from '../repositories/offers.ts';
import { centsToInput } from '../viewHelpers.ts';
import { afterItemChange, type FormPage, getItemOr404, itemUrl, loadItem } from './items.ts';

const $chooseBody = z.object({ markBought: checkbox });

const $availabilityBody = z.object({
  available: z.enum(['true', 'false']).transform((value) => value === 'true'),
});

const offerUrl = (id: number) => `/offers/${String(id)}`;

async function loadOffer(params: unknown): Promise<Offer> {
  const id = parseId(params);
  const offer = id === null ? undefined : await findOfferById(id);

  if (offer === undefined) {
    throw new HttpError(404, 'Oferta não encontrada.');
  }

  return offer;
}

// Dinheiro volta para o formato do formulário ("1.299,90")
function offerToValues(offer: Offer): Record<string, string> {
  return {
    seller: offer.seller,
    url: offer.url ?? '',
    price: centsToInput(offer.priceCents),
    condition: offer.condition ?? '',
    installments: offer.installments === null ? '' : String(offer.installments),
    installmentValue: centsToInput(offer.installmentCents),
    interestFree: offer.interestFree === true ? 'on' : '',
    shipping: centsToInput(offer.shippingCents),
    location: offer.location ?? '',
    notes: offer.notes ?? '',
  };
}

function newOfferPage(item: Item): FormPage {
  return {
    heading: 'Nova oferta',
    action: `${itemUrl(item.id)}/offers`,
    cancelUrl: itemUrl(item.id),
  };
}

function editOfferPage(offer: Offer): FormPage {
  return { heading: 'Editar oferta', action: offerUrl(offer.id), cancelUrl: itemUrl(offer.itemId) };
}

function renderOfferForm(
  request: FastifyRequest,
  reply: FastifyReply,
  item: Item,
  page: FormPage,
  values: Record<string, string>,
  errors: Record<string, string> = {},
): Promise<FastifyReply> {
  const template = wantsPartial(request) ? 'offers/_form' : 'offers/form';
  const statusCode = Object.keys(errors).length > 0 ? 422 : 200;

  return render(reply, template, { ...page, item, values, errors }, statusCode);
}

export async function offerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/items/:id/offers/new', async (request, reply) => {
    const item = await loadItem(request.params);

    return renderOfferForm(request, reply, item, newOfferPage(item), {});
  });

  app.post('/items/:id/offers', async (request, reply) => {
    const item = await loadItem(request.params);
    const values = formValues(request.body);
    const parsed = $offerInput.safeParse(values);

    if (!parsed.success) {
      const errors = fieldErrors(parsed.error);

      return renderOfferForm(request, reply, item, newOfferPage(item), values, errors);
    }

    await createOffer(item.id, parsed.data);

    return redirectAfterPost(request, reply, itemUrl(item.id));
  });

  app.get('/offers/:id/edit', async (request, reply) => {
    const offer = await loadOffer(request.params);
    const item = await getItemOr404(offer.itemId);

    return renderOfferForm(request, reply, item, editOfferPage(offer), offerToValues(offer));
  });

  app.post('/offers/:id', async (request, reply) => {
    const offer = await loadOffer(request.params);
    const values = formValues(request.body);
    const parsed = $offerInput.safeParse(values);

    if (!parsed.success) {
      const item = await getItemOr404(offer.itemId);
      const errors = fieldErrors(parsed.error);

      return renderOfferForm(request, reply, item, editOfferPage(offer), values, errors);
    }

    await updateOffer(offer.id, parsed.data);

    return redirectAfterPost(request, reply, itemUrl(offer.itemId));
  });

  // Confirmação para quem está sem JavaScript; com htmx, vale o hx-confirm
  app.get('/offers/:id/delete', async (request, reply) => {
    const offer = await loadOffer(request.params);

    return render(reply, 'confirmDelete', {
      title: `Excluir a oferta de "${offer.seller}"?`,
      description: 'Não dá para desfazer.',
      action: `${offerUrl(offer.id)}/delete`,
      cancelUrl: itemUrl(offer.itemId),
    });
  });

  app.post('/offers/:id/delete', async (request, reply) => {
    const offer = await loadOffer(request.params);

    await deleteOffer(offer.id);

    return afterItemChange(request, reply, offer.itemId);
  });

  app.post('/offers/:id/choose', async (request, reply) => {
    const offer = await loadOffer(request.params);
    const body = $chooseBody.safeParse(formValues(request.body));

    if (!body.success) {
      throw new HttpError(400, 'Requisição inválida.');
    }

    await chooseOffer(offer, { markBought: body.data.markBought });

    return afterItemChange(request, reply, offer.itemId);
  });

  app.post('/offers/:id/availability', async (request, reply) => {
    const offer = await loadOffer(request.params);
    const body = $availabilityBody.safeParse(formValues(request.body));

    if (!body.success) {
      throw new HttpError(400, 'Requisição inválida.');
    }

    await setOfferAvailable(offer.id, body.data.available);

    return afterItemChange(request, reply, offer.itemId);
  });
}
