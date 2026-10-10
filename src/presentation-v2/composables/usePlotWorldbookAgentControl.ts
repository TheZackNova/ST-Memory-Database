import { computed, ref } from 'vue';
import { AGENT_CONTEXT_SETTINGS_LIMITS_ACU } from '../../shared/defaults';
import type {
  AgentContextSettings_ACU,
  AgentPlotExecutionMode_ACU,
  AgentWorldbookControl_ACU,
  AgentWorldbookControlMode_ACU,
  AgentWorldbookScope_ACU,
  AgentWorldbookControlSnapshot_ACU,
  PromptSegment_ACU,
} from '../../shared/models/agent-worldbook-model';
import { settings_ACU, _set_pendingFinalGenerationGreenlights_ACU } from '../../service/runtime/state-manager';
import { saveSettings_ACU } from '../../service/settings/settings-service';
import {
  clonePromptSegments_ACU,
  getDefaultAgentDecisionPromptSegments_ACU,
  getDefaultAgentSkillifyPromptSegments_ACU,
  normalizeAgentContextSettings_ACU,
  normalizeEditablePromptSegments_ACU,
} from '../../service/agent/agent-prompt-template';
import {
  getPlotAgentWorldbookSnapshot_ACU,
  refreshPlotAgentWorldbookSnapshotFromWorldbooks_ACU,
  restoreWorldbookGreenlights_ACU,
  takeoverWorldbookGreenlights_ACU,
} from '../../service/agent/agent-worldbook-takeover';
import {
  skillifyCurrentPlotWorldbookSelection_ACU,
  type AgentSkillifyCursor_ACU,
  type AgentSkillifyProgressEvent_ACU,
  type AgentSkillifyRunResult_ACU,
  type AgentSkillifySelectedEntry_ACU,
} from '../../service/agent/agent-skillify-service';
import {
  clearWorldbookSkillMetaBlocks_ACU,
  resolveAgentWorldbookFilterAvailability_ACU,
} from '../../service/agent/agent-worldbook-skill-meta';
import {
  getAgentPromptTemplateDefaults_ACU,
  readAgentWorldbookControlFromWorldbooks_ACU,
  setAgentPromptTemplateDefaults_ACU,
  writeAgentWorldbookControlToWorldbook_ACU,
  type AgentWorldbookConfigSource_ACU,
  type AgentWorldbookControlWriteResult_ACU,
} from '../../service/agent/agent-worldbook-config-meta';
import { plotCopy } from '../copy/plot-copy';
import { useDialogStore } from '../stores/dialog-store';
import { useToastStore } from '../stores/toast-store';

export type AgentWorldbookBusyAction = 'restore' | 'skillify' | 'clearSkillMeta' | null;

interface AgentApiPresetOption {
  value: string;
  label: string;
}

export type AgentPromptKind_ACU = 'decision' | 'skillify';
export type AgentContextSettingKey_ACU = keyof AgentContextSettings_ACU;
export type AgentPlotExecutionModeSetting_ACU = AgentPlotExecutionMode_ACU;

function getPromptFallback_ACU(kind: AgentPromptKind_ACU): PromptSegment_ACU[] {
  return kind === 'decision' ? getDefaultAgentDecisionPromptSegments_ACU() : getDefaultAgentSkillifyPromptSegments_ACU();
}

function cloneContextSettings_ACU(value: AgentContextSettings_ACU): AgentContextSettings_ACU {
  return { ...(value as unknown as Record<string, number>) } as unknown as AgentContextSettings_ACU;
}

function parseFiniteIntegerInput_ACU(value: unknown): number | null {
  if (typeof value === 'string' && !value.trim()) return null;
  const raw = Number(value);
  return Number.isFinite(raw) ? Math.trunc(raw) : null;
}

function normalizeContextPatch_ACU(
  current: AgentContextSettings_ACU,
  key: AgentContextSettingKey_ACU,
  rawValue: unknown,
): AgentContextSettings_ACU | null {
  const raw = parseFiniteIntegerInput_ACU(rawValue);
  if (raw === null) return null;
  return normalizeAgentContextSettings_ACU({
    ...(current as unknown as Record<string, number>),
    [key]: raw,
  });
}

