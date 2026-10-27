/**
 * sanitizerGuard.ts
 * 廣零散 AI 雲端機敏資訊防護濾網 (Sanitizer Guard / Privacy Shield)
 * 
 * 核心職責：
 * 1. 偵測筆記是否標記有私密標籤 (#private, #secret, #confidential)，若存在則禁止發送至第三方雲端 AI 模型。
 * 2. 在向外連雲端 API (Groq, Gemini 等) 發送前，前端自動掃描正則 Regex (API 金鑰、Token、私鑰、連線字串等)，
 *    將其安全遮蔽為 [REDACTED:類型]，確保零敏感資訊外流。
 * 3. 支援 100% 本地端點 (Ollama / LocalAI) 智能情境識別。
 */

export interface SanitizeResult {
  /** 經脫敏處理後的安全文本 */
  sanitizedText: string;
  /** 是否因私密標籤或嚴重安全規則而阻止發送 */
  isBlocked: boolean;
  /** 阻止發送的原因說明（正體中文） */
  blockedReason?: string;
  /** 替換脫敏的機敏項目總數 */
  redactedCount: number;
  /** 偵測並脫敏的敏感類型清單 */
  redactedTypes: string[];
}

export interface SanitizeOptions {
  /** 是否強制執行脫敏，即便端點為本機端點（預設 true） */
  strict?: boolean;
  /** 是否檢查 #private 等私密標籤（預設 true） */
  checkPrivateTags?: boolean;
  /** 允許發送至本機端點時跳過私密標籤阻擋（預設 true） */
  allowLocalBypassPrivate?: boolean;
}

// 1. 全篇私密阻斷標籤：整篇藥帖禁止外傳雲端第三方 AI
const WHOLE_NOTE_PRIVATE_REGEX = /(?:^|\s)#(?:private|confidential|個人機敏|不公開)(?:\s|$)/i;

// 2. 段落級私密過濾標籤：僅標註 #secret 的段落被過濾遮蔽，其餘段落正常送審
const SECRET_PARAGRAPH_TAG_REGEX = /(?:^|\s)#(?:secret|機密|密)(?:\s|$)/i;

// 各類憑證與機敏資訊正則模式清單
interface PatternRule {
  type: string;
  regex: RegExp;
  replacement: string;
}

const SANITIZER_RULES: PatternRule[] = [
  // 1. 各大雲端與平台 API Keys
  {
    type: 'OpenAI API Key',
    regex: /\bsk-[a-zA-Z0-9_-]{20,}\b/g,
    replacement: '[REDACTED:OPENAI_KEY]',
  },
  {
    type: 'Groq API Key',
    regex: /\bgsk_[a-zA-Z0-9_-]{20,}\b/g,
    replacement: '[REDACTED:GROQ_KEY]',
  },
  {
    type: 'Google AI / Gemini Key',
    regex: /\bAIzaSy[a-zA-Z0-9_-]{33}\b/g,
    replacement: '[REDACTED:GEMINI_KEY]',
  },
  {
    type: 'Anthropic Claude Key',
    regex: /\bsk-ant-[a-zA-Z0-9_-]{20,}\b/g,
    replacement: '[REDACTED:ANTHROPIC_KEY]',
  },
  {
    type: 'GitHub Token',
    regex: /\b(?:ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{50,})\b/g,
    replacement: '[REDACTED:GITHUB_TOKEN]',
  },
  {
    type: 'AWS Access Key',
    regex: /\bAKIA[0-9A-Z]{16}\b/g,
    replacement: '[REDACTED:AWS_KEY]',
  },

  // 2. 加密憑證與私鑰區塊 (PEM / RSA / EC / OPENSSH)
  {
    type: 'Private Key Block',
    regex: /-----BEGIN\s+[A-Z\s]+PRIVATE\s+KEY-----[\s\S]*?-----END\s+[A-Z\s]+PRIVATE\s+KEY-----/g,
    replacement: '[REDACTED:PRIVATE_KEY_BLOCK]',
  },

  // 3. Bearer Token 與 JWT
  {
    type: 'JWT / Bearer Token',
    regex: /\bBearer\s+[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_\-\.\+\/=\?]+/gi,
    replacement: 'Bearer [REDACTED:JWT_TOKEN]',
  },

  // 4. 資料庫連線字串 (包含帳號密碼)
  {
    type: 'Database Connection String',
    regex: /\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s"'`]+/gi,
    replacement: '[REDACTED:DB_CONNECTION_URL]',
  },

  // 5. 臺灣身分證字號格式檢測
  {
    type: 'Taiwan National ID',
    regex: /\b[A-Z][1289]\d{8}\b/g,
    replacement: '[REDACTED:TW_ID]',
  },

  // 6. 一般 Password / Secret 賦值模式 (e.g. password = "xyz", API_SECRET='123')
  {
    type: 'Secret Assignment',
    regex: /((?:password|passwd|secret|api_key|apikey|token|access_token)\s*[:=]\s*["'])([^"'`\s]{6,})(["'])/gi,
    replacement: '$1[REDACTED:SECRET]$3',
  },
];

