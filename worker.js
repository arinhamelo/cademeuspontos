import siteFiles from './site-files.js';

const SESSION_SECONDS = 60 * 60 * 24 * 30;
const CODE_SECONDS = 10 * 60;
const MAX_CODE_REQUESTS_PER_HOUR = 3;
const MAX_ATTACHMENT_BYTES = 1024 * 1024;
const SENDER = 'acesso@auth.arinhamelo.com.br';

/** Data de hoje no Brasil (AAAA-MM-DD). */
const todayBR = () => new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

/** Tabela nova (aditiva) das preferências de aviso por e-mail. As tabelas existentes não mudam. */
let prefsReady = null;
function ensurePrefs(env) {
  prefsReady ??= env.DB.prepare('CREATE TABLE IF NOT EXISTS alert_prefs (email TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0, origin TEXT, updated_at INTEGER NOT NULL)').run().catch(error => { prefsReady = null; throw error; });
  return prefsReady;
}

/** Data em que a compra foi marcada como recebida (usada no painel de atrasos). */
function stampReceived(next, previous) {
  if (next.status === 'received') next.receivedAt = previous?.status === 'received' && previous?.receivedAt ? previous.receivedAt : todayBR();
  else delete next.receivedAt;
}

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers },
});

const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
const digest = async value => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
const constantTimeEqual = (a, b) => {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
};
const randomHex = (size = 32) => {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
};
const normalizeEmail = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
const validEmail = value => value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const getCookie = (request, name) => {
  const raw = request.headers.get('Cookie') || '';
  const match = raw.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? match[1] : '';
};
const cookie = token => `cpm_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_SECONDS}`;
const clearCookie = 'cpm_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';

async function bodyJson(request, limit = 1_500_000) {
  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > limit) throw new Error('Arquivo muito grande. O limite é 1 MB.');
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > limit) throw new Error('Arquivo muito grande. O limite é 1 MB.');
  return JSON.parse(text);
}

async function currentUser(request, env) {
  const token = getCookie(request, 'cpm_session');
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const tokenHash = await digest(token);
  const row = await env.DB.prepare('SELECT email FROM sessions WHERE token_hash = ? AND expires_at > ?').bind(tokenHash, Date.now()).first();
  return row?.email || null;
}

function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return false;
  const fetchSite = request.headers.get('Sec-Fetch-Site');
  return !fetchSite || fetchSite === 'same-origin' || fetchSite === 'none';
}

