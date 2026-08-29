const path = require('node:path');
const fs = require('node:fs');
const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, Browsers, fetchLatestWaWebVersion, DisconnectReason } = require('@whiskeysockets/baileys');

const dir = path.join(process.cwd(), 'diag_sess');
fs.mkdirSync(dir, { recursive: true });

const logger = {
  child: () => logger,
  level: 'debug',
  debug: (m, o) => console.log('  [dbg]', m, o ? JSON.stringify(o).slice(0, 400) : ''),
  info: (m, o) => console.log('  [inf]', m, o ? JSON.stringify(o).slice(0, 400) : ''),
  warn: (m, o) => console.log('  [wrn]', m, o ? JSON.stringify(o).slice(0, 400) : ''),
  error: (m, o) => console.log('  [err]', m, o ? JSON.stringify(o).slice(0, 400) : ''),
  trace: () => {},
  fatal: (m, o) => console.log('  [ftl]', m, o ? JSON.stringify(o).slice(0, 400) : ''),
  silent: () => {},
};

(async () => {
  const { state, saveCreds } = await useMultiFileAuthState(dir);
  let version;
  try {
    ({ version } = await fetchLatestWaWebVersion());
    console.log('VERSION picked:', JSON.stringify(version));
  } catch (e) {
    console.log('fetchLatestWaWebVersion FAILED:', e.message);
    version = undefined;
  }
  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    browser: Browsers.ubuntu('Chrome'),
    printQRInTerminal: false,
  });
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', (u) => {
    console.log('EVT connection.update:', JSON.stringify({
      connection: u.connection,
      qr: u.qr ? u.qr.slice(0, 60) : null,
      lastDisconnect: u.lastDisconnect?.error
        ? { name: u.lastDisconnect.error.name, msg: u.lastDisconnect.error.message, code: u.lastDisconnect.error?.output?.statusCode }
        : null,
      isNewLogin: u.isNewLogin,
    }));
    if (u.qr) console.log('RAW QR:', u.qr);
    if (u.lastDisconnect && u.connection === 'close') {
      const code = u.lastDisconnect.error?.output?.statusCode;
      console.log('CLOSED code=', code, 'msg=', u.lastDisconnect.error.message);
      if (code === DisconnectReason.loggedOut) process.exit(0);
    }
  });
  setTimeout(() => { console.log('TIMEOUT 50s, dump done'); process.exit(0); }, 50000);
})();