function normalizeAgentDecisionConcurrency_ACU(value: unknown): number | null {
  const raw = parseFiniteIntegerInput_ACU(value);
  return raw === null ? null : Math.max(1, Math.min(Number.MAX_SAFE_INTEGER, raw));
}

function normalizeMaxSkillifyConcurrency_ACU(value: unknown): number | null {
  const raw = parseFiniteIntegerInput_ACU(value);
  return raw === null ? null : Math.max(1, Math.min(Number.MAX_SAFE_INTEGER, raw));
}

function movePromptSegment_ACU(segments: PromptSegment_ACU[], index: number, delta: -1 | 1): PromptSegment_ACU[] {
  const target = index + delta;
  if (index < 0 || index >= segments.length || target < 0 || target >= segments.length) return segments;
  const next = clonePromptSegments_ACU(segments);
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

function countSnapshotEntries(snapshot: AgentWorldbookControlSnapshot_ACU): number {
  return Object.values(snapshot.books || {}).reduce((sum, entries) => sum + (Array.isArray(entries) ? entries.length : 0), 0);
}

function cloneWorldbookScope_ACU(scope: AgentWorldbookScope_ACU): AgentWorldbookScope_ACU {
  return {
    source: scope.source === 'manual' ? 'manual' : 'character',
    manualSelection: Array.isArray(scope.manualSelection) ? [...scope.manualSelection] : [],
  };
}

function getAgentApiPresetOptions_ACU(): AgentApiPresetOption[] {
  const seen = new Set<string>();
  const options: AgentApiPresetOption[] = [{
    value: '',
    label: plotCopy.agentControl.apiPresets.followCurrentLabel,
  }];
  const presets = Array.isArray(settings_ACU.apiPresets) ? settings_ACU.apiPresets : [];
  for (const preset of presets) {
    const name = typeof preset?.name === 'string' ? preset.name.trim() : '';
    if (!name || seen.has(name)) continue;
    seen.add(name);
    options.push({ value: name, label: name });
  }
  return options;
}

function normalizeAgentApiPreset_ACU(value: unknown): string {
  const name = String(value || '').trim();
  if (!name) return '';
  return getAgentApiPresetOptions_ACU().some(option => option.value === name) ? name : '';
}

function disableLegacyAgentWorldbookControl_ACU(options: { clearSnapshot?: boolean } = {}): void {
  const plotSettings = settings_ACU.plotSettings as Record<string, any> | undefined;
  if (!plotSettings || typeof plotSettings !== 'object') return;
  let changed = false;
  const legacyControl = plotSettings.agentWorldbookControl;
  if (legacyControl && typeof legacyControl === 'object' && !Array.isArray(legacyControl)) {
    if (legacyControl.mode !== 'disabled' || legacyControl.enabled !== false) {
      legacyControl.mode = 'disabled';
      legacyControl.enabled = false;
      changed = true;
    }
  }
  if (options.clearSnapshot === true && Object.prototype.hasOwnProperty.call(plotSettings, 'agentWorldbookControlSnapshot')) {
    delete plotSettings.agentWorldbookControlSnapshot;
    changed = true;
  }
  if (changed) saveSettings_ACU();
}

export function usePlotWorldbookAgentControl() {
  const toast = useToastStore();
  const dialog = useDialogStore();
  const mode = ref<AgentWorldbookControlMode_ACU>('disabled');
  const agentPlotExecutionMode = ref<AgentPlotExecutionMode_ACU>('concurrent');
  const agentApiPreset = ref('');
  const agentSkillApiPreset = ref('');
  const agentDecisionConcurrency = ref(1);
  const maxSkillifyConcurrency = ref(3);
  const worldbookScope = ref<AgentWorldbookScope_ACU>({ source: 'character', manualSelection: [] });
  const snapshot = ref<AgentWorldbookControlSnapshot_ACU>(getPlotAgentWorldbookSnapshot_ACU());
  const busy = ref<AgentWorldbookBusyAction>(null);
  const configSource = ref<AgentWorldbookConfigSource_ACU>('default');
  const configBookName = ref('');
  const writableConfigBookName = ref('');
  const configReason = ref('');
  const contextSettings = ref<AgentContextSettings_ACU>(normalizeAgentContextSettings_ACU(undefined));
  const agentDecisionPromptSegments = ref<PromptSegment_ACU[]>(getDefaultAgentDecisionPromptSegments_ACU());
  const agentSkillifyPromptSegments = ref<PromptSegment_ACU[]>(getDefaultAgentSkillifyPromptSegments_ACU());
  const skillifyCursor = ref<AgentSkillifyCursor_ACU | undefined>();
  const skillifyBatchStats = ref<Pick<AgentSkillifyRunResult_ACU, 'totalMatched' | 'selectedForRun' | 'remaining' | 'truncated'> | null>(null);
  const globalPromptTemplates = ref(getAgentPromptTemplateDefaults_ACU());
  const isReady = ref(false);
  const initializationFailed = ref(false);
  let initialization: Promise<void> | null = null;

  const isAgentMode = computed(() => mode.value === 'agent');
  const snapshotEntryCount = computed(() => countSnapshotEntries(snapshot.value));
  const apiPresetOptions = computed<AgentApiPresetOption[]>(getAgentApiPresetOptions_ACU);
  const configStatusText = computed(() => plotCopy.agentControl.config.status({
    source: configSource.value,
    bookName: configBookName.value,
    writableBookName: writableConfigBookName.value,
    reason: configReason.value,
  }));

  let skillifyScopeIdentity = '';

  function buildSkillifyScopeIdentity_ACU(
    control: AgentWorldbookControl_ACU,
    source: AgentWorldbookConfigSource_ACU,
    selectionSignature: string,
  ): string {
    const scope = cloneWorldbookScope_ACU(control.worldbookScope);
    return JSON.stringify({ source, scope, selectionSignature: String(selectionSignature || '') });
  }

  function clearSkillifyBatchState_ACU(): void {
    skillifyCursor.value = undefined;
    skillifyBatchStats.value = null;
  }

  function applyControlToRefs(control: AgentWorldbookControl_ACU): void {
    mode.value = control.mode;
    agentPlotExecutionMode.value = control.agentPlotExecutionMode;
    agentApiPreset.value = normalizeAgentApiPreset_ACU(control.agentApiPreset);
    agentSkillApiPreset.value = normalizeAgentApiPreset_ACU(control.agentSkillApiPreset);
    agentDecisionConcurrency.value = normalizeAgentDecisionConcurrency_ACU(control.agentDecisionConcurrency) ?? 1;
    maxSkillifyConcurrency.value = normalizeMaxSkillifyConcurrency_ACU(control.maxSkillifyConcurrency) ?? 3;
    worldbookScope.value = cloneWorldbookScope_ACU(control.worldbookScope);
    contextSettings.value = cloneContextSettings_ACU(normalizeAgentContextSettings_ACU(control.contextSettings));
    agentDecisionPromptSegments.value = clonePromptSegments_ACU(control.agentDecisionPromptSegments);
    agentSkillifyPromptSegments.value = clonePromptSegments_ACU(control.agentSkillifyPromptSegments);
  }

  async function refresh(): Promise<void> {
    const [result, nextSnapshot] = await Promise.all([
      readAgentWorldbookControlFromWorldbooks_ACU(),
      refreshPlotAgentWorldbookSnapshotFromWorldbooks_ACU(),
    ]);
    globalPromptTemplates.value = getAgentPromptTemplateDefaults_ACU();
    const nextScopeIdentity = buildSkillifyScopeIdentity_ACU(result.control, result.source, nextSnapshot.selectionSignature);
    if (skillifyScopeIdentity && skillifyScopeIdentity !== nextScopeIdentity) {
      clearSkillifyBatchState_ACU();
    }
    skillifyScopeIdentity = nextScopeIdentity;
    configSource.value = result.source;
    configBookName.value = result.bookName || '';
    writableConfigBookName.value = result.writableBookName || '';
    configReason.value = result.reason || '';
    applyControlToRefs(result.control);
    snapshot.value = nextSnapshot;
  }

  async function writeControlPatch(patch: Partial<AgentWorldbookControl_ACU>): Promise<AgentWorldbookControlWriteResult_ACU | null> {
    if (!isReady.value) {
      toast.warning(
        initializationFailed.value ? 'Đọc cấu hình sổ thế giới Agent thất bại, đã từ chối lưu để tránh giá trị mặc định ghi đè cấu hình đã lưu.' : 'Cấu hình sổ thế giới Agent vẫn đang tải, đã từ chối lưu để tránh ghi đè prompt đã lưu.',
        { muteable: false },
      );
      return null;
    }
    const result = await writeAgentWorldbookControlToWorldbook_ACU(patch);
    if (!result.updated) {
      toast.error(plotCopy.agentControl.config.saveFailed(result.reason || 'unknown'), { muteable: false });
      if (result.stateConfirmed === false) {
        try {
          await refresh();
        } catch {
          toast.warning('Trạng thái lưu cấu hình sổ thế giới Agent chưa được xác nhận và đọc lại thất bại; vui lòng làm mới rồi thử lại.', { muteable: false });
        }
        return null;
      }
      applyControlToRefs(result.control);
      return null;
    }
    await refresh();
    return result;
  }

  /** 返回值表示模式配置是否写入成功；接管/恢复的部分失败不影响返回 true（模式已变，调用方仍需刷新），由 toast 告警。 */
  async function setMode(next: AgentWorldbookControlMode_ACU): Promise<boolean> {
    const saved = await writeControlPatch({ mode: next, enabled: next !== 'disabled' });
    if (!saved) return false;
    if (next === 'agent') {
      try {
        const takeoverResult = await takeoverWorldbookGreenlights_ACU();
        snapshot.value = await refreshPlotAgentWorldbookSnapshotFromWorldbooks_ACU();
        if (takeoverResult.failed > 0 || snapshot.value.active !== true) {
          toast.warning(`Sổ thế giới Agent đã chuyển sang chế độ tiếp quản nhưng tiếp quản vật lý chưa hoàn tất hoàn toàn: ${takeoverResult.reason || 'unknown'}`, { muteable: false });
          return true;
        }
      } catch (error: any) {
        snapshot.value = await refreshPlotAgentWorldbookSnapshotFromWorldbooks_ACU();
        toast.warning(`Sổ thế giới Agent đã chuyển sang chế độ tiếp quản nhưng tiếp quản vật lý thất bại: ${error?.message || 'Lỗi không xác định'}`, { muteable: false });
        return true;
      }
      toast.info(plotCopy.agentControl.modeChanged.agent, { muteable: false });
      return true;
    }
    if (next === 'disabled') {
      try {
        _set_pendingFinalGenerationGreenlights_ACU([]);
        disableLegacyAgentWorldbookControl_ACU();
        const restoreResult = await restoreWorldbookGreenlights_ACU({ cleanupMode: 'restore_only' });
        snapshot.value = await refreshPlotAgentWorldbookSnapshotFromWorldbooks_ACU();
        if (restoreResult.skipped > 0 || restoreResult.failed > 0) {
          const message = plotCopy.agentControl.restore.reasons[restoreResult.reason || ''] || `Sổ thế giới Agent đã tắt nhưng khôi phục các mục được kiểm soát chưa hoàn tất hoàn toàn: ${restoreResult.reason || 'unknown'}`;
          toast.warning(message, { muteable: false });
          return true;
        }
        toast.info(plotCopy.agentControl.modeChanged.disabled, { muteable: false });
        return true;
      } catch (error: any) {
        snapshot.value = await refreshPlotAgentWorldbookSnapshotFromWorldbooks_ACU();
        toast.warning(`Sổ thế giới Agent đã tắt nhưng khôi phục các mục được kiểm soát thất bại: ${error?.message || 'Lỗi không xác định'}`, { muteable: false });
        return true;
      }
    }
    toast.info(plotCopy.agentControl.modeChanged[next], { muteable: false });
    return true;
  }

  async function setAgentPlotExecutionMode(next: AgentPlotExecutionMode_ACU): Promise<boolean> {
    return Boolean(await writeControlPatch({ agentPlotExecutionMode: next === 'concurrent' ? 'concurrent' : 'sequential' }));
  }

  async function setAgentApiPreset(next: string): Promise<void> {
    await writeControlPatch({ agentApiPreset: normalizeAgentApiPreset_ACU(next) });
  }

  async function setAgentSkillApiPreset(next: string): Promise<void> {
    await writeControlPatch({ agentSkillApiPreset: normalizeAgentApiPreset_ACU(next) });
  }

  async function setWorldbookScope(source: AgentWorldbookScope_ACU['source'], manualSelection = worldbookScope.value.manualSelection): Promise<boolean> {
    const normalizedSource = source === 'manual' ? 'manual' : 'character';
    const normalizedSelection = normalizedSource === 'manual'
      ? [...new Set((Array.isArray(manualSelection) ? manualSelection : []).map(name => String(name || '').trim()).filter(Boolean))]
      : [];
    return Boolean(await writeControlPatch({
      worldbookScope: { source: normalizedSource, manualSelection: normalizedSelection },
    }));
  }

  async function toggleWorldbookScopeBook(name: string, checked: boolean): Promise<boolean> {
    const normalizedName = String(name || '').trim();
    if (!normalizedName) return false;
    const selected = new Set(worldbookScope.value.manualSelection);
    if (checked) selected.add(normalizedName);
    else selected.delete(normalizedName);
    return setWorldbookScope('manual', Array.from(selected));
  }

  async function setAgentDecisionConcurrency(value: unknown): Promise<boolean> {
    const next = normalizeAgentDecisionConcurrency_ACU(value);
    if (next === null) return false;
    return Boolean(await writeControlPatch({ agentDecisionConcurrency: next }));
  }

  async function setMaxSkillifyConcurrency(value: unknown): Promise<boolean> {
    const next = normalizeMaxSkillifyConcurrency_ACU(value);
    if (next === null) return false;
    return Boolean(await writeControlPatch({ maxSkillifyConcurrency: next }));
  }

  async function setContextSetting(key: AgentContextSettingKey_ACU, value: unknown): Promise<boolean> {
    const next = normalizeContextPatch_ACU(contextSettings.value, key, value);
    if (!next) return false;
    return Boolean(await writeControlPatch({ contextSettings: next, contextSettingsConfigured: true }));
  }

  async function resetContextSettings(): Promise<void> {
    await writeControlPatch({
      contextSettings: normalizeAgentContextSettings_ACU(undefined),
      contextSettingsConfigured: true,
    });
  }

  async function setPromptSegments(kind: AgentPromptKind_ACU, segments: PromptSegment_ACU[]): Promise<void> {
    const key = kind === 'decision' ? 'agentDecisionPromptSegments' : 'agentSkillifyPromptSegments';
    const fallback = kind === 'decision'
      ? globalPromptTemplates.value.agentDecisionPromptSegments
      : globalPromptTemplates.value.agentSkillifyPromptSegments;
    const normalized = normalizeEditablePromptSegments_ACU(segments, fallback);
    await writeControlPatch({ [key]: normalized } as Partial<AgentWorldbookControl_ACU>);
  }

  async function savePromptSegmentsToCurrentWorldbook(
    decisionSegments: PromptSegment_ACU[],
    skillifySegments: PromptSegment_ACU[],
  ): Promise<boolean> {
    const decision = normalizeEditablePromptSegments_ACU(
      decisionSegments,
      globalPromptTemplates.value.agentDecisionPromptSegments,
    );
    const skillify = normalizeEditablePromptSegments_ACU(
      skillifySegments,
      globalPromptTemplates.value.agentSkillifyPromptSegments,
    );
    return Boolean(await writeControlPatch({
      agentDecisionPromptSegments: decision,
      agentSkillifyPromptSegments: skillify,
    }));
  }

  function getBuiltInPromptSegments(kind: AgentPromptKind_ACU): PromptSegment_ACU[] {
    return getPromptFallback_ACU(kind);
  }

  async function savePromptSegmentsAsGlobalTemplate(
    decisionSegments: PromptSegment_ACU[],
    skillifySegments: PromptSegment_ACU[],
  ): Promise<boolean> {
    if (!isReady.value) {
      toast.warning('Cấu hình sổ thế giới Agent vẫn đang tải, đã từ chối lưu để tránh ghi đè prompt đã lưu.', { muteable: false });
      return false;
    }
    const saved = setAgentPromptTemplateDefaults_ACU({
      agentDecisionPromptSegments: decisionSegments,
      agentSkillifyPromptSegments: skillifySegments,
    });
    if (!saved) {
      toast.error('Lưu mẫu prompt Agent toàn cục thất bại.', { muteable: false });
      return false;
    }
    globalPromptTemplates.value = getAgentPromptTemplateDefaults_ACU();
    return true;
  }

  async function addPromptSegment(kind: AgentPromptKind_ACU, position: 'top' | 'bottom'): Promise<void> {
    const current = kind === 'decision' ? agentDecisionPromptSegments.value : agentSkillifyPromptSegments.value;
    const next = clonePromptSegments_ACU(current);
    const segment: PromptSegment_ACU = { role: 'user', content: '', deletable: true };
    if (position === 'top') next.unshift(segment);
    else next.push(segment);
    await setPromptSegments(kind, next);
  }

  async function updatePromptSegment(
    kind: AgentPromptKind_ACU,
    index: number,
    patch: Partial<PromptSegment_ACU>,
  ): Promise<void> {
    const current = kind === 'decision' ? agentDecisionPromptSegments.value : agentSkillifyPromptSegments.value;
    if (index < 0 || index >= current.length) return;
    const next = clonePromptSegments_ACU(current);
    next[index] = { ...next[index], ...patch };
    await setPromptSegments(kind, next);
  }

  async function deletePromptSegment(kind: AgentPromptKind_ACU, index: number): Promise<void> {
    const current = kind === 'decision' ? agentDecisionPromptSegments.value : agentSkillifyPromptSegments.value;
    if (index < 0 || index >= current.length || current[index]?.deletable === false) return;
    const next = clonePromptSegments_ACU(current);
    next.splice(index, 1);
    await setPromptSegments(kind, next);
  }

  async function movePromptSegment(kind: AgentPromptKind_ACU, index: number, delta: -1 | 1): Promise<void> {
    const current = kind === 'decision' ? agentDecisionPromptSegments.value : agentSkillifyPromptSegments.value;
    await setPromptSegments(kind, movePromptSegment_ACU(current, index, delta));
  }

  async function restore(): Promise<boolean> {
    const confirmed = await dialog.confirm(plotCopy.agentControl.restore.confirm);
    if (!confirmed) return false;
    busy.value = 'restore';
    try {
      _set_pendingFinalGenerationGreenlights_ACU([]);
      const saved = await writeControlPatch({ mode: 'disabled', enabled: false });
      disableLegacyAgentWorldbookControl_ACU();
      if (!saved) return false;
      const result = await restoreWorldbookGreenlights_ACU({ cleanupMode: 'full' });
      disableLegacyAgentWorldbookControl_ACU({ clearSnapshot: result.updated && result.skipped === 0 && result.failed === 0 });
      await refresh();
      const message = plotCopy.agentControl.restore.reasons[result.reason || ''] || plotCopy.agentControl.restore.noop;
      if (result.skipped > 0 || result.failed > 0) {
        toast.warning(message, { muteable: false });
        return false;
      }
      if (result.updated) {
        toast.success(plotCopy.agentControl.restore.success(), { muteable: false });
        return true;
      }
      toast.info(message, { muteable: false });
      return true;
    } catch (e: any) {
      toast.error(`${plotCopy.agentControl.restore.error}${e?.message ? `: ${e.message}` : ''}`, { muteable: false });
      return false;
    } finally {
      busy.value = null;
    }
  }

  async function syncAgentWorldbookTakeoverAfterSkillChange(): Promise<boolean> {
    try {
      await refresh();
      if (!isAgentMode.value) return false;
      const takeoverResult = await takeoverWorldbookGreenlights_ACU();
      snapshot.value = await refreshPlotAgentWorldbookSnapshotFromWorldbooks_ACU();
      if (takeoverResult.failed > 0) {
        toast.warning(`Metadata Skill đã được cập nhật nhưng đồng bộ tiếp quản sổ thế giới Agent chưa hoàn tất hoàn toàn: ${takeoverResult.reason || 'unknown'}`, { muteable: false });
      }
      return true;
    } catch (error: any) {
      try { snapshot.value = await refreshPlotAgentWorldbookSnapshotFromWorldbooks_ACU(); } catch {}
      toast.warning(`Metadata Skill đã được cập nhật nhưng đồng bộ tiếp quản sổ thế giới Agent thất bại: ${error?.message || 'Lỗi không xác định'}`, { muteable: false });
      return false;
    }
  }

  async function skillifyAll(): Promise<boolean> {
    return runSkillifyWithOptions_ACU();
  }

  async function runSkillifyWithOptions_ACU(optionsPatch: { selectedEntries?: AgentSkillifySelectedEntry_ACU[] } = {}): Promise<boolean> {
    await refresh();
    const confirmed = await dialog.confirm(plotCopy.agentControl.skillify.confirm);
    if (!confirmed) return false;
    busy.value = 'skillify';
    let progressToastId: string | null = null;
    try {
      const progressOptions = { durationMs: 0, muteable: false, dismissible: false, feature: 'Skill hóa' };
      const formatProgressText = (event: AgentSkillifyProgressEvent_ACU): string => {
        if (event.phase === 'collecting') return 'Đang quét các mục có thể Skill hóa trong phạm vi sổ thế giới hiện tại...';
        if (event.phase === 'processing') return `Đang Skill hóa mục sổ thế giới: 0/${event.total}`;
        if (event.phase === 'retry') {
          const target = [event.bookName, event.uid !== undefined ? `#${event.uid}` : ''].filter(Boolean).join(' ');
          return `Đang thử lại Skill hóa: ${target || 'Mục hiện tại'}, lần thử thứ ${event.attempt || 1}/${event.maxAttempts || 1} thất bại (${event.message || 'AI trả về không hợp lệ'}).`;
        }
        if (event.phase === 'saving') {
          const target = [event.bookName, event.uid !== undefined ? `#${event.uid}` : ''].filter(Boolean).join(' ');
          return `Đang lưu metadata Skill: ${target || 'Mục hiện tại'}.`;
        }
        if (event.phase === 'entry_done') {
          return `Đang Skill hóa mục sổ thế giới: ${event.current}/${event.total}, cập nhật ${event.updated}, bỏ qua ${event.skipped}, thất bại ${event.failed}.`;
        }
        if (event.phase === 'complete') {
          return `Xử lý Skill hóa hoàn tất: ${event.current}/${event.total}, cập nhật ${event.updated}, bỏ qua ${event.skipped}, thất bại ${event.failed}.`;
        }
        return 'Đang Skill hóa mục sổ thế giới...';
      };
      const notifyProgress = (event: AgentSkillifyProgressEvent_ACU): void => {
        const text = formatProgressText(event);
        if (progressToastId && toast.update(progressToastId, 'info', text, progressOptions)) return;
        progressToastId = toast.info(text, progressOptions);
      };
      const hasExplicitSelection = Array.isArray(optionsPatch.selectedEntries);
      const result = await skillifyCurrentPlotWorldbookSelection_ACU({
        presetName: agentSkillApiPreset.value,
        overwriteManual: false,
        maxAiRetries: contextSettings.value.agentAiMaxRetries,
        maxConcurrency: maxSkillifyConcurrency.value,
        cursor: hasExplicitSelection ? undefined : skillifyCursor.value,
        ...optionsPatch,
        onProgress: notifyProgress,
      });
      skillifyBatchStats.value = {
        totalMatched: result.totalMatched,
        selectedForRun: result.selectedForRun,
        remaining: result.remaining,
        truncated: result.truncated,
      };
      skillifyCursor.value = !hasExplicitSelection && result.truncated && result.nextCursor
        ? result.nextCursor
        : undefined;
      if (result.totalCandidates === 0) {
        if (!progressToastId || !toast.update(progressToastId, 'warning', plotCopy.agentControl.skillify.noCandidates, { muteable: false })) {
          toast.warning(plotCopy.agentControl.skillify.noCandidates, { muteable: false });
        }
        return false;
      }
      const batchText = `Đợt này ${result.selectedForRun}/${result.totalMatched}, còn lại ${result.remaining}`;
      const text = result.failed > 0
        ? `${plotCopy.agentControl.skillify.partial(result.updated, result.skipped, result.failed)} (${batchText})`
        : `${plotCopy.agentControl.skillify.success(result.updated, result.skipped)} (${batchText})`;
      const toastUpdated = progressToastId && toast.update(progressToastId, result.failed > 0 ? 'warning' : 'success', text, { muteable: false });
      if (!toastUpdated) {
        if (result.failed > 0) toast.warning(text, { muteable: false });
        else toast.success(text, { muteable: false });
      }

      const updated = result.updated > 0;
      if (updated) {
        await syncAgentWorldbookTakeoverAfterSkillChange();
      }
      return updated;
    } catch (e: any) {
      const errorText = `${plotCopy.agentControl.skillify.error}${e?.message ? `: ${e.message}` : ''}`;
      if (!progressToastId || !toast.update(progressToastId, 'error', errorText, { muteable: false })) {
        toast.error(errorText, { muteable: false });
      }
      return false;
    } finally {
      busy.value = null;
    }
  }

  async function skillifySelected(selectedEntries: AgentSkillifySelectedEntry_ACU[]): Promise<boolean> {
    if (!Array.isArray(selectedEntries) || selectedEntries.length === 0) {
      toast.warning(plotCopy.agentControl.skillify.noSelection, { muteable: false });
      return false;
    }
    return runSkillifyWithOptions_ACU({ selectedEntries });
  }

  async function clearSkillMeta(): Promise<boolean> {
    const confirmed = await dialog.confirm({ ...plotCopy.agentControl.clearSkillMeta.confirm, confirmVariant: 'danger' });
    if (!confirmed) return false;
    busy.value = 'clearSkillMeta';
    try {
      clearSkillifyBatchState_ACU();
      const availability = await resolveAgentWorldbookFilterAvailability_ACU();
      configSource.value = availability.configSource;
      configBookName.value = availability.configBookName;
      writableConfigBookName.value = availability.writableBookName;
      configReason.value = availability.reason;
      applyControlToRefs(availability.control);

      const result = await clearWorldbookSkillMetaBlocks_ACU(availability.bookNames);
      const nextAvailability = await resolveAgentWorldbookFilterAvailability_ACU();
      configSource.value = nextAvailability.configSource;
      configBookName.value = nextAvailability.configBookName;
      writableConfigBookName.value = nextAvailability.writableBookName;
      configReason.value = nextAvailability.reason;
      applyControlToRefs(nextAvailability.control);

      if (result.failed > 0) {
        toast.warning(plotCopy.agentControl.clearSkillMeta.partial(result.cleared, result.skipped, result.failed), { muteable: false });
        return result.cleared > 0;
      }
      if (result.cleared > 0) {
        toast.success(plotCopy.agentControl.clearSkillMeta.success(result.cleared), { muteable: false });
        return true;
      }
      toast.info(plotCopy.agentControl.clearSkillMeta.noop, { muteable: false });
      return false;
    } catch (e: any) {
      toast.error(`${plotCopy.agentControl.clearSkillMeta.error}${e?.message ? `: ${e.message}` : ''}`, { muteable: false });
      return false;
    } finally {
      busy.value = null;
    }
  }

  function retryInitialization(): Promise<void> {
    if (initialization) return initialization;
    isReady.value = false;
    initializationFailed.value = false;
    initialization = refresh()
      .then(() => {
        initializationFailed.value = false;
        isReady.value = true;
      })
      .catch(error => {
        initializationFailed.value = true;
        toast.error(`Tải cấu hình sổ thế giới Agent thất bại: ${error?.message || 'Lỗi không xác định'}`, { muteable: false });
      })
      .finally(() => {
        initialization = null;
      });
    return initialization;
  }

  void retryInitialization();

  return {
    mode,
    agentPlotExecutionMode,
    agentApiPreset,
    agentSkillApiPreset,
    agentDecisionConcurrency,
    maxSkillifyConcurrency,
    worldbookScope,
    snapshot,
    busy,
    configSource,
    configBookName,
    writableConfigBookName,
    configStatusText,
    contextSettings,
    contextSettingsLimits: AGENT_CONTEXT_SETTINGS_LIMITS_ACU,
    agentDecisionPromptSegments,
    agentSkillifyPromptSegments,
    globalPromptTemplates,
    skillifyCursor,
    skillifyBatchStats,
    isReady,
    initializationFailed,
    isAgentMode,
    snapshotEntryCount,
    apiPresetOptions,
    refresh,
    retryInitialization,
    setMode,
    setAgentPlotExecutionMode,
    setAgentApiPreset,
    setAgentSkillApiPreset,
    setWorldbookScope,
    toggleWorldbookScopeBook,
    setAgentDecisionConcurrency,
    setMaxSkillifyConcurrency,
    setContextSetting,
    resetContextSettings,
    setPromptSegments,
    savePromptSegmentsToCurrentWorldbook,
    getBuiltInPromptSegments,
    savePromptSegmentsAsGlobalTemplate,
    addPromptSegment,
    updatePromptSegment,
    deletePromptSegment,
    movePromptSegment,
    restore,
    skillifyAll,
    skillifySelected,
    syncAgentWorldbookTakeoverAfterSkillChange,
    clearSkillMeta,
  };
}
