import { computed, ref, type ComputedRef, type Ref } from 'vue';
import {
  settings_ACU,
  abortAllActiveRequests_ACU,
  _set_isAutoUpdatingCard_ACU,
  _set_manualExtraHint_ACU,
  _set_wasStoppedByUser_ACU,
  getCurrentIsolationKey_ACU,
} from '../../service/runtime/state-manager';
import { getChatArray_ACU } from '../../service/chat/chat-service';
import { saveSettings_ACU } from '../../service/settings/settings-service';
import {
  getCurrentTableDisplayData_ACU,
  getCurrentWorldbookConfig_ACU,
  hasRuntimeTableData_ACU,
} from '../../service/settings/settings-readers';
import { getSortedSheetKeys_ACU } from '../../service/template/chat-scope';
import { collectV2CheckpointFloorsFromChat_ACU } from '../../service/table/table-history';
import {
  executeCardUpdateCore_ACU,
  orchestrateManualCatchUp_ACU,
  orchestrateManualUpdate_ACU,
  prepareManualCatchUpPlan_ACU,
  processUpdatesBatch_ACU,
  type BatchUpdateProgressContext,
  type CardUpdateProgressEvent,
} from '../../service/table/update-orchestrator';
import { resolveManualUpdateBatchSize_ACU, resolveManualUpdateContextDepth_ACU } from '../../service/table/manual-update-settings';
import { refreshMergedDataAndNotify_ACU } from '../../service/worldbook/pipeline';
import { getCurrentCharPrimaryLorebook_ACU } from '../../service/worldbook/worldbook-service';
import { topLevelWindow_ACU } from '../../shared/env';
import { useDialogStore } from '../stores/dialog-store';
import { useToastStore } from '../stores/toast-store';

type MessageKind = 'info' | 'success' | 'warning' | 'error';

/** 气泡与桌宠里显示的功能名。 */
const MANUAL_UPDATE_TASK_FEATURE = 'Điền bảng thủ công';
const CATCH_UP_TASK_FEATURE = 'Bắt kịp thủ công';

/** 宿主世界书 API 挂起时确认弹窗不能被无限期拖住，超过该时长即降级为提示文案。 */
const INJECTION_TARGET_RESOLVE_TIMEOUT_MS = 1500;
const RESOLVE_TIMEOUT: unique symbol = Symbol('injection-target-resolve-timeout');

/**
 * 确认弹窗用的世界书注入目标描述：大规模历史回填会一次生成上百条 TavernDB 条目，
 * 用户必须在确认前看到它们将写入哪本世界书（默认是角色卡绑定的主世界书，而不是
 * 用户新建的外挂数据库世界书）。解析失败或超时不阻断确认流程，只降级为提示文案。
 */
async function describeInjectionTargetForConfirm(): Promise<string> {
  const target = String(getCurrentWorldbookConfig_ACU()?.injectionTarget || '').trim() || 'character';
  if (target !== 'character') return target;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  try {
    const primary = await Promise.race<string | null | typeof RESOLVE_TIMEOUT>([
      getCurrentCharPrimaryLorebook_ACU(),
      new Promise<typeof RESOLVE_TIMEOUT>(resolve => {
        timeoutHandle = setTimeout(() => resolve(RESOLVE_TIMEOUT), INJECTION_TARGET_RESOLVE_TIMEOUT_MS);
      }),
    ]);
    if (primary === RESOLVE_TIMEOUT) return 'Thẻ nhân vật gắn sổ thế giới (hết thời gian phân tích sổ thế giới chính)';
    return primary ? `Thẻ nhân vật gắn sổ thế giới · ${primary}` : 'Thẻ nhân vật gắn sổ thế giới (chưa phân tích được sổ thế giới chính)';
  } catch {
    return 'Thẻ nhân vật gắn sổ thế giới (chưa phân tích được sổ thế giới chính)';
  } finally {
    if (timeoutHandle !== null) clearTimeout(timeoutHandle);
  }
}

export interface ManualUpdateState {
  selectedManualTableKeys: Ref<string[]>;
  manualContextDepth: Ref<number>;
  manualBatchSize: Ref<number>;
  manualExtraHint: Ref<string>;
  manualUpdateBusy: Ref<boolean>;
  catchUpBusy: Ref<boolean>;
  sheetKeys: ComputedRef<string[]>;
  sheetNames: ComputedRef<Record<string, string>>;
  /** runtime 是否已持有真实表格数据；false（如 purge 后）时展示层仅展示模板，选择器应禁用 */
  runtimeReady: ComputedRef<boolean>;
  selectedSheetSummary: ComputedRef<string>;
  checkpointFloorsLabel: ComputedRef<string>;
  manualRefillRangeLabel: ComputedRef<string>;
  checkpointRiskMessage: ComputedRef<string>;
  vectorIndexWarning: ComputedRef<boolean>;
  refresh: () => void;
  setManualContextDepth: (value: number | string) => void;
  setManualBatchSize: (value: number | string) => void;
  setManualSelectedKeys: (keys: string[]) => void;
  selectAllManualTables: () => void;
  selectNoManualTables: () => void;
  runManualUpdate: () => Promise<void>;
  runManualCatchUp: () => Promise<void>;
}

