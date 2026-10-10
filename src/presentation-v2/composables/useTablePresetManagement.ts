/**
 * useTablePresetManagement — 表格模板预设抽屉的状态机
 *
 * 借鉴 usePlotPresetManagement，但表格模板的编辑器是独立窗口（可视化表格编辑器），
 * 抽屉本身只承载管理列表（star / export / edit=打开可视化编辑器 / delete）以及
 * 顶部的「从默认新建 / 导入」操作。
 *
 * 与 useTableTemplatePresets 的关系：本 composable 通过 service 函数直接执行带名字
 * 的操作（删除、导出、设为全局默认、切换 chat 预设）；页面同时使用 useTableTemplatePresets
 * 维持下拉框的当前选中状态与 message。
 */
import { computed, getCurrentScope, onScopeDispose, ref } from 'vue';
import {
  applyTemplatePresetToCurrent_ACU,
  deleteTemplatePreset_ACU,
  ensureUniqueTemplatePresetName_ACU,
  getActiveTemplatePresetMeta_ACU,
  getDefaultTemplateSnapshot_ACU,
  getRuntimeTemplateSnapshot_ACU,
  getTemplatePreset_ACU,
  listTemplatePresetNames_ACU,
  resolveActiveTemplatePresetName_ACU,
  resolveTemplateForExport_ACU,
  upsertTemplatePreset_ACU,
} from '../../service/template/template-preset-service';
import { sanitizeChatSheetsObject_ACU } from '../../service/template/chat-scope';
import {
  sanitizeFilenameComponent_ACU,
  normalizeTemplatePresetSelectionValue_ACU,
  getCurrentTemplatePresetName_ACU,
} from '../../shared/template-preset-utils';
import { settings_ACU } from '../../service/runtime/state-manager';
import { useDialogStore } from '../stores/dialog-store';
import { useToastStore } from '../stores/toast-store';
import { safeJsonParse_ACU } from '../../shared/json-helpers';
import { openVisualizerSurface_ACU } from '../surfaces/visualizer/open-visualizer-surface';
import { ensureTemplateRecoveryOrDeleteCurrentIsolationData_ACU } from './useTemplateRecoveryGuard';
import { buildChatSheetGuideDataFromTemplateObj_ACU } from '../../service/template/chat-scope';
import { promptFollowGlobalAfterSetDefault_ACU } from './templateFollowGlobalFlow';

export type TablePresetDrawerView = 'closed' | 'manage';

type MessageKind = 'success' | 'error' | 'info' | 'warning';

interface TablePresetMeta {
  name: string;
  kind?: 'preset' | 'runtime';
  label?: string;
  meta?: string;
  readOnly?: boolean;
}

const RUNTIME_SENTINEL_NAME = '__runtime__';
const RUNTIME_TEMPLATE_LABEL = 'Mẫu đang có hiệu lực (bộ nhớ)';

function isRuntimeSentinelName(name: string): boolean {
  return String(name || '') === RUNTIME_SENTINEL_NAME;
}

