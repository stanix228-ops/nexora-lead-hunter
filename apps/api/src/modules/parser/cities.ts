export interface CityItem {
  name: string;
  domain: string;
  country: string;
}

export interface CityConfig {
  name: string;
  slug: string;
  domain: string;
  country: string;
}

export const CITIES: CityItem[] = [
  ...[
    'Актау', 'Актобе', 'Алматы', 'Астана', 'Атырау', 'Жезказган', 'Караганда', 'Кокшетау',
    'Конаев', 'Костанай', 'Кызылорда', 'Павлодар', 'Петропавловск', 'Рудный', 'Семей',
    'Степногорск', 'Талдыкорган', 'Тараз', 'Темиртау', 'Туркестан', 'Уральск',
    'Усть-Каменогорск', 'Шымкент', 'Экибастуз', 'Каскелен', 'Талгар', 'Кульсары', 'Жанаозен',
  ].map((n) => ({ name: n, domain: '2gis.kz', country: 'Казахстан' })),

  ...[
    'Москва', 'Санкт-Петербург', 'Новосибирск', 'Екатеринбург', 'Казань', 'Краснодар', 'Красноярск',
    'Нижний Новгород', 'Челябинск', 'Уфа', 'Самара', 'Ростов-на-Дону', 'Омск', 'Воронеж', 'Пермь',
    'Волгоград', 'Саратов', 'Тюмень', 'Тольятти', 'Махачкала', 'Барнаул', 'Ижевск', 'Хабаровск',
    'Ульяновск', 'Владивосток', 'Ярославль', 'Томск', 'Оренбург', 'Кемерово', 'Рязань',
    'Набережные Челны', 'Пенза', 'Астрахань', 'Липецк', 'Тула', 'Киров', 'Белгород',
    'Ставрополь', 'Сургут', 'Тверь', 'Нижневартовск', 'Владимир', 'Симферополь', 'Калуга',
    'Сочи', 'Севастополь', 'Брянск', 'Магнитогорск', 'Псков', 'Иваново', 'Тамбов',
    'Архангельск', 'Чита', 'Волжский', 'Курск', 'Новокузнецк', 'Мурманск', 'Ханты-Мансийск',
    'Вологда', 'Саранск', 'Кострома', 'Нижний Тагил', 'Якутск', 'Грозный', 'Смоленск',
    'Орёл', 'Петрозаводск', 'Новомосковск', 'Череповец', 'Владикавказ', 'Балашиха', 'Нальчик',
    'Пятигорск', 'Новый Уренгой', 'Подольск', 'Сергиев Посад', 'Абакан', 'Энгельс',
    'Йошкар-Ола', 'Мытищи', 'Зеленоград', 'Иркутск', 'Калининград', 'Улан-Удэ', 'Новороссийск',
    'Анапа', 'Геленджик', 'Дербент', 'Ессентуки', 'Кисловодск', 'Минеральные Воды',
  ].map((n) => ({ name: n, domain: '2gis.ru', country: 'Россия' })),

  ...[
    'Минск', 'Гомель', 'Могилёв', 'Витебск', 'Гродно', 'Брест', 'Барановичи', 'Бобруйск',
    'Борисов', 'Орша', 'Пинск', 'Солигорск', 'Лида', 'Молодечно', 'Полоцк', 'Новополоцк',
  ].map((n) => ({ name: n, domain: '2gis.by', country: 'Беларусь' })),

  ...[
    'Бишкек', 'Ош', 'Джалал-Абад', 'Каракол', 'Нарын', 'Токмок', 'Балыкчы', 'Чолпон-Ата',
  ].map((n) => ({ name: n, domain: '2gis.kg', country: 'Кыргызстан' })),

  ...[
    'Ташкент', 'Самарканд', 'Бухара', 'Наманган', 'Андижан', 'Фергана', 'Нукус', 'Карши',
  ].map((n) => ({ name: n, domain: '2gis.uz', country: 'Узбекистан' })),

  ...[
    'Баку', 'Гянджа', 'Сумгаит',
  ].map((n) => ({ name: n, domain: '2gis.az', country: 'Азербайджан' })),

  ...[
    'Дубай', 'Абу-Даби', 'Шарджа', 'Аджман', 'Рас-эль-Хайма',
  ].map((n) => ({ name: n, domain: '2gis.ae', country: 'ОАЭ' })),

  ...[
    'Прага',
  ].map((n) => ({ name: n, domain: '2gis.cz', country: 'Чехия' })),

  ...[
    'Лимассол', 'Никосия', 'Ларнака', 'Пафос',
  ].map((n) => ({ name: n, domain: '2gis.com.cy', country: 'Кипр' })),
];

