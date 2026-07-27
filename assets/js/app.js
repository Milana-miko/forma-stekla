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

async function submitForm(form) {
  const status = form.querySelector('.form-status');
  const button = form.querySelector('button[type="submit"]');
  const label = button.querySelector('.button-label') || button;
  if (!validateForm(form)) return;

  if (location.protocol === 'file:') {
    const message = 'Отправка работает на опубликованном сайте. Локальный HTML можно использовать только для просмотра.';
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
    const data = new FormData(form);
    const service = String(data.get('service') || 'Без уточнения').trim();
    const source = String(data.get('form_source') || 'Сайт').trim();
    const sentAt = new Intl.DateTimeFormat('ru-RU', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Europe/Moscow'
    }).format(new Date());

    data.set('subject', `Новая заявка: ${service} — Forma Stekla`);
    data.set('from_name', 'Forma Stekla — заявки');
    data.set('submitted_at', `${sentAt} (МСК)`);
    data.set('page_url', window.location.href);
    data.set('form_source', source);
    data.delete('started_at');
    data.delete('page_url');

    const response = await fetch(form.action, { method: 'POST', body: data, headers: { Accept: 'application/json' } });
    const payload = await response.json().catch(() => ({ success: false, message: 'Сервис вернул некорректный ответ.' }));
    if (!response.ok || !payload.success) throw new Error(payload.message || 'Не удалось отправить заявку.');
    const successMessage = 'Спасибо! Ваша заявка отправлена. Мы свяжемся с вами в ближайшее время.';
    status.className = 'form-status success';
    status.textContent = successMessage;
    showToast(successMessage, 'success');
    localStorage.setItem('formaLastSubmit', String(Date.now()));
    form.reset();
    form.dataset.startedAt = String(Date.now());
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
