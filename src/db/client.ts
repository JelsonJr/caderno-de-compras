import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { connectionOptions, SESSION_SETUP_SQL } from './options.ts';

export const pool = mysql.createPool({ ...connectionOptions, connectionLimit: 5 });

// Os comandos de uma conexão rodam em fila, então o ajuste de sessão vem antes de qualquer
// consulta. Se ele falhar, a conexão é descartada: melhor um erro do que datas no fuso errado.
pool.pool.on('connection', (connection) => {
  connection.query(SESSION_SETUP_SQL, (error) => {
    if (error !== null) {
      connection.destroy();
    }
  });
});

export const db = drizzle({ client: pool });
