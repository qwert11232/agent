/**
 * Реестр шаблонов слайдов карусели — собран по мотивам базы forevercomponents.com
 * (тематические группы компонентов: типографика, списки/прогресс, дата-виз,
 * карточки, терминал, маркетинг). Клиентское — без node-импортов.
 */

export const SLIDE_TEMPLATES = [
  { id: "cover", name: "Обложка", group: "Типографика", hint: "Крупный заголовок — первый слайд, цепляет за 2 секунды" },
  { id: "point", name: "Тезис", group: "Типографика", hint: "Номер + заголовок + короткое пояснение" },
  { id: "quote", name: "Цитата", group: "Типографика", hint: "Крупная цитата с подписью — для мнений и кейсов" },
  { id: "checklist", name: "Чек-лист", group: "Списки", hint: "Список с галочками, до 5 пунктов" },
  { id: "steps", name: "Шаги", group: "Списки", hint: "Нумерованные шаги, до 4 — мини-инструкция" },
  { id: "compare", name: "До / После", group: "Карточки", hint: "Две колонки сравнения: «частая ошибка» vs «как правильно»" },
  { id: "stats", name: "Цифры", group: "Дата-виз", hint: "1–3 крупные метрики в плитках, как KPI-дашборд" },
  { id: "code", name: "Код", group: "Терминал", hint: "Окно терминала со строками кода — образ ниши IT" },
  { id: "cta", name: "Призыв", group: "Маркетинг", hint: "Крупный текст + кнопка: подписаться, написать, оставить заявку" },
  { id: "outro", name: "Финал", group: "Маркетинг", hint: "Мягкое завершение: сохранить, поделиться" },
  { id: "timeline", name: "Таймлайн", group: "Списки", hint: "Этапы по датам с вертикальной линией" },
  { id: "faq", name: "Вопрос-ответ", group: "Карточки", hint: "Частый вопрос клиента и короткий ответ" },
  { id: "price", name: "Тариф", group: "Карточки", hint: "Цена крупно + что входит" },
  { id: "bars", name: "График", group: "Дата-виз", hint: "Столбики сравнения — до / после, по месяцам" },
  { id: "ticker", name: "Газета", group: "Типографика", hint: "Бегущие строки заголовков, нео-брутализм" },
  { id: "logos", name: "Стек / клиенты", group: "Маркетинг", hint: "Плитки с названиями технологий или клиентов" },
] as const;

export type SlideTemplateId = (typeof SLIDE_TEMPLATES)[number]["id"];

export type SlideSpecLike = {
  kind: SlideTemplateId;
  title?: string;
  body?: string;
  label?: string;
  items?: string[];
  stats?: { value: string; label: string }[];
  left?: { title: string; items: string[] };
  right?: { title: string; items: string[] };
  author?: string;
  codeLines?: string[];
  button?: string;
  photo?: string | null;
  bars?: { label: string; value: number }[];
  question?: string;
  answer?: string;
  price?: string;
  period?: string;
  tags?: string[];
};

export const TEMPLATE_GROUPS = ["Типографика", "Списки", "Карточки", "Дата-виз", "Терминал", "Маркетинг"] as const;

/** Стартовое содержимое при добавлении слайда в конструкторе. */
export function defaultSpec(id: SlideTemplateId): SlideSpecLike {
  switch (id) {
    case "cover":
      return { kind: "cover", title: "Новая карусель", body: "Подзаголовок: что внутри и кому поможет" };
    case "point":
      return { kind: "point", title: "Главная мысль слайда", body: "Пояснение: почему это важно и что сделать на практике." };
    case "quote":
      return { kind: "quote", body: "Продаёт не сайт, а то, как он снимает боль клиента.", author: "Ваш эксперт" };
    case "checklist":
      return { kind: "checklist", title: "Чек-лист перед запуском", items: ["Проверьте скорость загрузки", "Один призыв на экран", "Форма короче 3 полей", "Отзывы с цифрами"] };
    case "steps":
      return { kind: "steps", title: "Как заказать разработку", items: ["Бриф — 15 минут", "Оценка и план — 1 день", "Дизайн и разработка — 2–4 недели", "Запуск и поддержка"] };
    case "compare":
      return {
        kind: "compare",
        title: "Как бывает и как правильно",
        left: { title: "Частая ошибка", items: ["Форма на 7 полей", "Текст про «мы лучшая команда»", "Кнопка «Подробнее»"] },
        right: { title: "Как правильно", items: ["Только имя и телефон", "Польза клиента в заголовке", "Конкретный призыв"] },
      };
    case "stats":
      return { kind: "stats", title: "В цифрах", stats: [{ value: "48", label: "часов до запуска лендинга" }, { value: "+31%", label: "конверсия после редизайна" }] };
    case "code":
      return { kind: "code", title: "Запуск за одну команду", codeLines: ["$ git push origin main", "+ build passed", "+ deployed to production"] };
    case "cta":
      return { kind: "cta", title: "Нужен сайт, который продаёт?", body: "Расскажите о проекте — предложим решение за 1 день.", button: "Написать в сообщения" };
    case "outro":
      return { kind: "outro", title: "Сохраните, чтобы не потерять", body: "Есть вопросы — пишите в сообщения группы." };
    case "timeline":
      return { kind: "timeline", title: "Как идёт проект", items: ["Неделя 1 — бриф и прототип", "Неделя 2 — дизайн макетов", "Неделя 3 — вёрстка и логика", "Неделя 4 — тесты и запуск"] };
    case "faq":
      return { kind: "faq", title: "Частый вопрос", question: "Сколько стоит сайт?", answer: "Лендинг — от 80 тысяч, магазин — от 250. Точную цену называем после брифа: считаем по задачам, а не «по шаблону»." };
    case "price":
      return { kind: "price", title: "Лендинг под ключ", price: "80 000 ₽", period: "срок 2 недели", items: ["Прототип и дизайн", "Адаптив под телефон", "Подключение заявок в CRM", "Месяц поддержки"] };
    case "bars":
      return { kind: "bars", title: "Конверсия до и после", bars: [{ label: "Было", value: 34 }, { label: "Стало", value: 78 }] };
    case "ticker":
      return { kind: "ticker", title: "Главное за неделю", items: ["AI пишет код", "Дизайн-системы правят бал", "Скорость = деньги"] };
    case "logos":
      return { kind: "logos", title: "С чем работаем", tags: ["Next.js", "React", "Postgres", "OpenAI", "Figma", "Docker"] };
  }
}
