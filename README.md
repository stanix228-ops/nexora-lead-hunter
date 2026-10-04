# 🚀 Nexora — AI-Powered CRM & Lead Hunter (2GIS + Yandex Maps Scraper)

<p align="center">
  <b>Универсальная платформа для поиска B2B-клиентов, парсинга карт (Яндекс & 2ГИС) и автоматизации продаж через Telegram и WhatsApp.</b>
</p>

---

## ✨ Ключевой функционал

### 🎯 1. Умный парсер лидов (Lead Hunter)
- **Яндекс Карты (РФ & СНГ)**:
  - Глубокий парсинг организаций по городам и рубрикам без блокировок.
  - Извлечение прямых Telegram-ссылок, каналов, ботов и телефонных чатов (`t.me/+79...`).
  - Фильтры по наличию сайта, телефона и Telegram.
- **2ГИС (Казахстан, РФ, СНГ)**:
  - Автоматический сбор контактов, сайтов, соцсетей и рейтингов.
- **📋 Экспорт ссылок в 1 клик**:
  - Быстрое копирование всех найденных ссылок в столбик (Telegram, WhatsApp, Телефоны, Сайты).
  - Скачивание чистого `.txt` списка для рассылок и добавления в базы.
  - Экспорт в CSV / Excel и автоматический импорт в CRM.

### 💼 2. B2B CRM & Воронка продаж
- Канбан-доска сделок (Новые, В работе, КП отправлено, Успешно, Отказ).
- История коммуникаций и карточки клиентов.
- Теги, заметки, аналитика конверсий.

### 💬 3. WhatsApp & Мессенджер Интеграция
- Прямое подключение WhatsApp через QR-код (Baileys протокол).
- Чаты в реальном времени с клиентами прямо из интерфейса.
- Шаблоны сообщений и массовые рассылки.

### 🤖 4. AI-Агент и Автоматизация (опционально)
- Интеллектуальный автоответчик на базе LLM.
- Распознавание намерений клиента и квалификация лида.

---

## 🛠️ Стек технологий

- **Frontend:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, Lucide Icons, Framer Motion
- **Backend:** Node.js, Express, TypeScript, Prisma ORM, Baileys (WhatsApp Web API)
- **Database:** PostgreSQL
- **Scraping Engine:** Yandex Maps Geo Parser, 2GIS API / Scraper

---

## 🚀 Быстрый запуск

### 1. Клонирование репозитория
```bash
git clone https://github.com/stanix228-ops/nexora-lead-hunter.git
cd nexora-lead-hunter
```

### 2. Установка зависимостей
```bash
npm install
```

### 3. Настройка базы данных и переменных окружения
Создайте `.env` в корне или в `apps/api`:
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/nexora"
PORT=4000
```

Запустите миграции:
```bash
npx prisma db push --schema=apps/api/prisma/schema.prisma
```

### 4. Запуск в режиме разработки
```bash
# Запуск API бэкенда (порт 4000)
npm --prefix apps/api run dev

# Запуск Web интерфейса (порт 9000)
npm --prefix apps/web run dev
```

Откройте в браузере: **`http://localhost:9000`**

---

## 📄 Лицензия

MIT License © 2026 Nexora Lead Hunter
