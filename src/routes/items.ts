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
import { $itemInput, $itemStatus, type Item } from '../models/item.ts';
import { sortOffersByCost } from '../models/offer.ts';
import {
  clearChosenOffer,
  createItem,
  deleteItem,
  findItemById,
  listItems,
  setItemStatus,
  updateItem,
} from '../repositories/items.ts';
import { listOffersByItem } from '../repositories/offers.ts';

const $listQuery = z.object({ status: $itemStatus.optional().catch(undefined) });
const $statusBody = z.object({ status: $itemStatus });

export interface FormPage {
  heading: string;
  action: string;
  cancelUrl: string;
}

const NEW_ITEM_PAGE: FormPage = { heading: 'Novo item', action: '/items', cancelUrl: '/' };

export const itemUrl = (id: number) => `/items/${String(id)}`;

export async function getItemOr404(id: number | null): Promise<Item> {
  const item = id === null ? undefined : await findItemById(id);

  if (item === undefined) {
    throw new HttpError(404, 'Item não encontrado.');
  }

  return item;
}

export function loadItem(params: unknown): Promise<Item> {
  return getItemOr404(parseId(params));
}

// Página do item, ou só o trecho #item-detail quando a ação veio do htmx
export async function renderItemDetail(
  request: FastifyRequest,
  reply: FastifyReply,
  item: Item,
): Promise<FastifyReply> {
  const offers = sortOffersByCost(await listOffersByItem(item.id));
  // A ordenação já põe a mais barata disponível em primeiro
  const [first] = offers;

  const cheapestOfferId =
    first?.available === true && first.cost.totalCents !== null ? first.id : null;

  return render(reply, wantsPartial(request) ? 'items/_detail' : 'items/show', {
    item,
    offers,
    cheapestOfferId,
  });
}

// Ações feitas na página do item: com htmx devolve o trecho atualizado; sem JS, volta à página
export async function afterItemChange(
  request: FastifyRequest,
  reply: FastifyReply,
  itemId: number,
): Promise<FastifyReply> {
  if (!wantsPartial(request)) {
    return redirectAfterPost(request, reply, itemUrl(itemId));
  }

  return renderItemDetail(request, reply, await getItemOr404(itemId));
}

function renderItemForm(
  request: FastifyRequest,
  reply: FastifyReply,
  page: FormPage,
  values: Record<string, string>,
  errors: Record<string, string> = {},
): Promise<FastifyReply> {
  const template = wantsPartial(request) ? 'items/_form' : 'items/form';
  const statusCode = Object.keys(errors).length > 0 ? 422 : 200;

  return render(reply, template, { ...page, values, errors }, statusCode);
}

function editItemPage(item: Item): FormPage {
  return { heading: 'Editar item', action: itemUrl(item.id), cancelUrl: itemUrl(item.id) };
}

export async function itemRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', async (request, reply) => {
    const { status } = $listQuery.parse(request.query);
    const items = await listItems(status);

    return render(reply, wantsPartial(request) ? 'items/_list' : 'items/index', {
      items,
      status: status ?? '',
    });
  });

  app.get('/items/new', async (request, reply) =>
    renderItemForm(request, reply, NEW_ITEM_PAGE, {}),
  );

  app.post('/items', async (request, reply) => {
    const values = formValues(request.body);
    const parsed = $itemInput.safeParse(values);

    if (!parsed.success) {
      return renderItemForm(request, reply, NEW_ITEM_PAGE, values, fieldErrors(parsed.error));
    }

    const id = await createItem(parsed.data);

    return redirectAfterPost(request, reply, itemUrl(id));
  });

  app.get('/items/:id', async (request, reply) => {
    return renderItemDetail(request, reply, await loadItem(request.params));
  });

  app.get('/items/:id/edit', async (request, reply) => {
    const item = await loadItem(request.params);

    return renderItemForm(request, reply, editItemPage(item), {
      name: item.name,
      notes: item.notes ?? '',
    });
  });

  app.post('/items/:id', async (request, reply) => {
    const item = await loadItem(request.params);
    const values = formValues(request.body);
    const parsed = $itemInput.safeParse(values);

    if (!parsed.success) {
      return renderItemForm(request, reply, editItemPage(item), values, fieldErrors(parsed.error));
    }

    await updateItem(item.id, parsed.data);

    return redirectAfterPost(request, reply, itemUrl(item.id));
  });

  // Confirmação para quem está sem JavaScript; com htmx, vale o hx-confirm
  app.get('/items/:id/delete', async (request, reply) => {
    const item = await loadItem(request.params);

    return render(reply, 'confirmDelete', {
      title: `Excluir "${item.name}"?`,
      description: 'O item e todas as ofertas dele serão excluídos. Não dá para desfazer.',
      action: `${itemUrl(item.id)}/delete`,
      cancelUrl: itemUrl(item.id),
    });
  });

  app.post('/items/:id/delete', async (request, reply) => {
    const item = await loadItem(request.params);

    await deleteItem(item.id);

    return redirectAfterPost(request, reply, '/');
  });

  app.post('/items/:id/status', async (request, reply) => {
    const item = await loadItem(request.params);
    const body = $statusBody.safeParse(formValues(request.body));

    if (!body.success) {
      throw new HttpError(400, 'Status inválido.');
    }

    await setItemStatus(item.id, body.data.status);

    return afterItemChange(request, reply, item.id);
  });

  app.post('/items/:id/unchoose', async (request, reply) => {
    const item = await loadItem(request.params);

    await clearChosenOffer(item.id);

    return afterItemChange(request, reply, item.id);
  });
}