export const SLUG_MAP: Record<string, string> = {
  Алматы: 'almaty', Астана: 'astana', Шымкент: 'shymkent', Караганда: 'karaganda', Актобе: 'aktobe',
  Тараз: 'taraz', Павлодар: 'pavlodar', 'Усть-Каменогорск': 'ust-kamenogorsk', Семей: 'semey', Атырау: 'atyrau',
  Костанай: 'kostanay', Кызылорда: 'kyzylorda', Уральск: 'uralsk', Петропавловск: 'petropavlovsk', Актау: 'aktau',
  Темиртау: 'temirtau', Туркестан: 'turkestan', Кокшетау: 'kokshetau', Талдыкорган: 'taldykorgan',
  Экибастуз: 'ekibastuz', Рудный: 'rudny', Жезказган: 'zhezkazgan', Конаев: 'konaev', Степногорск: 'stepnogorsk',
  Каскелен: 'kaskelen', Талгар: 'talgar', Кульсары: 'kulsary', Жанаозен: 'zhanaozen',

  Москва: 'moscow', 'Санкт-Петербург': 'spb', Новосибирск: 'novosibirsk', Екатеринбург: 'ekaterinburg',
  Казань: 'kazan', Краснодар: 'krasnodar', Красноярск: 'krasnoyarsk', 'Нижний Новгород': 'n_novgorod',
  Челябинск: 'chelyabinsk', Уфа: 'ufa', Самара: 'samara', 'Ростов-на-Дону': 'rostov', Омск: 'omsk',
  Воронеж: 'voronezh', Пермь: 'perm', Волгоград: 'volgograd', Саратов: 'saratov', Тюмень: 'tyumen',
  Тольятти: 'tolyatti', Махачкала: 'makhachkala', Барнаул: 'barnaul', Ижевск: 'izhevsk', Хабаровск: 'khabarovsk',
  Ульяновск: 'ulyanovsk', Владивосток: 'vladivostok', Ярославль: 'yaroslavl', Томск: 'tomsk', Оренбург: 'orenburg',
  Кемерово: 'kemerovo', Рязань: 'ryazan', 'Набережные Челны': 'naberezhnye-chelny', Пенза: 'penza',
  Астрахань: 'astrahan', Липецк: 'lipetsk', Тула: 'tula', Киров: 'kirov', Белгород: 'belgorod',
  Ставрополь: 'stavropol', Сургут: 'surgut', Тверь: 'tver', Нижневартовск: 'nizhnevartovsk', Владимир: 'vladimir',
  Симферополь: 'simferopol', Калуга: 'kaluga', Сочи: 'sochi', Севастополь: 'sevastopol', Брянск: 'bryansk',
  Магнитогорск: 'magnitogorsk', Псков: 'pskov', Иваново: 'ivanovo', Тамбов: 'tambov', Архангельск: 'arkhangelsk',
  Чита: 'chita', Волжский: 'volzhsky', Курск: 'kursk', Новокузнецк: 'novokuznetsk', Мурманск: 'murmansk',
  'Ханты-Мансийск': 'khanty-mansiysk', Вологда: 'vologda', Саранск: 'saransk', Кострома: 'kostroma',
  'Нижний Тагил': 'ntagil', Якутск: 'yakutsk', Грозный: 'grozny', Смоленск: 'smolensk', Орёл: 'orel',
  Петрозаводск: 'petrozavodsk', Новомосковск: 'novomoskovsk', Череповец: 'cherepovets', Владикавказ: 'vladikavkaz',
  Балашиха: 'balashikha', Нальчик: 'nalchik', Пятигорск: 'pyatigorsk', 'Новый Уренгой': 'novy-urengoy',
  Подольск: 'podolsk', 'Сергиев Посад': 'sergiev-posad', Абакан: 'abakan', Энгельс: 'engels',
  'Йошкар-Ола': 'yoshkar-ola', Мытищи: 'mytishchi', Зеленоград: 'zelenograd', Иркутск: 'irkutsk',
  Калининград: 'kaliningrad', 'Улан-Удэ': 'ulanude', Новороссийск: 'novorossiysk', Анапа: 'anapa',
  Геленджик: 'gelendzhik', Дербент: 'derbent', Ессентуки: 'essentuki', Кисловодск: 'kislovodsk',
  'Минеральные Воды': 'minvody',

  Минск: 'minsk', Гомель: 'gomel', Могилёв: 'mogilev', Витебск: 'vitebsk', Гродно: 'grodno',
  Брест: 'brest', Барановичи: 'baranovichi', Бобруйск: 'bobruysk', Борисов: 'borisov',
  Орша: 'orsha', Пинск: 'pinsk', Солигорск: 'soligorsk', Лида: 'lida', Молодечно: 'molodechno',
  Полоцк: 'polotsk', Новополоцк: 'novopolotsk',

  Бишкек: 'bishkek', Ош: 'osh', 'Джалал-Абад': 'jalal-abad', Каракол: 'karakol', Нарын: 'naryn',
  Токмок: 'tokmok', Балыкчы: 'balykchy', 'Чолпон-Ата': 'cholpon-ata',

  Ташкент: 'tashkent', Самарканд: 'samarkand', Бухара: 'bukhara', Наманган: 'namangan',
  Андижан: 'andijan', Фергана: 'fergana', Нукус: 'nukus', Карши: 'karshi',

  Баку: 'baku', Гянджа: 'ganja', Сумгаит: 'sumgait',
  Дубай: 'dubai', 'Абу-Даби': 'abu-dhabi', Шарджа: 'sharjah', Аджман: 'ajman', 'Рас-эль-Хайма': 'ras-al-khaimah',
  Прага: 'prague',
  Лимассол: 'limassol', Никосия: 'nicosia', Ларнака: 'larnaca', Пафос: 'paphos',
};

