import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { hashPassword } from '../security/password.ts';

const rl = createInterface({ input: stdin, output: stdout });
const password = await rl.question('Nova senha (mínimo 12 caracteres): ');
rl.close();

if (password.length < 12) {
  console.error('Senha muito curta.');
  process.exit(1);
}

console.log('\nCole esta linha no .env:\n');
console.log(`ADMIN_PASSWORD_HASH=${await hashPassword(password)}`);
