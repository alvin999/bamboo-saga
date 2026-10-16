/**
 * 竹簡手稿 (Bamboo Saga) 金鑰安全持久化保險庫 (Key Vault)
 * 
 * 核心原則：
 * 1. 100% 純本機持久化，絕對不上任何雲端伺服器或 OneDrive 備份。
 * 2. 支援兩種安全架構方案切換：
 *    - 方案 3: 作業系統原生認證保險庫 (OS Native Keyring / DPAPI)
 *    - 方案 2+1: 本機隔離沙盒 + Web Crypto (AES-256-GCM) 硬體加速加密
 */

import { isTauriEnvironment } from '../storage/fsBridge';
import { invoke } from '@tauri-apps/api/core';

export type SecurityMode = 'scheme_3_os_native' | 'scheme_2_web_crypto';

export interface DecryptedKeys {
  groqKey: string;
  geminiKey: string;
  selectedModel: 'groq' | 'gemini';
  selectedModelId: string;
  securityMode: SecurityMode;
}

const SECURE_STORAGE_KEY = 'bamboo_sec_vault_v1';
const SECURITY_MODE_CONFIG_KEY = 'bamboo_sec_mode_pref';

// 固定的本機鹽值 (Salt)，用於衍生本機專屬 AES-256-GCM 金鑰
const LOCAL_SALT = new Uint8Array([75, 117, 110, 103, 102, 117, 80, 97, 110, 100, 97, 83, 97, 103, 97, 49]);

/**
 * 衍生本機專屬 AES-256 加密金鑰 (使用 Web Crypto PBKDF2)
 */
async function deriveLocalEncryptionKey(): Promise<CryptoKey> {
  const enc = new TextEncoder();
  // 結合本機硬體特徵 (如 UserAgent 與語言) 生成基礎熵，防止純靜態抽取
  const entropy = `BambooSaga:${navigator.userAgent.slice(0, 30)}:${navigator.language || 'zh-TW'}`;
  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(entropy),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: LOCAL_SALT,
      iterations: 100000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Web Crypto AES-256-GCM 加密 (方案 2+1)
 */
async function encryptWithWebCrypto(plainText: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await deriveLocalEncryptionKey();
  const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV
  const ciphertextBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plainText)
  );

  const payload = {
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(ciphertextBuffer)),
  };
  return JSON.stringify(payload);
}

/**
 * Web Crypto AES-256-GCM 解密 (方案 2+1)
 */
async function decryptWithWebCrypto(encryptedJson: string): Promise<string> {
  try {
    const payload = JSON.parse(encryptedJson);
    if (!payload.iv || !payload.data) return '';
    const key = await deriveLocalEncryptionKey();
    const iv = new Uint8Array(payload.iv);
    const data = new Uint8Array(payload.data);

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );
    const dec = new TextDecoder();
    return dec.decode(decryptedBuffer);
  } catch (err) {
    console.warn('[KeyVault] AES 解密失敗:', err);
    return '';
  }
}

/**
 * 取得當前設定的安全加密模式
 */
export function getCurrentSecurityMode(): SecurityMode {
  const pref = localStorage.getItem(SECURITY_MODE_CONFIG_KEY);
  if (pref === 'scheme_3_os_native' || pref === 'scheme_2_web_crypto') {
    return pref;
  }
  // 預設採用「方案 3: 作業系統原生保險庫」（若在桌面環境）或「方案 2+1」（若在瀏覽器）
  return isTauriEnvironment() ? 'scheme_3_os_native' : 'scheme_2_web_crypto';
}

/**
 * 設定安全加密模式偏好
 */
export function setSecurityModePreference(mode: SecurityMode) {
  localStorage.setItem(SECURITY_MODE_CONFIG_KEY, mode);
}

/**
 * 保存金鑰至本機保險庫（支援 方案 3 與 方案 2+1）
 */
