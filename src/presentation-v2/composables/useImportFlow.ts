/**
 * useImportFlow — 外部导入页业务流编排（阶段 2 / D21.4）
 *
 * 直接调 service/import / service/worldbook / shared 层；不 import presentation/。
 * AI 注入循环使用 service/table/update-orchestrator 的纯业务入口接通，
 * v2 代码不跨进旧 presentation/。
 */
import { useImportFlowStore } from '../stores/import-flow-store';
import { importTempGet_ACU, importTempRemove_ACU, importTempSet_ACU } from '../../shared/idb-import-temp';
import {
  STORAGE_KEY_IMPORTED_ENTRIES_ACU,
  STORAGE_KEY_IMPORTED_STATUS_ACU,
  STORAGE_KEY_IMPORTED_STATUS_FULL_ACU,
  STORAGE_KEY_IMPORTED_STATUS_STANDARD_ACU,
  STORAGE_KEY_IMPORTED_STATUS_SUMMARY_ACU,
} from '../../shared/data-constants';
import {
  clearImportedEntriesCore_ACU,
  deleteImportedEntriesCore_ACU,
  finalizeImportAndCleanup_ACU,
  initImportDatabase_ACU,
  saveChunkProgress_ACU,
} from '../../service/import/import-executor';
import { getCurrentCharPrimaryLorebook_ACU } from '../../service/worldbook/worldbook-service';
import { logDebug_ACU, logError_ACU } from '../../shared/utils';
import {
  executeCardUpdateCore_ACU,
  type CardUpdateProgressEvent,
} from '../../service/table/update-orchestrator';
import {
  abortAllActiveRequests_ACU,
  settings_ACU,
  _set_wasStoppedByUser_ACU,
} from '../../service/runtime/state-manager';
import { useToastStore, type ToastOptions } from '../stores/toast-store';

export type ImportMessageKind = 'info' | 'success' | 'warning' | 'error';

/** 气泡与桌宠里显示的功能名。 */
const IMPORT_TASK_FEATURE = 'Nhập từ ngoài';

export interface UseImportFlow {
  splitFile(file: File): Promise<void>;
  clearStaging(): Promise<void>;
  clearImportedEntries(): Promise<void>;
  deleteImportedEntries(): Promise<void>;
  injectChunks(): Promise<void>;
}

function progressLabel(event: CardUpdateProgressEvent): string {
  const prefix = event.currentBatch && event.totalBatches
    ? `Khối ${event.currentBatch}/${event.totalBatches}: `
    : '';
  switch (event.phase) {
    case 'preparing': return `${prefix}Chuẩn bị đầu vào AI...`;
    case 'calling_ai': return `${prefix}Gọi AI${event.attempt ? ` (${event.attempt}/${event.maxRetries || '?'})` : ''}...`;
    case 'parsing': return `${prefix}Phân tích kết quả điền bảng...`;
    case 'retry': return `${prefix}Lần thử này thất bại, đang thử lại${event.message ? `: ${event.message}` : '...'}`;
    case 'chunk_done': return `${prefix}Xử lý khối hoàn tất, đang lưu điểm dừng...`;
    case 'complete': return `${prefix}Hoàn tất.`;
    case 'error': return `${prefix}Gặp lỗi${event.message ? `: ${event.message}` : '.'}`;
    case 'saving': return `${prefix}Lưu dữ liệu bảng...`;
    default: return `${prefix || 'Đang xử lý...'}`;
  }
}

async function readFileText(file: File, encoding: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      resolve(typeof result === 'string' ? result : '');
    };
    reader.onerror = () => reject(reader.error ?? new Error('Đọc tệp thất bại'));
    reader.readAsText(file, encoding);
  });
}

async function resolveTargetLorebook(target: string): Promise<string | null> {
  if (target === 'character') {
    try {
      const primary = await getCurrentCharPrimaryLorebook_ACU();
      return typeof primary === 'string' && primary ? primary : null;
    } catch (e) {
      logError_ACU('[ACU-V2] resolve char primary lorebook failed', e);
      return null;
    }
  }
  return target ? target : null;
}

async function withImportPromptFilterForced<T>(task: () => Promise<T>): Promise<T> {
  const previousValue = settings_ACU.importPromptExcludeImportedWorldbookEntries;
  settings_ACU.importPromptExcludeImportedWorldbookEntries = true;
  try {
    return await task();
  } finally {
    settings_ACU.importPromptExcludeImportedWorldbookEntries = previousValue;
  }
}

