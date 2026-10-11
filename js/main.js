/**
 * BEST Fitness Club: поведение страницы.
 *
 * Скрипт не зависит от внешних библиотек. Все данные (цены, график) читаются
 * из разметки index.html или задаются в блоке «Настройки» ниже, поэтому для
 * обычных правок достаточно редактировать index.html.
 *
 * Содержание:
 *   1. Настройки
 *   2. Вспомогательные функции
 *   3. Анимации при прокрутке (появление, счётчики, шкалы)
 *   4. Фильтр тарифов
 *   5. Подбор абонемента
 *   6. Частые вопросы
 *   7. Просмотр фотографий
 *   8. Ленты отзывов
 *   9. Статус «Открыто / Закрыто»
 */
(() => {
  'use strict';

  /* ---------------------------------------------------------------------
   * 1. Настройки
   * ------------------------------------------------------------------- */

  /** Часовой пояс клуба (Вологда, МСК). */
  const CLUB_TIME_ZONE = 'Europe/Moscow';

  /**
   * График работы. Ключ: день недели (0 = воскресенье, 1 = понедельник ...).
   * Значение: [час открытия, минута, час закрытия, минута].
   * При изменении графика поправьте также таблицу в index.html
   * и блок структурированных данных (JSON-LD) в <head>.
   */
  const SCHEDULE = {
    1: [8, 0, 22, 0],
    2: [8, 0, 22, 0],
    3: [8, 0, 22, 0],
    4: [8, 0, 22, 0],
    5: [8, 0, 22, 0],
    6: [9, 0, 18, 0],
    0: [11, 0, 20, 0],
  };

  /**
   * Правила подбора абонемента. Поле id совпадает с атрибутом data-plan
   * у карточки тарифа в index.html: цена и название берутся оттуда.
   *   daytimeOnly: тариф действует только днём в будни
   *   maxVisits:   тариф рассчитан на ограниченное число посещений
   *   audience:    категория посетителя, для которой доступен тариф
   */
  const PLAN_RULES = [
    { id: 'unlimited' },
    { id: 'daytime', daytimeOnly: true },
    { id: 'eight-visits', maxVisits: 8 },
    { id: 'sunday', maxVisits: 8, note: 'Условие: 4 из 8 посещений приходятся на воскресенье.' },
    { id: 'student', audience: 'student', note: 'Для студентов дневного отделения.' },
    { id: 'school', audience: 'school' },
    { id: 'mom', audience: 'mom', daytimeOnly: true, note: 'Тренер оплачивается отдельно.' },
    { id: 'senior', audience: 'senior', daytimeOnly: true, note: 'Условия льготы уточняйте на рецепции.' },
  ];

  /** Среднее число недель в месяце. */
  const WEEKS_PER_MONTH = 4.3;

  /** Задержка перед сбросом stagger-эффекта, чтобы наведение не тормозило. */
  const REVEAL_CLEANUP_MS = 1200;


  /* ---------------------------------------------------------------------
   * 2. Вспомогательные функции
   * ------------------------------------------------------------------- */

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Форматирует число с пробелами между разрядами: 18900 -> «18 900». */
  const formatNumber = (value) => Math.round(value).toLocaleString('ru-RU');

  /** Склонение слова по числу: plural(5, 'раз', 'раза', 'раз'). */
  const plural = (n, one, few, many) => {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
    return many;
  };

  /** Вызывает callback один раз, когда элемент впервые появляется на экране. */
  function onceVisible(elements, callback, threshold = 0.15) {
    if (!('IntersectionObserver' in window)) {
      elements.forEach(callback);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        callback(entry.target);
        observer.unobserve(entry.target);
      });
    }, { threshold });
    elements.forEach((element) => observer.observe(element));
  }


  /* ---------------------------------------------------------------------
   * 3. Анимации при прокрутке
   * ------------------------------------------------------------------- */

  /** Плавное появление блоков с атрибутом data-reveal. */
  function initReveal() {
    const targets = $$('[data-reveal]');

    // Небольшая задержка между соседними карточками создаёт «волну».
    targets.forEach((element) => {
      const index = Array.prototype.indexOf.call(element.parentElement.children, element);
      element.style.transitionDelay = `${(index % 4) * 90}ms`;
    });

    onceVisible(targets, (element) => {
      element.classList.add('is-visible');
      // После появления задержка не нужна, иначе реакция на наведение запаздывает.
      setTimeout(() => { element.style.transitionDelay = ''; }, REVEAL_CLEANUP_MS);
    });
  }

  /** Счётчики: число плавно «набегает» от нуля до значения data-count. */
  function initCounters() {
    const counters = $$('[data-count]');
    if (prefersReducedMotion) return;

    onceVisible(counters, (element) => {
      const target = Number(element.dataset.count);
      const decimals = Number(element.dataset.decimals || 0);
      const duration = 1400;
      const start = performance.now();

      const step = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        element.textContent = (target * eased).toFixed(decimals);
        if (progress < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  /** Шкалы рейтинга заполняются при появлении на экране. */
  function initBars() {
    onceVisible($$('.bar__fill'), (element) => element.classList.add('is-visible'));
  }


  /* ---------------------------------------------------------------------
   * 4. Фильтр тарифов
   * ------------------------------------------------------------------- */

  function initTariffFilter() {
    const tabs = $('[data-tariff-tabs]');
    const cards = $$('.tariff');
    if (!tabs || !cards.length) return;

    const applyFilter = (filter) => {
      cards.forEach((card) => {
        let visible;
        if (filter === 'all') visible = true;
        else if (filter === 'popular') visible = card.hasAttribute('data-popular');
        else visible = card.dataset.category === filter;
        card.hidden = !visible;
      });
    };

    tabs.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-filter]');
      if (!button) return;
      $$('button', tabs).forEach((item) => {
        const active = item === button;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-pressed', String(active));
      });
      applyFilter(button.dataset.filter);
    });

    applyFilter($('button.is-active', tabs).dataset.filter);
  }


  /* ---------------------------------------------------------------------
   * 5. Подбор абонемента
   * ------------------------------------------------------------------- */

  function initPlanPicker() {
    const root = $('#picker');
    const result = $('#picker-result');
    const slider = $('#visits-per-week');
    const sliderOutput = $('#visits-per-week-output');
    if (!root || !result || !slider) return;

    const singleVisitPrice = Number(root.dataset.singleVisit);
    const state = { time: 'any', audience: 'adult' };

    /** Читает цену и название тарифа из карточки в разметке. */
    const readPlan = (id) => {
      const card = $(`.tariff[data-plan="${id}"]`);
      if (!card) return null;
      return {
        id,
        name: $('.tariff__title', card).textContent.trim(),
        price: Number(card.dataset.price),
      };
    };

    const render = () => {
      const perWeek = Number(slider.value);
      const visits = Math.round(perWeek * WEEKS_PER_MONTH);
      sliderOutput.textContent = `${perWeek} ${plural(perWeek, 'раз', 'раза', 'раз')}`;

      // Отбираем тарифы, подходящие под условия посетителя.
      const candidates = PLAN_RULES
        .filter((rule) => !rule.daytimeOnly || state.time === 'day')
        .filter((rule) => !rule.maxVisits || visits <= rule.maxVisits)
        .filter((rule) => !rule.audience || rule.audience === state.audience)
        .map((rule) => ({ ...readPlan(rule.id), note: rule.note }))
        .filter((plan) => plan.price);

      let best = candidates.reduce((a, b) => (b.price < a.price ? b : a));
      const payAsYouGo = visits * singleVisitPrice;

      // Если занятий мало, разовые посещения дешевле любого абонемента.
      if (payAsYouGo < best.price) {
        best = {
          name: 'Разовые посещения',
          price: payAsYouGo,
          note: `Одно посещение стоит ${singleVisitPrice} ₽.`,
        };
      }

      const savings = Math.max(0, payAsYouGo - best.price);
      const year = readPlan('year');

      result.innerHTML = `
        <span class="result__eyebrow">Тебе подойдёт</span>
        <div class="result__name">${best.name}</div>
        <div class="result__price">${formatNumber(best.price)} ₽<small> / месяц</small></div>
        <ul class="result__list">
          <li>Около ${visits} ${plural(visits, 'посещения', 'посещений', 'посещений')} в месяц, примерно ${formatNumber(best.price / visits)} ₽ за тренировку</li>
          ${savings > 0 ? `<li>Экономия ${formatNumber(savings)} ₽ в месяц по сравнению с разовыми посещениями</li>` : ''}
          ${perWeek >= 3 && year ? `<li>Годовой абонемент: ${formatNumber(year.price)} ₽, то есть около ${formatNumber(year.price / 12)} ₽ в месяц</li>` : ''}
        </ul>
        <a class="btn" href="#prices"><span class="btn__label">Все тарифы</span></a>
        <p class="result__note">${best.note ? `${best.note} ` : ''}Расчёт ориентировочный. Актуальные условия уточняйте на рецепции.</p>`;

      result.classList.remove('is-updated');
      void result.offsetWidth; // перезапуск анимации
      result.classList.add('is-updated');
    };

    // Группы переключателей: «Когда удобно» и «Кто ты».
    $$('[data-picker-group]', root).forEach((group) => {
      group.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-value]');
        if (!button) return;
        $$('button', group).forEach((item) => {
          const active = item === button;
          item.classList.toggle('is-active', active);
          item.setAttribute('aria-pressed', String(active));
        });
        state[group.dataset.pickerGroup] = button.dataset.value;
        render();
      });
    });

    slider.addEventListener('input', render);
    render();
  }


  /* ---------------------------------------------------------------------
   * 6. Частые вопросы
   * ------------------------------------------------------------------- */

  function initFaq() {
    $$('.faq__question').forEach((button) => {
      button.addEventListener('click', () => {
        const isOpen = button.closest('.faq__item').classList.toggle('is-open');
        button.setAttribute('aria-expanded', String(isOpen));
      });
    });
  }


  /* ---------------------------------------------------------------------
   * 7. Просмотр фотографий
   * ------------------------------------------------------------------- */

  function initLightbox() {
    const lightbox = $('#lightbox');
    if (!lightbox) return;
    const image = $('img', lightbox);
    let lastFocused = null;

    const open = (source) => {
      lastFocused = document.activeElement;
      image.src = source.src;
      image.alt = source.alt;
      lightbox.hidden = false;
    };

    const close = () => {
      lightbox.hidden = true;
      image.removeAttribute('src');
      if (lastFocused) lastFocused.focus();
    };

    $$('.gallery__item').forEach((item) => {
      item.addEventListener('click', () => open($('img', item)));
    });
    lightbox.addEventListener('click', close);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !lightbox.hidden) close();
    });
  }


  /* ---------------------------------------------------------------------
   * 8. Ленты отзывов
   * ------------------------------------------------------------------- */

  /** Дублирует карточки, чтобы лента крутилась бесшовно. */
  function initReviewMarquee() {
    if (prefersReducedMotion) return;
    $$('.reviews').forEach((row) => {
      const track = $('.reviews__track', row);
      Array.from(track.children).forEach((card) => {
        const copy = card.cloneNode(true);
        copy.setAttribute('aria-hidden', 'true');
        track.appendChild(copy);
      });
      row.classList.add('is-animated');
    });
  }


  /* ---------------------------------------------------------------------
   * 9. Статус «Открыто / Закрыто»
   * ------------------------------------------------------------------- */

  /** Возвращает день недели и минуты с начала суток по времени клуба. */
  function getClubTime() {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: CLUB_TIME_ZONE,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date());

    const get = (type) => parts.find((part) => part.type === type).value;
    const days = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return {
      day: days[get('weekday')],
      minutes: Number(get('hour')) * 60 + Number(get('minute')),
    };
  }

  const pad = (n) => String(n).padStart(2, '0');
  const formatTime = (hour, minute) => `${pad(hour)}:${pad(minute)}`;

  function initOpeningStatus() {
    const badges = $$('[data-open-status]');
    const rows = $$('.hours tr[data-day]');
    if (!badges.length) return;

    const update = () => {
      const { day, minutes } = getClubTime();
      const [openH, openM, closeH, closeM] = SCHEDULE[day];
      const openAt = openH * 60 + openM;
      const closeAt = closeH * 60 + closeM;

      let state;
      let text;
      if (minutes >= openAt && minutes < closeAt) {
        state = 'open';
        text = `Сейчас открыто, до ${formatTime(closeH, closeM)}`;
      } else if (minutes < openAt) {
        state = 'closed';
        text = `Сейчас закрыто, откроемся в ${formatTime(openH, openM)}`;
      } else {
        const [nextH, nextM] = SCHEDULE[(day + 1) % 7];
        state = 'closed';
        text = `Сейчас закрыто, откроемся завтра в ${formatTime(nextH, nextM)}`;
      }

      badges.forEach((badge) => {
        badge.dataset.state = state;
        badge.textContent = text;
      });
      rows.forEach((row) => row.classList.toggle('is-today', Number(row.dataset.day) === day));
    };

    update();
    setInterval(update, 60 * 1000);
  }


  /* ---------------------------------------------------------------------
   * Запуск
   * ------------------------------------------------------------------- */

  initReveal();
  initCounters();
  initBars();
  initTariffFilter();
  initPlanPicker();
  initFaq();
  initLightbox();
  initReviewMarquee();
  initOpeningStatus();
})();
