import * as z from 'zod';

// Importado também pelos models, para valer em testes e scripts que não carregam o config.ts
z.config(z.locales.pt());