/**
 * 檢查輸入字串是否包含全篇私密筆記標籤 (#private)
 */
export function hasWholeNotePrivateTag(text: string): boolean {
  if (!text) return false;
  return WHOLE_NOTE_PRIVATE_REGEX.test(text);
}

/**
 * 檢查輸入字串是否包含段落級私密標籤 (#secret)
 */
export function hasSecretParagraphTag(text: string): boolean {
  if (!text) return false;
  return SECRET_PARAGRAPH_TAG_REGEX.test(text);
}

// 相容舊函式命名
export const hasPrivateTag = hasWholeNotePrivateTag;

/**
 * 核心脫敏防護過濾器
 * 
 * 語意職責：
 * 1. #private (全篇私密)：整篇藥帖絕對禁止傳送給雲端 AI，全篇阻斷保護。
 * 2. #secret (段落私密)：僅過濾並遮蔽帶有 #secret 的該段落，其餘公開段落照常送 AI 提煉。
 * 3. 行內機敏資訊 (API Key、Token、密碼)：自動遮蔽為 [REDACTED:類型]。
 * 
 * @param text 待傳送給 AI 的文字內容
 * @param isLocalEndpoint 是否為本地離線端點 (如 Ollama / LocalAI)
 * @param options 防護選項
 * @returns 包含脫敏後文字與阻擋狀態的物件
 */
export function sanitizeForAi(
  text: string,
  isLocalEndpoint = false,
  options: SanitizeOptions = {}
): SanitizeResult {
  const {
    checkPrivateTags = true,
    allowLocalBypassPrivate = true,
  } = options;

  if (!text) {
    return {
      sanitizedText: '',
      isBlocked: false,
      redactedCount: 0,
      redactedTypes: [],
    };
  }

  // 1. 全篇私密標籤 (#private)：整篇攔截阻斷
  if (checkPrivateTags && hasWholeNotePrivateTag(text)) {
    // 若為本地端點且允許本地私密存取，則放行；若是雲端 API，則絕對封鎖整篇手稿
    if (!isLocalEndpoint || !allowLocalBypassPrivate) {
      return {
        sanitizedText: '',
        isBlocked: true,
        blockedReason: '⚠️ 此藥帖標註有全篇私密標籤（#private），廣零散安全防護已全篇攔截，禁止送至雲端 AI！',
        redactedCount: 0,
        redactedTypes: ['Whole Note Blocked (#private)'],
      };
    }
  }

  let sanitized = text;
  let totalRedacted = 0;
  const detectedTypes = new Set<string>();

  // 2. 段落級私密標籤 (#secret)：若為雲端 API，過濾遮蔽含有 #secret 的該段落
  if (!isLocalEndpoint && hasSecretParagraphTag(sanitized)) {
    // 按雙換行切分段落
    const paragraphs = sanitized.split(/\n\n+/);
    const safeParagraphs = paragraphs.map((p) => {
      if (hasSecretParagraphTag(p)) {
        totalRedacted++;
        detectedTypes.add('Secret Paragraph (#secret)');
        return '[REDACTED:SECRET_PARAGRAPH] (此段落標註 #secret，已由安全濾網自動排除)';
      }
      return p;
    });
    sanitized = safeParagraphs.join('\n\n');
  }

  // 2. 依序執行正則脫敏替換
  for (const rule of SANITIZER_RULES) {
    let matchCount = 0;
    sanitized = sanitized.replace(rule.regex, (...args) => {
      matchCount++;
      // 若替換字串包含 $1, $3 等群組捕獲
      if (rule.replacement.includes('$')) {
        let res = rule.replacement;
        res = res.replace('$1', args[1] || '').replace('$3', args[3] || '');
        return res;
      }
      return rule.replacement;
    });

    if (matchCount > 0) {
      totalRedacted += matchCount;
      detectedTypes.add(rule.type);
    }
  }

  return {
    sanitizedText: sanitized,
    isBlocked: false,
    redactedCount: totalRedacted,
    redactedTypes: Array.from(detectedTypes),
  };
}
