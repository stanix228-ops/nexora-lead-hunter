const { Client } = require('pg');

(async () => {
  const admin = new Client({ host: '127.0.0.1', port: 5433, user: 'postgres', database: 'postgres' });
  await admin.connect();
  const enc = await admin.query("SELECT datname, pg_encoding_to_char(encoding) enc, datcollate, datctype FROM pg_database WHERE datname IN ('template1','template0','postgres')");
  console.log(JSON.stringify(enc.rows));
  try {
    await admin.query(`CREATE DATABASE nexora_utf8 TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'`);
    console.log('created nexora_utf8 OK');
  } catch (e) {
    console.log('create failed: ' + e.message);
  }
  const c = await admin.query("SELECT datname, pg_encoding_to_char(encoding) enc FROM pg_database WHERE datname='nexora_utf8'");
  console.log(JSON.stringify(c.rows));
  await admin.end();
})().catch((e) => { console.error(e.message); process.exit(1); });