function currentSheetKeys(): string[] {
  try {
    return getSortedSheetKeys_ACU(getCurrentTableDisplayData_ACU() || {});
  } catch {
    return [];
  }
}

/**
 * 执行用表键：仅 runtime 真实表。
 * runtime 未就绪（purge 后为 null / 空）时返回 []，避免把模板表
 * 当作可执行数据传给 orchestrator。
 */
function runtimeExecutionSheetKeys(): string[] {
  if (!hasRuntimeTableData_ACU()) return [];
  try {
    return getSortedSheetKeys_ACU(getCurrentTableDisplayData_ACU() || {});
  } catch {
    return [];
  }
}

/**
 * TOCTOU 执行边界校验：确认后重新读取 runtime，
 * 要求当前 runtime 表集合与确认前快照完全一致，且快照目标仍全部有效。
 * 任一变化（purge、表删除、新增表、外部直接写 Ref 篡改选择）都会 fail-closed 阻断，
 * 避免在确认文案与最终执行目标不一致的情况下继续破坏性操作。
 */
function runtimeTargetsStillMatch(snapshotKeys: string[], requestedKeys: string[]): boolean {
  if (!requestedKeys.length || !hasRuntimeTableData_ACU()) return false;
  const currentKeys = runtimeExecutionSheetKeys();
  if (currentKeys.length !== snapshotKeys.length) return false;
  const snapshotSet = new Set(snapshotKeys);
  if (!currentKeys.every((key) => snapshotSet.has(key))) return false;
  return requestedKeys.every((key) => snapshotSet.has(key));
}

function resolveManualSelection(keys: string[]): string[] {
  if (!keys.length) return [];
  const saved = Array.isArray(settings_ACU.manualSelectedTables) ? settings_ACU.manualSelectedTables : [];
  if (settings_ACU.hasManualSelection !== true) return keys.slice();
  const valid = new Set(keys);
  return saved.filter((key: string) => valid.has(key));
}

function saveManualSelection(keys: string[]): void {
  // runtime 未就绪（如 purge 后）时禁止写入手动选表配置：
  // 此时展示的是模板表，若把空选择写回会永久覆盖用户原有选表偏好
  // （hasManualSelection=true + manualSelectedTables=[]），待 runtime 恢复后
  // resolveManualSelection 会错误地继续返回空数组。必须 fail-closed 保持原状态。
  if (!hasRuntimeTableData_ACU()) return;
  const valid = new Set(runtimeExecutionSheetKeys());
  settings_ACU.manualSelectedTables = keys.filter(key => valid.has(key));
  settings_ACU.hasManualSelection = true;
  saveSettings_ACU();
}

function normalizeNonNegativeInteger(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}

// 手动面板的层数/分批参数由 service 层统一解析：手动更新与一键追平都读同一处，
// 不再在 UI 侧临时改写自动填表的全局设置来“桥接”。
const resolveManualContextDepth = resolveManualUpdateContextDepth_ACU;
const resolveManualBatchSize = resolveManualUpdateBatchSize_ACU;

interface ManualRefillRangeSummary {
  indices: number[];
  startAiFloor: number;
  endAiFloor: number;
}

function resolveManualRefillRangeSummary_ACU(manualDepth: number): ManualRefillRangeSummary | null {
  const chat = getChatArray_ACU();
  if (!Array.isArray(chat) || chat.length === 0) return null;
  const aiItems = chat
    .map((msg: any, index: number) => (msg && !msg.is_user ? { index, aiFloor: 0 } : null))
    .filter((item): item is { index: number; aiFloor: number } => item !== null);
  aiItems.forEach((item, idx) => { item.aiFloor = idx + 1; });
  const skip = normalizeNonNegativeInteger(settings_ACU.skipUpdateFloors, 0);
  const effectiveAiItems = skip > 0 ? aiItems.slice(0, -skip) : aiItems.slice();
  const contextItems = manualDepth > 0 ? effectiveAiItems.slice(-manualDepth) : effectiveAiItems;
  if (!contextItems.length) return null;
  return {
    indices: contextItems.map(item => item.index),
    startAiFloor: contextItems[0].aiFloor,
    endAiFloor: contextItems[contextItems.length - 1].aiFloor,
  };
}

