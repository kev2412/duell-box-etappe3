// network.js – kapselt PeerJS (Raumcode, Verbindung) und den lokalen 1-Gerät-Testmodus.
// Alle anderen Module sprechen nur mit der Link-Schnittstelle:
//   link.send(type, data)   link.on(type, fn) -> unsubscribe   link.onStatus(fn) -> unsubscribe   link.close()
// PeerJS wird als globales `Peer` per CDN-Script in index.html geladen.

const APP_PREFIX = 'duellbox-v1-';      // schützt vor ID-Kollisionen auf dem öffentlichen PeerJS-Server
const CONNECT_TIMEOUT_MS = 12000;
const MAX_CODE_TRIES = 8;

export class NetError extends Error {
  constructor(kind, message) {
    super(message);
    this.name = 'NetError';
    this.kind = kind;
  }
}

/* ------------------------------------------------------------------ */
/* Gemeinsame Basis                                                    */
/* ------------------------------------------------------------------ */

class Link {
  constructor(role) {
    this.role = role;               // 'host' | 'guest'
    this.connected = false;
    this._handlers = new Map();
    this._statusHandlers = new Set();
  }

  on(type, fn) {
    let set = this._handlers.get(type);
    if (!set) this._handlers.set(type, (set = new Set()));
    set.add(fn);
    return () => set.delete(fn);
  }

  onStatus(fn) {
    this._statusHandlers.add(fn);
    return () => this._statusHandlers.delete(fn);
  }

  _emit(type, data) {
    for (const fn of this._handlers.get(type) ?? []) {
      try { fn(data); } catch (err) { console.error(`[network] Handler "${type}" fehlgeschlagen`, err); }
    }
  }

  _setStatus(status) {              // 'open' | 'closed'
    const wasConnected = this.connected;
    this.connected = status === 'open';
    if (status === 'closed' && !wasConnected) return;
    for (const fn of this._statusHandlers) {
      try { fn(status); } catch (err) { console.error('[network] Status-Handler fehlgeschlagen', err); }
    }
  }

  send() { throw new Error('send() nicht implementiert'); }
  close() { /* überschrieben */ }
}

/* ------------------------------------------------------------------ */
/* PeerJS-Verbindung                                                   */
/* ------------------------------------------------------------------ */

class PeerLink extends Link {
  constructor(role, peer) {
    super(role);
    this.peer = peer;
    this.conn = null;
  }

  _bind(conn) {
    this.conn = conn;
    conn.on('data', (raw) => {
      // Eingehende Daten sind unvertrauenswürdig: nur Objekte mit String-Typ weiterreichen.
      if (!raw || typeof raw !== 'object' || typeof raw.t !== 'string') return;
      this._emit(raw.t, raw.d);
    });
    conn.on('close', () => this._setStatus('closed'));
    conn.on('error', () => this._setStatus('closed'));
    this._setStatus('open');
  }

  send(type, data) {
    if (this.conn && this.conn.open) this.conn.send({ t: type, d: data });
  }

  close() {
    try { this.conn?.close(); } catch { /* schon zu */ }
    try { this.peer?.destroy(); } catch { /* schon zu */ }
    this._setStatus('closed');
  }
}

function assertPeerJs() {
  if (typeof window.Peer !== 'function') {
    throw new NetError('no-peerjs', 'PeerJS konnte nicht geladen werden. Bitte Internetverbindung prüfen und Seite neu laden.');
  }
}

function randomCode() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0] % 10000).padStart(4, '0');
}

function toNetError(err) {
  if (err instanceof NetError) return err;
  switch (err?.type) {
    case 'peer-unavailable': return new NetError('no-room', 'Raum nicht gefunden. Bitte Code prüfen.');
    case 'unavailable-id':   return new NetError('id-taken', 'Raumcode bereits vergeben.');
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed':    return new NetError('network', 'Keine Verbindung zum Vermittlungsserver. Bitte Internet prüfen.');
    default:                 return new NetError('unknown', 'Verbindung fehlgeschlagen. Bitte erneut versuchen.');
  }
}

