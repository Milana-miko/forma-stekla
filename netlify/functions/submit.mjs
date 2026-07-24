const recentRequests = new Map();

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  }
});

const clean = (value, max = 2000) => String(value || '').replace(/[<>]/g, '').trim().slice(0, max);

function clientIp(request) {
  return request.headers.get('x-nf-client-connection-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

function rateLimited(ip) {
  const now = Date.now();
  for (const [key, time] of recentRequests) if (now - time > 60_000) recentRequests.delete(key);
  const previous = recentRequests.get(ip) || 0;
  if (now - previous < 35_000) return true;
  recentRequests.set(ip, now);
  return false;
}

async function sendWeb3Forms(fields, files) {
  const accessKey = process.env.WEB3FORMS_ACCESS_KEY;
  if (!accessKey) return { configured: false, ok: false };

  const body = new FormData();
  body.set('access_key', accessKey);
  body.set('subject', `Новая заявка Forma Stekla — ${fields.service}`);
  body.set('from_name', 'Forma Stekla website');
  body.set('name', fields.name);
  body.set('phone', fields.phone);
  body.set('service', fields.service);
  body.set('message', fields.message || 'Комментарий не указан');
  body.set('form_source', fields.formSource);
  body.set('replyto', process.env.NOTIFICATION_EMAIL || 'info.forma.stekla@gmail.com');
  if (files[0]) body.set('attachment', files[0], files[0].name);
  if (files.length > 1) body.set('additional_files', `Еще ${files.length - 1} файл(а) отправлены в Telegram.`);

  const response = await fetch('https://api.web3forms.com/submit', { method: 'POST', body });
  const payload = await response.json().catch(() => ({}));
  return { configured: true, ok: response.ok && payload.success !== false, payload };
}

async function telegramCall(method, body) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', body });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) throw new Error(payload.description || `Telegram: ${method} failed`);
  return payload;
}

async function sendTelegram(fields, files) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { configured: false, ok: false };

  const text = [
    '🪟 Новая заявка Forma Stekla',
    '',
    `Имя: ${fields.name}`,
    `Телефон: ${fields.phone}`,
    `Направление: ${fields.service}`,
    `Источник: ${fields.formSource}`,
    `Комментарий: ${fields.message || 'не указан'}`,
    files.length ? `Файлы: ${files.length}` : 'Файлы: нет'
  ].join('\n');

  const messageBody = new FormData();
  messageBody.set('chat_id', chatId);
  messageBody.set('text', text);
  messageBody.set('disable_web_page_preview', 'true');
  await telegramCall('sendMessage', messageBody);

  for (const file of files) {
    const upload = new FormData();
    upload.set('chat_id', chatId);
    const isImage = file.type.startsWith('image/');
    upload.set(isImage ? 'photo' : 'document', file, file.name);
    await telegramCall(isImage ? 'sendPhoto' : 'sendDocument', upload);
  }
  return { configured: true, ok: true };
}

export default async (request) => {
  if (request.method !== 'POST') return json(405, { ok: false, message: 'Метод не поддерживается.' });

  try {
    const ip = clientIp(request);
    if (rateLimited(ip)) return json(429, { ok: false, message: 'Слишком частая отправка. Подождите около минуты.' });

    const form = await request.formData();
    if (clean(form.get('website'), 200)) return json(200, { ok: true, message: 'Заявка отправлена.' });

    const startedAt = Number(form.get('started_at') || 0);
    if (startedAt && Date.now() - startedAt < 1800) return json(400, { ok: false, message: 'Форма отправлена слишком быстро. Попробуйте ещё раз.' });

    const fields = {
      name: clean(form.get('name'), 100),
      phone: clean(form.get('phone'), 40),
      service: clean(form.get('service'), 120) || 'Не указано',
      message: clean(form.get('message'), 2000),
      formSource: clean(form.get('form_source'), 120) || 'Сайт'
    };
    if (fields.name.length < 2 || fields.phone.replace(/\D/g, '').length < 10) {
      return json(400, { ok: false, message: 'Проверьте имя и номер телефона.' });
    }
    if (!form.get('consent')) return json(400, { ok: false, message: 'Необходимо согласие на обработку данных.' });

    const files = form.getAll('attachments').filter(item => item instanceof File && item.size > 0);
    if (files.length > 3) return json(400, { ok: false, message: 'Можно прикрепить не более 3 файлов.' });
    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
    let total = 0;
    for (const file of files) {
      total += file.size;
      if (!allowed.has(file.type)) return json(400, { ok: false, message: `Недопустимый формат файла: ${file.name}` });
      if (file.size > 4.5 * 1024 * 1024) return json(400, { ok: false, message: `Файл ${file.name} превышает 4,5 МБ.` });
    }
    if (total > 4.5 * 1024 * 1024) return json(400, { ok: false, message: 'Общий размер файлов превышает 4,5 МБ.' });

    const [emailResult, telegramResult] = await Promise.allSettled([
      sendWeb3Forms(fields, files),
      sendTelegram(fields, files)
    ]);

    const email = emailResult.status === 'fulfilled' ? emailResult.value : { configured: true, ok: false };
    const telegram = telegramResult.status === 'fulfilled' ? telegramResult.value : { configured: true, ok: false };
    const configured = email.configured || telegram.configured;
    if (!configured) return json(503, { ok: false, message: 'Сервис заявок ещё не настроен. Добавьте ключи Web3Forms и Telegram в Netlify.' });
    if (!email.ok && !telegram.ok) return json(502, { ok: false, message: 'Не удалось доставить заявку. Позвоните нам или напишите в Telegram.' });

    let message = 'Спасибо! Мы получили вашу заявку и скоро свяжемся с вами.';
    if (!email.ok || !telegram.ok) message = 'Заявка получена, но один из каналов уведомлений временно недоступен.';
    return json(200, { ok: true, message });
  } catch (error) {
    console.error('Forma Stekla submit error:', error);
    return json(500, { ok: false, message: 'Произошла ошибка при отправке. Попробуйте ещё раз или свяжитесь с нами напрямую.' });
  }
};

export const config = {
  path: '/.netlify/functions/submit',
  rateLimit: { windowLimit: 3, windowSize: 60, aggregateBy: ['ip', 'domain'] }
};
