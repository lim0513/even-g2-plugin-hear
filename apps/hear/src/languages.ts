// Soniox 支持的语言（/docs/translation/supported-languages，2026-10 抓的，60 种）。
// 转写和翻译目标用同一张表；语言识别是自动的，这张表只用来做下拉和校验代码。
export const LANGUAGES: { code: string; name: string }[] = [
  { code: 'zh', name: '中文' }, { code: 'ja', name: '日本語' }, { code: 'en', name: 'English' }, { code: 'ko', name: '한국어' },
  { code: 'de', name: 'Deutsch' }, { code: 'fr', name: 'Français' }, { code: 'es', name: 'Español' }, { code: 'pt', name: 'Português' },
  { code: 'it', name: 'Italiano' }, { code: 'ru', name: 'Русский' }, { code: 'vi', name: 'Tiếng Việt' }, { code: 'th', name: 'ไทย' },
  { code: 'id', name: 'Bahasa Indonesia' }, { code: 'ms', name: 'Bahasa Melayu' }, { code: 'tl', name: 'Tagalog' }, { code: 'hi', name: 'हिन्दी' },
  { code: 'ar', name: 'العربية' }, { code: 'tr', name: 'Türkçe' }, { code: 'nl', name: 'Nederlands' }, { code: 'pl', name: 'Polski' },
  { code: 'uk', name: 'Українська' }, { code: 'cs', name: 'Čeština' }, { code: 'sv', name: 'Svenska' }, { code: 'da', name: 'Dansk' },
  { code: 'no', name: 'Norsk' }, { code: 'fi', name: 'Suomi' }, { code: 'el', name: 'Ελληνικά' }, { code: 'he', name: 'עברית' },
  { code: 'hu', name: 'Magyar' }, { code: 'ro', name: 'Română' }, { code: 'bg', name: 'Български' }, { code: 'hr', name: 'Hrvatski' },
  { code: 'sr', name: 'Srpski' }, { code: 'sk', name: 'Slovenčina' }, { code: 'sl', name: 'Slovenščina' }, { code: 'bs', name: 'Bosanski' },
  { code: 'mk', name: 'Македонски' }, { code: 'sq', name: 'Shqip' }, { code: 'lt', name: 'Lietuvių' }, { code: 'lv', name: 'Latviešu' },
  { code: 'et', name: 'Eesti' }, { code: 'be', name: 'Беларуская' }, { code: 'kk', name: 'Қазақ' }, { code: 'az', name: 'Azərbaycan' },
  { code: 'fa', name: 'فارسی' }, { code: 'ur', name: 'اردو' }, { code: 'bn', name: 'বাংলা' }, { code: 'ta', name: 'தமிழ்' },
  { code: 'te', name: 'తెలుగు' }, { code: 'kn', name: 'ಕನ್ನಡ' }, { code: 'ml', name: 'മലയാളം' }, { code: 'mr', name: 'मराठी' },
  { code: 'gu', name: 'ગુજરાતી' }, { code: 'pa', name: 'ਪੰਜਾਬੀ' }, { code: 'sw', name: 'Kiswahili' }, { code: 'af', name: 'Afrikaans' },
  { code: 'ca', name: 'Català' }, { code: 'eu', name: 'Euskara' }, { code: 'gl', name: 'Galego' }, { code: 'cy', name: 'Cymraeg' },
]

export const LANG_CODES = new Set(LANGUAGES.map((l) => l.code))

export const langName = (code: string) => LANGUAGES.find((l) => l.code === code)?.name ?? code

/** 把「ja, zh」这种输入解析成合法代码数组；不认识的丢掉 */
export function parseHints(s: string): string[] {
  return [...new Set(s.toLowerCase().split(/[,，、\s]+/).map((c) => c.trim()).filter((c) => LANG_CODES.has(c)))]
}