async function requestCode(request, env) {
  let input;
  try { input = await bodyJson(request, 4096); } catch { return json({ error: 'Confira o endereço de e-mail.' }, 400); }
  const email = normalizeEmail(input.email);
  if (!validEmail(email)) return json({ error: 'Informe um endereço de e-mail válido.' }, 400);
  const now = Date.now();
  const recent = await env.DB.prepare('SELECT COUNT(*) AS total FROM login_codes WHERE email = ? AND created_at > ?').bind(email, now - 60 * 60 * 1000).first();
  if (Number(recent?.total || 0) >= MAX_CODE_REQUESTS_PER_HOUR) return json({ error: 'Você pediu várias chaves recentemente. Tente novamente daqui a uma hora.' }, 429);
  const last = await env.DB.prepare('SELECT created_at FROM login_codes WHERE email = ? ORDER BY created_at DESC LIMIT 1').bind(email).first();
  if (last && now - Number(last.created_at) < 60_000) return json({ error: 'Aguarde um minuto antes de pedir outra chave.' }, 429);

  const digits = String(crypto.getRandomValues(new Uint32Array(1))[0] % 100_000_000).padStart(8, '0');
  const id = randomHex(16);
  const codeHash = await digest(`${id}:${email}:${digits}`);
  await env.DB.prepare('INSERT INTO login_codes (id, email, code_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, email, codeHash, now, now + CODE_SECONDS * 1000).run();
  try {
    await env.EMAIL.send({
      from: SENDER,
      to: email,
      subject: 'Sua chave de acesso ao Cadê meus pontos',
      text: `Sua chave temporária é ${digits}. Ela pode ser usada uma única vez e expira em 10 minutos. Se você não pediu esta chave, ignore esta mensagem.`,
      html: `<div style="font-family:Arial,sans-serif;color:#292333;max-width:520px;margin:auto"><h1 style="color:#7416a8">Cadê meus pontos?</h1><p>Use esta chave para entrar no seu espaço pessoal:</p><p style="font-size:30px;font-weight:bold;letter-spacing:8px;color:#471367">${digits}</p><p>Ela pode ser usada uma única vez e expira em 10 minutos.</p><p style="color:#827b8c;font-size:13px">Se você não pediu esta chave, ignore esta mensagem.</p></div>`,
    });
  } catch (error) {
    await env.DB.prepare('DELETE FROM login_codes WHERE id = ?').bind(id).run();
    console.error('Email service could not deliver an access code.', error?.name || 'Error');
    return json({ error: 'Não foi possível enviar a chave agora. Tente novamente em instantes.' }, 503);
  }
  return json({ sent: true });
}

async function verifyCode(request, env) {
  let input;
  try { input = await bodyJson(request, 4096); } catch { return json({ error: 'Informe o e-mail e a chave recebida.' }, 400); }
  const email = normalizeEmail(input.email);
  const code = typeof input.code === 'string' ? input.code.trim() : '';
  if (!validEmail(email) || !/^\d{8}$/.test(code)) return json({ error: 'Confira o e-mail e a chave de 8 dígitos.' }, 400);
  const now = Date.now();
  const challenge = await env.DB.prepare('SELECT id, code_hash, attempts FROM login_codes WHERE email = ? AND used_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1').bind(email, now).first();
  if (!challenge || Number(challenge.attempts) >= 5) return json({ error: 'A chave expirou ou não é válida. Peça uma nova chave.' }, 400);
  const candidate = await digest(`${challenge.id}:${email}:${code}`);
  if (!constantTimeEqual(candidate, challenge.code_hash)) {
    await env.DB.prepare('UPDATE login_codes SET attempts = attempts + 1 WHERE id = ? AND used_at IS NULL').bind(challenge.id).run();
    return json({ error: 'A chave não confere. Confira o código e tente novamente.' }, 400);
  }
  const used = await env.DB.prepare('UPDATE login_codes SET used_at = ? WHERE id = ? AND used_at IS NULL AND attempts < 5').bind(now, challenge.id).run();
  if (Number(used.meta?.changes || 0) !== 1) return json({ error: 'A chave já foi usada. Peça uma nova chave.' }, 400);

  const existing = await env.DB.prepare('SELECT email FROM users WHERE email = ?').bind(email).first();
  await env.DB.prepare('INSERT OR IGNORE INTO users (email, created_at, last_login) VALUES (?, ?, ?)').bind(email, now, now).run();
  await env.DB.prepare('UPDATE users SET last_login = ? WHERE email = ?').bind(now, email).run();
  await env.DB.prepare('UPDATE login_codes SET used_at = COALESCE(used_at, ?) WHERE email = ?').bind(now, email).run();
  const token = randomHex(32);
  const tokenHash = await digest(token);
  await env.DB.prepare('DELETE FROM sessions WHERE email = ? OR expires_at <= ?').bind(email, now).run();
  await env.DB.prepare('INSERT INTO sessions (token_hash, email, created_at, expires_at) VALUES (?, ?, ?, ?)').bind(tokenHash, email, now, now + SESSION_SECONDS * 1000).run();
  return json({ email, firstAccess: !existing }, 200, { 'Set-Cookie': cookie(token) });
}

function validPurchase(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const id = typeof input.id === 'string' && /^[a-zA-Z0-9-]{8,80}$/.test(input.id) ? input.id : '';
  const partner = typeof input.partner === 'string' ? input.partner.trim().replace(/\s+/g, ' ').slice(0, 120) : '';
  const program = typeof input.program === 'string' ? input.program.trim().replace(/\s+/g, ' ').slice(0, 120) : '';
  const amount = Number(input.amount), factor = Number(input.factor);
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const regulation = typeof input.regulation === 'string' ? input.regulation.trim().slice(0, 1000) : '';
  if (!id || !partner || !program || !Number.isFinite(amount) || amount <= 0 || amount > 100_000_000 || !Number.isFinite(factor) || factor <= 0 || factor > 100_000) return null;
  if (!datePattern.test(input.purchaseDate) || !datePattern.test(input.dueDate)) return null;
  if (!Number.isInteger(Number(input.days)) || Number(input.days) < 0 || Number(input.days) > 10000) return null;
  if (regulation) { try { const u = new URL(regulation); if (!['http:', 'https:'].includes(u.protocol)) return null; } catch { return null; } }
  const attachment = typeof input.attachment === 'string' ? input.attachment.slice(0, 180) : '';
  const body = {
    id, partner, program, amount, factor, expected: amount * factor,
    purchaseDate: input.purchaseDate, days: Number(input.days), dayType: input.dayType === 'uteis' ? 'uteis' : 'corridos',
    dueDate: input.dueDate, order: typeof input.order === 'string' ? input.order.trim().slice(0, 120) : '',
    notes: typeof input.notes === 'string' ? input.notes.trim().slice(0, 300) : '', regulation,
    attachment, status: 'pending', createdAt: Number.isFinite(Number(input.createdAt)) ? Number(input.createdAt) : Date.now(),
  };
  return { body, attachmentData: typeof input.attachmentData === 'string' ? input.attachmentData : '' };
}

async function savePurchase(request, env, email) {
  let input;
  try { input = await bodyJson(request); } catch (error) { return json({ error: error.message || 'Não foi possível ler a compra.' }, 400); }
  const clean = validPurchase(input);
  if (!clean) return json({ error: 'Confira os dados da compra e tente novamente.' }, 400);
  let attachmentBytes = null, contentType = '';
  if (clean.attachmentData) {
    const match = clean.attachmentData.match(/^data:(application\/pdf|image\/png);base64,([a-zA-Z0-9+/=]+)$/);
    if (!match) return json({ error: 'O anexo precisa ser um PDF ou PNG válido.' }, 400);
    const decoded = atob(match[2]);
    if (decoded.length > MAX_ATTACHMENT_BYTES) return json({ error: 'O anexo deve ter até 1 MB.' }, 400);
    attachmentBytes = Uint8Array.from(decoded, c => c.charCodeAt(0));
    contentType = match[1];
    if (!clean.body.attachment) clean.body.attachment = contentType === 'application/pdf' ? 'regulamento.pdf' : 'regulamento.png';
  }
  const now = Date.now();
  const statements = [env.DB.prepare('INSERT INTO purchases (id, email, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').bind(clean.body.id, email, JSON.stringify(clean.body), now, now)];
  if (attachmentBytes) statements.push(env.DB.prepare('INSERT INTO attachments (purchase_id, email, name, content_type, data, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(clean.body.id, email, clean.body.attachment, contentType, attachmentBytes, now));
  try { await env.DB.batch(statements); } catch { return json({ error: 'Não foi possível salvar a compra. Tente novamente.' }, 500); }
  return json(clean.body, 201);
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (request.method === 'GET' && path === '/api/session') {
    const email = await currentUser(request, env);
    return json(email ? { authenticated: true, email } : { authenticated: false });
  }
  if (path.startsWith('/api/') && !sameOrigin(request)) return json({ error: 'Requisição não permitida.' }, 403);
  if (request.method === 'POST' && path === '/api/auth/request-code') return requestCode(request, env);
  if (request.method === 'POST' && path === '/api/auth/verify') return verifyCode(request, env);
  if (request.method === 'POST' && path === '/api/auth/logout') {
    const token = getCookie(request, 'cpm_session');
    if (token && /^[a-f0-9]{64}$/.test(token)) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await digest(token)).run();
    return json({ ok: true }, 200, { 'Set-Cookie': clearCookie });
  }
  if (path.startsWith('/api/')) {
    const email = await currentUser(request, env);
    if (!email) return json({ error: 'Entre com seu e-mail para continuar.' }, 401);
    if (request.method === 'GET' && path === '/api/purchases') {
      const result = await env.DB.prepare('SELECT body FROM purchases WHERE email = ? ORDER BY created_at DESC LIMIT 1000').bind(email).all();
      return json((result.results || []).map(row => JSON.parse(row.body)));
    }
    if (request.method === 'POST' && path === '/api/purchases') return savePurchase(request, env, email);
    if (path === '/api/preferences' && request.method === 'GET') {
      await ensurePrefs(env);
      const row = await env.DB.prepare('SELECT enabled FROM alert_prefs WHERE email = ?').bind(email).first();
      return json({ dueAlerts: Number(row?.enabled || 0) === 1 });
    }
    if (path === '/api/preferences' && request.method === 'PUT') {
      let input; try { input = await bodyJson(request, 4096); } catch { return json({ error: 'Requisição inválida.' }, 400); }
      await ensurePrefs(env);
      const enabled = input.dueAlerts === true ? 1 : 0;
      await env.DB.prepare('INSERT INTO alert_prefs (email, enabled, origin, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(email) DO UPDATE SET enabled = excluded.enabled, origin = excluded.origin, updated_at = excluded.updated_at')
        .bind(email, enabled, url.origin, Date.now()).run();
      return json({ dueAlerts: enabled === 1 });
    }
    const deleteMatch = path.match(/^\/api\/purchases\/([a-zA-Z0-9-]{8,80})$/);
    if (request.method === 'DELETE' && deleteMatch) {
      const result = await env.DB.batch([
        env.DB.prepare('DELETE FROM attachments WHERE purchase_id = ? AND email = ?').bind(deleteMatch[1], email),
        env.DB.prepare('DELETE FROM purchases WHERE id = ? AND email = ?').bind(deleteMatch[1], email),
      ]);
      if (Number(result[1]?.meta?.changes || 0) !== 1) return json({ error: 'Compra não encontrada.' }, 404);
      return json({ ok: true });
    }
    const attachmentMatch = path.match(/^\/api\/purchases\/([a-zA-Z0-9-]{8,80})\/attachment$/);
    if (request.method === 'GET' && attachmentMatch) {
      const file = await env.DB.prepare('SELECT name, content_type, data FROM attachments WHERE purchase_id = ? AND email = ?').bind(attachmentMatch[1], email).first();
      if (!file) return json({ error: 'Anexo não encontrado.' }, 404);
      const name = String(file.name).replace(/[\r\n"\\]/g, '_');
      return new Response(file.data, { headers: { 'Content-Type': file.content_type, 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
    const purchaseMatch = path.match(/^\/api\/purchases\/([a-zA-Z0-9-]{8,80})$/);
    if ((request.method === 'PATCH' || request.method === 'PUT') && purchaseMatch) {
      let input; try { input = await bodyJson(request, 1_500_000); } catch { return json({ error: 'Requisição inválida.' }, 400); }
      const row = await env.DB.prepare('SELECT body FROM purchases WHERE id = ? AND email = ?').bind(purchaseMatch[1], email).first();
      if (!row) return json({ error: 'Compra não encontrada.' }, 404);
      const body = JSON.parse(row.body);
      if (request.method === 'PUT') {
        const clean = validPurchase({ ...body, ...input, id: body.id, attachmentData: input.attachmentData || '' });
        if (!clean) return json({ error: 'Confira os dados do lançamento.' }, 400);
        const next = { ...clean.body, createdAt: body.createdAt };
        const receivedTotal = Number(input.received ?? body.received ?? 0);
        if (!Number.isFinite(receivedTotal) || receivedTotal < 0 || receivedTotal > next.expected) return json({ error: 'Os pontos recebidos não podem ser negativos nem superar o total esperado.' }, 400);
        if (receivedTotal >= next.expected - 0.000001) {
          next.status = 'received'; next.received = next.expected;
        } else {
          next.status = 'pending';
          if (receivedTotal > 0) next.received = receivedTotal; else delete next.received;
        }
        stampReceived(next, body);
        if (body.alertedFor && body.alertedFor === next.dueDate) next.alertedFor = body.alertedFor;
        let attachmentBytes = null, contentType = '';
        if (clean.attachmentData) {
          const match = clean.attachmentData.match(/^data:(application\/pdf|image\/png);base64,([a-zA-Z0-9+/=]+)$/);
          if (!match) return json({ error: 'O anexo precisa ser um PDF ou PNG válido.' }, 400);
          const decoded = atob(match[2]);
          if (decoded.length > MAX_ATTACHMENT_BYTES) return json({ error: 'O anexo deve ter até 1 MB.' }, 400);
          attachmentBytes = Uint8Array.from(decoded, c => c.charCodeAt(0)); contentType = match[1];
          if (!next.attachment) next.attachment = contentType === 'application/pdf' ? 'regulamento.pdf' : 'regulamento.png';
        } else if (input.removeAttachment === true) next.attachment = '';
        const statements = [env.DB.prepare('UPDATE purchases SET body = ?, updated_at = ? WHERE id = ? AND email = ?').bind(JSON.stringify(next), Date.now(), purchaseMatch[1], email)];
        if (attachmentBytes || input.removeAttachment === true) statements.push(env.DB.prepare('DELETE FROM attachments WHERE purchase_id = ? AND email = ?').bind(purchaseMatch[1], email));
        if (attachmentBytes) statements.push(env.DB.prepare('INSERT INTO attachments (purchase_id, email, name, content_type, data, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(purchaseMatch[1], email, next.attachment, contentType, attachmentBytes, Date.now()));
        try { await env.DB.batch(statements); } catch { return json({ error: 'Não foi possível atualizar o lançamento.' }, 500); }
        return json(next);
      }
      const previousStatus = body.status, previousReceivedAt = body.receivedAt;
      if (input.receivedTotal !== undefined) {
        const total = Number(input.receivedTotal), expected = Number(body.expected);
        if (!Number.isFinite(total) || total < 0 || total > expected) return json({ error: `Informe o total recebido entre 0 e ${Math.ceil(expected)} pontos.` }, 400);
        body.received = total;
        body.status = total >= expected - 0.000001 ? 'received' : 'pending';
        if (total === 0) delete body.received;
      } else if (input.receivedNow !== undefined) {
        const amount = Number(input.receivedNow), current = Number(body.received || 0), left = Math.max(0, Number(body.expected) - current);
        if (!Number.isFinite(amount) || amount <= 0 || amount > left + 0.000001) return json({ error: `Informe um valor entre 1 e ${Math.ceil(left)} pontos.` }, 400);
        body.received = Math.min(Number(body.expected), current + amount);
        body.status = body.received >= Number(body.expected) - 0.000001 ? 'received' : 'pending';
      } else if (input.status === 'pending') {
        body.status = 'pending'; delete body.received;
      } else if (input.status === 'received') {
        body.status = 'received'; body.received = body.expected;
      } else return json({ error: 'Informe o recebimento ou uma situação válida.' }, 400);
      stampReceived(body, { status: previousStatus, receivedAt: previousReceivedAt });
      await env.DB.prepare('UPDATE purchases SET body = ?, updated_at = ? WHERE id = ? AND email = ?').bind(JSON.stringify(body), Date.now(), purchaseMatch[1], email).run();
      return json(body);
    }
    return json({ error: 'Rota não encontrada.' }, 404);
  }
  return json({ error: 'Rota não encontrada.' }, 404);
}

function staticResponse(path) {
  const name = path === '/' ? '/index.html' : path;
  const contentType = { '/index.html': 'text/html; charset=utf-8', '/styles.css': 'text/css; charset=utf-8', '/app.js': 'text/javascript; charset=utf-8', '/pontos-mark.svg': 'image/svg+xml' }[name];
  if (!contentType || !Object.hasOwn(siteFiles, name)) return new Response('Not found', { status: 404 });
  return new Response(siteFiles[name], { headers: { 'Content-Type': contentType, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' } });
}

const pointsBR = value => Math.round(Number(value || 0)).toLocaleString('pt-BR');
const dateBR = value => { const [y, m, d] = String(value || '').split('-'); return d ? `${d}/${m}/${y}` : '—'; };
const escHtml = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Aviso diário (Cron da Cloudflare): para quem ativou o aviso, um e-mail com as compras que passaram
 * do prazo e ainda não foram recebidas. Cada compra é avisada uma vez por data prevista (campo alertedFor).
 */
async function sendDueAlerts(env) {
  await ensurePrefs(env);
  const today = todayBR();
  const prefs = await env.DB.prepare('SELECT email, origin FROM alert_prefs WHERE enabled = 1').all();
  for (const pref of prefs.results || []) {
    try {
      const rows = await env.DB.prepare('SELECT id, body FROM purchases WHERE email = ?').bind(pref.email).all();
      const due = (rows.results || []).map(r => JSON.parse(r.body)).filter(p => p.status !== 'received' && p.dueDate && p.dueDate < today && Number(p.expected || 0) - Number(p.received || 0) > 0 && p.alertedFor !== p.dueDate);
      if (!due.length) continue;
      const origin = pref.origin || '';
      const items = due.slice(0, 20).map(p => {
        const left = Number(p.expected || 0) - Number(p.received || 0);
        const link = origin ? `${origin}/?compra=${encodeURIComponent(p.id)}` : '';
        return { p, left, link };
      });
      const text = `Olá! Estas compras passaram do prazo e os pontos ainda não foram registrados como recebidos:\n\n${items.map(({ p, left, link }) => `• ${p.partner} (${p.program}): ${pointsBR(left)} pontos, previstos para ${dateBR(p.dueDate)}${link ? `\n  ${link}` : ''}`).join('\n')}\n\nSe os pontos já entraram, registre o recebimento no app. Se não, abra a compra e use o modelo de reclamação pronto.\n\nPara deixar de receber estes avisos, desative-os na tela inicial do Cadê meus pontos.`;
      const html = `<div style="font-family:Arial,sans-serif;color:#292333;max-width:560px;margin:auto"><h1 style="color:#7416a8;font-size:22px">Cadê meus pontos?</h1><p>Estas compras passaram do prazo e os pontos ainda não foram registrados como recebidos:</p><ul style="padding-left:18px">${items.map(({ p, left, link }) => `<li style="margin-bottom:10px"><strong>${escHtml(p.partner)}</strong> (${escHtml(p.program)})<br>${pointsBR(left)} pontos · previstos para ${dateBR(p.dueDate)}${link ? `<br><a href="${escHtml(link)}" style="color:#7416a8">Abrir compra e preparar a reclamação</a>` : ''}</li>`).join('')}</ul><p>Se os pontos já entraram, registre o recebimento no app.</p><p style="color:#827b8c;font-size:13px">Para deixar de receber estes avisos, desative-os na tela inicial do Cadê meus pontos.</p></div>`;
      await env.EMAIL.send({ from: SENDER, to: pref.email, subject: due.length === 1 ? `Prazo vencido: pontos da ${due[0].partner}` : `${due.length} compras passaram do prazo`, text, html });
      const now = Date.now();
      await env.DB.batch(due.map(p => env.DB.prepare('UPDATE purchases SET body = ?, updated_at = ? WHERE id = ? AND email = ?').bind(JSON.stringify({ ...p, alertedFor: p.dueDate }), now, p.id, pref.email)));
    } catch (error) {
      console.error('Due alert failed for one account.', error?.name || 'Error');
    }
  }
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendDueAlerts(env));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try { return await handleApi(request, env); }
      catch (error) { console.error('Request failed.', error?.name || 'Error'); return json({ error: 'Ocorreu um erro ao processar a solicitação.' }, 500); }
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    return staticResponse(url.pathname);
  },
};