function isStaleRevisionConflict(result: unknown): boolean {
  return !!result
    && typeof result === 'object'
    && (result as { saved?: unknown }).saved === false
    && /^V2 stale_revision_conflict(?:\b|:)/.test(String((result as { error?: unknown }).error || ''));
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

function getTemplateApplyError_ACU(result: any, fallback: string): string {
  if (!result) return fallback;
  if (typeof result === 'object' && result.saved === false) {
    return typeof result.error === 'string' && result.error ? result.error : fallback;
  }
  return '';
}

function getTemplateApplyWarning_ACU(result: any): string {
  return result && typeof result === 'object' && typeof result.postCommitWarning === 'string'
    ? result.postCommitWarning
    : '';
}

export function useTablePresetManagement() {
  const templateOperationController = new AbortController();
  if (getCurrentScope()) onScopeDispose(() => templateOperationController.abort());
  const dialogStore = useDialogStore();
  const toast = useToastStore();
  const drawerView = ref<TablePresetDrawerView>('closed');
  const busy = ref(false);
  const message = ref<{ kind: MessageKind; text: string } | null>(null);
  const presetMeta = ref<TablePresetMeta[]>([]);
  const defaultPresetName = ref('');

  const isDrawerOpen = computed(() => drawerView.value !== 'closed');
  const title = computed(() => (drawerView.value === 'manage' ? 'Quản lý preset mẫu bảng' : ''));

  function refresh(): void {
    const items: TablePresetMeta[] = [];
    const runtimeSnapshot = getRuntimeTemplateSnapshot_ACU();
    if (runtimeSnapshot?.templateStr && runtimeSnapshot?.templateObj) {
      items.push({
        name: RUNTIME_SENTINEL_NAME,
        kind: 'runtime',
        label: RUNTIME_TEMPLATE_LABEL,
        readOnly: true,
      });
    }
    for (const name of listTemplatePresetNames_ACU()) items.push({ name, kind: 'preset' });
    presetMeta.value = items;
    defaultPresetName.value = normalizeTemplatePresetSelectionValue_ACU(
      getCurrentTemplatePresetName_ACU(settings_ACU, { requireExisting: false }),
    );
  }

  function openManage(): void {
    refresh();
    drawerView.value = 'manage';
  }

  function closeDrawer(): void {
    drawerView.value = 'closed';
  }

  async function run<T>(action: () => Promise<T> | T): Promise<T | null> {
    busy.value = true;
    message.value = null;
    try {
      return await action();
    } catch (error: any) {
      toast.error(error?.message || 'Thao tác thất bại.');
      return null;
    } finally {
      busy.value = false;
      refresh();
    }
  }

  /**
   * 带破坏性确认与单次 stale 重试的预设应用（editPreset / setAsDefault /
   * deletePreset 默认回退共用）。updateGlobal:true 时（S1-3）全局切换会经协调器，
   * 与 chat 路径一样可能返回破坏性 blockers。
   */
  async function applyPresetWithDestructiveConfirmAndRetry(
    presetName: string,
    options: { source: string; updateGlobal: boolean; persistChatScope: boolean },
  ): Promise<any> {
    const applyWithSingleStaleRetry = async (destructiveChangeConfirmed: boolean): Promise<any> => {
      const buildOptions = () => ({
        source: options.source,
        updateGlobal: options.updateGlobal,
        save: true,
        persistChatScope: options.persistChatScope,
        destructiveChangeConfirmed,
        signal: templateOperationController.signal,
      });
      const firstAttempt = await applyTemplatePresetToCurrent_ACU(presetName, buildOptions());
      if (!isStaleRevisionConflict(firstAttempt)) return firstAttempt;
      if (templateOperationController.signal.aborted) return firstAttempt;
      return applyTemplatePresetToCurrent_ACU(presetName, buildOptions());
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

  /** 打开可视化表格编辑器；编辑当前生效的模板。 */
  async function openVisualizer(): Promise<void> {
    await run(async () => {
      const opened = await openVisualizerSurface_ACU({ source: 'v2-shell' });
      if (!opened) throw new Error('Tải trình chỉnh sửa trực quan thất bại.');
      toast.success('Đã mở trình chỉnh sửa bảng trực quan.');
    });
  }

  /** 编辑指定全局预设：先把当前聊天切换到该预设，再打开可视化编辑器。 */
  async function editPreset(name: string): Promise<void> {
    const normalized = normalizeTemplatePresetSelectionValue_ACU(name);
    if (isRuntimeSentinelName(name) || normalized === RUNTIME_SENTINEL_NAME) {
      toast.warning('Mẫu đang có hiệu lực không phải preset có thể sửa, vui lòng lưu thành preset toàn cục trước.');
      return;
    }
    if (!normalized) {
      toast.warning('Không thể sửa trực tiếp preset mặc định, vui lòng tạo mới từ mặc định rồi chỉnh sửa.');
      return;
    }
    await run(async () => {
      const preset = getTemplatePreset_ACU(normalized);
      if (!preset?.templateStr) throw new Error('Không tìm thấy preset đích.');
      const guideData = buildChatSheetGuideDataFromTemplateObj_ACU(
        typeof preset.templateStr === 'string' ? safeJsonParse_ACU(preset.templateStr, null) : preset.templateStr,
        { stripSeedRows: false },
      );
      const guard = await ensureTemplateRecoveryOrDeleteCurrentIsolationData_ACU(guideData, 'switch-template');
      if (!guard.success) return;
      const result = await applyPresetWithDestructiveConfirmAndRetry(normalized, {
        source: 'v2_table_drawer_edit',
        updateGlobal: false,
        persistChatScope: true,
      });
      const applyError = getTemplateApplyError_ACU(result, 'Chuyển sang preset đích thất bại.');
      if (applyError) throw new Error(applyError);
      const warning = getTemplateApplyWarning_ACU(result);
      if (warning) {
        toast.warning(warning, { muteable: false, durationMs: 6000 });
        return;
      }
      const opened = await openVisualizerSurface_ACU({ source: 'v2-shell' });
      if (!opened) throw new Error('Tải trình chỉnh sửa trực quan thất bại.');
      toast.success(`Đã chuyển sang「${normalized}」và mở trình chỉnh sửa trực quan.`);
    });
  }

  async function setAsDefault(name: string): Promise<void> {
    if (isRuntimeSentinelName(name)) {
      toast.warning('Mẫu đang có hiệu lực không phải preset toàn cục, không thể đặt làm mặc định.');
      return;
    }
    const normalized = normalizeTemplatePresetSelectionValue_ACU(name);
    await run(async () => {
      // S1-3：当前聊天 inherit_global 时设默认会经协调器切换生效模板，
      // 破坏性 blockers 需确认重试；失败则全局默认不变（fail-closed）。
      const result = await applyPresetWithDestructiveConfirmAndRetry(normalized, {
        source: 'v2_table_drawer_set_default',
        updateGlobal: true,
        persistChatScope: false,
      });
      const applyError = getTemplateApplyError_ACU(result, 'Đặt làm mặc định toàn cục thất bại.');
      if (applyError) throw new Error(applyError);
      const applyWarning = getTemplateApplyWarning_ACU(result);
      if (applyWarning) toast.warning(applyWarning, { muteable: false, durationMs: 6000 });
      toast.success(`「${normalized || 'Preset mặc định'}」đã được đặt làm mặc định toàn cục.`);
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

  async function deletePreset(name: string): Promise<void> {
    if (isRuntimeSentinelName(name)) {
      toast.warning('Mẫu đang có hiệu lực là mục runtime chỉ đọc, không thể xóa.');
      return;
    }
    if (!name) {
      toast.warning('Không thể xóa preset mặc định.');
      return;
    }
    const confirmed = await dialogStore.confirm({
      title: 'Xóa preset mẫu toàn cục',
      message: `Bạn có chắc muốn xóa preset mẫu toàn cục「${name}」không? Thao tác này không thể hoàn tác.`,
      confirmLabel: 'Xóa preset',
      confirmVariant: 'danger',
    });
    if (!confirmed) return;
    await run(async () => {
      const normalized = normalizeTemplatePresetSelectionValue_ACU(name);
      const wasGlobalDefault = defaultPresetName.value === normalized;
      const wasActive = normalizeTemplatePresetSelectionValue_ACU(resolveActiveTemplatePresetName_ACU({ fallbackToGlobal: true })) === normalized;
      if (wasGlobalDefault) {
        // S1-3：回退到内置默认模板同样经协调器（inherit_global 聊天生效模板会变），
        // 破坏性 blockers 需确认重试；失败则中止删除（fail-closed）。
        const globalResult = await applyPresetWithDestructiveConfirmAndRetry('', {
          source: 'v2_table_drawer_delete_default_fallback',
          updateGlobal: true,
          persistChatScope: false,
        });
        const globalError = getTemplateApplyError_ACU(globalResult, 'Quay về mặc định toàn cục thất bại, chưa xóa preset.');
        if (globalError) throw new Error(globalError);
      }
      if (wasActive) {
        const chatResult = await applyTemplatePresetToCurrent_ACU('', {
          source: 'v2_table_drawer_delete_active_fallback',
          updateGlobal: false,
          save: true,
          persistChatScope: true,
          signal: templateOperationController.signal,
        });
        const chatError = getTemplateApplyError_ACU(chatResult, 'Quay về cuộc trò chuyện hiện tại thất bại, chưa xóa preset.');
        if (chatError) throw new Error(chatError);
        const warning = getTemplateApplyWarning_ACU(chatResult);
        if (warning) {
          toast.warning(warning, { muteable: false, durationMs: 6000 });
          return;
        }
      }
      if (!deleteTemplatePreset_ACU(name)) throw new Error('Xóa thất bại hoặc preset không tồn tại.');
      toast.success(`Đã xóa preset mẫu toàn cục「${name}」.`);
    });
  }

  function exportPreset(name: string): void {
    const isRuntimeItem = isRuntimeSentinelName(name);
    const resolved = isRuntimeItem ? resolveTemplateForExport_ACU('runtime') : resolveTemplateForExport_ACU('global', name);
    if (!resolved) {
      toast.error('Không thể phân tích mẫu đích.');
      return;
    }
    const sanitized = sanitizeChatSheetsObject_ACU(resolved.jsonData, { ensureMate: true });
    const safeName = sanitizeFilenameComponent_ACU(resolved.fromPresetName) || 'template';
    downloadJson(sanitized, isRuntimeItem ? `TavernDB_template_runtime_${safeName}.json` : `TavernDB_template_${safeName}.json`);
    message.value = null;
    toast.success(isRuntimeItem ? 'Đã xuất mẫu đang có hiệu lực hiện tại.' : `「${resolved.fromPresetName || 'Preset mặc định'}」đã được xuất.`);
  }

  async function createBlankPreset(): Promise<void> {
    const raw = await dialogStore.prompt({
      title: 'Tạo preset mẫu toàn cục mới',
      message: 'Vui lòng nhập tên preset mẫu toàn cục mới.',
      label: 'Tên preset',
      defaultValue: 'Preset mẫu mới',
      confirmLabel: 'Tạo preset',
    });
    if (!raw) return;
    const requested = raw.trim();
    if (!requested) return;
    await run(async () => {
      const finalName = ensureUniqueTemplatePresetName_ACU(requested);
      if (finalName !== requested) {
        const confirmed = await dialogStore.confirm({
          title: 'Tên preset đã tồn tại',
          message: `Tên preset đã tồn tại, sẽ tự động lưu thành「${finalName}」. Tiếp tục không?`,
          confirmLabel: 'Tiếp tục lưu',
        });
        if (!confirmed) return;
      }
      const snapshot = getDefaultTemplateSnapshot_ACU();
      if (!snapshot?.templateStr) throw new Error('Không thể phân tích mẫu mặc định.');
      if (!upsertTemplatePreset_ACU(finalName, snapshot.templateStr)) throw new Error('Không thể ghi vào preset mẫu toàn cục.');
      toast.success(`Đã tạo preset mẫu toàn cục「${finalName}」.`);
    });
  }

  /** "重命名当前生效的全局预设"——保留原有能力，从抽屉里发起。 */
  async function renamePreset(name: string): Promise<void> {
    if (isRuntimeSentinelName(name)) {
      toast.warning('Mẫu đang có hiệu lực là mục runtime chỉ đọc, không thể đổi tên.');
      return;
    }
    if (!name) {
      toast.warning('Không thể đổi tên preset mặc định.');
      return;
    }
    const preset = getTemplatePreset_ACU(name);
    if (!preset?.templateStr) {
      toast.warning('Không tìm thấy preset đích.');
      return;
    }
    const raw = await dialogStore.prompt({
      title: 'Đổi tên preset mẫu toàn cục',
      message: `Đổi tên preset mẫu toàn cục「${name}」thành:`,
      label: 'Tên preset',
      defaultValue: name,
      confirmLabel: 'Đổi tên',
    });
    if (!raw) return;
    const newName = raw.trim();
    if (!newName || newName === name) return;
    await run(async () => {
      if (!upsertTemplatePreset_ACU(newName, preset.templateStr)) throw new Error('Đổi tên thất bại.');
      deleteTemplatePreset_ACU(name);
      if (defaultPresetName.value === name) {
        const result = await applyTemplatePresetToCurrent_ACU(newName, {
          source: 'v2_table_drawer_rename',
          updateGlobal: true,
          save: true,
          persistChatScope: false,
        });
        if (!result) throw new Error('Chuyển preset mẫu toàn cục sau khi đổi tên thất bại.');
      }
      toast.success(`Preset đã được đổi tên thành「${newName}」.`);
    });
  }

  refresh();

  return {
    drawerView,
    isDrawerOpen,
    title,
    busy,
    message,
    presetMeta,
    defaultPresetName,
    refresh,
    openManage,
    closeDrawer,
    openVisualizer,
    editPreset,
    setAsDefault,
    deletePreset,
    exportPreset,
    createBlankPreset,
    renamePreset,
  };
}
