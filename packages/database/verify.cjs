const { PrismaClient } = require('./dist/src/index.js');
const p = new PrismaClient();
(async () => {
  const r = {};
  r.users = await p.user.count();
  r.accounts = await p.whatsAppAccount.count();
  r.leads = await p.lead.count();
  r.campaigns = await p.campaign.count();
  r.campaignLeads = await p.campaignLead.count();
  r.metrics = await p.accountMetric.count();
  r.conversations = await p.conversation.count();
  r.messages = await p.message.count();
  r.riskEvents = await p.riskEvent.count();
  r.activity = await p.activityEvent.count();
  r.tags = await p.tag.count();
  console.log(JSON.stringify(r));
  await p.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });

