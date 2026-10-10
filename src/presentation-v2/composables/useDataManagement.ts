/**
 * useDataManagement — 数据管理页业务流编排
 *
 * v2 页面只依赖本 composable；旧 settings / chat / worldbook / template service
 * 调用集中在这里，避免 Vue 组件跨进旧 presentation 层。
 */
import { computed, reactive, ref } from 'vue';
import { DEFAULT_MERGE_SUMMARY_PROMPT_ACU, DEFAULT_MERGE_SUMMARY_PROMPT_SQL_ACU } from '../../shared/defaults-json.js';
import { normalizeIsolationCode_ACU } from '../../shared/data-constants';
import { ensureSheetOrderNumbers_ACU, logError_ACU, parseTableTemplateJson_ACU } from '../../shared/utils';
import { readIsolatedTagData_ACU } from '../../data/repositories/chat-message-data-repo';
import { currentChatFileIdentifier_ACU, currentJsonTableData_ACU, getCurrentIsolationKey_ACU, settings_ACU } from '../../service/runtime/state-manager';
import {
  applyTemplateScopeForCurrentChat_ACU,
  applyCombinedSettingsImport_ACU,
  getDataIsolationHistory_ACU,
  removeDataIsolationHistory_ACU,
  saveSettings_ACU,
  switchIsolationProfile_ACU,
} from '../../service/settings/settings-service';
import { cleanupLegacyIsolationProfiles_ACU } from '../../service/settings/legacy-isolation-cleanup-service';
import { normalizeResetDefaultsOptions, hasSelectedResetDefaultsOption, resetAllDefaults_ACU, type ResetDefaultsCleanupOptions } from '../../service/table/reset-defaults-service';
import { getCurrentStorageMode, isSqliteMode } from '../../service/table/storage-mode';
import { reloadStorageProvider } from '../../service/table/table-storage-strategy';
import { getChatArray_ACU, deleteLocalDataWithScope_ACU, isFullRangeDeletionRequest_ACU, overrideLatestLayerWithTemplateCore_ACU } from '../../service/chat/chat-service';
import { loadOrCreateJsonTableFromChatHistory_ACU } from '../../service/table/table-service';
import { cleanupWorldbookEntriesAfterDataDeletion_ACU } from '../../service/worldbook/worldbook-cleanup';
import { deleteAllGeneratedEntries_ACU, refreshMergedDataAndNotify_ACU } from '../../service/worldbook/pipeline';
import { applyTemplateSnapshotToScope_ACU } from '../../service/template/template-preset-service';
import { sanitizeChatSheetsObject_ACU } from '../../service/template/chat-scope';
import { buildCurrentTableCheckpoint_ACU, parseTableCheckpointFile_ACU, restoreTableCheckpointToLatestAi_ACU, type TableCheckpointFileV1_ACU } from '../../service/table/table-checkpoint-transfer';
import { buildRegisteredMixedStorageSnapshotTransfer_ACU, commitRegisteredMixedStorageDecision_ACU, getActiveMixedStorageDecisionSummary_ACU, type MixedStorageDecisionSummary_ACU } from '../../service/table/mixed-storage-decision-registry';
import type { MixedStorageCommitAction_ACU } from '../../shared/models/mixed-storage-commit-action';
import { commitPreparedV2Recovery_ACU, prepareV2Recovery_ACU, scanV2IsolationDiagnostics_ACU, type CommitPreparedV2RecoveryOptions_ACU, type V2IsolationDiagnostic_ACU, type V2RecoverySummary_ACU } from '../../service/table/table-v2-recovery-service';
import { useToastStore } from '../stores/toast-store';

export type DataMgmtMessageKind = 'info' | 'success' | 'warning' | 'error';

export interface DataMgmtMessage {
  kind: DataMgmtMessageKind;
  text: string;
  at: number;
}

export type { ResetDefaultsCleanupKey, ResetDefaultsCleanupOptions } from '../../service/table/reset-defaults-service';

function setMessage(target: ReturnType<typeof ref<DataMgmtMessage | null>>, kind: DataMgmtMessageKind, text: string): void {
  target.value = { kind, text, at: Date.now() };
}

function normalizeFloorValue(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

function normalizeRetainRecentLayers(value: unknown): number {
  if (value === '' || value === null || value === undefined) return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

async function readFileText(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('Đọc tệp thất bại'));
    reader.readAsText(file, 'UTF-8');
  });
}

