import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { isHtmx, render } from './http.ts';
import { hasValidSession } from './security/session.ts';

interface ErrorText {
  heading: string;
  message: string;
}

// Erro com status HTTP e uma mensagem que pode ser mostrada na tela
export class HttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

const BAD_REQUEST: ErrorText = {
  heading: 'Requisição inválida',
  message: 'Confira os dados enviados e tente de novo.',
};

const NOT_FOUND: ErrorText = {
  heading: 'Página não encontrada',
  message: 'O endereço não existe ou o registro foi excluído.',
};

const INTERNAL_ERROR: ErrorText = {
  heading: 'Erro interno',
  message: 'Algo deu errado do nosso lado. Tente de novo em instantes.',
};

const TEXTS_BY_STATUS = new Map<number, ErrorText>([
  [404, NOT_FOUND],
  [413, { heading: 'Envio grande demais', message: 'Reduza o texto e tente de novo.' }],
  [
    429,
    {
      heading: 'Muitas tentativas',
      message:
        'Você fez muitas requisições em pouco tempo. Aguarde alguns minutos e tente de novo.',
    },
  ],
]);

async function sendErrorPage(
  request: FastifyRequest,
  reply: FastifyReply,
  statusCode: number,
  text: ErrorText,
): Promise<FastifyReply> {
  // Nas ações do htmx, o aviso aparece na faixa #flash em vez de substituir a página
  if (isHtmx(request)) {
    reply.header('HX-Retarget', '#flash').header('HX-Reswap', 'innerHTML');

    return render(reply, 'partials/flash', text, statusCode);
  }

  return render(reply, 'error', { ...text, loggedIn: hasValidSession(request) }, statusCode);
}

export async function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const statusCode =
    error.statusCode !== undefined && error.statusCode >= 400 ? error.statusCode : 500;

  if (statusCode >= 500) {
    request.log.error(error);

    return sendErrorPage(request, reply, statusCode, INTERNAL_ERROR);
  }

  const text = TEXTS_BY_STATUS.get(statusCode) ?? BAD_REQUEST;
  // As mensagens de erro do Fastify são técnicas e em inglês; só as do HttpError vão para a tela
  const message = error instanceof HttpError ? error.message : text.message;

  return sendErrorPage(request, reply, statusCode, { heading: text.heading, message });
}

export async function notFoundHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  return sendErrorPage(request, reply, 404, NOT_FOUND);
}