export function useImportFlow(): UseImportFlow {
  const store = useImportFlowStore();
  const toast = useToastStore();
  let progressToastId: string | null = null;
  let abortRequested = false;
  let currentAbortController: AbortController | null = null;

  function notify(kind: ImportMessageKind, text: string, options: ToastOptions = {}): void {
    if (progressToastId) {
      if (toast.update(progressToastId, kind, text, options)) {
        if (options.durationMs !== 0) progressToastId = null;
        return;
      }
      progressToastId = null;
    }
    toast[kind](text, options);
  }

  function progressToastOptions(): ToastOptions {
    return {
      durationMs: 0,
      muteable: false,
      dismissible: false,
      feature: IMPORT_TASK_FEATURE,
      action: abortRequested
        ? undefined
        : {
            label: 'Dừng',
            variant: 'danger',
            dismissOnClick: false,
            onClick: requestAbort,
          },
    };
  }

  function notifyProgress(text: string): void {
    if (progressToastId && toast.update(progressToastId, 'info', text, progressToastOptions())) {
      return;
    }
    progressToastId = toast.info(text, progressToastOptions());
  }

  function requestAbort(): void {
    if (abortRequested) return;
    abortRequested = true;
    _set_wasStoppedByUser_ACU(true);
    currentAbortController?.abort();
    abortAllActiveRequests_ACU();
    const text = 'Đã yêu cầu dừng nhập từ ngoài, đang dừng khối hiện tại và lưu điểm dừng...';
    if (progressToastId) {
      toast.update(progressToastId, 'warning', text, {
        durationMs: 0,
        muteable: false,
        dismissible: false,
        feature: IMPORT_TASK_FEATURE,
      });
    } else {
      toast.warning(text, {
        durationMs: 0,
        muteable: false,
        dismissible: false,
        feature: IMPORT_TASK_FEATURE,
      });
    }
  }

  async function saveAbortCheckpoint(status: { currentIndex: number }, index: number, total: number): Promise<void> {
    status.currentIndex = index;
    await importTempSet_ACU(STORAGE_KEY_IMPORTED_STATUS_ACU, JSON.stringify(status));
    await store.refreshStaging();
    notify(
      'warning',
      `Nhập từ ngoài đã dừng, đã lưu điểm dừng: hoàn tất ${index}/${total}. Sau đó có thể bấm "Tiếp tục ghi" để khôi phục.`,
      { muteable: false },
    );
  }

  async function splitFile(file: File): Promise<void> {
    if (!file) return;
    const splitSize = store.splitSize;
    if (!Number.isFinite(splitSize) || splitSize <= 0) {
      notify('error', 'Vui lòng nhập số ký tự phân tách hợp lệ.');
      return;
    }

    store.setBusy(true);
    try {
      const content = await readFileText(file, store.encoding);
      if (!content) {
        notify('warning', 'Tệp trống hoặc đọc thất bại.');
        await store.refreshStaging();
        return;
      }

      // wipe stale resume statuses
      await Promise.all([
        importTempRemove_ACU(STORAGE_KEY_IMPORTED_STATUS_ACU),
        importTempRemove_ACU(STORAGE_KEY_IMPORTED_STATUS_STANDARD_ACU),
        importTempRemove_ACU(STORAGE_KEY_IMPORTED_STATUS_SUMMARY_ACU),
        importTempRemove_ACU(STORAGE_KEY_IMPORTED_STATUS_FULL_ACU),
      ]);

      const chunks: Array<{ content: string }> = [];
      for (let i = 0; i < content.length; i += splitSize) {
        chunks.push({ content: content.substring(i, i + splitSize) });
      }
      await importTempSet_ACU(STORAGE_KEY_IMPORTED_ENTRIES_ACU, JSON.stringify(chunks));
      logDebug_ACU(`[ACU-V2 import] saved ${chunks.length} chunks (split=${splitSize})`);
      notify('success', `Đã tách tệp thành ${chunks.length} phần thành công.`);
    } catch (e: any) {
      logError_ACU('[ACU-V2] splitFile failed', e);
      notify('error', e?.message || 'Lỗi khi đọc tệp.');
    } finally {
      await store.refreshStaging();
      store.setBusy(false);
    }
  }

  async function clearStaging(): Promise<void> {
    store.setBusy(true);
    try {
      const before = store.staging.hasChunks;
      await Promise.all([
        importTempRemove_ACU(STORAGE_KEY_IMPORTED_ENTRIES_ACU),
        importTempRemove_ACU(STORAGE_KEY_IMPORTED_STATUS_ACU),
        importTempRemove_ACU(STORAGE_KEY_IMPORTED_STATUS_STANDARD_ACU),
        importTempRemove_ACU(STORAGE_KEY_IMPORTED_STATUS_SUMMARY_ACU),
        importTempRemove_ACU(STORAGE_KEY_IMPORTED_STATUS_FULL_ACU),
      ]);
      notify(
        before ? 'success' : 'info',
        before ? 'Đã xóa thành công bộ nhớ đệm tạm của nhập.' : 'Không có bộ nhớ đệm tạm của nhập cần xóa.',
      );
    } catch (e: any) {
      logError_ACU('[ACU-V2] clearStaging failed', e);
      notify('error', 'Lỗi khi xóa bộ nhớ đệm nhập.');
    } finally {
      await store.refreshStaging();
      store.setBusy(false);
    }
  }

  async function clearImportedEntries(): Promise<void> {
    const target = await resolveTargetLorebook(store.worldbookTarget);
    if (!target) {
      notify('error', 'Không thể xóa mục nhập: chưa đặt đích chèn dữ liệu.');
      return;
    }
    store.setBusy(true);
    try {
      const result = await clearImportedEntriesCore_ACU(target);
      if (result.deletedCount > 0) {
        notify('success', `Đã xóa thành công ${result.deletedCount} mục nhập.`);
      } else {
        notify('info', 'Không tìm thấy mục sổ thế giới đã chèn nào có thể xóa.');
      }
    } catch (e: any) {
      logError_ACU('[ACU-V2] clearImportedEntries failed', e);
      notify('error', 'Lỗi khi xóa mục nhập.');
    } finally {
      await store.refreshStaging();
      store.setBusy(false);
    }
  }

  async function deleteImportedEntries(): Promise<void> {
    const target = await resolveTargetLorebook(store.worldbookTarget);
    if (!target) {
      notify('error', 'Không thể xóa mục chèn: chưa đặt sổ thế giới đích chèn dữ liệu nhập.');
      return;
    }
    store.setBusy(true);
    try {
      const deletedCount = await deleteImportedEntriesCore_ACU(target);
      if (deletedCount > 0) {
        notify('success', `Đã xóa thành công ${deletedCount} mục do nhập từ ngoài chèn vào.`);
      } else {
        notify('info', `Trong sổ thế giới "${target}" không tìm thấy mục nhập từ ngoài phù hợp với mã hiện tại.`);
      }
    } catch (e: any) {
      logError_ACU('[ACU-V2] deleteImportedEntries failed', e);
      notify('error', 'Lỗi khi xóa mục chèn.');
    } finally {
      store.setBusy(false);
    }
  }

  async function injectChunks(): Promise<void> {
    if (store.busy) return;

    const savedEntriesJson = await importTempGet_ACU(STORAGE_KEY_IMPORTED_ENTRIES_ACU);
    if (!savedEntriesJson) {
      notify('warning', 'Chưa tải tệp TXT. Vui lòng chọn và tách tệp trước.');
      await store.refreshStaging();
      return;
    }

    let allChunks: Array<{ content?: string }> = [];
    try {
      const parsed = JSON.parse(savedEntriesJson);
      allChunks = Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      logError_ACU('[ACU-V2] parse imported chunks failed', e);
      await Promise.all([
        importTempRemove_ACU(STORAGE_KEY_IMPORTED_ENTRIES_ACU),
        importTempRemove_ACU(STORAGE_KEY_IMPORTED_STATUS_ACU),
      ]);
      await store.refreshStaging();
      notify('error', 'Dữ liệu tạm của nhập đã hỏng, đã xóa trống. Vui lòng chọn lại tệp TXT.');
      return;
    }

    if (allChunks.length === 0) {
      await store.refreshStaging();
      notify('warning', 'Không có khối nào để chèn. Vui lòng chọn lại tệp TXT.');
      return;
    }

    const target = await resolveTargetLorebook(store.worldbookTarget);
    if (!target) {
      notify('error', 'Không thể chèn: chưa đặt sổ thế giới đích chèn dữ liệu nhập.');
      return;
    }

    store.refreshSheetSource();
    const selectedSheetKeys = store.hasTableSelection
      ? store.selectedSheetKeys.slice()
      : store.availableSheetKeys.slice();
    if (store.hasTableSelection && selectedSheetKeys.length === 0) {
      notify('error', 'Chưa chọn bảng nào, không thể chèn. Vui lòng tick ít nhất một bảng trong "Chọn bảng chèn" để chọn ít nhất một bảng.');
      return;
    }

    store.setBusy(true);
    progressToastId = null;
    abortRequested = false;
    currentAbortController = null;
    _set_wasStoppedByUser_ACU(false);
    try {
      const selectionSig = JSON.stringify(selectedSheetKeys);
      const initResult = await initImportDatabase_ACU(target, selectedSheetKeys, allChunks, selectionSig);
      if (!initResult.success || !initResult.status || !initResult.modeSuffix) {
        notify('error', initResult.error || 'Khởi tạo nhập thất bại.');
        return;
      }

      const status = initResult.status;
      const modeSuffix = initResult.modeSuffix;
      const updateMode = 'manual_unified';

      for (let i = status.currentIndex; i < allChunks.length; i++) {
        if (abortRequested) {
          await saveAbortCheckpoint(status, i, allChunks.length);
          return;
        }
        const chunk = allChunks[i] || {};
        const mockMessage = { is_user: false, mes: String(chunk.content || ''), name: 'Văn bản nhập' };
        let success = false;
        let lastError = '';
        const maxOuterRetries = 3;

        for (let attempt = 1; attempt <= maxOuterRetries && !success; attempt++) {
          if (abortRequested) {
            await saveAbortCheckpoint(status, i, allChunks.length);
            return;
          }
          const abortController = new AbortController();
          currentAbortController = abortController;
          notifyProgress(`Đang xử lý khối ${i + 1}/${allChunks.length} (lần thử ${attempt}/${maxOuterRetries})...`);
          const result = await withImportPromptFilterForced(() => executeCardUpdateCore_ACU(
            [mockMessage],
            -1,
            true,
            updateMode,
            true,
            selectedSheetKeys,
            null,
            abortController,
            { currentBatch: i + 1, totalBatches: allChunks.length },
            event => {
              notifyProgress(progressLabel(event));
            },
          ));
          currentAbortController = null;
          if (abortRequested || result.aborted) {
            await saveAbortCheckpoint(status, i, allChunks.length);
            return;
          }
          success = result.success;
          lastError = result.error || (result.aborted ? 'Tác vụ đã bị dừng.' : '');
          if (!success && attempt < maxOuterRetries) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }

        if (!success) {
          status.currentIndex = i;
          await importTempSet_ACU(STORAGE_KEY_IMPORTED_STATUS_ACU, JSON.stringify(status));
          await store.refreshStaging();
          notify('error', `Khối ${i + 1}/${allChunks.length} xử lý thất bại, đã lưu điểm dừng. ${lastError || 'Vui lòng bấm tiếp tục chèn sau.'}`, { muteable: false });
          return;
        }

        const saved = await saveChunkProgress_ACU(target, modeSuffix, status, i);
        if (!saved) {
          notify('error', `Khối thứ ${i + 1} đã được xử lý nhưng không thể lưu mục CSDL tạm, đã dừng nhập tiếp.`, { muteable: false });
          return;
        }
        await store.refreshStaging();
      }

      notifyProgress('Đã xử lý xong tất cả khối văn bản, đang tạo mục sổ thế giới cuối cùng...');
      const finalResult = await finalizeImportAndCleanup_ACU(target, selectedSheetKeys, modeSuffix, allChunks.length);
      if (!finalResult.success) {
        notify('error', finalResult.error || 'Chèn cuối cùng thất bại.', { muteable: false });
        return;
      }

      store.setWorldbookTarget('');
      notify(
        'success',
        finalResult.cleanedCount && finalResult.cleanedCount > 0
          ? `Nhập từ ngoài đã hoàn tất: đã chèn ${allChunks.length} khối, và dọn ${finalResult.cleanedCount} mục CSDL cũ.`
          : `Nhập từ ngoài đã hoàn tất: đã chèn ${allChunks.length} khối và gỡ liên kết với sổ thế giới.`,
        { muteable: false },
      );
    } catch (e: any) {
      logError_ACU('[ACU-V2] injectChunks failed', e);
      notify('error', `Nhập từ ngoài thất bại: ${e?.message || 'Lỗi không xác định'}`, { muteable: false });
    } finally {
      currentAbortController = null;
      _set_wasStoppedByUser_ACU(false);
      await store.refreshStaging();
      store.setBusy(false);
    }
  }

  return {
    splitFile,
    clearStaging,
    clearImportedEntries,
    deleteImportedEntries,
    injectChunks,
  };
}