const CYR_TO_LAT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya', ә: 'a', ғ: 'g', қ: 'k', ң: 'n', ө: 'o', ұ: 'u', ү: 'u',
  һ: 'h', і: 'i', ў: 'u',
};

export function transliterate(text: string): string {
  return text
    .toLowerCase()
    .split('')
    .map((char) => CYR_TO_LAT[char] !== undefined ? CYR_TO_LAT[char] : char)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function getCityConfig(cityName: string, country?: string): CityConfig {
  const trimmed = cityName.trim();
  const lower = trimmed.toLowerCase();
  
  const found = CITIES.find((c) => c.name.toLowerCase() === lower);
  if (found) {
    return {
      name: found.name,
      slug: SLUG_MAP[found.name] || transliterate(found.name),
      domain: found.domain,
      country: found.country,
    };
  }

  // Fallback for custom user-entered cities
  let domain = '2gis.kz';
  let countryName = country || 'Казахстан';

  if (country === 'Россия') domain = '2gis.ru';
  else if (country === 'Беларусь') domain = '2gis.by';
  else if (country === 'Кыргызстан') domain = '2gis.kg';
  else if (country === 'Узбекистан') domain = '2gis.uz';
  else if (country === 'Азербайджан') domain = '2gis.az';
  else if (country === 'ОАЭ') domain = '2gis.ae';
  else if (country === 'Чехия') domain = '2gis.cz';
  else if (country === 'Кипр') domain = '2gis.com.cy';

  const slug = SLUG_MAP[trimmed] || transliterate(trimmed);

  return {
    name: trimmed,
    slug: slug || 'almaty',
    domain,
    country: countryName,
  };
}

export function searchUrl(cityName: string, niche: string, country?: string, pageNumber: number = 1): string {
  const cfg = getCityConfig(cityName, country);
  const encodedQuery = encodeURIComponent(niche.trim());
  if (pageNumber > 1) {
    return `https://${cfg.domain}/${cfg.slug}/search/${encodedQuery}/page/${pageNumber}`;
  }
  return `https://${cfg.domain}/${cfg.slug}/search/${encodedQuery}`;
}

export function getCitiesByCountry(): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const c of CITIES) {
    const label = c.country || 'Другое';
    if (!map[label]) map[label] = [];
    map[label].push(c.name);
  }
  return map;
}

