import { computed, getCurrentScope, onScopeDispose, ref } from 'vue';
import {
  applyTemplateSnapshotToScope_ACU,
  applyTemplatePresetToCurrent_ACU,
  deleteTemplatePreset_ACU,
  getActiveTemplatePresetMeta_ACU,
  ensureUniqueTemplatePresetName_ACU,
  getDefaultTemplateSnapshot_ACU,
  getTemplatePreset_ACU,
  listTemplatePresetNames_ACU,
  normalizeTemplateForPresetSave_ACU,
  getRuntimeTemplateSnapshot_ACU,
  parseImportedTemplateData_ACU,
  resolveActiveTemplatePresetName_ACU,
  resolveTemplateForExport_ACU,
  upsertTemplatePreset_ACU,
} from '../../service/template/template-preset-service';
import {
  buildChatSheetGuideDataFromTemplateObj_ACU,
  getCurrentChatTemplateScopeState_ACU,
  listChatTemplateArchiveEntries_ACU,
  sanitizeChatSheetsObject_ACU,
  sanitizeTemplateSnapshotForChat_ACU,
} from '../../service/template/chat-scope';
import { deleteLocalDataInChatCore_ACU } from '../../service/chat/chat-service';
import { settings_ACU } from '../../service/runtime/state-manager';
import { safeJsonParse_ACU } from '../../shared/json-helpers';
import { getCurrentTemplatePresetName_ACU, normalizeTemplatePresetSelectionValue_ACU, sanitizeFilenameComponent_ACU } from '../../shared/template-preset-utils';
import { deriveTemplatePresetNameForImport_ACU } from '../../shared/template-preset-utils';
import { useDialogStore } from '../stores/dialog-store';
import { useToastStore } from '../stores/toast-store';
import { ensureTemplateRecoveryOrDeleteCurrentIsolationData_ACU } from './useTemplateRecoveryGuard';
import { promptFollowGlobalAfterSetDefault_ACU, runFollowGlobalTemplateFlow_ACU } from './templateFollowGlobalFlow';

export type TemplateScope = 'global' | 'chat' | 'runtime';

type MessageKind = 'success' | 'error' | 'info' | 'warning';
type ChatPresetSelectionKind = 'global' | 'snapshot' | 'runtime';
type TemplateArchiveEntry = Record<string, any>;
type PresetItem = { value: string; label: string; meta?: string };

const CHAT_GLOBAL_PRESET_VALUE_PREFIX = 'global:';
const CHAT_SNAPSHOT_PRESET_VALUE_PREFIX = 'snapshot:';
const RUNTIME_PRESET_VALUE = 'runtime:current';

const RUNTIME_SENTINEL_NAME = '__runtime__';

function encodeChatPresetValue(kind: ChatPresetSelectionKind, name: string): string {
  return `${kind === 'snapshot' ? CHAT_SNAPSHOT_PRESET_VALUE_PREFIX : CHAT_GLOBAL_PRESET_VALUE_PREFIX}${encodeURIComponent(name || '')}`;
}

function decodeChatPresetValue(value: string): { kind: ChatPresetSelectionKind; name: string } {
  const raw = String(value || '');
  if (raw === RUNTIME_PRESET_VALUE) {
    return { kind: 'runtime', name: '' };
  }
  if (raw.startsWith(CHAT_SNAPSHOT_PRESET_VALUE_PREFIX)) {
    return { kind: 'snapshot', name: normalizeTemplatePresetSelectionValue_ACU(decodeURIComponent(raw.slice(CHAT_SNAPSHOT_PRESET_VALUE_PREFIX.length))) };
  }
  if (raw.startsWith(CHAT_GLOBAL_PRESET_VALUE_PREFIX)) {
    return { kind: 'global', name: normalizeTemplatePresetSelectionValue_ACU(decodeURIComponent(raw.slice(CHAT_GLOBAL_PRESET_VALUE_PREFIX.length))) };
  }
  const normalized = normalizeTemplatePresetSelectionValue_ACU(raw);
  return { kind: 'global', name: normalized };
}

function isRuntimePresetValue(value: string): boolean {
  return String(value || '') === RUNTIME_PRESET_VALUE;
}

function isRuntimeSentinelName(name: string): boolean {
  return String(name || '') === RUNTIME_SENTINEL_NAME;
}

function buildRuntimePresetItem(meta?: string): PresetItem {
  return { value: RUNTIME_PRESET_VALUE, label: 'Mẫu đang có hiệu lực (bộ nhớ)', meta };
}