function formatAiFloorRange_ACU(startAiFloor: number, endAiFloor: number): string {
  return startAiFloor === endAiFloor
    ? `Tầng AI ${startAiFloor}`
    : `Tầng AI ${startAiFloor}~${endAiFloor}`;
}

function progressLabel(event: CardUpdateProgressEvent): string {
  const prefix = event.currentBatch && event.totalBatches
    ? `Đợt ${event.currentBatch}/${event.totalBatches} · `
    : '';
  if (event.message && event.phase !== 'retry' && event.phase !== 'error') {
    return `${prefix}${normalizeManualProgressMessage(event.message)}`;
  }
  switch (event.phase) {
    case 'preparing': return `${prefix} Chuẩn bị ngữ cảnh`;
    case 'calling_ai': return `${prefix}Gọi AI${event.attempt ? ` (lần thử ${event.attempt}/${event.maxRetries || '?'})` : ''}`;
    case 'parsing': return `${prefix} Phân tích kết quả điền bảng`;
    case 'saving': return `${prefix} Lưu dữ liệu bảng`;
    case 'retry': return `${prefix} Đang thử lại ${event.message ? `:${event.message}` : ''}`;
    case 'complete': return `${prefix} Hoàn tất`;
    case 'chunk_done': return `${prefix} Hoàn tất phân khối`;
    case 'error': return `${prefix} Gặp lỗi ${event.message ? `:${event.message}` : ''}`;
    default: return prefix || 'Đang xử lý';
  }
}

function normalizeManualProgressMessage(message: string): string {
  return message
    .split(' AI 响应').join('kết quả điền bảng thủ công')
    .split('AI 响应').join('kết quả điền bảng thủ công');
}

