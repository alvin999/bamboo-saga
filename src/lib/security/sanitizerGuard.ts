/**
 * sanitizerGuard.ts
 * 廣零散 AI 私密防護濾網 (Sanitizer Guard / Privacy Shield)
 * 
 * 核心職責：
 * 1. #private (全篇私密)：整篇藥帖禁止外傳第三方雲端 AI，全篇阻斷保護。
 * 2. #secret (單行私密)：只要該行含有 #secret，該整行文字於發送雲端 AI 時自動遮蔽排除。
 * 3. 本地端點 (Ollama / LocalAI / LM Studio) 不受限，支援 100% 離線私密運算。
 */

export interface SanitizeResult {
  /** 經處理後的安全文本 */
  sanitizedText: string;
  /** 是否因私密標籤而阻止發送 */
  isBlocked: boolean;
  /** 阻止發送的原因說明（正體中文） */
  blockedReason?: string;
  /** 遮蔽過濾的機敏項目行數 */
  redactedCount: number;
  /** 偵測並遮蔽的類型清單 */
  redactedTypes: string[];
}

export interface SanitizeOptions {
  /** 是否檢查 #private 私密標籤（預設 true） */
  checkPrivateTags?: boolean;
  /** 允許發送至本機端點時跳過私密標籤阻擋（預設 true） */
  allowLocalBypassPrivate?: boolean;
}

// 1. 全篇私密阻斷標籤：整篇藥帖禁止外傳雲端第三方 AI
const WHOLE_NOTE_PRIVATE_REGEX = /(?:^|\s)#(?:private|confidential|個人機敏|不公開)(?:\s|$)/i;

// 2. 單行私密過濾標籤：含有 #secret 的該整行文字於雲端發送時被過濾遮蔽
const SECRET_LINE_TAG_REGEX = /(?:^|\s)#(?:secret|機密|密)(?:\s|$)/i;

/**
 * 檢查輸入字串是否包含全篇私密筆記標籤 (#private)
 */
export function hasWholeNotePrivateTag(text: string): boolean {
  if (!text) return false;
  return WHOLE_NOTE_PRIVATE_REGEX.test(text);
}

/**
 * 檢查單行或文字是否包含單行私密標籤 (#secret)
 */
export function hasSecretLineTag(text: string): boolean {
  if (!text) return false;
  return SECRET_LINE_TAG_REGEX.test(text);
}

// 相容舊函式命名
export const hasPrivateTag = hasWholeNotePrivateTag;
export const hasSecretParagraphTag = hasSecretLineTag;

/**
 * 核心私密防護過濾器
 * 
 * 職責：
 * 1. #private：整篇藥帖阻斷，絕不上傳雲端 AI。
 * 2. #secret：單行遮蔽，凡含有 #secret 的整行文字直接遮蔽為 [REDACTED:SECRET_LINE]。
 * 
 * @param text 待傳送給 AI 的文字內容
 * @param isLocalEndpoint 是否為本地離線端點 (如 Ollama / LM Studio)
 * @param options 防護選項
 * @returns 包含過濾後文字與阻擋狀態的物件
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

  // 若為本地離線端點，保留完整內容給本機模型運算
  if (isLocalEndpoint) {
    return {
      sanitizedText: text,
      isBlocked: false,
      redactedCount: 0,
      redactedTypes: [],
    };
  }

  // 2. 單行私密過濾 (#secret)：逐行檢查，含有 #secret 的整行直接遮蔽替換
  const lines = text.split(/\r?\n/);
  let redactedLinesCount = 0;
  const filteredLines = lines.map((line) => {
    if (hasSecretLineTag(line)) {
      redactedLinesCount++;
      return '[REDACTED:SECRET_LINE]';
    }
    return line;
  });

  const detectedTypes: string[] = [];
  if (redactedLinesCount > 0) {
    detectedTypes.push('Secret Line (#secret)');
  }

  return {
    sanitizedText: filteredLines.join('\n'),
    isBlocked: false,
    redactedCount: redactedLinesCount,
    redactedTypes: detectedTypes,
  };
}
