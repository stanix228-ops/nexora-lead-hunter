export const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'Nexora API',
    version: '1.0.0',
    description: `Nexora WhatsApp Hub — учёт WhatsApp-аккаунтов, CRM лидов, кампаний, сообщений, аналитики и рисков.

## Как подключиться
- **Базовый URL:** \`http://localhost:4000/api\`
- **Авторизация:** залогиньтесь через \`POST /api/auth/login\` (демо: \`admin@nexora.local\` / \`NexoraDev123!\`) и получите JWT-токен. Затем нажмите **Authorize** и вставьте \`Bearer <token>\`.
- Все эндпоинты (кроме \`auth/login\`, \`auth/register\`, \`health\`) требуют токен.
- Realtime-уведомления: **Socket.IO** на \`http://localhost:4000/socket.io\` с токеном в \`auth.token\`, события в комнаты \`user:{id}\` (например \`lead.created\`, \`conversation.updated\`, \`account.status.changed\`).`,
    contact: { name: 'Nexora' },
  },
  servers: [{ url: 'http://localhost:4000/api' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
  },
  security: [{ bearerAuth: [] }],
  tags: [
    { name: 'Auth', description: 'Вход, регистрация, выход, текущий пользователь' },
    { name: 'Accounts', description: 'WhatsApp-аккаунты и их статусы' },
    { name: 'Leads', description: 'CRM лидов: CRUD, фильтры, export, bulk-операции' },
    { name: 'Campaigns', description: 'Кампании: CRUD, статистика, серии' },
    { name: 'Conversations', description: 'Диалоги и сообщения (с provenance)' },
    { name: 'Messages', description: 'Сообщения в диалогах' },
    { name: 'Risk', description: 'Риск-мониторинг аккаунтов' },
    { name: 'Activity', description: 'Журнал действий' },
    { name: 'Import', description: 'Импорт лидов из текста и CSV' },
    { name: 'Analytics', description: 'Аналитика и воронка' },
  ],
  paths: {
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Вход по email/password',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', example: 'admin@nexora.local' },
                  password: { type: 'string', example: 'NexoraDev123!' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Успех. Возвращает JWT token и данные пользователя.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    token: { type: 'string' },
                    user: { type: 'object' },
                    expiresIn: { type: 'number' },
                  },
                },
              },
            },
          },
          401: { description: 'Неверные учётные данные' },
        },
      },
    },
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Регистрация нового пользователя',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string' },
                  password: { type: 'string', minLength: 8 },
                  name: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Создан. Возвращает token и user.' },
          409: { description: 'Email уже занят' },
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Выход (очистка cookie)',
        responses: { 200: { description: 'OK' } },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Текущий пользователь',
        responses: { 200: { description: 'Данные пользователя' } },
      },
    },
    '/accounts': {
      get: {
        tags: ['Accounts'],
        summary: 'Список аккаунтов со счётчиками и риском',
        responses: {
          200: {
            description: 'Массив аккаунтов',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    items: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          name: { type: 'string' },
                          phoneMasked: { type: 'string' },
                          status: { enum: ['ONLINE', 'OFFLINE', 'PAUSED', 'ATTENTION'] },
                          counters: { type: 'object' },
                          risk: { type: 'object', properties: { level: { type: 'string' } } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Accounts'],
        summary: 'Добавить WhatsApp-аккаунт (максимум 7)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'phone'],
                properties: {
                  name: { type: 'string' },
                  phone: { type: 'string', example: '+77001234567' },
                  countryCode: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Аккаунт создан' },
          400: { description: 'Достигнут лимит 7 аккаунтов' },
        },
      },
    },
    '/accounts/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      get: { tags: ['Accounts'], summary: 'Детали аккаунта', responses: { 200: { description: 'OK' }, 404: { description: 'Не найден' } } },
      patch: {
        tags: ['Accounts'],
        summary: 'Обновить аккаунт',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  status: { enum: ['ONLINE', 'OFFLINE', 'PAUSED', 'ATTENTION'] },
                  countryCode: { type: 'string' },
                  position: { type: 'number' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'OK' } },
      },
      delete: { tags: ['Accounts'], summary: 'Удалить аккаунт', responses: { 200: { description: 'OK' } } },
    },
    '/accounts/{id}/pause': {
      post: {
        tags: ['Accounts'],
        summary: 'Поставить аккаунт на паузу',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/accounts/{id}/resume': {
      post: {
        tags: ['Accounts'],
        summary: 'Снять с паузы / вернуть в ONLINE',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/leads': {
      get: {
        tags: ['Leads'],
        summary: 'Список лидов с фильтрами',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'number' } },
          { name: 'pageSize', in: 'query', schema: { type: 'number' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', enum: ['NEW', 'CONTACTED', 'REPLIED', 'INTERESTED', 'NEGOTIATION', 'CLIENT', 'NO_RESPONSE'] },
          { name: 'account', in: 'query', schema: { type: 'string' } },
          { name: 'city', in: 'query', schema: { type: 'string' } },
          { name: 'niche', in: 'query', schema: { type: 'string' } },
          { name: 'source', in: 'query', enum: ['WA_LINK', 'PHONE', 'INSTAGRAM', 'WEBSITE', 'CSV', 'MANUAL'] },
          { name: 'campaign', in: 'query', schema: { type: 'string' } },
          { name: 'tag', in: 'query', schema: { type: 'string' } },
          { name: 'dateFrom', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'dateTo', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'sortBy', in: 'query', enum: ['createdAt', 'companyName', 'status', 'city', 'phone', 'updatedAt'] },
          { name: 'sortDir', in: 'query', enum: ['asc', 'desc'] },
        ],
        responses: { 200: { description: 'Пагинированный список лидов' } },
      },
      post: {
        tags: ['Leads'],
        summary: 'Создать лида',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  companyName: { type: 'string' },
                  phone: { type: 'string', example: '+77001234567' },
                  whatsappUrl: { type: 'string' },
                  instagramUrl: { type: 'string' },
                  website: { type: 'string' },
                  city: { type: 'string' },
                  niche: { type: 'string' },
                  status: { enum: ['NEW', 'CONTACTED', 'REPLIED', 'INTERESTED', 'NEGOTIATION', 'CLIENT', 'NO_RESPONSE'] },
                  source: { enum: ['WA_LINK', 'PHONE', 'INSTAGRAM', 'WEBSITE', 'CSV', 'MANUAL'] },
                  notes: { type: 'string' },
                  assignedAccountId: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Лид создан' } },
      },
    },
    '/leads/export': {
      get: {
        tags: ['Leads'],
        summary: 'Экспорт лидов (CSV-файл)',
        parameters: [
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'account', in: 'query', schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'CSV-файл' } },
      },
    },
    '/leads/bulk': {
      post: {
        tags: ['Leads'],
        summary: 'Массовые операции над лидами',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['ids', 'action'],
                properties: {
                  ids: { type: 'array', items: { type: 'string' } },
                  action: { enum: ['ASSIGN_ACCOUNT', 'ADD_TAG', 'REMOVE_TAG', 'ASSIGN_CAMPAIGN', 'SET_STATUS', 'DELETE'] },
                  payload: { type: 'object', example: { status: 'CONTACTED', accountId: 'acc_1' } },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'OK' } },
      },
    },
    '/leads/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      get: { tags: ['Leads'], summary: 'Детали лида с диалогами', responses: { 200: { description: 'OK' }, 404: { description: 'Не найден' } } },
      patch: { tags: ['Leads'], summary: 'Обновить лида', requestBody: { content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'OK' } } },
      delete: { tags: ['Leads'], summary: 'Удалить лида', responses: { 200: { description: 'OK' } } },
    },
    '/campaigns': {
      get: {
        tags: ['Campaigns'],
        summary: 'Список кампаний со статистикой (воронка, счётчики)',
        responses: { 200: { description: 'Массив кампаний' } },
      },
      post: {
        tags: ['Campaigns'],
        summary: 'Создать кампанию',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string', maxLength: 120 },
                  description: { type: 'string' },
                  niche: { type: 'string' },
                  city: { type: 'string' },
                  source: { type: 'string' },
                  status: { enum: ['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED'] },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Кампания создана' } },
      },
    },
    '/campaigns/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      get: { tags: ['Campaigns'], summary: 'Кампания: статистика + 30-дневная серия', responses: { 200: { description: 'OK' }, 404: { description: 'Не найдена' } } },
      patch: { tags: ['Campaigns'], summary: 'Обновить кампанию', requestBody: { content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'OK' } } },
      delete: { tags: ['Campaigns'], summary: 'Удалить кампанию', responses: { 200: { description: 'OK' } } },
    },
    '/conversations': {
      get: {
        tags: ['Conversations'],
        summary: 'Список диалогов',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'number' } },
          { name: 'pageSize', in: 'query', schema: { type: 'number' } },
          { name: 'filter', in: 'query', enum: ['ALL', 'UNREAD', 'REPLIED', 'INTERESTED', 'NEGOTIATION', 'CLIENTS', 'NO_RESPONSE'] },
          { name: 'account', in: 'query', schema: { type: 'string' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'unreadOnly', in: 'query', schema: { type: 'boolean' } },
        ],
        responses: { 200: { description: 'Пагинированный список' } },
      },
      post: {
        tags: ['Conversations'],
        summary: 'Создать диалог',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['accountId', 'leadId'],
                properties: {
                  accountId: { type: 'string' },
                  leadId: { type: 'string' },
                  status: { enum: ['NEW', 'UNREAD', 'REPLIED', 'INTERESTED', 'NEGOTIATION', 'CLIENT', 'NO_RESPONSE'] },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Диалог создан' } },
      },
    },
    '/conversations/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      get: { tags: ['Conversations'], summary: 'Диалог со всеми сообщениями', responses: { 200: { description: 'OK' }, 404: { description: 'Не найден' } } },
      patch: {
        tags: ['Conversations'],
        summary: 'Обновить статус / прочитано',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  status: { enum: ['NEW', 'UNREAD', 'REPLIED', 'INTERESTED', 'NEGOTIATION', 'CLIENT', 'NO_RESPONSE'] },
                  unreadCount: { type: 'number' },
                  markRead: { type: 'boolean' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'OK' } },
      },
    },
    '/messages': {
      get: {
        tags: ['Messages'],
        summary: 'Сообщения (фильтр по conversationId)',
        parameters: [{ name: 'conversationId', in: 'query', schema: { type: 'string' } }],
        responses: { 200: { description: 'Массив сообщений' } },
      },
      post: {
        tags: ['Messages'],
        summary: 'Записать сообщение в диалог (с provenance)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['conversationId', 'direction', 'body'],
                properties: {
                  conversationId: { type: 'string' },
                  direction: { enum: ['INBOUND', 'OUTBOUND'] },
                  body: { type: 'string', maxLength: 10000 },
                  provenance: { enum: ['TRACKED', 'MANUAL', 'UNAVAILABLE'], default: 'MANUAL' },
                  eventType: { enum: ['MESSAGE_CREATED', 'MESSAGE_SENT', 'MESSAGE_DELIVERED', 'MESSAGE_READ', 'MESSAGE_FAILED', 'MESSAGE_RECEIVED'] },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Сообщение и обновлённый диалог' } },
      },
    },
    '/risk': {
      get: {
        tags: ['Risk'],
        summary: 'Риск-оценка по всем аккаунтам',
        responses: { 200: { description: 'Массив: аккаунт, уровень риска, сигналы, события' } },
      },
    },
    '/risk/events': {
      get: {
        tags: ['Risk'],
        summary: 'Последние 100 риск-событий',
        responses: { 200: { description: 'Массив событий' } },
      },
    },
    '/activity': {
      get: {
        tags: ['Activity'],
        summary: 'Журнал действий (пагинация)',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'number' } },
          { name: 'pageSize', in: 'query', schema: { type: 'number' } },
          { name: 'action', in: 'query', schema: { type: 'string' } },
          { name: 'entity', in: 'query', schema: { type: 'string' } },
          { name: 'entityId', in: 'query', schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Пагинированный список' } },
      },
    },
    '/activity/latest': {
      get: {
        tags: ['Activity'],
        summary: 'Последние 30 действий',
        responses: { 200: { description: 'Массив' } },
      },
    },
    '/import/analyze': {
      post: {
        tags: ['Import'],
        summary: 'Анализ текста или CSV: детекция, маппинг, дедупликация',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['mode', 'content'],
                properties: {
                  mode: { enum: ['text', 'csv'] },
                  content: { type: 'string' },
                  mapping: { type: 'object' },
                  niche: { type: 'string' },
                  city: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Анализ + предпросмотр + дедуп' } },
      },
    },
    '/import': {
      post: {
        tags: ['Import'],
        summary: 'Выполнить импорт лидов',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['mode', 'content', 'strategy'],
                properties: {
                  mode: { enum: ['text', 'csv'] },
                  content: { type: 'string' },
                  mapping: { type: 'object' },
                  strategy: { enum: ['new', 'all'] },
                  niche: { type: 'string' },
                  city: { type: 'string' },
                  source: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Результат импорта' } },
      },
    },
    '/analytics': {
      get: {
        tags: ['Analytics'],
        summary: 'Сводная аналитика: воронка, ставки, клиенты по аккаунтам/кампаниям, счётчики сообщений',
        responses: { 200: { description: 'AnalyticsSummary' } },
      },
    },
    '/analytics/funnel': {
      get: {
        tags: ['Analytics'],
        summary: 'Воронка по этапам',
        responses: { 200: { description: 'Массив этапов' } },
      },
    },
  },
} as const;