function formatCheckpointExportTimestamp(date: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('') + `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function downloadJson(filename: string, data: unknown): void {
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function getAiMessageCount(): number {
  const chat = getChatArray_ACU();
  return Array.isArray(chat) ? chat.filter((msg: any) => !msg?.is_user).length : 0;
}

function buildCombinedExportPayload(): Record<string, unknown> {
  const templateObj = parseTableTemplateJson_ACU({ stripSeedRows: false });
  if (!templateObj || typeof templateObj !== 'object') {
    throw new Error('Không thể phân tích mẫu hiện tại.');
  }

  const sheetKeys = Object.keys(templateObj).filter(k => k.startsWith('sheet_'));
  ensureSheetOrderNumbers_ACU(templateObj, { baseOrderKeys: sheetKeys, forceRebuild: false });
  const templateData = sanitizeChatSheetsObject_ACU(templateObj, { ensureMate: true });

  return {
    prompt: Array.isArray(settings_ACU.charCardPrompt) ? settings_ACU.charCardPrompt : [],
    template: templateData,
    mergeSummaryPrompt: settings_ACU.mergeSummaryPrompt || (isSqliteMode() ? DEFAULT_MERGE_SUMMARY_PROMPT_SQL_ACU : DEFAULT_MERGE_SUMMARY_PROMPT_ACU),
    mergeTargetCount: settings_ACU.mergeTargetCount || 1,
    mergeBatchSize: settings_ACU.mergeBatchSize || 5,
    mergeStartIndex: settings_ACU.mergeStartIndex || 1,
    mergeEndIndex: settings_ACU.mergeEndIndex || null,
    autoMergeEnabled: settings_ACU.autoMergeEnabled || false,
    autoMergeThreshold: settings_ACU.autoMergeThreshold || 20,
    autoMergeReserve: settings_ACU.autoMergeReserve || 0,
    deleteStartFloor: settings_ACU.deleteStartFloor || null,
    deleteEndFloor: settings_ACU.deleteEndFloor || null,
  };
}

export function useDataManagement() {
  const toast = useToastStore();
  const message = ref<DataMgmtMessage | null>(null);
  const busyAction = ref('');
  const isolationCode = ref('');
  const activeIsolationCode = ref('');
  const mixedStorageDecision = ref<MixedStorageDecisionSummary_ACU | null>(null);
  const v2RecoverySummary = ref<V2RecoverySummary_ACU | null>(null);
  const v2IsolationDiagnostics = ref<V2IsolationDiagnostic_ACU[]>([]);
  const isolationHistory = ref<string[]>([]);
  const deleteRange = reactive({
    startFloor: 1 as number | string,
    endFloor: '' as number | string,
  });
  const retainRecentLayers = ref(100);
  const aiMessageCount = ref(0);

  const currentIsolationLabel = computed(() => {
    const code = activeIsolationCode.value;
    return code || 'Dữ liệu mặc định (không cô lập)';
  });
  const isolationModeLabel = computed(() => (activeIsolationCode.value ? 'Đã bật cô lập' : 'Chưa bật cô lập'));
  const isolationHistoryOptions = computed(() =>
    isolationHistory.value.map(code => ({ value: code, label: code })),
  );
  const legacyIsolationCodes = computed(() => {
    const codes = new Set(isolationHistory.value);
    if (activeIsolationCode.value) codes.add(activeIsolationCode.value);
    return [...codes];
  });
  const legacyIsolationCount = computed(() => legacyIsolationCodes.value.length);
  const rangeLabel = computed(() => {
    const start = normalizeFloorValue(deleteRange.startFloor);
    const end = normalizeFloorValue(deleteRange.endFloor);
    if (start && end) return `Từ tầng AI thứ ${start} đến ${end}`;
    if (start) return `Từ tầng AI thứ ${start} trở đi`;
    if (end) return `Đến tầng AI thứ ${end}`;
    return 'Tất cả tầng AI';
  });
  const tableCount = computed(() =>
    currentJsonTableData_ACU && typeof currentJsonTableData_ACU === 'object'
      ? Object.keys(currentJsonTableData_ACU).filter(key => key.startsWith('sheet_')).length
      : 0,
  );

  /** 手动删除的可选表：勾选后只删这些表的数据（含 checkpoint 中的该表），其它表不动。 */
  const deleteSheetKeys = ref<string[]>([]);
  /** 运行时当前表清单（按 orderNo 排序），供「限定表格」勾选列表使用。 */
  const deletableSheetOptions = ref<Array<{ sheetKey: string; name: string }>>([]);
  const hasDeleteSheetSelection = computed(() => deleteSheetKeys.value.length > 0);
  const selectedDeleteSheetNames = computed(() =>
    deleteSheetKeys.value.map(sheetKey => deletableSheetOptions.value.find(option => option.sheetKey === sheetKey)?.name || sheetKey),
  );

  function collectDeletableSheetOptions(): Array<{ sheetKey: string; name: string }> {
    const data = currentJsonTableData_ACU;
    if (!data || typeof data !== 'object') return [];
    return Object.keys(data)
      .filter(key => key.startsWith('sheet_'))
      .map(key => {
        const sheet = (data as Record<string, any>)[key];
        return {
          sheetKey: key,
          name: String(sheet?.name || key),
          orderNo: Number.isFinite(Number(sheet?.orderNo)) ? Number(sheet.orderNo) : Number.MAX_SAFE_INTEGER,
        };
      })
      .sort((left, right) => left.orderNo - right.orderNo || left.sheetKey.localeCompare(right.sheetKey))
      .map(({ sheetKey, name }) => ({ sheetKey, name }));
  }

  function toggleDeleteSheetKey(sheetKey: string, selected: boolean): void {
    const next = new Set(deleteSheetKeys.value);
    if (selected) next.add(sheetKey);
    else next.delete(sheetKey);
    deleteSheetKeys.value = [...next];
  }

  function clearDeleteSheetSelection(): void {
    deleteSheetKeys.value = [];
  }

  function refresh(): void {
    const currentCode = normalizeIsolationCode_ACU(settings_ACU.dataIsolationCode || '');
    activeIsolationCode.value = currentCode;
    isolationCode.value = currentCode;
    isolationHistory.value = getDataIsolationHistory_ACU();
    deleteRange.startFloor = settings_ACU.deleteStartFloor || 1;
    deleteRange.endFloor = settings_ACU.deleteEndFloor || '';
    retainRecentLayers.value = normalizeRetainRecentLayers(settings_ACU.retainRecentLayers ?? 100);
    aiMessageCount.value = getAiMessageCount();
    mixedStorageDecision.value = getActiveMixedStorageDecisionSummary_ACU();
    // 聊天/模板切换后运行时表集合可能变化：剔除已不存在的勾选，避免删到看不见的 key。
    deletableSheetOptions.value = collectDeletableSheetOptions();
    const available = new Set(deletableSheetOptions.value.map(option => option.sheetKey));
    deleteSheetKeys.value = deleteSheetKeys.value.filter(sheetKey => available.has(sheetKey));
  }

  function getCheckpointTargetStorageMode(): 'native' | 'sqlite' {
    return getCurrentStorageMode();
  }

  async function applyIsolation(): Promise<void> {
    const targetCode = normalizeIsolationCode_ACU(isolationCode.value);
    busyAction.value = 'apply-isolation';
    try {
      await switchIsolationProfile_ACU(targetCode);
      refresh();
      activeIsolationCode.value = targetCode;
      isolationCode.value = targetCode;
      isolationHistory.value = getDataIsolationHistory_ACU();
      message.value = null;
      toast.success(`Đã chuyển sang ${targetCode || 'Dữ liệu mặc định (không cô lập)'}.`);
    } catch (e: any) {
      logError_ACU('[ACU-V2] applyIsolation failed', e);
      message.value = null;
      toast.error('Chuyển mã cô lập thất bại, xem chi tiết trong nhật ký chạy.');
    } finally {
      busyAction.value = '';
    }
  }

  async function removeHistory(code: string): Promise<void> {
    const target = normalizeIsolationCode_ACU(code);
    if (!target) return;
    busyAction.value = 'remove-history';
    try {
      const wasActive = target === activeIsolationCode.value;
      if (wasActive) {
        await switchIsolationProfile_ACU('');
      }
      removeDataIsolationHistory_ACU(target);
      refresh();
      if (wasActive) {
        activeIsolationCode.value = '';
        isolationCode.value = '';
        isolationHistory.value = getDataIsolationHistory_ACU();
        message.value = null;
        toast.success(`Đã xóa mã khỏi lịch sử: ${target}; hiện đã chuyển sang dữ liệu mặc định (không cô lập).`);
      } else {
        message.value = null;
        toast.success(`Đã xóa mã khỏi lịch sử: ${target}`);
      }
    } catch (e: any) {
      logError_ACU('[ACU-V2] removeHistory failed', e);
      message.value = null;
      toast.error('Xóa mã lịch sử thất bại, xem chi tiết trong nhật ký chạy.');
    } finally {
      busyAction.value = '';
    }
  }

  async function cleanupLegacyIsolationProfiles(): Promise<void> {
    if (busyAction.value) return;
    busyAction.value = 'cleanup-legacy-isolation';
    try {
      const result = await cleanupLegacyIsolationProfiles_ACU();
      refresh();
      message.value = null;
      if (result.failedCodes.length > 0) {
        toast.warning(`Đã dọn ${result.removedCodes.length} nhãn cô lập cũ; ${result.failedCodes.length} lần xóa thất bại, đã giữ lại đăng ký, có thể thử lại.`);
      } else if (result.removedCodes.length === 0) {
        toast.info('Không tìm thấy nhãn cô lập cũ nào có thể dọn.');
      } else {
        toast.success(`Đã dọn ${result.removedCodes.length} nhãn cô lập cũ và chuyển sang dữ liệu mặc định.`);
      }
    } catch (e: any) {
      logError_ACU('[ACU-V2] cleanupLegacyIsolationProfiles failed', e);
      message.value = null;
      toast.error('Dọn nhãn cô lập cũ thất bại, xem chi tiết trong nhật ký chạy.');
    } finally {
      busyAction.value = '';
    }
  }

  async function deleteCurrentIsolationEntries(): Promise<void> {
    busyAction.value = 'delete-isolation-entries';
    try {
      await deleteAllGeneratedEntries_ACU();
      message.value = null;
      toast.success('Đã xóa các mục chèn CSDL tương ứng với mã hiện tại.');
    } catch (e: any) {
      logError_ACU('[ACU-V2] deleteCurrentIsolationEntries failed', e);
      message.value = null;
      toast.error('Xóa mục chèn thất bại, xem chi tiết trong nhật ký chạy.');
    } finally {
      busyAction.value = '';
    }
  }

  async function importCombinedSettings(file: File): Promise<void> {
    busyAction.value = 'import-combined';
    try {
      const text = await readFileText(file);
      const combinedData = JSON.parse(text);
      if (!Array.isArray(combinedData?.prompt)) throw new Error('"prompt" có giá trị phải là mảng.');
      if (!combinedData?.template || typeof combinedData.template !== 'object') throw new Error('Thiếu đối tượng "template" hợp lệ.');

      applyCombinedSettingsImport_ACU(combinedData);
      const applied = await applyTemplateSnapshotToScope_ACU(combinedData.template, {
        scope: 'global',
        source: 'v2_import_combined',
        presetName: '',
        save: true,
        persistChatScope: false,
      });
      if (!applied) throw new Error('Cấu trúc mẫu không hợp lệ, không thể áp dụng vào mẫu toàn cục hiện tại.');
      if (typeof applied === 'object' && 'saved' in applied && applied.saved === false) {
        throw new Error((applied as any).error || 'Mẫu đã được phân tích nhưng áp dụng vào mẫu toàn cục hiện tại thất bại (bản cam kết điều phối của cuộc trò chuyện hiện tại bị từ chối).');
      }
      refresh();
      message.value = null;
      toast.success('Đã nhập cấu hình gộp: prompt, cài đặt gộp và mẫu toàn cục đã được cập nhật.', { muteable: false });
    } catch (e: any) {
      logError_ACU('[ACU-V2] importCombinedSettings failed', e);
      setMessage(message, 'error', `Nhập gộp thất bại: ${e?.message || 'Lỗi không xác định'}`);
    } finally {
      busyAction.value = '';
    }
  }

  function exportCombinedSettings(): void {
    try {
      const payload = buildCombinedExportPayload();
      downloadJson('TavernDB_Combined_Settings.json', payload);
      message.value = null;
      toast.success('Đã xuất cấu hình gộp.');
    } catch (e: any) {
      logError_ACU('[ACU-V2] exportCombinedSettings failed', e);
      message.value = null;
      toast.error('Xuất cấu hình gộp thất bại, xem chi tiết trong nhật ký chạy.');
    }
  }

  function exportJsonData(): void {
    if (!currentJsonTableData_ACU) {
      message.value = null;
      toast.warning('Không có CSDL để xuất. Hãy bắt đầu một cuộc trò chuyện hoặc nạp dữ liệu cuộc trò chuyện hiện tại trước.');
      return;
    }
    try {
      const sanitized = sanitizeChatSheetsObject_ACU(currentJsonTableData_ACU, { ensureMate: true });
      const chatName = String(currentChatFileIdentifier_ACU || 'current_chat').replace(/[\\/:*?"<>|]+/g, '_');
      downloadJson(`TavernDB_data_${chatName}.json`, sanitized);
      message.value = null;
      toast.success('Đã xuất JSON CSDL của cuộc trò chuyện hiện tại.');
    } catch (e: any) {
      logError_ACU('[ACU-V2] exportJsonData failed', e);
      message.value = null;
      toast.error('Xuất JSON thất bại, xem chi tiết trong nhật ký chạy.');
    }
  }

  function exportTableCheckpoint(): void {
    try {
      const checkpoint = buildCurrentTableCheckpoint_ACU();
      const chatName = String(currentChatFileIdentifier_ACU || 'current_chat').replace(/[\\/:*?"<>|]+/g, '_');
      downloadJson(`TavernDB_checkpoint_${chatName}_${formatCheckpointExportTimestamp()}.json`, checkpoint);
      message.value = null;
      toast.success('Đã xuất Checkpoint của cuộc trò chuyện hiện tại.');
    } catch (e: any) {
      logError_ACU('[ACU-V2] exportTableCheckpoint failed', e);
      message.value = null;
      toast.error(`Xuất Checkpoint thất bại: ${e?.message || 'Lỗi không xác định'}`);
    }
  }

  function exportMixedStorageSnapshots(): void {
    const decision = mixedStorageDecision.value;
    if (!decision) {
      toast.warning('Hiện không có quyết định lưu trữ hỗn hợp nào để xuất.');
      return;
    }
    busyAction.value = 'export-mixed-storage-snapshots';
    try {
      const transfer = buildRegisteredMixedStorageSnapshotTransfer_ACU(decision.decisionId);
      downloadJson(transfer.legacy.filename, transfer.legacy.payload);
      downloadJson(transfer.v2.filename, transfer.v2.payload);
      toast.success('Đã xuất hai snapshot lưu trữ hỗn hợp legacy-v1 và V2.');
    } catch (e: any) {
      logError_ACU('[ACU-V2] exportMixedStorageSnapshots failed', e);
      mixedStorageDecision.value = getActiveMixedStorageDecisionSummary_ACU();
      toast.error(`Xuất snapshot lưu trữ hỗn hợp thất bại: ${e?.message || 'Lỗi không xác định'}`);
    } finally {
      busyAction.value = '';
    }
  }

  async function commitMixedStorageDecision(action: MixedStorageCommitAction_ACU): Promise<void> {
    const decision = mixedStorageDecision.value;
    if (!decision) {
      toast.warning('Quyết định lưu trữ hỗn hợp đã hết hiệu lực, vui lòng nạp lại cuộc trò chuyện hiện tại.');
      return;
    }
    busyAction.value = `commit-mixed-storage-${action}`;
    try {
      const result = await commitRegisteredMixedStorageDecision_ACU(decision.decisionId, action);
      mixedStorageDecision.value = getActiveMixedStorageDecisionSummary_ACU();
      if (result.status === 'committed') {
        toast.success(action === 'keep_v2' ? 'Đã giữ dữ liệu V2 và dọn dữ liệu legacy dư thừa.' : 'Đã cam kết ứng viên gộp lưu trữ hỗn hợp đã được xác minh.');
      } else if (result.status === 'committed_postcondition_failed') {
        toast.warning(`Dữ liệu đã được lưu nhưng kiểm tra hậu điều kiện thất bại: ${result.error || 'Lỗi không xác định'}. Vui lòng nạp lại cuộc trò chuyện hiện tại rồi đối chiếu dữ liệu.`, { muteable: false, durationMs: 6000 });
      } else {
        toast.error(`Cam kết lưu trữ hỗn hợp thất bại: ${result.error || 'Lỗi không xác định'}`);
      }
    } catch (e: any) {
      logError_ACU('[ACU-V2] commitMixedStorageDecision failed', e);
      mixedStorageDecision.value = getActiveMixedStorageDecisionSummary_ACU();
      toast.error(`Quyết định lưu trữ hỗn hợp đã hết hiệu lực: ${e?.message || 'Lỗi không xác định'}`);
    } finally {
      busyAction.value = '';
    }
  }

  async function scanV2IsolationDiagnostics(): Promise<void> {
    busyAction.value = 'scan-v2-isolation-diagnostics';
    try {
      v2IsolationDiagnostics.value = await scanV2IsolationDiagnostics_ACU();
      if (v2IsolationDiagnostics.value.length === 0) {
        toast.warning('Cuộc trò chuyện hiện tại không có V2 storage frame, không thể tạo chẩn đoán khôi phục miền cô lập.');
      } else {
        toast.info(`Đã hoàn tất chẩn đoán chỉ đọc cho ${v2IsolationDiagnostics.value.length} miền cô lập V2.`);
      }
    } catch (e: any) {
      logError_ACU('[ACU-V2] scanV2IsolationDiagnostics failed', e);
      v2IsolationDiagnostics.value = [];
      toast.error(`Chẩn đoán miền cô lập V2 thất bại: ${e?.message || 'Lỗi không xác định'}`);
    } finally {
      busyAction.value = '';
    }
  }

  async function prepareV2Recovery(): Promise<void> {
    busyAction.value = 'prepare-v2-recovery';
    try {
      v2RecoverySummary.value = await prepareV2Recovery_ACU();
      const summary = v2RecoverySummary.value;
      if (summary.status === 'recoverable_repaired_checkpoint') {
        toast.warning('Phát hiện V2 full checkpoint có thể sửa. Hãy xuất bản sao lưu frame gốc trước, rồi xác nhận cam kết.', { muteable: false, durationMs: 6000 });
      } else if (summary.status === 'recoverable_orphan_data_replace') {
        toast.warning('Phát hiện data_replace không có mốc neo. Việc khôi phục này phải được xác nhận rõ ràng hai lần.', { muteable: false, durationMs: 6000 });
      } else if (summary.status === 'recoverable_temporary_sheet_anchor') {
        toast.warning('Phát hiện phát lại lịch sử phụ thuộc vào việc bổ sung mốc neo bằng Sheet tạm. Hãy cam kết khôi phục để cố định trạng thái tương thích thành integrity_repair checkpoint.', { muteable: false, durationMs: 6000 });
      } else if (summary.status === 'recoverable_redundant_full_checkpoint') {
        toast.warning('Phát hiện nhiều full checkpoint dưới cùng một khóa cô lập (phát lại chỉ nhận cái cuối cùng, các phần tăng thêm trước đó đã mất hiệu lực). Hãy xuất bản sao lưu frame gốc trước, rồi cam kết hội tụ.', { muteable: false, durationMs: 6000 });
      } else if (summary.status === 'recoverable_compat_tolerant_replay') {
        if (summary.planId) {
          toast.warning(
            summary.requiresConfirmation
              ? 'Phát hiện lịch sử trò chuyện chỉ đọc được qua phát lại tương thích khoan dung, và kết quả tương thích có gộp danh tính sheetKey. Sau khi xác nhận có thể cố định thành gốc chuyển tiếp, khôi phục ghi và bắt kịp.'
              : 'Phát hiện lịch sử trò chuyện chỉ đọc được qua phát lại tương thích khoan dung (ghi/bắt kịp bị từ chối). Hãy cam kết cố định để ghi kết quả phát lại tương thích thành gốc chuyển tiếp có thể phát lại nghiêm ngặt.',
            { muteable: false, durationMs: 6000 },
          );
        } else {
          toast.warning(summary.message, { muteable: false, durationMs: 8000 });
        }
      } else if (summary.status === 'unrecoverable_late_checkpoint_artifacts') {
        toast.warning('Phát hiện cả hai phía của checkpoint muộn hơn đều có V2 artifact. Tự động dời lên sẽ thay đổi ngữ nghĩa phát lại hậu tố; hãy xuất bản sao lưu khôi phục trước rồi đối chiếu thủ công.', { muteable: false, durationMs: 6000 });
      } else {
        toast.warning(summary.message, { muteable: false, durationMs: 6000 });
      }
    } catch (e: any) {
      logError_ACU('[ACU-V2] prepareV2Recovery failed', e);
      v2RecoverySummary.value = null;
      toast.error(`Chẩn đoán khôi phục V2 thất bại: ${e?.message || 'Lỗi không xác định'}`);
    } finally {
      busyAction.value = '';
    }
  }

  function exportV2RecoveryBackups(): void {
    const isolationKey = getCurrentIsolationKey_ACU();
    const backups = getChatArray_ACU().flatMap((message: any, messageIndex: number) => {
      if (message?.is_user) return [];
      const backup = readIsolatedTagData_ACU(message, isolationKey)?.recoveryBackup;
      return backup ? [{ messageIndex, backup: JSON.parse(JSON.stringify(backup)) }] : [];
    });
    if (backups.length === 0) {
      toast.warning('Mã cô lập hiện tại không có bản sao lưu frame gốc khôi phục V2 nào để xuất.');
      return;
    }
    try {
      const chatName = String(currentChatFileIdentifier_ACU || 'current_chat').replace(/[\/:*?"<>|]+/g, '_');
      downloadJson(`TavernDB_v2_recovery_backups_${chatName}_${formatCheckpointExportTimestamp()}.json`, { version: 1, isolationKey, backups });
      toast.success(`Đã xuất ${backups.length} bản sao lưu frame gốc khôi phục V2.`);
    } catch (e: any) {
      logError_ACU('[ACU-V2] exportV2RecoveryBackups failed', e);
      toast.error(`Xuất sao lưu khôi phục V2 thất bại: ${e?.message || 'Lỗi không xác định'}`);
    }
  }

  async function commitV2Recovery(options: CommitPreparedV2RecoveryOptions_ACU = {}): Promise<void> {
    const summary = v2RecoverySummary.value;
    if (!summary?.planId || !summary.status.startsWith('recoverable_')) {
      toast.warning('Kế hoạch khôi phục V2 đã hết hiệu lực, vui lòng chẩn đoán lại.');
      return;
    }
    const isCompatFixation = summary.status === 'recoverable_compat_tolerant_replay';
    busyAction.value = 'commit-v2-recovery';
    try {
      const result = await commitPreparedV2Recovery_ACU(summary.planId, options);
      if (result.status === 'committed') {
        v2RecoverySummary.value = null;
        toast.success(isCompatFixation
          ? 'Kết quả phát lại tương thích đã được cố định thành gốc chuyển tiếp; storage frame gốc không bị ghi đè, ghi và bắt kịp đã khôi phục.'
          : 'Đã lưu khôi phục V2; frame gốc đã được ghi vào bản sao lưu cô lập.');
      } else if (result.status === 'committed_postcondition_failed') {
        v2RecoverySummary.value = null;
        toast.warning(`Đã lưu khôi phục V2 nhưng kiểm tra hậu điều kiện thất bại: ${result.error || 'Lỗi không xác định'}. Vui lòng nạp lại cuộc trò chuyện hiện tại để đối chiếu dữ liệu.`, { muteable: false, durationMs: 6000 });
      } else {
        toast.error(`Cam kết khôi phục V2 thất bại: ${result.error || 'Lỗi không xác định'}`);
      }
    } catch (e: any) {
      logError_ACU('[ACU-V2] commitV2Recovery failed', e);
      toast.error(`Cam kết khôi phục V2 bất thường: ${e?.message || 'Lỗi không xác định'}`);
    } finally {
      busyAction.value = '';
    }
  }

  async function parseTableCheckpoint(file: File): Promise<TableCheckpointFileV1_ACU | null> {
    busyAction.value = 'parse-checkpoint';
    try {
      const parsed = parseTableCheckpointFile_ACU(await readFileText(file));
      if (parsed.success === false) throw new Error(parsed.error);
      return parsed.checkpoint;
    } catch (e: any) {
      logError_ACU('[ACU-V2] parseTableCheckpoint failed', e);
      message.value = null;
      toast.error(`Tệp Checkpoint không hợp lệ: ${e?.message || 'Lỗi không xác định'}`);
      return null;
    } finally {
      busyAction.value = '';
    }
  }

  async function restoreTableCheckpoint(checkpoint: TableCheckpointFileV1_ACU): Promise<void> {
    busyAction.value = 'restore-checkpoint';
    try {
      const result = await restoreTableCheckpointToLatestAi_ACU(checkpoint);
      if (!result.success) throw new Error(result.error || 'Khôi phục Checkpoint thất bại.');
      refresh();
      message.value = null;
      const cleanupWarnings = result.cleanupWarnings || [];
      const derivedRefreshWarnings = result.derivedRefreshWarnings || [];
      const postCondition = result.postCondition;
      const postConditionFailures = !postCondition
        ? ['Thiếu hậu điều kiện khôi phục']
        : [
            !postCondition.runtimeMatches ? 'Dữ liệu runtime không nhất quán' : '',
            !postCondition.scopeIsChatOverride ? 'Phạm vi mẫu không phải chat_override' : '',
            !postCondition.templateMatches ? 'Snapshot mẫu của cuộc trò chuyện không nhất quán' : '',
            !postCondition.guideMatches ? 'Bảng hướng dẫn không nhất quán' : '',
          ].filter(Boolean);
      const providerFallback = getCurrentStorageMode() === 'sqlite' && postCondition?.providerMode === 'native';
      const warnings = [
        ...derivedRefreshWarnings.map(warning => `Làm mới phái sinh: ${warning}`),
        ...cleanupWarnings.map(warning => `Dọn dẹp: ${warning}`),
      ];
      const targetMessage = `tin nhắn thứ ${result.restoredMessageIndex! + 1}`;
      const providerMessage = `Lưu trữ thực tế: ${postCondition?.providerMode || 'Không khả dụng'}`;
      if (warnings.length || postConditionFailures.length || providerFallback) {
        const reasons = [
          ...postConditionFailures,
          providerFallback ? 'Mục tiêu đặt là SQLite, lưu trữ thực tế fallback về native' : '',
          ...warnings,
        ].filter(Boolean).join('; ');
        toast.warning(`Checkpoint đã khôi phục về ${targetMessage}, nhưng chỉ thành công một phần: ${providerMessage}; ${reasons}.`, { muteable: false, durationMs: 6000 });
      } else {
        toast.success(`Checkpoint đã khôi phục về ${targetMessage}; ${providerMessage}.`, { muteable: false });
      }
      for (const warning of cleanupWarnings) logError_ACU('[ACU-V2] Checkpoint cleanup warning', warning);
      for (const warning of derivedRefreshWarnings) logError_ACU('[ACU-V2] Checkpoint derived refresh warning', warning);
    } catch (e: any) {
      logError_ACU('[ACU-V2] restoreTableCheckpoint failed', e);
      message.value = null;
      toast.error(`Khôi phục Checkpoint thất bại: ${e?.message || 'Lỗi không xác định'}`, { muteable: false });
    } finally {
      busyAction.value = '';
    }
  }

  async function resetAllDefaults(options: ResetDefaultsCleanupOptions = {}): Promise<void> {
    const cleanup = normalizeResetDefaultsOptions(options);
    if (!hasSelectedResetDefaultsOption(cleanup)) {
      toast.warning('Chưa chọn mục cần khôi phục hoặc dọn.');
      return;
    }

    busyAction.value = 'reset-defaults';
    try {
      const outcome = await resetAllDefaults_ACU(cleanup);
      if (outcome.skipped) {
        message.value = null;
        toast.warning(outcome.failures[0]?.error || 'Chưa chọn mục cần khôi phục hoặc dọn.');
        return;
      }
      if (!outcome.success) {
        const hardFailures = outcome.failures.filter(f => f.step !== 'derived_refresh');
        const summary = outcome.failures.map(f => `${f.step}: ${f.error}`).join('; ');
        message.value = null;
        if (hardFailures.length > 0) {
          toast.error(hardFailures.some(f => f.compensated)
            ? `Khôi phục mặc định thất bại một phần: ${summary}`
            : `Khôi phục mặc định thất bại: ${summary}`);
        } else {
          toast.warning(`Đã khôi phục cấu hình mặc định theo các mục đã chọn, nhưng việc làm mới sau đó chưa hoàn tất: ${summary}`);
        }
        return;
      }
      if (outcome.warnings.length) {
        toast.warning(`Đã khôi phục cấu hình mặc định theo các mục đã chọn, nhưng một phần việc làm mới sau đó chưa hoàn tất: ${outcome.warnings.join('; ')}`);
      } else {
        toast.success('Đã khôi phục cấu hình mặc định theo các mục đã chọn.');
      }
      refresh();
      message.value = null;
    } catch (e: any) {
      logError_ACU('[ACU-V2] resetAllDefaults failed', e);
      message.value = null;
      toast.error('Khôi phục mặc định thất bại, xem chi tiết trong nhật ký chạy.');
    } finally {
      busyAction.value = '';
    }
  }

  async function overrideLatestLayerWithTemplate(): Promise<void> {
    busyAction.value = 'override-latest';
    try {
      applyTemplateScopeForCurrentChat_ACU();
      const templateData = parseTableTemplateJson_ACU({ stripSeedRows: true });
      if (!templateData) throw new Error('Không thể phân tích mẫu đang có hiệu lực hiện tại.');
      const modifiedCount = await overrideLatestLayerWithTemplateCore_ACU(templateData);
      if (modifiedCount > 0) {
        await loadOrCreateJsonTableFromChatHistory_ACU();
        await refreshMergedDataAndNotify_ACU();
        message.value = null;
        toast.success(`Đã dùng mẫu đang có hiệu lực hiện tại để ghi đè ${modifiedCount} bảng của tầng AI mới nhất.`, { muteable: false });
      } else {
        message.value = null;
        toast.info('Không tìm thấy dữ liệu bảng của tầng AI mới nhất có thể ghi đè.', { muteable: false });
      }
    } catch (e: any) {
      logError_ACU('[ACU-V2] overrideLatestLayerWithTemplate failed', e);
      message.value = null;
      toast.error('Ghi đè mẫu thất bại, xem chi tiết trong nhật ký chạy.');
    } finally {
      busyAction.value = '';
    }
  }

  /**
   * 预判当前范围输入会走哪条删除路径，供页面生成确认文案。
   * 与服务层 deleteLocalDataWithScope_ACU 使用同一判定函数，不重复实现规则。
   */
  function resolveDeletionPath(mode: 'current' | 'all'): 'purge' | 'range' {
    if (mode !== 'all') return 'range';
    // 按表删除永不硬清空：其它表与聊天级 guide/scope 必须保留。
    if (hasDeleteSheetSelection.value) return 'range';
    const start = normalizeFloorValue(deleteRange.startFloor);
    const end = normalizeFloorValue(deleteRange.endFloor);
    return isFullRangeDeletionRequest_ACU(start, end, getAiMessageCount()) ? 'purge' : 'range';
  }

  async function deleteLocalData(mode: 'current' | 'all'): Promise<void> {
    const expectedPath = resolveDeletionPath(mode);
    const sheetKeys = hasDeleteSheetSelection.value ? [...deleteSheetKeys.value] : null;
    busyAction.value = expectedPath === 'purge'
      ? 'purge-all-local'
      : (mode === 'current' ? 'delete-current-local' : 'delete-all-local');
    try {
      const start = normalizeFloorValue(deleteRange.startFloor);
      const end = normalizeFloorValue(deleteRange.endFloor);
      settings_ACU.deleteStartFloor = start;
      settings_ACU.deleteEndFloor = end;
      saveSettings_ACU();

      // 只在选表时传第 5 参：整楼层删除的调用形态保持不变。
      const outcome = sheetKeys
        ? await deleteLocalDataWithScope_ACU(mode, start, end, expectedPath, sheetKeys)
        : await deleteLocalDataWithScope_ACU(mode, start, end, expectedPath);

      if (outcome.path === 'aborted') {
        message.value = null;
        toast.warning(outcome.reason, { muteable: false, durationMs: 6000 });
        return;
      }
      if (outcome.path === 'purge') {
        applyPurgeOutcome(outcome.result);
        return;
      }
      await applyRangeDeletionOutcome(outcome.deletedCount, sheetKeys ? selectedDeleteSheetNames.value : null);
    } catch (e: any) {
      logError_ACU('[ACU-V2] deleteLocalData failed', e);
      message.value = null;
      toast.error('Xóa dữ liệu cục bộ thất bại, xem chi tiết trong nhật ký chạy.');
    } finally {
      busyAction.value = '';
    }
  }

  async function applyRangeDeletionOutcome(deletedCount: number, sheetNames: string[] | null = null): Promise<void> {
    if (deletedCount > 0) {
      await loadOrCreateJsonTableFromChatHistory_ACU();
      if (isSqliteMode()) await reloadStorageProvider();
      await refreshMergedDataAndNotify_ACU();
      const worldbookDeleted = await cleanupWorldbookEntriesAfterDataDeletion_ACU();
      refresh();
      const scopeText = sheetNames && sheetNames.length > 0
        ? `Bảng「${sheetNames.join('」「')}」trong ${deletedCount} tin nhắn có dữ liệu`
        : `${deletedCount} tin nhắn chứa dữ liệu cục bộ`;
      setMessage(
        message,
        'success',
        `Đã xóa ${scopeText}${worldbookDeleted ? `, đồng thời dọn ${worldbookDeleted} mục sổ thế giới` : ''}.`,
      );
      const text = message.value?.text || '';
      message.value = null;
      toast.success(text, { muteable: false });
    } else {
      message.value = null;
      toast.info('Không tìm thấy dữ liệu phù hợp với phạm vi hiện tại.', { muteable: false });
    }
  }

  /**
   * 应用硬清空（purge）结果到 UI（C 方案接线 purge 的收尾）。
   *
   * 与 applyRangeDeletionOutcome 的收尾差异：
   * - 不调用 loadOrCreateJsonTableFromChatHistory_ACU / reloadStorageProvider：
   *   purgeCurrentChatDatabaseState_ACU 内部已在严格保存后回落为当前全局模板的
   *   header-only 空结构（S1-1，pristine：不写 frame，首次填表才建根），此处只需刷新展示。
   * - 不调用 cleanupWorldbookEntriesAfterDataDeletion_ACU（C3）：purge 内部已做
   *   cleanupDatabaseGeneratedWorldbookEntries_ACU，结果进入 result.cleanupWarnings。
   * - 调用 refreshMergedDataAndNotify_ACU 让各面板显示回落后的模板空结构（S1-1 语义下
   *   "从模板重建空结构"是期望行为，不再是需要防御的重新物化）。
   * - 表格页面（FormFill/Dashboard）的显示由 getCurrentTableDisplayData_ACU 纯读取回退到
   *   当前全局模板（stripSeedRows），页面 mount/既有 refresh tick 即可展示，无需重新物化 runtime。
   */
  async function applyPurgeOutcome(result: { saved: boolean; clearedMessageCount: number; removedMetadata: string[]; cleanupWarnings?: string[]; error?: string }): Promise<void> {
    if (!result.saved) {
      message.value = null;
      toast.error(result.error || 'Hard clear thất bại, xem chi tiết trong nhật ký chạy.', { muteable: false });
      return;
    }
    await refreshMergedDataAndNotify_ACU();
    refresh();
    if (result.cleanupWarnings?.length) {
      toast.warning(`Toàn bộ dữ liệu cục bộ đã bị hard clear (${result.clearedMessageCount} tin nhắn). Cảnh báo: ${result.cleanupWarnings[0]}`, { muteable: false, durationMs: 6000 });
    } else {
      const removed = result.removedMetadata.length ? `, xóa siêu dữ liệu: ${result.removedMetadata.join(', ')}` : '';
      toast.success(`Đã xóa toàn bộ dữ liệu cục bộ (${result.clearedMessageCount} tin nhắn)${removed}.`, { muteable: false });
    }
  }

  function setRetainRecentLayers(value: number | string): void {
    const normalized = normalizeRetainRecentLayers(value);
    retainRecentLayers.value = normalized;
    settings_ACU.retainRecentLayers = normalized;
    saveSettings_ACU();
    message.value = null;
  }

  return {
    message,
    busyAction,
    isolationCode,
    isolationHistory,
    mixedStorageDecision,
    v2RecoverySummary,
    v2IsolationDiagnostics,
    isolationHistoryOptions,
    legacyIsolationCodes,
    legacyIsolationCount,
    currentIsolationLabel,
    isolationModeLabel,
    deleteRange,
    deleteSheetKeys,
    deletableSheetOptions,
    hasDeleteSheetSelection,
    selectedDeleteSheetNames,
    toggleDeleteSheetKey,
    clearDeleteSheetSelection,
    retainRecentLayers,
    rangeLabel,
    aiMessageCount,
    tableCount,
    refresh,
    getCheckpointTargetStorageMode,
    applyIsolation,
    removeHistory,
    cleanupLegacyIsolationProfiles,
    deleteCurrentIsolationEntries,
    importCombinedSettings,
    exportCombinedSettings,
    exportJsonData,
    exportTableCheckpoint,
    exportMixedStorageSnapshots,
    commitMixedStorageDecision,
    scanV2IsolationDiagnostics,
    prepareV2Recovery,
    exportV2RecoveryBackups,
    commitV2Recovery,
    parseTableCheckpoint,
    restoreTableCheckpoint,
    resetAllDefaults,
    overrideLatestLayerWithTemplate,
    deleteLocalData,
    resolveDeletionPath,
    setRetainRecentLayers,
  };
}