function defaultPresetItem(label: string, meta?: string, value = ''): PresetItem {
  return { value, label, meta };
}

const RUNTIME_TEMPLATE_LABEL = 'Mẫu đang có hiệu lực (bộ nhớ)';

function countTemplateSheets(templateSource: unknown): number | null {
  const templateObj = typeof templateSource === 'string'
    ? safeJsonParse_ACU(templateSource, null)
    : templateSource;
  if (!templateObj || typeof templateObj !== 'object' || Array.isArray(templateObj)) return null;
  const count = Object.keys(templateObj).filter(key => key.startsWith('sheet_')).length;
  return count > 0 ? count : null;
}

function formatSheetCountMeta(templateSource: unknown): string | undefined {
  const count = countTemplateSheets(templateSource);
  return count ? `${count} bảng` : undefined;
}

function formatArchiveMeta(entry: TemplateArchiveEntry): string | undefined {
  const parts = [formatSheetCountMeta(entry?.templateStr)].filter(Boolean) as string[];
  const source = String(entry?.presetName || '').trim();
  if (source) parts.push(`Nguồn: ${source}`);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = event => resolve(String(event.target?.result || ''));
    reader.onerror = () => reject(new Error('Đọc tệp mẫu thất bại'));
    reader.readAsText(file, 'UTF-8');
  });
}

function downloadJson(jsonData: Record<string, any>, filename: string): void {
  const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function isStaleRevisionConflict(result: unknown): boolean {
  return !!result
    && typeof result === 'object'
    && (result as { saved?: unknown }).saved === false
    && /^V2 stale_revision_conflict(?:\b|:)/.test(String((result as { error?: unknown }).error || ''));
}

function formatTemplateOperationError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error || 'Thao tác thất bại.');
  if (/^V2 stale_revision_conflict(?:\b|:)/.test(text)) {
    return 'Trạng thái bảng đã được cập nhật khi cam kết; sau khi hệ thống đọc lại vẫn không thể hoàn tất việc chuyển đổi. Vui lòng làm mới cuộc trò chuyện hiện tại rồi thử lại.';
  }
  if (/^V2 history_indeterminate(?:\b|:)/.test(text)) {
    return 'Trạng thái lịch sử bảng không đầy đủ hoặc thứ tự bất thường, đã từ chối ghi đè dữ liệu. Vui lòng kiểm tra và khôi phục lịch sử V2 trong Quản lý dữ liệu trước rồi thử lại.';
  }
  if (/^V2 reveal_source_(?:missing|indeterminate)(?:\b|:)/.test(text)) {
    return 'Nguồn khôi phục đáng tin cậy của bảng lịch sử không khả dụng, đã từ chối ghi. Vui lòng kiểm tra và khôi phục lịch sử V2 trong Quản lý dữ liệu trước rồi thử lại.';
  }
  return text;
}

/**
 * S3-8 名称/内容指纹：判断当前聊天快照内容是否偏离库中同名预设。
 *
 * 可比性关键：chat scope 的 templateStr 写入时经过 sanitizeTemplateSnapshotForChat_ACU，
 * 而库 preset 的 templateStr 是保存时的原始串——两侧都先 sanitize 同构化后再比较，
 * 否则序列化差异会造成恒误报。任一侧解析失败时宁可不标记也不误报。
 */
function computeChatSnapshotDiff(
  snapshotTemplateStr: unknown,
  presetName: string,
): { differs: boolean; reason: 'diverged' | 'library_preset_missing' | null } {
  const chatSanitized = sanitizeTemplateSnapshotForChat_ACU(snapshotTemplateStr || null);
  if (!chatSanitized?.templateStr) return { differs: false, reason: null };
  let librarySanitized: { templateStr?: string } | null;
  if (presetName) {
    const libraryStr = getTemplatePreset_ACU(presetName)?.templateStr;
    if (!libraryStr) return { differs: true, reason: 'library_preset_missing' };
    librarySanitized = sanitizeTemplateSnapshotForChat_ACU(libraryStr);
  } else {
    librarySanitized = getDefaultTemplateSnapshot_ACU();
  }
  if (!librarySanitized?.templateStr) return { differs: false, reason: null };
  return chatSanitized.templateStr === librarySanitized.templateStr
    ? { differs: false, reason: null }
    : { differs: true, reason: 'diverged' };
}

function resolveGuideDataForPresetSelection(selection: { kind: ChatPresetSelectionKind; name: string }): Record<string, any> | null {
  const normalized = normalizeTemplatePresetSelectionValue_ACU(selection.name);
  const chatScopeState = selection.kind === 'snapshot' ? getCurrentChatTemplateScopeState_ACU() : null;
  if (chatScopeState?.guideData && typeof chatScopeState.guideData === 'object') return chatScopeState.guideData;
  const snapshot = selection.kind === 'snapshot' && chatScopeState?.templateStr
    ? chatScopeState.templateStr
    : (normalized ? getTemplatePreset_ACU(normalized)?.templateStr : getDefaultTemplateSnapshot_ACU()?.templateObj);
  const templateObj = typeof snapshot === 'string'
    ? safeJsonParse_ACU(snapshot, null)
    : snapshot;
  return buildChatSheetGuideDataFromTemplateObj_ACU(templateObj, { stripSeedRows: false });
}

export function useTableTemplatePresets() {
  const templateOperationController = new AbortController();
  if (getCurrentScope()) onScopeDispose(() => templateOperationController.abort());

  const dialogStore = useDialogStore();
  const toast = useToastStore();
  const busy = ref(false);
  const message = ref<{ kind: MessageKind; text: string } | null>(null);
  const globalPresetNames = ref<string[]>([]);
  const chatArchiveEntries = ref<TemplateArchiveEntry[]>([]);
  const selectedGlobalPreset = ref('');
  const selectedGlobalPresetValue = ref(encodeChatPresetValue('global', ''));
  const selectedChatPreset = ref(encodeChatPresetValue('global', ''));
  const selectedChatPresetLabel = ref('Preset mặc định (toàn cục)');
  const chatPresetItems = ref<PresetItem[]>([]);
  const chatArchiveItems = ref<PresetItem[]>([]);
  const activeTemplateScope = ref<'global' | 'chat'>('global');
  const runtimeTemplateItem = ref<PresetItem | null>(null);
  const runtimeDiffersFromLibrary = ref(false);
  const runtimeTemplateAvailable = ref(false);
  /** S3-8：当前聊天快照内容是否偏离库中同名预设（仅 chat_override 模式下可能为 true）。 */
  const chatSnapshotDiffersFromLibrary = ref(false);

  const isChatOverridden = computed(() => activeTemplateScope.value === 'chat');

  function buildChatPresetItems(
    globalNames: string[],
    _currentGlobalPreset: string,
    activeMeta: ReturnType<typeof getActiveTemplatePresetMeta_ACU>,
    runtimeItem: PresetItem | null,
  ): PresetItem[] {
    const seen = new Set<string>();
    const defaultSnapshot = getDefaultTemplateSnapshot_ACU();
    const items = [defaultPresetItem('Preset mặc định (toàn cục)', formatSheetCountMeta(defaultSnapshot?.templateObj || defaultSnapshot?.templateStr), encodeChatPresetValue('global', ''))];
    seen.add(encodeChatPresetValue('global', ''));
    if (runtimeItem) {
      items.push(runtimeItem);
      seen.add(RUNTIME_PRESET_VALUE);
    }
    for (const name of globalNames) {
      const normalized = normalizeTemplatePresetSelectionValue_ACU(name);
      if (!normalized) continue;
      const value = encodeChatPresetValue('global', normalized);
      if (seen.has(value)) continue;
      seen.add(value);
      items.push({ value, label: `${normalized} (preset toàn cục)`, meta: formatSheetCountMeta(getTemplatePreset_ACU(normalized)?.templateStr) });
    }
    chatSnapshotDiffersFromLibrary.value = false;
    if (activeMeta.mode === 'chat_override') {
      const currentScope = getCurrentChatTemplateScopeState_ACU();
      // 空 presetName 是当前聊天选择“默认模板”的有效标识，不能用 || 回退旧全局预设。
      const normalized = normalizeTemplatePresetSelectionValue_ACU(
        currentScope?.presetName ?? activeMeta.presetName,
      );
      const value = encodeChatPresetValue('snapshot', normalized);
      if (!seen.has(value)) {
        seen.add(value);
        // S3-8：快照内容偏离库中同名预设时在标签处明示，避免同名不同内容的静默混淆。
        const diff = computeChatSnapshotDiff(currentScope?.templateStr, normalized);
        chatSnapshotDiffersFromLibrary.value = diff.differs;
        const divergenceSuffix = diff.reason === 'diverged' ? ' (nội dung đã lệch khỏi preset trong thư viện)' : '';
        const metaParts = [formatSheetCountMeta(currentScope?.templateStr)].filter(Boolean) as string[];
        if (diff.reason === 'library_preset_missing') metaParts.push('Thư viện không còn preset cùng tên');
        items.push({
          value,
          label: `${normalized || 'Preset mặc định'} (snapshot cuộc trò chuyện hiện tại)${divergenceSuffix}`,
          meta: metaParts.length > 0 ? metaParts.join(' · ') : undefined,
        });
      }
    }
    return items;
  }

  function resolveSelectedChatPresetValue(
    activeMeta: ReturnType<typeof getActiveTemplatePresetMeta_ACU>,
    currentGlobalPreset: string,
  ): string {
    const activeName = normalizeTemplatePresetSelectionValue_ACU(activeMeta.presetName);
    if (activeMeta.mode === 'chat_override') return encodeChatPresetValue('snapshot', activeName);
    if (activeMeta.mode === 'preset_link') return encodeChatPresetValue('global', activeName);
    return encodeChatPresetValue('global', currentGlobalPreset || '');
  }

  function computeRuntimeViews(): { item: PresetItem | null; available: boolean; differsFromLibrary: boolean } {
    const runtimeSnapshot = getRuntimeTemplateSnapshot_ACU();
    if (!runtimeSnapshot?.templateStr || !runtimeSnapshot?.templateObj) {
      return { item: null, available: false, differsFromLibrary: false };
    }
    const item: PresetItem = {
      value: RUNTIME_PRESET_VALUE,
      label: RUNTIME_TEMPLATE_LABEL,
      meta: formatSheetCountMeta(runtimeSnapshot.templateObj),
    };

    const activeName = normalizeTemplatePresetSelectionValue_ACU(resolveActiveTemplatePresetName_ACU({ fallbackToGlobal: true }));
    let libraryStr: string | null = null;
    if (activeName) {
      libraryStr = getTemplatePreset_ACU(activeName)?.templateStr || null;
    } else {
      libraryStr = getDefaultTemplateSnapshot_ACU()?.templateStr || null;
    }
    const differsFromLibrary = libraryStr != null && runtimeSnapshot.templateStr !== libraryStr;
    return { item, available: true, differsFromLibrary };
  }

  function refresh(): void {
    const nextGlobalNames = listTemplatePresetNames_ACU();
    const nextChatArchives = listChatTemplateArchiveEntries_ACU();
    const nextSelectedGlobal = normalizeTemplatePresetSelectionValue_ACU(
      getCurrentTemplatePresetName_ACU(settings_ACU, { requireExisting: false }),
    );
    const activeMeta = getActiveTemplatePresetMeta_ACU();
    const runtimeViews = computeRuntimeViews();
    runtimeTemplateItem.value = runtimeViews.item;
    runtimeTemplateAvailable.value = runtimeViews.available;
    runtimeDiffersFromLibrary.value = runtimeViews.differsFromLibrary;
    const nextItems = buildChatPresetItems(
      nextGlobalNames,
      nextSelectedGlobal,
      activeMeta,
      runtimeViews.item,
    );
    const nextSelectedChat = resolveSelectedChatPresetValue(activeMeta, nextSelectedGlobal);

    globalPresetNames.value = nextGlobalNames;
    chatArchiveEntries.value = nextChatArchives;
    selectedGlobalPreset.value = nextSelectedGlobal;
    selectedGlobalPresetValue.value = encodeChatPresetValue('global', nextSelectedGlobal || '');
    selectedChatPreset.value = nextSelectedChat;
    selectedChatPresetLabel.value = nextItems.find(item => item.value === nextSelectedChat)?.label || 'Preset mặc định (toàn cục)';
    activeTemplateScope.value = activeMeta.scope === 'chat' ? 'chat' : 'global';
    chatPresetItems.value = nextItems;
    chatArchiveItems.value = nextChatArchives.map((entry: TemplateArchiveEntry) => ({
      value: String(entry?.archiveKey || '').trim(),
      label: String(entry?.label || entry?.presetName || 'Snapshot mẫu lịch sử cuộc trò chuyện'),
      meta: formatArchiveMeta(entry),
    })).filter((item: PresetItem) => !!item.value);
  }

  async function run<T>(action: () => Promise<T> | T): Promise<T | null> {
    // busy 以前只用于渲染，重复点击仍会并发进入同一聊天的模板协调窗口。
    // UI 侧直接拒绝重入；service/transaction 的 revision 校验仍负责兜住其他入口。
    if (busy.value) {
      toast.info('Đang chuyển mẫu, vui lòng chờ thao tác hiện tại hoàn tất.');
      return null;
    }
    busy.value = true;
    message.value = null;
    try {
      return await action();
    } catch (error: any) {
      const text = formatTemplateOperationError(error);
      message.value = { kind: 'error', text };
      toast.error(text);
      return null;
    } finally {
      busy.value = false;
      refresh();
    }
  }

  async function selectGlobalPreset(name: string): Promise<void> {
    const decoded = decodeChatPresetValue(name);
    const normalized = normalizeTemplatePresetSelectionValue_ACU(decoded.name);
    await run(async () => {
      // S1-3：当前聊天 inherit_global 时全局切换会经协调器提交，可能返回破坏性
      // blockers（需确认重试）或 saved:false（fail-closed，全局未变）。
      const result = await applyChatTemplateWithDestructiveConfirmation(destructiveChangeConfirmed => applyTemplatePresetToCurrent_ACU(normalized, {
        source: 'v2_table_global_select',
        updateGlobal: true,
        save: true,
        persistChatScope: false,
        destructiveChangeConfirmed,
        signal: templateOperationController.signal,
      }));
      if (!result) throw new Error('Chuyển preset mẫu toàn cục thất bại.');
      if (typeof result === 'object' && result.saved === false) {
        throw new Error(typeof result.error === 'string' && result.error ? result.error : 'Chuyển preset mẫu toàn cục thất bại.');
      }
      if (typeof result === 'object' && typeof result.postCommitWarning === 'string' && result.postCommitWarning) {
        toast.warning(result.postCommitWarning, { muteable: false, durationMs: 6000 });
      }
      message.value = null;
      // S1-2：当前聊天存在覆盖时，新全局默认不会生效——确认后清覆盖跟随全局。
      if (getActiveTemplatePresetMeta_ACU().mode === 'chat_override') {
        await promptFollowGlobalAfterSetDefault_ACU({
          dialogStore,
          toast,
          signal: templateOperationController.signal,
          newDefaultName: normalized,
        });
      }
    });
  }

  /** 跟随全局（清除聊天覆盖）：协调到当前全局模板并把 scope 置回 inherit_global（S1-2）。 */
  async function followGlobalTemplate(): Promise<void> {
    await run(async () => {
      await runFollowGlobalTemplateFlow_ACU({
        dialogStore,
        toast,
        signal: templateOperationController.signal,
      });
      message.value = null;
    });
  }

  async function ensureTemplateSwitchCanProceed(guideData: Record<string, any> | null): Promise<boolean> {
    const recoveryGuard = await ensureTemplateRecoveryOrDeleteCurrentIsolationData_ACU(guideData, 'switch-template');
    return recoveryGuard.success;
  }

  async function applyChatTemplateWithDestructiveConfirmation(
    apply: (destructiveChangeConfirmed: boolean) => Promise<any>,
  ): Promise<any> {
    const applyWithSingleStaleRetry = async (destructiveChangeConfirmed: boolean): Promise<any> => {
      const firstAttempt = await apply(destructiveChangeConfirmed);
      // stale revision 表示本次计划的 read-plan-commit 窗口已失效。重新进入 service
      // 才会读取新基线；其它 V2 历史错误绝不能通过重试伪装成可恢复状态。
      if (!isStaleRevisionConflict(firstAttempt)) return firstAttempt;
      if (templateOperationController.signal.aborted) return firstAttempt;
      return apply(destructiveChangeConfirmed);
    };

    const firstResult = await applyWithSingleStaleRetry(false);
    if (!firstResult || firstResult.saved !== false || !Array.isArray(firstResult.blockers) || firstResult.blockers.length === 0) {
      return firstResult;
    }
    const destructiveBlockers = firstResult.blockers.filter((blocker: unknown) => (
      typeof blocker === 'string' && (/删除(?:表|列).+需要显式确认/.test(blocker) || /Xóa (?:bảng|cột) .+ cần xác nhận (?:rõ ràng|tường minh)/.test(blocker))
    ));
    if (destructiveBlockers.length === 0) return firstResult;
    const confirmed = await dialogStore.confirm({
      title: 'Xác nhận thay đổi mẫu có tính phá hủy',
      message: `Thay đổi mẫu này sẽ xóa bảng hoặc cột hiện có:\n${destructiveBlockers.join('\n')}`,
      dangerMessage: 'Sau khi xác nhận sẽ thực hiện theo cam kết nguyên tử V2. Dữ liệu đã xóa chỉ có thể khôi phục qua bản sao lưu trò chuyện hoặc checkpoint.',
      confirmLabel: 'Xác nhận xóa và tiếp tục',
      cancelLabel: 'Hủy',
      confirmVariant: 'danger',
    });
    return confirmed ? applyWithSingleStaleRetry(true) : firstResult;
  }

  async function selectChatPreset(name: string): Promise<void> {
    const selection = decodeChatPresetValue(name);
    const normalized = normalizeTemplatePresetSelectionValue_ACU(selection.name);
    if (selection.kind === 'runtime') return;
    await run(async () => {
      const guideData = resolveGuideDataForPresetSelection(selection);
      const canProceed = await ensureTemplateSwitchCanProceed(guideData);
      if (!canProceed) return;
      const result = await applyChatTemplateWithDestructiveConfirmation(destructiveChangeConfirmed => applyTemplatePresetToCurrent_ACU(normalized, {
        source: selection.kind === 'snapshot' ? 'v2_table_chat_select_snapshot' : 'v2_table_chat_select_global',
        updateGlobal: false,
        save: true,
        persistChatScope: true,
        chatSelectionSource: selection.kind === 'snapshot' ? 'snapshot' : 'global',
        destructiveChangeConfirmed,
        signal: templateOperationController.signal,
      }));
      if (!result) throw new Error('Chuyển preset mẫu của cuộc trò chuyện hiện tại thất bại.');
      if (result.saved === false) throw new Error(result.error || 'Chuyển preset mẫu của cuộc trò chuyện hiện tại thất bại.');
      if (result.postCommitWarning) {
        toast.warning(result.postCommitWarning, { muteable: false, durationMs: 6000 });
      }
      message.value = null;
    });
  }

  async function restoreArchivedChatTemplate(): Promise<void> {
    await run(async () => {
      const archives = listChatTemplateArchiveEntries_ACU();
      if (archives.length === 0) {
        message.value = { kind: 'info', text: 'Cuộc trò chuyện hiện tại không có bản lưu mẫu lịch sử nào để khôi phục.' };
        toast.info('Cuộc trò chuyện hiện tại không có bản lưu mẫu lịch sử nào để khôi phục.');
        return;
      }
      const selectedArchiveKey = await dialogStore.choose({
        title: 'Khôi phục bản lưu mẫu lịch sử',
        message: 'Vui lòng chọn bản lưu lịch sử để khôi phục thành mẫu bảng của cuộc trò chuyện hiện tại. Trước khi khôi phục sẽ kiểm tra theo quy tắc khôi phục dữ liệu hiện hành.',
        actions: archives.map((entry: TemplateArchiveEntry) => ({
          value: String(entry.archiveKey || '').trim(),
          label: `${entry.label || entry.presetName || 'Snapshot mẫu lịch sử cuộc trò chuyện'}${formatArchiveMeta(entry) ? ` · ${formatArchiveMeta(entry)}` : ''}`,
        })).filter((action: { value: string; label: string }) => !!action.value),
        cancelLabel: 'Hủy',
      });
      if (!selectedArchiveKey) return;
      const archive = archives.find((entry: TemplateArchiveEntry) => String(entry.archiveKey || '').trim() === selectedArchiveKey);
      if (!archive) throw new Error('Không tìm thấy bản lưu mẫu lịch sử đã chọn.');
      const guideData = archive.guideData && typeof archive.guideData === 'object'
        ? archive.guideData
        : buildChatSheetGuideDataFromTemplateObj_ACU(
          typeof archive.templateStr === 'string' ? safeJsonParse_ACU(archive.templateStr, null) : archive.templateStr,
          { stripSeedRows: false },
        );
      const canProceed = await ensureTemplateSwitchCanProceed(guideData);
      if (!canProceed) return;
      const result = await applyChatTemplateWithDestructiveConfirmation(destructiveChangeConfirmed => applyTemplateSnapshotToScope_ACU(archive.templateStr, {
        scope: 'chat',
        source: 'v2_table_chat_archive_restore',
        presetName: String(archive.presetName || '').trim(),
        save: true,
        persistChatScope: true,
        registerChatPresetEntry: false,
        destructiveChangeConfirmed,
        signal: templateOperationController.signal,
      }));
      if (!result) throw new Error('Khôi phục bản lưu mẫu lịch sử thất bại.');
      if ('saved' in result && result.saved === false) {
        throw new Error('error' in result && typeof result.error === 'string' ? result.error : 'Khôi phục bản lưu mẫu lịch sử thất bại.');
      }
      message.value = null;
      const warning = 'postCommitWarning' in result && typeof result.postCommitWarning === 'string' ? result.postCommitWarning : '';
      if (warning) toast.warning(warning, { muteable: false, durationMs: 6000 });
      else toast.success('Đã khôi phục bản lưu mẫu lịch sử.', { muteable: false });
    });
  }

  async function saveGlobalAs(): Promise<void> {
    const current = selectedGlobalPreset.value;
    const raw = await dialogStore.prompt({
      title: 'Lưu thành preset mẫu toàn cục',
      message: 'Vui lòng nhập tên preset mẫu toàn cục cần lưu thành.',
      label: 'Tên preset',
      defaultValue: current ? `${current}_bản_sao` : 'Preset mẫu mới',
      confirmLabel: 'Lưu thành',
    });
    if (!raw) return;
    const requested = raw.trim();
    if (!requested) return;
    await run(async () => {
      const normalizedTemplate = normalizeTemplateForPresetSave_ACU();
      if (!normalizedTemplate) throw new Error('Không thể phân tích mẫu hiện tại.');
      const finalName = ensureUniqueTemplatePresetName_ACU(requested);
      if (finalName !== requested) {
        const confirmed = await dialogStore.confirm({
          title: 'Tên preset đã tồn tại',
          message: `Tên preset đã tồn tại, sẽ tự động lưu thành「${finalName}」. Tiếp tục không?`,
          confirmLabel: 'Tiếp tục lưu',
        });
        if (!confirmed) return;
      }
      if (!upsertTemplatePreset_ACU(finalName, normalizedTemplate.templateStr)) throw new Error('Không thể ghi vào preset mẫu toàn cục.');
      const result = await applyTemplatePresetToCurrent_ACU(finalName, {
        source: 'v2_table_global_save_as',
        updateGlobal: true,
        save: true,
        persistChatScope: false,
        signal: templateOperationController.signal,
      });
      if (!result) throw new Error('Chuyển preset mẫu toàn cục sau khi lưu thành thất bại.');
      if (typeof result === 'object' && result.saved === false) {
        throw new Error(typeof result.error === 'string' && result.error ? result.error : 'Chuyển preset mẫu toàn cục sau khi lưu thành thất bại.');
      }
      message.value = null;
      toast.success(`Đã lưu thành preset mẫu toàn cục「${finalName}」.`);
    });
  }

  async function renameGlobalPreset(): Promise<void> {
    const oldName = selectedGlobalPreset.value;
    if (!oldName) {
      message.value = { kind: 'warning', text: 'Không thể đổi tên preset mặc định.' };
      return;
    }
    const preset = getTemplatePreset_ACU(oldName);
    if (!preset?.templateStr) {
      message.value = { kind: 'warning', text: 'Không tìm thấy preset mẫu toàn cục đang chọn.' };
      return;
    }
    const raw = await dialogStore.prompt({
      title: 'Đổi tên preset mẫu toàn cục',
      message: `Đổi tên preset mẫu toàn cục「${oldName}」thành:`,
      label: 'Tên preset',
      defaultValue: oldName,
      confirmLabel: 'Đổi tên',
    });
    if (!raw) return;
    const newName = raw.trim();
    if (!newName) return;
    await run(async () => {
      if (!upsertTemplatePreset_ACU(newName, preset.templateStr)) throw new Error('Đổi tên preset mẫu toàn cục thất bại.');
      if (newName !== oldName) deleteTemplatePreset_ACU(oldName);
      if (selectedGlobalPreset.value === oldName) {
        const result = await applyTemplatePresetToCurrent_ACU(newName, {
          source: 'v2_table_global_rename',
          updateGlobal: true,
          save: true,
          persistChatScope: false,
          signal: templateOperationController.signal,
        });
        if (!result) throw new Error('Chuyển preset mẫu toàn cục sau khi đổi tên thất bại.');
        if (typeof result === 'object' && result.saved === false) {
          throw new Error(typeof result.error === 'string' && result.error ? result.error : 'Chuyển preset mẫu toàn cục sau khi đổi tên thất bại.');
        }
      }
      message.value = null;
    });
  }

  async function deleteGlobalPreset(): Promise<void> {
    const name = selectedGlobalPreset.value;
    if (!name) {
      message.value = { kind: 'warning', text: 'Không thể xóa preset mặc định.' };
      return;
    }
    const confirmed = await dialogStore.confirm({
      title: 'Xóa preset mẫu toàn cục',
      message: `Bạn có chắc muốn xóa preset mẫu toàn cục「${name}」không? Thao tác này không thể hoàn tác.`,
      confirmLabel: 'Xóa preset',
      confirmVariant: 'danger',
    });
    if (!confirmed) return;
    await run(() => {
      if (!deleteTemplatePreset_ACU(name)) throw new Error('Xóa thất bại hoặc preset mẫu toàn cục không tồn tại.');
      message.value = null;
    });
  }

  async function importPresetForCurrentChat(file: File): Promise<void> {
    await run(async () => {
      const content = await readFileText(file);
      const prepared = parseImportedTemplateData_ACU(content);
      const baseName = deriveTemplatePresetNameForImport_ACU({
        filename: file.name,
        fallbackLabel: `Mẫu_nhập_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`,
      });
      if (!baseName) throw new Error('Không thể xác định tên preset nhập.');
      const finalName = ensureUniqueTemplatePresetName_ACU(baseName);
      const canProceed = await ensureTemplateSwitchCanProceed(
        buildChatSheetGuideDataFromTemplateObj_ACU(prepared.templateObj, { stripSeedRows: false }),
      );
      if (!canProceed) return;
      const result = await applyChatTemplateWithDestructiveConfirmation(destructiveChangeConfirmed => applyTemplateSnapshotToScope_ACU(prepared.templateStr, {
        scope: 'chat',
        source: 'v2_table_import_current',
        save: true,
        persistChatScope: true,
        presetName: finalName,
        registerChatPresetEntry: false,
        destructiveChangeConfirmed,
        signal: templateOperationController.signal,
      }));
      if (!result) throw new Error('Chuyển mẫu nhập sang cuộc trò chuyện hiện tại thất bại.');
      if (result.saved === false) throw new Error(result.error || 'Chuyển mẫu nhập sang cuộc trò chuyện hiện tại thất bại.');
      if (!upsertTemplatePreset_ACU(finalName, prepared.templateStr)) throw new Error('Đã áp dụng mẫu nhưng lưu vào thư viện preset thất bại.');
      message.value = null;
      if (result.postCommitWarning) {
        toast.warning(result.postCommitWarning, { muteable: false, durationMs: 6000 });
      } else {
        toast.success(`Đã lưu mẫu và chuyển sang「${finalName}」.`, { muteable: false });
      }
    });
  }

  function exportTemplate(scope: TemplateScope): void {
    const selectedPresetName = scope === 'runtime'
      ? ''
      : (scope === 'global'
        ? selectedGlobalPreset.value
        : decodeChatPresetValue(selectedChatPreset.value).name);
    const resolved = resolveTemplateForExport_ACU(scope, selectedPresetName);
    if (!resolved) {
      const text = 'Không thể phân tích mẫu hiện tại.';
      message.value = { kind: 'error', text };
      toast.error(text);
      return;
    }
    const sanitized = sanitizeChatSheetsObject_ACU(resolved.jsonData, { ensureMate: true });
    const safeName = sanitizeFilenameComponent_ACU(resolved.fromPresetName) || 'template';
    const filename = scope === 'global'
      ? `TavernDB_template_${safeName}.json`
      : (scope === 'chat'
        ? `TavernDB_template_chat_${safeName}.json`
        : `TavernDB_template_runtime_${safeName}.json`);
    downloadJson(sanitized, filename);
    message.value = null;
    toast.success(scope === 'global' ? 'Đã xuất mẫu toàn cục.' : (scope === 'chat' ? 'Đã xuất mẫu của cuộc trò chuyện hiện tại.' : 'Đã xuất mẫu đang có hiệu lực hiện tại.'));
  }

  refresh();

  return {
    busy,
    message,
    selectedGlobalPreset,
    selectedGlobalPresetValue,
    selectedChatPreset,
    selectedChatPresetLabel,
    isChatOverridden,
    chatPresetItems,
    chatArchiveItems,
    runtimeTemplateItem,
    runtimeDiffersFromLibrary,
    runtimeTemplateAvailable,
    chatSnapshotDiffersFromLibrary,
    refresh,
    selectGlobalPreset,
    selectChatPreset,
    followGlobalTemplate,
    restoreArchivedChatTemplate,
    saveGlobalAs,
    renameGlobalPreset,
    deleteGlobalPreset,
    importPresetForCurrentChat,
    exportTemplate,
  };
}
