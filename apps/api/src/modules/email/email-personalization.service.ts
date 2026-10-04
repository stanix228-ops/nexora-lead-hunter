import { prisma } from '@nexora/database';
import { logger } from '../../common/logger';

export interface PersonalizedEmailDraft {
  subject: string;
  bodyText: string;
  bodyHtml: string;
  personalizationFactors: {
    companyName: string;
    niche?: string;
    websiteUrl?: string;
    speedIssue?: string;
    mobileIssue?: boolean;
    missingTools?: string[];
    detectedGaps?: string[];
    seoScore?: number;
    techStack?: string[];
  };
}

export class EmailPersonalizationService {
  /**
   * Generates a hyper-personalized, non-spam cold outreach email based on the lead's
   * automated BusinessAnalysis audit (speed, tech stack, SEO score, mobile responsiveness, detected gaps).
   */
  static async generatePersonalizedFirstTouch(leadId: string): Promise<PersonalizedEmailDraft> {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        analysis: true,
        score: true,
      },
    });

    if (!lead) {
      throw new Error(`Лид с ID ${leadId} не найден.`);
    }

    const companyName = lead.companyName || lead.contactName || 'Коллеги';
    const contactName = lead.contactName || 'Коллеги';
    const niche = lead.niche || 'вашей сфере';
    const analysis = lead.analysis;
    const score = lead.score;

    // Extract real audit facts from BusinessAnalysis
    const pageSpeed = analysis?.pageLoadSpeedMs ? (analysis.pageLoadSpeedMs / 1000).toFixed(1) : null;
    const isMobileFriendly = analysis?.isMobileFriendly;
    const seoScore = analysis?.seoScore;
    const techStack = Array.isArray(analysis?.techStack) ? (analysis.techStack as string[]) : [];
    const detectedGaps = Array.isArray(analysis?.detectedGaps) ? (analysis.detectedGaps as string[]) : [];
    const foundProblems = Array.isArray(analysis?.foundProblems) ? (analysis.foundProblems as string[]) : [];
    const hasOnlineBooking = analysis?.hasOnlineBooking;
    const hasChatWidget = analysis?.hasChatWidget;

    const missingTools: string[] = [];
    if (hasOnlineBooking === false) missingTools.push('онлайн-запись / бронирование');
    if (hasChatWidget === false) missingTools.push('быстрый чат-виджет для захвата заявок');

    // Select primary audit angle to avoid generic spam
    let angle: 'SPEED_AND_MOBILE' | 'AUTOMATION_AND_LEADS' | 'REDESIGN_AND_SEO' | 'GENERAL_GROWTH' = 'GENERAL_GROWTH';
    let subject = `Аналитика и точки роста для ${companyName}`;
    let primaryObservation = '';
    let proposedImpact = '';

    if (pageSpeed && parseFloat(pageSpeed) > 2.5) {
      angle = 'SPEED_AND_MOBILE';
      subject = `Аудит скорости и мобильной версии для ${companyName}`;
      primaryObservation = `При анализе вашего сайта обратили внимание, что время первичной загрузки составляет около ${pageSpeed} сек. По статистике мобильного трафика в нише «${niche}», задержка свыше 3 секунд приводит к потере до 35-40% потенциальных заявок с рекламы и поиска.`;
      proposedImpact = `Оптимизация Core Web Vitals и адаптивной верстки позволяет вернуть до 30% потерянных лидов без увеличения рекламного бюджета.`;
    } else if (missingTools.length > 0 || detectedGaps.length > 0) {
      angle = 'AUTOMATION_AND_LEADS';
      subject = `Автоматизация обработки заявок для ${companyName}`;
      const gapsStr = detectedGaps.slice(0, 2).join(', ') || missingTools.join(', ');
      primaryObservation = `Изучили цифровую инфраструктуру ${companyName}. Заметили потенциал для роста конверсии: на сайте сейчас отсутствуют ${gapsStr}, из-за чего часть клиентов уходит к конкурентам с мгновенным откликом.`;
      proposedImpact = `Интеграция умного виджета и AI-ассистента в связке с CRM позволяет квалифицировать лиды 24/7 за 15 секунд.`;
    } else if (seoScore && seoScore < 60) {
      angle = 'REDESIGN_AND_SEO';
      subject = `Потенциал роста органического трафика для ${companyName}`;
      primaryObservation = `Провели экспресс-аудит поисковой оптимизации: текущий SEO-индекс составляет ${seoScore}/100. В нише «${niche}» есть возможность занять лидирующие позиции по ключевым коммерческим запросам в вашем регионе.`;
      proposedImpact = `Устранение технических ошибок структуры и оптимизация метаданных дают стабильный поток целевых клиентов без постоянных затрат на контекст.`;
    } else {
      primaryObservation = `Обратили внимание на развитие вашего бизнеса в сфере «${niche}». Мы в Nexora специализируемся на разработке высококонверсионных веб-решений, умных ботов и AI-автоматизации для компаний вашего уровня.`;
      proposedImpact = `Наши решения помогают автоматизировать продажи, сократить цикл сделки и увеличить конверсию сайта в 1.5–2 раза.`;
    }

    const painPointRef = foundProblems.length > 0
      ? `Конкретно мы обратили внимание на: ${foundProblems[0]}.`
      : '';

    // Plain text email body
    const bodyText = `Здравствуйте, ${contactName}!

Меня зовут Алексей, команда Nexora Digital.

${primaryObservation}

${painPointRef ? painPointRef + '\n\n' : ''}${proposedImpact}

Мы подготовили краткий разбор с вариантами решения и оценкой сроков (обычно реализация занимает от 7 до 14 рабочих дней).

Подскажите, актуален ли для вас сейчас вопрос повышения конверсии и привлечения новых клиентов? Могу отправить краткую презентацию с расчетами прямо в ответном письме.

--
С уважением,
Алексей Смирнов | Nexora AI & Web Solutions
Email: info@nexora.io | Web: https://nexora.io
`;

    // HTML email body (clean, mobile-responsive, professional styling)
    const bodyHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f8fafc; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 32px 28px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .header { font-size: 18px; font-weight: 600; color: #0f172a; margin-bottom: 20px; }
    .highlight-box { background-color: #f1f5f9; border-left: 4px solid #3b82f6; padding: 14px 18px; border-radius: 0 8px 8px 0; margin: 20px 0; font-size: 14px; color: #334155; }
    .badge { display: inline-block; background: #dbeafe; color: #1e40af; font-size: 12px; font-weight: 600; padding: 3px 8px; border-radius: 6px; margin-bottom: 8px; }
    .content p { margin: 0 0 16px 0; font-size: 15px; color: #334155; }
    .cta-text { font-weight: 600; color: #1e293b; margin-top: 24px; }
    .signature { border-top: 1px solid #e2e8f0; margin-top: 28px; padding-top: 20px; font-size: 13px; color: #64748b; }
    .signature strong { color: #0f172a; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">Здравствуйте, ${contactName}!</div>
    <div class="content">
      <p>Меня зовут Алексей, команда IT-студии <strong>Nexora</strong>.</p>
      
      <div class="highlight-box">
        <div class="badge">📊 Результат экспресс-анализа для ${companyName}</div>
        <div>${primaryObservation}</div>
      </div>

      ${painPointRef ? `<p><strong>Ключевая точка внимания:</strong> ${painPointRef}</p>` : ''}

      <p>${proposedImpact}</p>

      <p class="cta-text">Подскажите, актуален ли для вас сейчас вопрос повышения отдачи от сайта и привлечения новых клиентов? Могу отправить детальный разбор с примерами и оценкой сроков прямо в ответном письме.</p>
    </div>

    <div class="signature">
      <strong>Алексей Смирнов</strong><br>
      Ведущий консультант Nexora AI & Web Solutions<br>
      🌐 <a href="https://nexora.io" style="color: #2563eb; text-decoration: none;">nexora.io</a> | ✉️ alex@nexora.io
    </div>
  </div>
</body>
</html>
`;

    return {
      subject,
      bodyText,
      bodyHtml,
      personalizationFactors: {
        companyName,
        niche: lead.niche || undefined,
        websiteUrl: lead.website || undefined,
        speedIssue: pageSpeed ? `${pageSpeed}s` : undefined,
        mobileIssue: isMobileFriendly === false,
        missingTools,
        detectedGaps,
        seoScore: seoScore ?? undefined,
        techStack,
      },
    };
  }
}
