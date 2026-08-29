import { prisma } from './index';
import { maskPhone, buildWaLink } from '@nexora/utils';
import bcrypt from 'bcryptjs';

/* ---------------------------------------------------------------- utils */
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260816);
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
const between = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const daysAgo = (days: number, hour = between(9, 20), minute = between(0, 59)) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d;
};

/* ---------------------------------------------------------------- data */
const COMPANY_NAMES = [
  'Alpha Systems', 'Baiterek Trading', 'KazTool', 'Steppe Digital', 'Nomad Logistics',
  'Alem Fintech', 'Tulpar Construction', 'Qazaq Express', 'Zhetysu Agro', 'Sayan Group',
  'Koktem Retail', 'Orda Media', 'ZamanDev', 'Asia Agro Holding', 'Dala Build',
  'Arman Clinic', 'Shanyrak Estate', 'Kerey Edu', 'Sunkar Travel', 'Tengri Motors',
  'Otyrar Foods', 'Sapar Consulting', 'Alatau Solar', 'Egil Group', 'Kulan Steel',
  'Aigerim Beauty', 'Zher Home', 'Talasout Machinery', 'Korgau Security', 'Samruk Plastics',
  'Shymkent Textile', 'Aqmaral Fashion', 'Taraz Chemicals', 'Aktau Marine', 'Zaisan Mining',
  'Karatau Ceramics', 'Borly Furniture', 'Semey Bakery', 'Kokshe Fresh', 'Burabai Hotels',
  'Illi Technologies', 'Kairat Invest', 'Mangystau Energy', 'Ertis Paper', 'Korday Foods',
  'Zhetysu Organic', 'Astana Digital', 'Arshyn Platforms', 'Baskas Retail', 'Kyzylorda Rice',
  'Turan Express', 'Orken Media', 'Saulesh Clinic', 'Aktobe Motors', 'PavlodarAgro',
  'Kostanay Grain', 'Ridder Metals', 'Temirtau Steel Works', 'Ekibastuz Power', 'Balqash Copper',
  'Sarqan Fruits', 'Katon Tourism', 'Merki Tea', 'Shieli Rice', 'Charyn Canyon Tours',
  'Altyn-Emel Safari', 'Kazakh Tourism Co', 'Battery Tech KZ', 'Alarm Solutions', 'Fresh Mart',
  'Mega Logistic Hub', 'CargoLink', 'Silk Way Transit', 'Trans Eurasia', 'Kaz Trans Oil',
  'GreenEco Energy', 'SolarPanels KZ', 'BioFarm Plus', 'Kaz Seed', 'FitLife Studio',
  'MedPlus Clinic', 'DentalPro Astana', 'GymBox Almaty', 'RunClub KZ', 'City Fitness',
  'AppHub Studio', 'DevRel KZ', 'CloudNine SaaS', 'DataMine Analytics', 'Pixelfactory',
  'Webvia Agency', 'MarketBridge', 'LeadSales Pro', 'Digital Boom', 'SeoStorm',
  'ContentLab KZ', 'VideoRepublic', 'PhotoFrame Studio', 'SoundWave Records', 'TrendBrand',
  'LuxFamily Outlet', 'UrbanCorp', 'MegaMall', 'Plaza Retail', 'City Market',
  'Premium Cars KZ', 'MotoLife', 'E-cars Astana', 'Autopoint', 'Steering Stop',
  'KitchenStyle', 'Smart Home KZ', 'Lighting Plus', 'Furniture City', 'OfficeMax',
];

const NICHES = [
  'IT & Software', 'E-commerce', 'Retail', 'Construction', 'Logistics', 'Finance',
  'Education', 'Healthcare', 'Manufacturing', 'Hospitality', 'Food & Beverage', 'Real Estate',
];

const CITIES = [
  'Almaty', 'Astana', 'Shymkent', 'Karaganda', 'Aktobe', 'Atyrau', 'Pavlodar',
  'Semey', 'Kostanay', 'Oral', 'Taraz', 'Aktau', 'Kyzylorda', 'Petropavl',
];

const LEAD_STATUSES = [
  'NEW', 'NEW', 'NEW', 'NEW', 'CONTACTED', 'CONTACTED', 'CONTACTED', 'REPLIED',
  'REPLIED', 'INTERESTED', 'INTERESTED', 'NEGOTIATION', 'CLIENT', 'NO_RESPONSE',
] as const;

const KW = 7000000;

function makePhone(index: number): string {
  const digits = '7700' + String(1000000 + ((index * 137) % 8999999));
  return digits;
}

