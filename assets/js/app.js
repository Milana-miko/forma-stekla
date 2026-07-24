const loader = document.querySelector('.page-loader');
const header = document.querySelector('.site-header');
const menuToggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('.main-nav');
const modal = document.getElementById('estimateModal');
const modalForm = document.getElementById('estimateForm');
const contactForm = document.getElementById('contactForm');
const lightbox = document.getElementById('lightbox');
const lightboxImage = lightbox.querySelector('img');
const projects = [...document.querySelectorAll('.project')];
const showAllButton = document.getElementById('showAllProjects');
const initialProjectLimit = 8;
let currentImageIndex = 0;
let activeFilter = 'all';
let allProjectsVisible = false;

window.addEventListener('load', () => setTimeout(() => loader.classList.add('hidden'), 350));
document.getElementById('year').textContent = new Date().getFullYear();
window.addEventListener('scroll', () => header.classList.toggle('scrolled', window.scrollY > 40), { passive: true });

function closeMenu() {
  menuToggle.classList.remove('active');
  nav.classList.remove('open');
  document.body.classList.remove('menu-open');
  menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.setAttribute('aria-label', 'Открыть меню');
}
menuToggle.addEventListener('click', () => {
  const open = !menuToggle.classList.contains('active');
  menuToggle.classList.toggle('active', open);
  nav.classList.toggle('open', open);
  document.body.classList.toggle('menu-open', open);
  menuToggle.setAttribute('aria-expanded', String(open));
  menuToggle.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
});
nav.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && nav.classList.contains('open')) closeMenu();
});

const observer = new IntersectionObserver(entries => entries.forEach(entry => {
  if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); }
}), { threshold: .12 });
document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

document.querySelectorAll('[data-open-modal]').forEach(button => button.addEventListener('click', () => {
  const service = button.dataset.service;
  if (service) modalForm.querySelectorAll('input[name="service"]').forEach(input => input.checked = input.value === service);
  modal.showModal();
  setTimeout(() => modalForm.querySelector('input[name="name"]')?.focus(), 80);
}));
document.querySelector('[data-close-modal]').addEventListener('click', () => modal.close());
modal.addEventListener('click', event => {
  const rect = modal.getBoundingClientRect();
  const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
  if (!inside) modal.close();
});

function validateForm(form) {
  const name = form.elements.name;
  const phone = form.elements.phone;
  const digits = phone.value.replace(/\D/g, '');
  name.setCustomValidity(name.value.trim().length >= 2 ? '' : 'Введите имя — минимум 2 символа.');
  phone.setCustomValidity(digits.length >= 10 ? '' : 'Введите корректный номер телефона.');
  return form.reportValidity();
}

const toast = document.getElementById('siteToast');
let toastTimer;
function showToast(message, type = '') {
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast visible ${type}`.trim();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = 'toast'; }, 5200);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

async function compressImage(file) {
  if (!file.type.startsWith('image/')) return file;
  const bitmap = await createImageBitmap(file);
  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
  context.fillStyle = '#fff';
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Не удалось обработать изображение.')), 'image/jpeg', .82));
  const base = file.name.replace(/\.[^.]+$/, '');
  return new File([blob], `${base}-optimized.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
}

async function prepareFiles(input, summary) {
  const selected = [...(input?.files || [])];
  if (!selected.length) return [];
  if (selected.length > 3) throw new Error('Можно прикрепить не более 3 файлов.');
  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
  if (selected.some(file => !allowed.has(file.type))) throw new Error('Разрешены только JPG, PNG, WEBP и PDF.');
  if (summary) summary.textContent = 'Подготавливаем файлы…';
  const prepared = [];
  for (const file of selected) {
    if (file.size > 4.5 * 1024 * 1024) throw new Error(`Файл «${file.name}» больше 4,5 МБ.`);
    prepared.push(await compressImage(file));
  }
  const total = prepared.reduce((sum, file) => sum + file.size, 0);
  if (total > 4.5 * 1024 * 1024) throw new Error('Общий размер файлов после обработки превышает 4,5 МБ.');
  if (summary) summary.textContent = prepared.map(file => `${file.name} — ${formatBytes(file.size)}`).join(' · ');
  return prepared;
}

document.querySelectorAll('input[name="attachments"]').forEach(input => {
  input.addEventListener('change', async () => {
    const summary = input.closest('.file-field')?.querySelector('.file-summary');
    if (!summary) return;
    summary.classList.remove('is-error');
    try {
      const files = [...input.files];
      if (files.length > 3) throw new Error('Можно выбрать не более 3 файлов.');
      summary.textContent = files.length ? files.map(file => `${file.name} — ${formatBytes(file.size)}`).join(' · ') : '';
    } catch (error) {
      summary.textContent = error.message;
      summary.classList.add('is-error');
      input.value = '';
    }
  });
});

async function submitForm(form) {
  const status = form.querySelector('.form-status');
  const button = form.querySelector('button[type="submit"]');
  const label = button.querySelector('.button-label') || button;
  if (!validateForm(form)) return;

  if (location.protocol === 'file:') {
    const message = 'Отправка работает после публикации сайта на Netlify. Локальный HTML можно использовать только для просмотра.';
    status.className = 'form-status error';
    status.textContent = message;
    showToast(message, 'error');
    return;
  }

  const lastSubmit = Number(localStorage.getItem('formaLastSubmit') || 0);
  if (Date.now() - lastSubmit < 45000) {
    const message = 'Заявка уже отправлялась недавно. Подождите около минуты.';
    status.className = 'form-status error';
    status.textContent = message;
    showToast(message, 'error');
    return;
  }

  status.className = 'form-status';
  status.textContent = '';
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  const original = label.textContent;
  label.textContent = 'Отправляем';

  try {
    const data = new FormData();
    [...form.elements].forEach(field => {
      if (!field.name || field.disabled || field.type === 'file' || field.type === 'submit') return;
      if ((field.type === 'checkbox' || field.type === 'radio') && !field.checked) return;
      data.append(field.name, field.value);
    });
    data.set('started_at', form.dataset.startedAt || String(Date.now()));
    const input = form.querySelector('input[name="attachments"]');
    const summary = input?.closest('.file-field')?.querySelector('.file-summary');
    const files = await prepareFiles(input, summary);
    files.forEach(file => data.append('attachments', file, file.name));

    const response = await fetch(form.action, { method: 'POST', body: data, headers: { Accept: 'application/json' } });
    const payload = await response.json().catch(() => ({ ok: false, message: 'Сервис вернул некорректный ответ.' }));
    if (!response.ok || !payload.ok) throw new Error(payload.message || 'Не удалось отправить заявку.');
    status.className = 'form-status success';
    status.textContent = payload.message;
    showToast(payload.message, 'success');
    localStorage.setItem('formaLastSubmit', String(Date.now()));
    form.reset();
    form.dataset.startedAt = String(Date.now());
    if (summary) summary.textContent = '';
    if (form === modalForm) setTimeout(() => modal.close(), 2400);
  } catch (error) {
    const message = error.message || 'Не удалось отправить заявку. Позвоните нам или напишите в Telegram.';
    status.className = 'form-status error';
    status.textContent = message;
    showToast(message, 'error');
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    label.textContent = original;
  }
}
[contactForm, modalForm].forEach(form => {
  form.dataset.startedAt = String(Date.now());
  form.addEventListener('submit', event => {
    event.preventDefault();
    submitForm(form);
  });
});

function matchingProjects() {
  return projects.filter(project => activeFilter === 'all' || project.dataset.category === activeFilter);
}
function updatePortfolio() {
  const matching = matchingProjects();
  projects.forEach(project => {
    const index = matching.indexOf(project);
    const matches = index !== -1;
    const withinLimit = allProjectsVisible || index < initialProjectLimit;
    project.classList.toggle('hidden', !matches);
    project.classList.toggle('project-collapsed', matches && !withinLimit);
  });
  if (showAllButton) {
    const hasMore = matching.length > initialProjectLimit;
    showAllButton.parentElement.hidden = !hasMore;
    showAllButton.textContent = allProjectsVisible ? 'Скрыть проекты' : 'Смотреть все проекты';
    showAllButton.setAttribute('aria-expanded', String(allProjectsVisible));
  }
}

document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
  activeFilter = button.dataset.filter;
  allProjectsVisible = false;
  document.querySelectorAll('[data-filter]').forEach(btn => btn.classList.remove('active'));
  button.classList.add('active');
  updatePortfolio();
}));
showAllButton?.addEventListener('click', () => {
  allProjectsVisible = !allProjectsVisible;
  updatePortfolio();
  if (!allProjectsVisible) document.getElementById('portfolio').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
updatePortfolio();

function visibleProjects() {
  return projects.filter(project => !project.classList.contains('hidden') && !project.classList.contains('project-collapsed'));
}
function openLightbox(project) {
  const visible = visibleProjects();
  currentImageIndex = visible.indexOf(project);
  lightboxImage.src = project.dataset.image;
  lightboxImage.alt = project.querySelector('img').alt;
  lightbox.showModal();
}
projects.forEach(project => {
  project.tabIndex = 0;
  project.setAttribute('role', 'button');
  project.setAttribute('aria-label', 'Открыть фотографию проекта');
  project.addEventListener('click', () => openLightbox(project));
  project.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openLightbox(project); }
  });
});
function moveLightbox(direction) {
  const visible = visibleProjects();
  if (!visible.length) return;
  currentImageIndex = (currentImageIndex + direction + visible.length) % visible.length;
  lightboxImage.src = visible[currentImageIndex].dataset.image;
  lightboxImage.alt = visible[currentImageIndex].querySelector('img').alt;
}
document.querySelector('.lightbox-close').addEventListener('click', () => lightbox.close());
document.querySelector('.lightbox-prev').addEventListener('click', () => moveLightbox(-1));
document.querySelector('.lightbox-next').addEventListener('click', () => moveLightbox(1));
document.addEventListener('keydown', event => {
  if (!lightbox.open) return;
  if (event.key === 'ArrowLeft') moveLightbox(-1);
  if (event.key === 'ArrowRight') moveLightbox(1);
});
lightbox.addEventListener('click', event => { if (event.target === lightbox) lightbox.close(); });


// PWA: offline shell and optional install button.
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
let deferredInstallPrompt;
const installButton = document.getElementById('installApp');
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  if (installButton) installButton.hidden = false;
});
installButton?.addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installButton.hidden = true;
});
window.addEventListener('appinstalled', () => { if (installButton) installButton.hidden = true; });