function openPeer(id) {
  return new Promise((resolve, reject) => {
    const peer = new window.Peer(id || undefined, { debug: 1 });
    const timer = setTimeout(() => {
      try { peer.destroy(); } catch { /* egal */ }
      reject(new NetError('timeout', 'Zeitüberschreitung beim Verbinden. Bitte erneut versuchen.'));
    }, CONNECT_TIMEOUT_MS);
    peer.once('open', () => { clearTimeout(timer); resolve(peer); });
    peer.once('error', (err) => {
      clearTimeout(timer);
      try { peer.destroy(); } catch { /* egal */ }
      reject(err);
    });
  });
}

/**
 * Raum erstellen. Liefert sofort den Code; `guest` löst auf, sobald der Mitspieler verbunden ist.
 * @returns {Promise<{code: string, guest: Promise<Link>, cancel: () => void}>}
 */
export async function createRoom() {
  assertPeerJs();
  let peer = null;
  let code = '';
  for (let i = 0; i < MAX_CODE_TRIES && !peer; i++) {
    code = randomCode();
    try {
      peer = await openPeer(APP_PREFIX + code);
    } catch (err) {
      if (err?.type !== 'unavailable-id') throw toNetError(err);
    }
  }
  if (!peer) throw new NetError('no-code', 'Kein freier Raumcode gefunden. Bitte erneut versuchen.');

  const link = new PeerLink('host', peer);
  const guest = new Promise((resolve, reject) => {
    peer.on('connection', (conn) => {
      if (link.conn) {
        // Raum ist voll: Verbindung höflich abweisen.
        conn.on('open', () => {
          conn.send({ t: 'room-full' });
          setTimeout(() => conn.close(), 300);
        });
        return;
      }
      link.conn = conn;             // Platz sofort reservieren
      conn.on('open', () => { link._bind(conn); resolve(link); });
      conn.on('close', () => { if (!link.connected && link.conn === conn) link.conn = null; });
    });
    peer.on('error', (err) => { if (!link.connected) reject(toNetError(err)); });
  });

  return { code, guest, cancel: () => { try { peer.destroy(); } catch { /* egal */ } } };
}

/** Raum beitreten. Löst mit dem Link auf, sobald die Verbindung steht. */
export async function joinRoom(code) {
  assertPeerJs();
  if (!/^\d{4}$/.test(code)) throw new NetError('bad-code', 'Bitte einen 4-stelligen Code eingeben.');
  let peer;
  try { peer = await openPeer(); } catch (err) { throw toNetError(err); }

  return new Promise((resolve, reject) => {
    const link = new PeerLink('guest', peer);
    const conn = peer.connect(APP_PREFIX + code, { reliable: true, serialization: 'json' });
    const fail = (err) => {
      clearTimeout(timer);
      try { peer.destroy(); } catch { /* egal */ }
      reject(toNetError(err));
    };
    const timer = setTimeout(
      () => fail(new NetError('timeout', 'Raum nicht erreichbar. Bitte Code prüfen und erneut versuchen.')),
      CONNECT_TIMEOUT_MS,
    );
    peer.on('error', fail);
    conn.on('error', fail);
    conn.on('open', () => {
      clearTimeout(timer);
      peer.off('error', fail);
      link._bind(conn);
      resolve(link);
    });
  });
}

/* ------------------------------------------------------------------ */
/* Lokaler 1-Gerät-Testmodus                                           */
/* ------------------------------------------------------------------ */

class LocalLink extends Link {
  constructor(role) {
    super(role);
    this.other = null;
  }

  send(type, data) {
    const other = this.other;
    if (!other || !this.connected) return;
    // JSON-Roundtrip bildet die echte Übertragung nach (deckt nicht serialisierbare Daten auf).
    const copy = data === undefined ? undefined : JSON.parse(JSON.stringify(data));
    setTimeout(() => other._emit(type, copy), 0);
  }

  close() {
    const other = this.other;
    this._setStatus('closed');
    if (other) other._setStatus('closed');
  }
}

/** Zwei per Loopback verbundene Links (Host, Gast) für den Test auf einem Gerät. */
export function createLocalPair() {
  const host = new LocalLink('host');
  const guest = new LocalLink('guest');
  host.other = guest;
  guest.other = host;
  host._setStatus('open');
  guest._setStatus('open');
  return [host, guest];
}