/* ---------------------------------------------------------------- main */
async function main() {
  console.log('Seeding Nexora demo data…');

  const adminEmail = process.env.DEMO_ADMIN_EMAIL || 'admin@nexora.local';
  const adminPassword = process.env.DEMO_ADMIN_PASSWORD || 'NexoraDev123!';

  const passwordHash = await bcrypt.hash(adminPassword, 10);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: 'Nexora Admin',
      passwordHash,
      isAdmin: true,
      isDemo: false,
    },
  });

  const existing = await prisma.lead.count({ where: { userId: admin.id } });
  if (existing > 0) {
    console.log(`Demo data already present for ${adminEmail} (${existing} leads). Skipping.`);
    return;
  }

  // ---- WhatsApp accounts (7)
  const accountNames = ['WA #1', 'WA #2', 'WA #3', 'WA #4', 'WA #5', 'WA #6', 'WA #7'];
  const accountPhones = accountNames.map((_, i) => makePhone(i + 1));
  const statusesForAccounts = [
    'ONLINE', 'ONLINE', 'ONLINE', 'PAUSED', 'ONLINE', 'ONLINE', 'ONLINE',
  ] as const;

  const accounts = [];
  for (let i = 0; i < 7; i++) {
    const digits = accountPhones[i];
    const account = await prisma.whatsAppAccount.create({
      data: {
        userId: admin.id,
        name: accountNames[i],
        phone: digits,
        phoneMasked: maskPhone(digits),
        countryCode: '+7',
        status: statusesForAccounts[i],
        position: i + 1,
        lastActiveAt: statusesForAccounts[i] === 'ONLINE' ? new Date() : null,
        isDemo: true,
      },
    });
    accounts.push(account);
  }

  // ---- Leads (100)
  const leads = [];
  for (let i = 0; i < 100; i++) {
    const companyName = COMPANY_NAMES[i % COMPANY_NAMES.length];
    const phone = makePhone(i + 100);
    const source = pick(['WA_LINK', 'PHONE', 'INSTAGRAM', 'WEBSITE', 'CSV', 'MANUAL'] as const);
    const city = pick(CITIES);
    const niche = pick(NICHES);
    const status = pick(LEAD_STATUSES) as (typeof LEAD_STATUSES)[number];
    const slug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, '');
    const assign = rand() < 0.55 ? pick(accounts) : null;

    const lead = await prisma.lead.create({
      data: {
        userId: admin.id,
        companyName,
        phone,
        whatsappUrl: buildWaLink(phone),
        instagramUrl: `https://instagram.com/${slug}`,
        website: rand() < 0.6 ? `https://www.${slug}.kz` : null,
        city,
        niche,
        source,
        status,
        notes: rand() < 0.3 ? 'Initial outreach via Nexora. Follow up advised.' : null,
        assignedAccountId: assign?.id ?? null,
        isDemo: true,
        createdAt: daysAgo(between(1, 120)),
      },
    });
    leads.push(lead);

    await prisma.activityEvent.create({
      data: {
        userId: admin.id,
        leadId: lead.id,
        action: 'LEAD_IMPORTED',
        entity: 'LEAD',
        entityId: lead.id,
        metadata: { source: lead.source, isDemo: true },
        createdAt: lead.createdAt,
      },
    });
    if (assign) {
      await prisma.activityEvent.create({
        data: {
          userId: admin.id,
          leadId: lead.id,
          action: 'LEAD_ASSIGNED',
          entity: 'LEAD',
          entityId: lead.id,
          metadata: { accountId: assign.id, accountName: assign.name, isDemo: true },
          createdAt: new Date(lead.createdAt.getTime() + 60000),
        },
      });
    }
  }

  // ---- Tags
  const tagData = [
    { name: 'hot', color: '#EF4444' },
    { name: 'reply', color: '#F59E0B' },
    { name: 'client', color: '#10B981' },
    { name: 'vip', color: '#8B5CF6' },
  ];
  const tags = [];
  for (const t of tagData) {
    tags.push(await prisma.tag.upsert({
      where: { userId_name: { userId: admin.id, name: t.name } },
      update: {},
      create: { userId: admin.id, name: t.name, color: t.color },
    }));
  }

  let tagCounter = 0;
  for (const lead of leads) {
    if (lead.status === 'CLIENT' || lead.status === 'INTERESTED') {
      const tag = tags[tagCounter % tags.length];
      tagCounter++;
      await prisma.leadTag.create({
        data: { leadId: lead.id, tagId: tag.id },
      });
      await prisma.activityEvent.create({
        data: {
          userId: admin.id,
          leadId: lead.id,
          action: 'TAG_ADDED',
          entity: 'LEAD',
          entityId: lead.id,
          metadata: { tagName: tag.name, isDemo: true },
          createdAt: daysAgo(between(1, 30)),
        },
      });
    }
  }

  // ---- Campaigns
  const campaignsData = [
    {
      name: 'Website Outreach',
      description: 'Cold outreach to companies that signed up through the website.',
      niche: 'IT & Software',
      city: 'Almaty',
      source: 'WEBSITE',
      status: 'ACTIVE' as const,
    },
    {
      name: 'Instagram Sales',
      description: 'Prospecting via Instagram brand pages and DMs.',
      niche: 'Retail',
      city: 'Astana',
      source: 'INSTAGRAM',
      status: 'ACTIVE' as const,
    },
    {
      name: 'Phone Follow-up',
      description: 'Follow-up campaign for leads that did not respond initially.',
      niche: 'Logistics',
      city: 'Shymkent',
      source: 'PHONE',
      status: 'PAUSED' as const,
    },
  ];

  const campaigns = [];
  for (let i = 0; i < campaignsData.length; i++) {
    const c = await prisma.campaign.create({
      data: { userId: admin.id, isDemo: true, createdAt: daysAgo(between(10, 90)), ...campaignsData[i] },
    });
    campaigns.push(c);

    await prisma.activityEvent.create({
      data: {
        userId: admin.id,
        action: 'CAMPAIGN_CREATED',
        entity: 'CAMPAIGN',
        entityId: c.id,
        metadata: { name: c.name, isDemo: true },
        createdAt: c.createdAt,
      },
    });
  }

  // assign ~70% of leads to campaigns (campaign 1 gets most)
  for (let i = 0; i < leads.length; i++) {
    if (i % 4 === 0) continue;
    const campaign = pick(campaigns);
    await prisma.campaignLead.create({
      data: { campaignId: campaign.id, leadId: leads[i].id, addedAt: daysAgo(between(1, 60)) },
    });
  }

  // ---- Conversations + messages for lead subset
  const conversationLeads = leads.filter((_, i) => i % 2 === 0).slice(0, 40);
  for (const lead of conversationLeads) {
    const account = accounts.find((a) => a.id === lead.assignedAccountId) ?? pick(accounts);
    const status =
      lead.status === 'NEW' ? 'UNREAD' :
      lead.status === 'CONTACTED' ? 'NO_RESPONSE' :
      lead.status === 'REPLIED' ? 'REPLIED' :
      lead.status === 'INTERESTED' ? 'INTERESTED' :
      lead.status === 'NEGOTIATION' ? 'NEGOTIATION' :
      lead.status === 'CLIENT' ? 'CLIENT' : 'NO_RESPONSE';

    const outbound = [
      `Hello ${lead.companyName ?? 'there'}! We help companies like yours grow their sales. Happy to share more.`,
      'Thanks for your time today. Sending over a short summary of our services.',
      'Good morning! Following up on our previous conversation.',
    ];
    const inbound = [
      'Thanks for reaching out, sounds interesting.',
      'Can you send more details about pricing?',
      'We might be interested. What does the onboarding look like?',
      'Thanks! Let’s discuss next week.',
    ];

    const conv = await prisma.conversation.create({
      data: {
        userId: admin.id,
        accountId: account.id,
        leadId: lead.id,
        status,
        unreadCount: status === 'UNREAD' ? between(1, 3) : 0,
        lastMessagePreview: status === 'NO_RESPONSE' ? outbound[0] : pick(outbound),
        lastMessageAt: daysAgo(between(0, 20)),
        isDemo: true,
      },
    });

    const messages = between(1, 4);
    for (let m = 0; m < messages; m++) {
      const out = m % 2 === 0;
      await prisma.message.create({
        data: {
          conversationId: conv.id,
          direction: out ? 'OUTBOUND' : 'INBOUND',
          body: out ? pick(outbound) : pick(inbound),
          provenance: 'MANUAL',
          recordedAt: daysAgo(between(0, 20)),
        },
      });
    }
  }

  // ---- Account metrics (60 days) + risk events
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const account of accounts) {
    for (let d = 59; d >= 0; d--) {
      const day = new Date(today);
      day.setDate(day.getDate() - d);

      const momentum = account.status === 'PAUSED' ? 0.15 : 1;
      const weekday = day.getDay();
      const base = weekday === 0 ? 6 : weekday === 6 ? 11 : between(18, 34);
      const messagesSent = Math.round(base * momentum * (0.7 + rand() * 0.6));
      const messagesReceived = Math.round(messagesSent * (0.35 + rand() * 0.2));
      const replies = Math.round(messagesSent * (0.22 + rand() * 0.18));
      const errors = rand() < 0.2 ? between(0, 3) : between(0, 1);
      const messageFailures = rand() < 0.15 ? between(0, 2) : 0;
      const negativeEvents = rand() < 0.06 ? between(1, 2) : 0;
      const responseRate = messagesSent > 0 ? Math.round((replies / messagesSent) * 1000) / 10 : null;

      await prisma.accountMetric.create({
        data: {
          accountId: account.id,
          day,
          messagesSent,
          messagesReceived,
          replies,
          responseRate,
          errors,
          negativeEvents,
          messageFailures,
          activeConversations: Math.round(messagesSent / 2.2),
          isDemo: true,
        },
      });
    }

    if (account.name === 'WA #4' || account.name === 'WA #7') {
      const level = account.name === 'WA #4' ? 'CRITICAL' : 'HIGH';
      await prisma.riskEvent.create({
        data: {
          accountId: account.id,
          level,
          message:
            level === 'CRITICAL'
              ? 'Critical account state — response rate dropped sharply and errors are elevated.'
              : 'Account requires attention — unusual failure activity detected.',
          metadata: { isDemo: true },
          isDemo: true,
          createdAt: daysAgo(1),
        },
      });
    }
  }

  console.log('Seed complete.');
  console.log(`  Admin: ${adminEmail} / ${adminPassword}`);
  console.log('  Accounts: 7 · Leads: 100 · Campaigns: 3 · Tags: 4 · All demo rows flagged isDemo=true');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });