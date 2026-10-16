<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { Tag, Check, X } from 'lucide-svelte';

  let {
    isOpen = false,
    fileTitle = '',
    onSaveLabel,
    onClose
  } = $props<{
    isOpen: boolean;
    fileTitle: string;
    onSaveLabel: (label: string) => void;
    onClose: () => void;
  }>();

  let labelText = $state('');
  let inputEl = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if (isOpen) {
      labelText = '';
      tick().then(() => {
        inputEl?.focus();
      });
    }
  });

  function handleConfirm() {
    if (!labelText.trim()) return;
    onSaveLabel(labelText.trim());
    onClose();
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirm();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }
</script>

{#if isOpen}
  <div
    class="modal-backdrop"
    onclick={onClose}
    onkeydown={handleKeyDown}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="modal-card"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      role="document"
      tabindex="-1"
    >
      <div class="modal-header">
        <div class="title-wrap">
          <Tag size={18} class="header-icon" />
          <h3>為當前狀態添加歷史標籤 (Put Label)</h3>
        </div>
        <button class="close-btn" onclick={onClose} title="關閉 (Esc)">
          <X size={16} />
        </button>
      </div>

      <p class="subtitle">
        在「{fileTitle}」的本地歷史時間軸上固定此版本，方便未來對照或一鍵復原。
      </p>

      <div class="input-wrap">
        <input
          bind:this={inputEl}
          type="text"
          placeholder="例如：重構前備份、提煉完畢之丹方、版本 1.2..."
          bind:value={labelText}
          onkeydown={handleKeyDown}
        />
      </div>

      <div class="modal-actions">
        <button class="btn-cancel" onclick={onClose}>取消 (Esc)</button>
        <button
          class="btn-confirm"
          disabled={!labelText.trim()}
          onclick={handleConfirm}
        >
          <Check size={14} />
          確認固定標籤 (Enter)
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: rgba(10, 10, 12, 0.72);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .modal-card {
    width: 480px;
    background: #18191b;
    border: 1px solid #32353a;
    border-radius: 8px;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6);
    padding: 20px;
    color: #ebdbb2;
    display: flex;
    flex-direction: column;
    gap: 14px;
    animation: popIn 0.15s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes popIn {
    from {
      opacity: 0;
      transform: scale(0.96) translateY(-8px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .title-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  :global(.header-icon) {
    color: #fabd2f;
  }

  h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: #fbf1c7;
  }

  .close-btn {
    background: none;
    border: none;
    color: #928374;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    transition: all 0.15s;
  }

  .close-btn:hover {
    color: #ebdbb2;
    background: #282828;
  }

  .subtitle {
    margin: 0;
    font-size: 13px;
    color: #a89984;
    line-height: 1.5;
  }

  .input-wrap input {
    width: 100%;
    box-sizing: border-box;
    background: #121314;
    border: 1px solid #3c3836;
    border-radius: 5px;
    padding: 10px 12px;
    font-size: 14px;
    color: #ebdbb2;
    outline: none;
    transition: border-color 0.15s;
  }

  .input-wrap input:focus {
    border-color: #fabd2f;
    box-shadow: 0 0 0 1px rgba(250, 189, 47, 0.3);
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 6px;
  }

  .btn-cancel {
    background: transparent;
    border: 1px solid #504945;
    color: #a89984;
    padding: 6px 14px;
    border-radius: 4px;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-cancel:hover {
    background: #282828;
    color: #ebdbb2;
  }

  .btn-confirm {
    background: #d79921;
    border: 1px solid #fabd2f;
    color: #1d2021;
    font-weight: 600;
    padding: 6px 16px;
    border-radius: 4px;
    font-size: 13px;
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-confirm:hover:not(:disabled) {
    background: #fabd2f;
    box-shadow: 0 0 10px rgba(250, 189, 47, 0.4);
  }

  .btn-confirm:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