export function useManualUpdate(): ManualUpdateState {
  const dialogStore = useDialogStore();
  const toast = useToastStore();
  const selectedManualTableKeys = ref<string[]>(resolveManualSelection(runtimeExecutionSheetKeys()));
  const manualContextDepth = ref(resolveManualContextDepth());
  const manualBatchSize = ref(resolveManualBatchSize());
  const manualExtraHint = ref('');
  const manualUpdateBusy = ref(false);
  const catchUpBusy = ref(false);
  const refreshTick = ref(0);
  let progressToastId: string | null = null;
  let abortRequested = false;
  let catchUpAbortController: AbortController | null = null;

  function progressToastOptions(onAbort: () => void = requestAbort) {
    const isCatchUp = onAbort === requestCatchUpAbort;
    const abortDisabled = isCatchUp
      ? catchUpAbortController?.signal.aborted === true
      : abortRequested;
    return {
      durationMs: 0,
      muteable: false,
      dismissible: false,
      feature: isCatchUp ? CATCH_UP_TASK_FEATURE : MANUAL_UPDATE_TASK_FEATURE,
      action: abortDisabled
        ? undefined
        : {
            label: 'Dừng',
            variant: 'danger' as const,
            dismissOnClick: false,
            onClick: onAbort,
          },
    };
  }

  function notifyProgress(text: string, onAbort: () => void = requestAbort): void {
    if (progressToastId && toast.update(progressToastId, 'info', text, progressToastOptions(onAbort))) {
      return;
    }
    progressToastId = toast.info(text, progressToastOptions(onAbort));
  }

  function finishToast(kind: MessageKind, text: string): void {
    if (progressToastId) {
      if (toast.update(progressToastId, kind, text, { muteable: false })) {
        progressToastId = null;
        return;
      }
      progressToastId = null;
    }
    toast[kind](text, { muteable: false });
  }

  function requestAbort(): void {
    if (abortRequested) return;
    abortRequested = true;
    _set_wasStoppedByUser_ACU(true);
    abortAllActiveRequests_ACU();
    _set_isAutoUpdatingCard_ACU(false);
    if (progressToastId) {
      toast.update(progressToastId, 'warning', 'Đã dừng điền bảng thủ công, đang dừng tác vụ hiện tại và các đợt tiếp theo...', {
        durationMs: 0,
        muteable: false,
        dismissible: false,
        feature: MANUAL_UPDATE_TASK_FEATURE,
      });
    } else {
      toast.warning('Đã dừng điền bảng thủ công, đang dừng tác vụ hiện tại và các đợt tiếp theo...', {
        durationMs: 0,
        muteable: false,
        dismissible: false,
        feature: MANUAL_UPDATE_TASK_FEATURE,
      });
    }
  }

  function requestCatchUpAbort(): void {
    if (!catchUpAbortController || catchUpAbortController.signal.aborted) return;
    catchUpAbortController.abort();
    const text = 'Đã dừng bắt kịp thủ công, đang chờ hội tụ về ranh giới an toàn hiện tại...';
    const options = { durationMs: 0, muteable: false, dismissible: false, feature: CATCH_UP_TASK_FEATURE };
    if (progressToastId) {
      toast.update(progressToastId, 'warning', text, options);
    } else {
      toast.warning(text, options);
    }
  }

  const sheetKeys = computed(() => {
    void refreshTick.value;
    return currentSheetKeys();
  });

  /** runtime 就绪判据：仅真实表存在时选择器才允许交互 */
  const runtimeReady = computed<boolean>(() => {
    void refreshTick.value;
    return hasRuntimeTableData_ACU();
  });

  const sheetNames = computed<Record<string, string>>(() => {
    const displayData = getCurrentTableDisplayData_ACU() || {};
    const names: Record<string, string> = {};
    for (const key of sheetKeys.value) {
      names[key] = String(displayData[key]?.name || key);
    }
    return names;
  });

  const selectedSheetSummary = computed<string>(() => {
    const keys = selectedManualTableKeys.value;
    if (!keys.length) return 'Chưa chọn bảng';
    const names = sheetNames.value;
    return keys
      .map(key => `${names[key] || key} (${key})`)
      .join(', ');
  });

  const checkpointFloors = computed(() => {
    void refreshTick.value;
    try {
      return collectV2CheckpointFloorsFromChat_ACU(getChatArray_ACU(), getCurrentIsolationKey_ACU());
    } catch {
      return [];
    }
  });

  function formatCheckpointReasonLabel(reason?: string): string {
    switch (reason) {
      case 'init':
        return 'Mốc cơ sở ban đầu';
      case 'migration':
        return 'Mốc cơ sở di trú';
      case 'compaction':
        return 'Mốc cơ sở ranh giới lưu giữ';
      case 'manual':
        return 'Mốc cơ sở thủ công lịch sử';
      case 'periodic':
        return 'Mốc cơ sở chu kỳ lịch sử';
      default:
        return reason ? `Mốc cơ sở cũ: ${reason}` : 'Mốc cơ sở cũ';
    }
  }

  const checkpointFloorsLabel = computed<string>(() => {
    const checkpoints = checkpointFloors.value;
    return checkpoints.length > 0
      ? checkpoints
        .map(item => `Tầng AI ${item.aiFloor} (${formatCheckpointReasonLabel(item.reason)})`)
        .join(', ')
      : 'Nhãn cô lập hiện tại chưa có full checkpoint';
  });

  const manualRefillRange = computed<ManualRefillRangeSummary | null>(() => {
    void refreshTick.value;
    try {
      return resolveManualRefillRangeSummary_ACU(manualContextDepth.value);
    } catch {
      return null;
    }
  });

  const manualRefillRangeLabel = computed<string>(() => {
    const range = manualRefillRange.value;
    return range
      ? formatAiFloorRange_ACU(range.startAiFloor, range.endAiFloor)
      : 'Chưa có tầng AI nào có thể điền lại';
  });

  const checkpointRiskMessage = computed<string>(() => {
    const checkpoints = checkpointFloors.value;
    const range = manualRefillRange.value;
    if (checkpoints.length === 0 || !range) return '';
    const checkpointIndexSet = new Set(range.indices);
    const coveredCheckpoints = checkpoints.filter(item => checkpointIndexSet.has(item.messageIndex));
    if (coveredCheckpoints.length !== checkpoints.length) return '';
    const coveredFloors = coveredCheckpoints.map(item => `Tầng AI ${item.aiFloor}`).join(', ');
    return `Nguy hiểm: toàn bộ full checkpoint của cuộc trò chuyện hiện tại đều nằm trong phạm vi điền lại lần này (${coveredFloors}). Lần đầu chạy, hệ thống chỉ kiểm tra ranh giới; nếu xác nhận thiếu checkpoint có thể phát lại trước điểm bắt đầu điền lại, bước tiếp theo sẽ yêu cầu bạn xác nhận riêng việc có thay thế nền của các bảng đã chọn trong phạm vi lần này hay không.`;
  });

  /** 本次重填范围是否会覆盖（删除并重建）任一 full checkpoint；不覆盖时静默执行。 */
  const refillRangeCoversCheckpoint = computed<boolean>(() => {
    const range = manualRefillRange.value;
    if (!range) return false;
    const rangeIndexSet = new Set(range.indices);
    return checkpointFloors.value.some(item => rangeIndexSet.has(item.messageIndex));
  });

  const vectorIndexWarning = computed<boolean>(() => {
    void refreshTick.value;
    try {
      return getCurrentWorldbookConfig_ACU().summaryVectorIndexModeEnabled === true;
    } catch {
      return false;
    }
  });

  function refresh(): void {
    selectedManualTableKeys.value = resolveManualSelection(runtimeExecutionSheetKeys());
    manualContextDepth.value = resolveManualContextDepth();
    manualBatchSize.value = resolveManualBatchSize();
    refreshTick.value++;
  }

  function setManualContextDepth(value: number | string): void {
    const normalized = normalizeNonNegativeInteger(value, manualContextDepth.value);
    manualContextDepth.value = normalized;
    settings_ACU.manualUpdateContextDepth = normalized;
    saveSettings_ACU();
  }

  function setManualBatchSize(value: number | string): void {
    const normalized = normalizePositiveInteger(value, manualBatchSize.value);
    manualBatchSize.value = normalized;
    settings_ACU.manualUpdateBatchSize = normalized;
    saveSettings_ACU();
  }

  function setManualSelectedKeys(keys: string[]): void {
    const valid = new Set(runtimeExecutionSheetKeys());
    selectedManualTableKeys.value = keys.filter((key) => valid.has(key));
    saveManualSelection(selectedManualTableKeys.value);
    refreshTick.value++;
  }

  function selectAllManualTables(): void {
    setManualSelectedKeys(runtimeExecutionSheetKeys());
  }

  function selectNoManualTables(): void {
    setManualSelectedKeys([]);
  }

  async function runManualUpdate(): Promise<void> {
    if (manualUpdateBusy.value || catchUpBusy.value) return;
    // 空选择优先于 runtime 状态判断：保持原有提示，避免误报“运行时未就绪”。
    if (!selectedManualTableKeys.value.length) {
      toast.warning('Chưa chọn bảng cần điền bảng thủ công.');
      return;
    }
    // 执行边界校验（确认前）：selected keys 必须仍是当前 runtime 真实表。
    // 展示层可回退模板，但破坏性重填绝不允许把模板表当作执行目标；
    // 也防止任何外部直接写 Ref 绕过 setter 隔离后仍被这里放行。
    // 在弹确认框前建立不可变快照：确认文案与最终执行目标必须来自同一快照。
    const requestedTargetKeys = selectedManualTableKeys.value.slice();
    const snapshotRuntimeKeys = runtimeExecutionSheetKeys();
    const runtimeKeys = new Set(snapshotRuntimeKeys);
    const validTargetKeys = requestedTargetKeys.filter((key) => runtimeKeys.has(key));
    if (!snapshotRuntimeKeys.length || validTargetKeys.length !== requestedTargetKeys.length) {
      toast.warning('Runtime bảng hiện chưa sẵn sàng, không thể điền bảng thủ công.');
      return;
    }

    manualUpdateBusy.value = true;
    try {
      if (refillRangeCoversCheckpoint.value) {
      const injectionTargetLabel = await describeInjectionTargetForConfirm();
      const confirmed = await dialogStore.confirm({
        title: 'Thực hiện điền bảng thủ công',
        message: `Sắp thực hiện điền bảng thủ công.\n\nfull checkpoint hiện tại: ${checkpointFloorsLabel.value}\nPhạm vi điền lại lần này: ${manualRefillRangeLabel.value}\nBảng đã chọn: ${selectedSheetSummary.value}\nĐích chèn sổ thế giới: ${injectionTargetLabel} (kết quả điền bảng sẽ được ghi vào mục TavernDB của sổ thế giới đó)\n\nThao tác rủi ro cao: hệ thống sẽ xóa trước checkpoint và nhật ký tăng thêm V2 của các bảng đã chọn trong phạm vi điền lại lần này, rồi lấy trạng thái sau khi dọn làm nền để điền lại, cuối cùng ghi checkpoint bảng đơn mới.\nNếu checkpoint bị xóa là mốc dữ liệu duy nhất của các bảng này, dữ liệu bảng ở các tầng trước đó sẽ không thể khôi phục.\n\ncheckpoint ngoài phạm vi, dữ liệu bảng của lịch sử trò chuyện ngoài phạm vi và các bảng không được chọn sẽ không bị xóa. Nếu thất bại hoặc bị dừng trước khi kết quả của đợt đầu được ghi xuống, dữ liệu bảng trước khi dọn sẽ được tự động khôi phục. Một khi đã có đợt được cam kết thành công, thất bại sẽ không hoàn tác việc dọn: các đợt đã cam kết sẽ được giữ lại, runtime sẽ căn chỉnh lại theo kết quả đã cam kết trong lịch sử trò chuyện.`,
        dangerMessage: checkpointRiskMessage.value || undefined,
        confirmLabel: 'Xác nhận và tiếp tục',
        cancelLabel: 'Hủy',
        confirmVariant: 'danger',
      });
      if (!confirmed) return;
      }
      // 兼容沿用 clearBeforeUpdate 参数名；service 层实际执行事务式重填，不会预清空聊天记录。
      const clearBeforeUpdate = true;
      // 确认后 TOCTOU 复检：确认期间 runtime 可能被 purge/表删除/新增表改变。
      // 若当前 runtime 表集合与确认前快照不一致，或目标已失效，必须 fail-closed 阻断，
      // 不得静默缩减/替换执行目标后继续破坏性重填。
      if (!runtimeTargetsStillMatch(snapshotRuntimeKeys, requestedTargetKeys)) {
        toast.warning('Runtime bảng đã thay đổi trong lúc xác nhận, đã hủy lần điền bảng thủ công này, vui lòng xác nhận rồi thử lại.');
        return;
      }
      const targetManualTableKeys = requestedTargetKeys.slice();

      progressToastId = null;
      abortRequested = false;
      _set_wasStoppedByUser_ACU(false);
      notifyProgress('Bắt đầu điền bảng thủ công.');
      const extra = manualExtraHint.value.trim();
      if (extra) _set_manualExtraHint_ACU(`Sau đây là yêu cầu điền bảng bổ sung của người dùng, hãy tuân thủ nghiêm ngặt:\n${extra}`);
      const handleProgress = (event: CardUpdateProgressEvent) => {
        notifyProgress(progressLabel(event));
        if (event.phase === 'complete') {
          try { (topLevelWindow_ACU as any).AutoCardUpdaterAPI?._notifyTableUpdate?.(); } catch (_) {}
          refreshTick.value++;
        }
      };

      const runProcessBatch = (indices: number[], mode: string, options: any) =>
        processUpdatesBatch_ACU(indices, mode, options, (
          messagesToUse: any[],
          saveTargetIndex: number,
          updateMode: string,
          isSilentMode: boolean,
          targetSheetKeys: string[] | null,
          requestOptions: Record<string, any> | null,
          progressContext: BatchUpdateProgressContext,
          abortController?: AbortController,
        ) => executeCardUpdateCore_ACU(
          messagesToUse,
          saveTargetIndex,
          false,
          updateMode,
          isSilentMode,
          targetSheetKeys,
          requestOptions,
          abortController ?? new AbortController(),
          progressContext,
          handleProgress,
        ));

      const result = await orchestrateManualUpdate_ACU(
        targetManualTableKeys,
        runProcessBatch,
        async () => { await refreshMergedDataAndNotify_ACU(); },
        {
          clearBeforeUpdate,
          onProgress: handleProgress,
          // 把确认前快照传给 service 层：orchestrator 在破坏性清理前会再次校验 runtime。
          executionSnapshot: { sheetKeys: snapshotRuntimeKeys },
        },
      );
      finishToast(
        result.success ? (result.checkpointWarning ? 'warning' : 'success') : (abortRequested || result.error?.includes('终止') || result.error?.includes('bị dừng') ? 'warning' : 'error'),
        result.success
          ? `${result.autoMergeTriggered
              ? `Điền bảng thủ công hoàn tất; tự động gộp tóm tắt ${result.autoMergeSuccess ? 'đã hoàn tất' : 'chưa hoàn tất'}.`
              : 'Điền bảng thủ công hoàn tất.'}${result.checkpointWarning
                ? ` Nhưng việc tạo checkpoint ranh giới lưu giữ của tầng AI thất bại: ${result.checkpointWarning}`
                : ''}`
          : (abortRequested ? 'Tác vụ điền bảng thủ công đã bị người dùng dừng.' : (result.error || 'Điền bảng thủ công thất bại.')),
      );
    } catch (error: any) {
      finishToast('error', error?.message || 'Điền bảng thủ công thực thi bất thường.');
    } finally {
      manualUpdateBusy.value = false;
      refresh();
    }
  }

  async function retryCatchUpSyncOnly(): Promise<void> {
    if (manualUpdateBusy.value || catchUpBusy.value) return;
    catchUpBusy.value = true;
    try {
      if (progressToastId) {
        toast.update(progressToastId, 'info', 'Đang chỉ thử lại đồng bộ sổ thế giới, sẽ không gọi lại AI...', {
          durationMs: 0,
          muteable: false,
          dismissible: false,
        });
      }
      const result = await refreshMergedDataAndNotify_ACU();
      refresh();
      if (result.degraded) {
        showCatchUpSyncPending();
        return;
      }
      finishToast('success', 'Đồng bộ sổ thế giới đã hoàn tất; không gọi lại AI.');
    } catch (error: any) {
      showCatchUpSyncPending(error?.message || 'Đồng bộ sổ thế giới vẫn chưa hoàn tất.');
    } finally {
      catchUpBusy.value = false;
    }
  }

  function showCatchUpSyncPending(detail?: string): void {
    const text = `Dữ liệu bắt kịp đã được lưu nhưng đồng bộ sổ thế giới đang chờ thử lại. ${detail ? ` ${detail}` : ''}`;
    const options = {
      durationMs: 0,
      muteable: false,
      dismissible: true,
      feature: CATCH_UP_TASK_FEATURE,
      // 待用户重试的常驻提示，不代表正在干活。
      busy: false,
      action: {
        label: 'Chỉ thử lại đồng bộ',
        dismissOnClick: false,
        onClick: retryCatchUpSyncOnly,
      },
    };
    if (progressToastId && toast.update(progressToastId, 'warning', text, options)) return;
    progressToastId = toast.warning(text, options);
  }

  async function runManualCatchUp(): Promise<void> {
    if (manualUpdateBusy.value || catchUpBusy.value) return;
    // 空选择优先于 runtime 状态判断：保持原有提示，避免误报“运行时未就绪”。
    if (!selectedManualTableKeys.value.length) {
      toast.warning('Chưa chọn bảng cần bắt kịp.');
      return;
    }
    // 执行边界校验（确认前）：追平同样绝不允许把模板表当作执行目标。
    // 弹确认框前建立不可变快照：确认文案与最终执行目标必须来自同一快照。
    const requestedTargetKeys = selectedManualTableKeys.value.slice();
    const snapshotRuntimeKeys = runtimeExecutionSheetKeys();
    const runtimeKeys = new Set(snapshotRuntimeKeys);
    const validTargetKeys = requestedTargetKeys.filter((key) => runtimeKeys.has(key));
    if (!snapshotRuntimeKeys.length || validTargetKeys.length !== requestedTargetKeys.length) {
      toast.warning('Runtime bảng hiện chưa sẵn sàng, không thể bắt kịp thủ công.');
      return;
    }

    catchUpBusy.value = true;
    try {
      const planningResult = await prepareManualCatchUpPlan_ACU(requestedTargetKeys);
      if (!planningResult.success || !planningResult.plan) {
        finishToast('error', planningResult.error || 'Không thể tạo kế hoạch bắt kịp thủ công.');
        return;
      }
      const plan = planningResult.plan;
      if (!plan.waves.length) {
        finishToast('info', 'Các bảng đã chọn đã được bắt kịp, không cần gọi AI hoặc ghi dữ liệu.');
        return;
      }
      const totalBuckets = plan.waves.reduce((count, wave) => count + wave.groups.reduce(
        (waveCount, group) => waveCount + Math.ceil(wave.messageIndices.length / group.batchSize),
        0,
      ), 0);
      const waveSummary = plan.waves.map((wave, index) =>
        `Wave ${index + 1}: ${formatAiFloorRange_ACU(wave.startAiFloor, wave.endAiFloor)}; ${wave.sheetKeys.map(key => sheetNames.value[key] || key).join(', ')}`
      ).join('\n');
      const confirmed = await dialogStore.confirm({
        title: 'Bắt kịp các tầng chưa điền của bảng đã chọn',
        message: `Mục tiêu khóa: tầng AI ${plan.targetAiFloor} \nDự kiến ${plan.waves.length} wave, ${totalBuckets} bucket.\nBỏ qua tầng mới nhất: ${normalizeNonNegativeInteger(settings_ACU.skipUpdateFloors, 0)} tầng.\n\n${waveSummary}\n\nChức năng này chỉ bổ sung phần thiếu hậu tố sau tiền tuyến liên tục đã cam kết của mỗi bảng, không quét hay sửa các khoảng trống nội bộ trước tiền tuyến lịch sử. Khi thực thi sẽ đọc lại dữ kiện đã cam kết và lập kế hoạch lại, tránh xử lý lặp các bucket đã hoàn tất trong lúc chờ xác nhận.\n\nTrước khi thực thi sẽ dựa trên dữ kiện đã cam kết hiện tại để kiểm tra trước mốc neo lưu trữ: nếu tầng mục tiêu sớm hơn checkpoint chính thức, sẽ tự động tạo mốc neo tạm và hội tụ nguyên tử tại ranh giới gốc (thành quả đã cam kết không bị mất, cũng không để lại gốc chính thức thứ hai); nếu kiểm tra trước không chứng minh được an toàn, sẽ chặn trước khi gọi AI.`,
        confirmLabel: 'Xác nhận bắt kịp',
        cancelLabel: 'Hủy',
      });
      if (!confirmed) return;

      // 确认后 TOCTOU 复检：确认期间 runtime 可能被 purge/表删除/新增表改变。
      // 追平计划基于确认前快照生成，若当前 runtime 表集合与快照不一致，
      // 必须重新规划并要求用户重新确认，避免“确认的计划”与“执行的目标”不一致。
      if (!runtimeTargetsStillMatch(snapshotRuntimeKeys, requestedTargetKeys)) {
        finishToast('warning', 'Runtime bảng đã thay đổi trong lúc xác nhận, đã hủy lần bắt kịp này, vui lòng xác nhận lại mục tiêu.');
        return;
      }
      progressToastId = null;
      abortRequested = false;
      catchUpAbortController = new AbortController();
      notifyProgress('Bắt đầu bắt kịp thủ công.', requestCatchUpAbort);
      const result = await orchestrateManualCatchUp_ACU(
        requestedTargetKeys,
        refreshMergedDataAndNotify_ACU,
        {
          abortController: catchUpAbortController,
          onProgress: event => notifyProgress(progressLabel(event), requestCatchUpAbort),
          // 把确认前快照传给 service 层：orchestrator 内部会再次校验 runtime 一致性，
          // 使 TOCTOU 防护延伸到 UI 复检之后的异步窗口。
          executionSnapshot: { sheetKeys: snapshotRuntimeKeys },
        },
      );
      if (result.dataCommitted === true) {
        try { (topLevelWindow_ACU as any).AutoCardUpdaterAPI?._notifyTableUpdate?.(); } catch (_) {}
      }
      if (result.outcome === 'sync_pending') {
        showCatchUpSyncPending();
      } else if (result.outcome === 'no_work') {
        finishToast('info', 'Các bảng đã chọn đã được bắt kịp, không cần gọi AI hoặc ghi dữ liệu.');
      } else if (result.outcome === 'progress_metadata_failed') {
        finishToast('warning', `Dữ liệu bắt kịp thủ công đã được cam kết nhưng ghi nhận trạng thái hoàn tất thất bại: ${result.error || 'Lần bắt kịp sau sẽ ghi nhận lại trạng thái.'}`);
      } else if (result.outcome === 'integrity_failed') {
        finishToast('error', `Kiểm tra tính toàn vẹn lưu trữ của lần bắt kịp thủ công thất bại, đã nạp lại dữ liệu đã lưu trong cuộc trò chuyện: ${result.error || 'Hãy chạy chẩn đoán khôi phục V2.'}`);
      } else if (result.outcome === 'blocked') {
        finishToast('error', result.error || 'Bắt kịp thủ công đã bị chặn trước khi gọi AI: không thể sửa an toàn mốc neo lưu trữ V2.');
      } else if (result.outcome === 'stopped' || catchUpAbortController.signal.aborted) {
        finishToast('warning', `Đã dừng bắt kịp thủ công; đã giữ lại ${result.committedBucketCount || 0} bucket đã cam kết.`);
      } else if (result.success) {
        finishToast('success', `Bắt kịp thủ công hoàn tất, đã cam kết tổng cộng ${result.committedBucketCount || 0} bucket.`);
      } else {
        finishToast('error', result.error || 'Bắt kịp thủ công thất bại.');
      }
    } catch (error: any) {
      finishToast('error', error?.message || 'Bắt kịp thủ công thực thi bất thường.');
    } finally {
      catchUpAbortController = null;
      catchUpBusy.value = false;
      refresh();
    }
  }

  return {
    selectedManualTableKeys,
    manualContextDepth,
    manualBatchSize,
    manualExtraHint,
    manualUpdateBusy,
    catchUpBusy,
    sheetKeys,
    sheetNames,
    runtimeReady,
    selectedSheetSummary,
    checkpointFloorsLabel,
    manualRefillRangeLabel,
    checkpointRiskMessage,
    vectorIndexWarning,
    refresh,
    setManualContextDepth,
    setManualBatchSize,
    setManualSelectedKeys,
    selectAllManualTables,
    selectNoManualTables,
    runManualUpdate,
    runManualCatchUp,
  };
}