export async function saveSecureKeys(data: {
  groqKey: string;
  geminiKey: string;
  selectedModel: 'groq' | 'gemini';
  selectedModelId: string;
  securityMode?: SecurityMode;
}): Promise<boolean> {
  const mode = data.securityMode || getCurrentSecurityMode();
  setSecurityModePreference(mode);

  const payloadString = JSON.stringify({
    groqKey: data.groqKey.trim(),
    geminiKey: data.geminiKey.trim(),
    selectedModel: data.selectedModel,
    selectedModelId: data.selectedModelId,
  });

  try {
    if (mode === 'scheme_3_os_native' && isTauriEnvironment()) {
      // 方案 3：呼叫 Tauri 後端作業系統安全儲存
      try {
        await invoke('save_os_secure_keys', { payload: payloadString });
        // 同步清除前端 localStorage 密文，確保零殘留
        localStorage.removeItem(SECURE_STORAGE_KEY);
        return true;
      } catch (nativeErr) {
        console.warn('[KeyVault] 呼叫 OS 原生安全庫失敗，自動安全備援降級為方案 2+1:', nativeErr);
      }
    }

    // 方案 2+1：本機隔離沙盒 + Web Crypto (AES-256-GCM)
    const encrypted = await encryptWithWebCrypto(payloadString);
    localStorage.setItem(SECURE_STORAGE_KEY, encrypted);
    return true;
  } catch (err) {
    console.error('[KeyVault] 保存安全金鑰失敗:', err);
    return false;
  }
}

/**
 * 從本機保險庫載入金鑰（自動辨識 方案 3 或 方案 2+1）
 */
export async function loadSecureKeys(): Promise<DecryptedKeys> {
  const mode = getCurrentSecurityMode();
  const defaultRes: DecryptedKeys = {
    groqKey: '',
    geminiKey: '',
    selectedModel: 'gemini',
    selectedModelId: 'gemini-1.5-flash',
    securityMode: mode,
  };

  const sanitizeReadModelId = (model: 'groq' | 'gemini', modelId?: string) => {
    if (!modelId || modelId === 'gemini-2.5-flash') {
      return model === 'groq' ? 'llama-3.3-70b-versatile' : 'gemini-1.5-flash';
    }
    return modelId;
  };

  try {
    // 1. 若為方案 3 且處於桌面環境，先嘗試從 OS 原生保險庫讀取
    if (mode === 'scheme_3_os_native' && isTauriEnvironment()) {
      try {
        const raw = await invoke<string>('load_os_secure_keys');
        if (raw) {
          const parsed = JSON.parse(raw);
          const chosenModel = parsed.selectedModel || 'gemini';
          return {
            groqKey: parsed.groqKey || '',
            geminiKey: parsed.geminiKey || '',
            selectedModel: chosenModel,
            selectedModelId: sanitizeReadModelId(chosenModel, parsed.selectedModelId),
            securityMode: 'scheme_3_os_native',
          };
        }
      } catch (nativeErr) {
        console.warn('[KeyVault] 讀取 OS 原生保險庫無資料或失敗，檢查方案 2+1 快照:', nativeErr);
      }
    }

    // 2. 方案 2+1：從本機 localStorage 讀取並以 Web Crypto AES-256 解密
    const encrypted = localStorage.getItem(SECURE_STORAGE_KEY);
    if (encrypted) {
      const decryptedString = await decryptWithWebCrypto(encrypted);
      if (decryptedString) {
        const parsed = JSON.parse(decryptedString);
        const chosenModel = parsed.selectedModel || 'gemini';
        return {
          groqKey: parsed.groqKey || '',
          geminiKey: parsed.geminiKey || '',
          selectedModel: chosenModel,
          selectedModelId: sanitizeReadModelId(chosenModel, parsed.selectedModelId),
          securityMode: 'scheme_2_web_crypto',
        };
      }
    }
  } catch (err) {
    console.error('[KeyVault] 載入安全金鑰失敗:', err);
  }

  return defaultRes;
}

/**
 * 徹底清除本機所有持久化金鑰（含 OS 原生庫與 Web Crypto 密文）
 */
export async function purgeAllLocalKeys(): Promise<void> {
  localStorage.removeItem(SECURE_STORAGE_KEY);
  if (isTauriEnvironment()) {
    try {
      await invoke('purge_os_secure_keys');
    } catch (e) {
      // 忽略
    }
  }
}
