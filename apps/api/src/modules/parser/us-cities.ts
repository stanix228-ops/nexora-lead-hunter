export interface UsStateData {
  state: string;
  code: string;
  cities: string[];
}

export const US_STATES_MAP: Record<string, string[]> = {
  'Florida (Флорида)': ['Miami', 'Orlando', 'Tampa', 'Fort Lauderdale', 'Jacksonville', 'Boca Raton', 'Naples', 'Sarasota'],
  'California (Калифорния)': ['Los Angeles', 'San Francisco', 'San Diego', 'San Jose', 'Sacramento', 'Fresno', 'Irvine', 'Long Beach'],
  'Texas (Техас)': ['Houston', 'Dallas', 'Austin', 'San Antonio', 'Fort Worth', 'El Paso', 'Arlington', 'Plano'],
  'New York (Нью-Йорк)': ['New York City', 'Brooklyn', 'Queens', 'Buffalo', 'Rochester', 'Albany', 'Yonkers'],
  'Illinois (Иллинойс)': ['Chicago', 'Naperville', 'Aurora', 'Rockford', 'Joliet'],
  'Nevada (Невада)': ['Las Vegas', 'Henderson', 'Reno', 'North Las Vegas'],
  'Washington (Вашингтон)': ['Seattle', 'Bellevue', 'Tacoma', 'Spokane', 'Vancouver'],
  'Georgia (Джорджия)': ['Atlanta', 'Savannah', 'Augusta', 'Athens', 'Sandy Springs'],
  'North Carolina (Северная Каролина)': ['Charlotte', 'Raleigh', 'Greensboro', 'Durham', 'Winston-Salem'],
  'Arizona (Аризона)': ['Phoenix', 'Scottsdale', 'Tucson', 'Mesa', 'Chandler', 'Glendale'],
  'Colorado (Колорадо)': ['Denver', 'Colorado Springs', 'Aurora', 'Boulder', 'Fort Collins'],
  'Pennsylvania (Пенсильвания)': ['Philadelphia', 'Pittsburgh', 'Allentown', 'Erie'],
  'Massachusetts (Массачусетс)': ['Boston', 'Cambridge', 'Worcester', 'Springfield'],
  'Ohio (Огайо)': ['Columbus', 'Cleveland', 'Cincinnati', 'Toledo', 'Akron'],
  'New Jersey (Нью-Джерси)': ['Jersey City', 'Newark', 'Paterson', 'Elizabeth', 'Trenton'],
};

export const US_NICHE_SUGGESTIONS = [
  { label: 'Roofing (Кровельные работы)', query: 'Roofing contractor' },
  { label: 'Plumbing (Сантехника)', query: 'Plumbing contractor' },
  { label: 'Dental (Стоматология)', query: 'Dentist' },
  { label: 'HVAC (Кондиционеры и отопление)', query: 'HVAC contractor' },
  { label: 'Lawyers (Юристы / Адвокаты)', query: 'Lawyer law firm' },
  { label: 'Auto Detailing (Детейлинг / Авто)', query: 'Auto detailing auto repair' },
  { label: 'Real Estate (Недвижимость)', query: 'Real estate agency' },
  { label: 'Cleaning Services (Клининг)', query: 'Cleaning company' },
  { label: 'Landscaping (Ландшафтный дизайн)', query: 'Landscaping company' },
  { label: 'Remodeling (Ремонт и строительство)', query: 'Home remodeling contractor' },
  { label: 'Solar Energy (Солнечные панели)', query: 'Solar energy company' },
  { label: 'Medical Spas (Косметология / СПА)', query: 'Medical spa' },
  { label: 'Moving Companies (Переезды)', query: 'Moving company' },
  { label: 'Accounting / CPA (Бухгалтеры)', query: 'CPA accounting' },
];
