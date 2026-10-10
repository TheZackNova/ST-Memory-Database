/**
 * content-replace-store — 正文替换页设置与操作边界
 *
 * v2 页面只依赖本 store；旧 settings / chat / optimization service
 * 调用集中在这里，避免 Vue 组件跨进旧 presentation 层。
 */
import { defineStore } from 'pinia';
import { normalizeExcludeRules_ACU, normalizeExtractRules_ACU, logError_ACU } from '../../shared/utils';
import { buildDefaultContentOptimizationPromptGroup_ACU } from '../../shared/defaults';
import { getOriginalContent_ACU, replaceChatMessage_ACU } from '../../service/chat/chat-service';
import { performContentOptimization_ACU } from '../../service/optimization/content-optimization';
import { getLastOptimizedMessageIndex_ACU } from '../../service/plot/plot-logic';
import { settings_ACU } from '../../service/runtime/state-manager';
import { saveSettings_ACU } from '../../service/settings/settings-service';
import { useToastStore } from './toast-store';

export type ContentReplaceMessageKind = 'info' | 'success' | 'warning' | 'error';
export type ContentReplaceBusyAction = '' | 'test' | 'reoptimize' | 'import-presets' | 'export-preset';

export interface ContentReplaceMessage {
  kind: ContentReplaceMessageKind;
  text: string;
  at: number;
}

export interface ContentReplaceRulePair {
  start: string;
  end: string;
}

export interface ContentReplacePromptSegment {
  role: string;
  content: string;
  deletable?: boolean;
  mainSlot?: 'A' | 'B' | '';
  isMain?: boolean;
  isMain2?: boolean;
}

export interface ContentReplacePreset {
  name: string;
  promptGroup: ContentReplacePromptSegment[];
}

const DEFAULT_CONTENT_REPLACE_PRESET_NAME = 'Preset mặc định';
export const CUSTOM_CONTENT_REPLACE_PRESET_VALUE = '__acu_content_replace_custom__';

interface ContentReplaceState {
  enabled: boolean;
  apiPreset: string;
  apiPresetNames: string[];
  seamlessMode: boolean;
  autoApply: boolean;
  showDiff: boolean;
  parallelMode: boolean;
  minLength: number;
  maxOptimizations: number;
  loopCount: number;
  retryCount: number;
  extractTags: string;
  excludeTags: string;
  extractRules: ContentReplaceRulePair[];
  excludeRules: ContentReplaceRulePair[];
  promptGroup: ContentReplacePromptSegment[];
  promptDirty: boolean;
  promptPresets: ContentReplacePreset[];
  activePresetHint: string;
  presetNameDraft: string;
  testInput: string;
  testOutput: string;
  lastOptimizedMessageIndex: number;
  busyAction: ContentReplaceBusyAction;
  message: ContentReplaceMessage | null;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? null));
}

function normalizeInteger(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function normalizePromptSegment(raw: any): ContentReplacePromptSegment | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const role = typeof raw.role === 'string' && raw.role.trim() ? raw.role : 'USER';
  const mainSlot = raw.mainSlot === 'A' || raw.mainSlot === 'B' ? raw.mainSlot : '';
  return {
    role,
    content: typeof raw.content === 'string' ? raw.content : '',
    deletable: raw.deletable !== false,
    ...(mainSlot ? { mainSlot } : {}),
    ...(raw.isMain ? { isMain: true } : {}),
    ...(raw.isMain2 ? { isMain2: true } : {}),
  };
}

function normalizePromptGroup(raw: unknown): ContentReplacePromptSegment[] {
  const source = Array.isArray(raw) ? raw : [];
  const normalized = source
    .map(normalizePromptSegment)
    .filter((item): item is ContentReplacePromptSegment => !!item);
  return normalized.length ? normalized : clone(buildDefaultContentOptimizationPromptGroup_ACU());
}

function normalizePresets(raw: unknown): ContentReplacePreset[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ContentReplacePreset[] = [];
  for (const item of raw) {
    const name = typeof item?.name === 'string' ? item.name.trim() : '';
    if (!name || name === DEFAULT_CONTENT_REPLACE_PRESET_NAME || name === CUSTOM_CONTENT_REPLACE_PRESET_VALUE || seen.has(name)) continue;
    seen.add(name);
    out.push({
      name,
      promptGroup: normalizePromptGroup(item?.promptGroup),
    });
  }
  return out;
}

function coerceRulePairs(rules: unknown): ContentReplaceRulePair[] {
  return Array.isArray(rules)
    ? rules.map((rule: any) => ({
        start: String(rule?.start ?? ''),
        end: String(rule?.end ?? ''),
      }))
    : [];
}

function ensureSettingsShape(): Record<string, any> {
  if (!settings_ACU.contentOptimizationSettings || typeof settings_ACU.contentOptimizationSettings !== 'object') {
    settings_ACU.contentOptimizationSettings = {};
  }
  const cfg = settings_ACU.contentOptimizationSettings as Record<string, any>;
  cfg.enabled = cfg.enabled === true;
  cfg.apiPreset = typeof cfg.apiPreset === 'string' ? cfg.apiPreset : '';
  cfg.seamlessMode = cfg.seamlessMode !== false;
  cfg.autoApply = cfg.autoApply !== false;
  cfg.showDiff = cfg.showDiff !== false;
  cfg.parallelMode = cfg.parallelMode === true;
  cfg.minLength = normalizeInteger(cfg.minLength, 100, 0, 1000000);
  cfg.maxOptimizations = normalizeInteger(cfg.maxOptimizations, 10, 1, 100);
  cfg.loopCount = normalizeInteger(cfg.loopCount, 1, 1, 10);
  cfg.retryCount = normalizeInteger(cfg.retryCount, 3, 1, 10);
  cfg.extractTags = typeof cfg.extractTags === 'string' ? cfg.extractTags : '';
  cfg.excludeTags = typeof cfg.excludeTags === 'string' ? cfg.excludeTags : '';
  cfg.extractRules = normalizeExtractRules_ACU(cfg.extractRules, cfg.extractTags);
  cfg.excludeRules = normalizeExcludeRules_ACU(cfg.excludeRules, cfg.excludeTags);
  cfg.promptGroup = normalizePromptGroup(cfg.promptGroup);
  cfg.promptPresets = normalizePresets(cfg.promptPresets);
  return cfg;
}

function readApiPresetNames(): string[] {
  if (!Array.isArray(settings_ACU.apiPresets)) return [];
  return settings_ACU.apiPresets
    .map((preset: any) => String(preset?.name || '').trim())
    .filter(Boolean);
}

function setMessage(store: ContentReplaceState, kind: ContentReplaceMessageKind, text: string): void {
  store.message = { kind, text, at: Date.now() };
}

function clearMessageAndToast(store: ContentReplaceState, kind: 'success' | 'info' | 'warning' | 'error', text: string, options?: { muteable?: boolean }): void {
  store.message = null;
  useToastStore()[kind](text, options);
}

function promptFingerprint(segments: ContentReplacePromptSegment[]): string {
  return JSON.stringify(
    segments.map(seg => ({
      role: seg.role,
      content: seg.content,
      mainSlot: seg.mainSlot || '',
      isMain: seg.isMain === true,
      isMain2: seg.isMain2 === true,
    })),
  );
}

function defaultPromptGroup(): ContentReplacePromptSegment[] {
  return clone(buildDefaultContentOptimizationPromptGroup_ACU());
}

function findMatchingPresetName(
  promptGroup: ContentReplacePromptSegment[],
  presets: ContentReplacePreset[],
  preferredName = '',
): string {
  const fingerprint = promptFingerprint(promptGroup);
  const preferred = preferredName
    ? presets.find(preset => preset.name === preferredName)
    : null;
  if (preferred && promptFingerprint(preferred.promptGroup) === fingerprint) return preferred.name;
  return presets.find(preset => promptFingerprint(preset.promptGroup) === fingerprint)?.name || '';
}

function uniquePresetName(existing: ContentReplacePreset[], baseName: string): string {
  const base = String(baseName || '').trim() || 'Preset thay thế nội dung mới';
  let candidate = base;
  let suffix = 1;
  while (existing.some(p => p.name === candidate) || candidate === DEFAULT_CONTENT_REPLACE_PRESET_NAME) {
    suffix += 1;
    candidate = `${base} (${suffix})`;
  }
  return candidate;
}

function persist(): void {
  saveSettings_ACU();
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

async function readFileText(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('Đọc tệp thất bại'));
    reader.readAsText(file, 'UTF-8');
  });
}

function formatOptimizationResult(result: any): string {
  if (!result?.success) return `Tối ưu thất bại: ${result?.error || 'Lỗi không xác định'}`;
  const optimizations = Array.isArray(result.optimizations) ? result.optimizations : [];
  const lines = [
    `Tối ưu hoàn tất: ${optimizations.length} đề xuất`,
    `Tóm tắt: ${result.summary || 'Không có'}`,
    '',
  ];
  optimizations.forEach((opt: any, index: number) => {
    lines.push(`[${index + 1}] ${opt.plan || opt.reason || 'Chưa nêu rõ'}`);
    lines.push(`Bản gốc: ${String(opt.original || '').slice(0, 120)}`);
    lines.push(`Thay thế: ${String(opt.optimized || '').slice(0, 120)}`);
    lines.push('');
  });
  lines.push('=== Toàn văn sau tối ưu ===');
  lines.push(String(result.optimizedContent || ''));
  return lines.join('\n');
}

export const useContentReplaceStore = defineStore('acu-v2-content-replace', {
  state: (): ContentReplaceState => ({
    enabled: false,
    apiPreset: '',
    apiPresetNames: [],
    seamlessMode: true,
    autoApply: true,
    showDiff: true,
    parallelMode: false,
    minLength: 100,
    maxOptimizations: 10,
    loopCount: 1,
    retryCount: 3,
    extractTags: '',
    excludeTags: '',
    extractRules: [],
    excludeRules: [],
    promptGroup: [],
    promptDirty: false,
    promptPresets: [],
    activePresetHint: '',
    presetNameDraft: '',
    testInput: '',
    testOutput: '',
    lastOptimizedMessageIndex: -1,
    busyAction: '',
    message: null,
  }),
  getters: {
    hasSelectedPreset(state): boolean {
      const selected = findMatchingPresetName(state.promptGroup, state.promptPresets, state.activePresetHint);
      return !!selected;
    },
    selectedPresetName(state): string {
      const selected = findMatchingPresetName(state.promptGroup, state.promptPresets, state.activePresetHint);
      if (selected) return selected;
      if (promptFingerprint(state.promptGroup) === promptFingerprint(defaultPromptGroup())) return '';
      return CUSTOM_CONTENT_REPLACE_PRESET_VALUE;
    },
    promptSegmentCount(state): number {
      return state.promptGroup.length;
    },
    defaultPromptSegmentCount(): number {
      return defaultPromptGroup().length;
    },
    activePresetLabel(state): string {
      const selected = findMatchingPresetName(state.promptGroup, state.promptPresets, state.activePresetHint);
      if (selected) return selected;
      return promptFingerprint(state.promptGroup) === promptFingerprint(defaultPromptGroup())
        ? DEFAULT_CONTENT_REPLACE_PRESET_NAME
        : 'Prompt tùy chỉnh';
    },
    promptTemplateMode(state): 'default' | 'custom' {
      return promptFingerprint(state.promptGroup) === promptFingerprint(defaultPromptGroup())
        ? 'default'
        : 'custom';
    },
    lastOptimizedLabel(state): string {
      return state.lastOptimizedMessageIndex >= 0
        ? `Tin nhắn thứ ${state.lastOptimizedMessageIndex + 1}`
        : 'Chưa có tin nhắn nào để tối ưu lại';
    },
  },
  actions: {
    refreshFromSettings(): void {
      const cfg = ensureSettingsShape();
      this.enabled = cfg.enabled === true;
      this.apiPresetNames = readApiPresetNames();
      this.apiPreset = this.apiPresetNames.includes(cfg.apiPreset) ? cfg.apiPreset : '';
      if (cfg.apiPreset !== this.apiPreset) cfg.apiPreset = this.apiPreset;
      this.seamlessMode = cfg.seamlessMode !== false;
      this.autoApply = cfg.autoApply !== false;
      this.showDiff = cfg.showDiff !== false;
      this.parallelMode = cfg.parallelMode === true;
      this.minLength = cfg.minLength;
      this.maxOptimizations = cfg.maxOptimizations;
      this.loopCount = cfg.loopCount;
      this.retryCount = cfg.retryCount;
      this.extractTags = cfg.extractTags || '';
      this.excludeTags = cfg.excludeTags || '';
      this.extractRules = clone(cfg.extractRules || []);
      this.excludeRules = clone(cfg.excludeRules || []);
      this.promptGroup = clone(cfg.promptGroup || []);
      this.promptDirty = false;
      this.promptPresets = clone(cfg.promptPresets || []);
      this.lastOptimizedMessageIndex = getLastOptimizedMessageIndex_ACU();
      if (this.activePresetHint && !findMatchingPresetName(this.promptGroup, this.promptPresets, this.activePresetHint)) {
        this.activePresetHint = '';
      }
    },
    saveToSettings(): void {
      const cfg = ensureSettingsShape();
      cfg.enabled = this.enabled;
      cfg.apiPreset = this.apiPreset;
      cfg.seamlessMode = this.seamlessMode;
      cfg.autoApply = this.autoApply;
      cfg.showDiff = this.showDiff;
      cfg.parallelMode = this.parallelMode;
      cfg.minLength = normalizeInteger(this.minLength, 100, 0, 1000000);
      cfg.maxOptimizations = normalizeInteger(this.maxOptimizations, 10, 1, 100);
      cfg.loopCount = normalizeInteger(this.loopCount, 1, 1, 10);
      cfg.retryCount = normalizeInteger(this.retryCount, 3, 1, 10);
      cfg.extractTags = this.extractTags;
      cfg.excludeTags = this.excludeTags;
      cfg.extractRules = normalizeExtractRules_ACU(this.extractRules, this.extractTags);
      cfg.excludeRules = normalizeExcludeRules_ACU(this.excludeRules, this.excludeTags);
      cfg.promptGroup = normalizePromptGroup(this.promptGroup);
      cfg.promptPresets = normalizePresets(this.promptPresets);
      persist();
      this.refreshFromSettings();
    },
    setBoolean(key: 'enabled' | 'seamlessMode' | 'autoApply' | 'showDiff' | 'parallelMode', value: boolean): void {
      this[key] = !!value;
      this.saveToSettings();
    },
    setString(key: 'apiPreset' | 'extractTags' | 'excludeTags' | 'presetNameDraft' | 'testInput', value: string): void {
      this[key] = String(value ?? '');
      if (key !== 'presetNameDraft' && key !== 'testInput') this.saveToSettings();
    },
    setNumber(key: 'minLength' | 'maxOptimizations' | 'loopCount' | 'retryCount', value: number | string): void {
      const bounds = {
        minLength: [100, 0, 1000000],
        maxOptimizations: [10, 1, 100],
        loopCount: [1, 1, 10],
        retryCount: [3, 1, 10],
      } as const;
      const [fallback, min, max] = bounds[key];
      this[key] = normalizeInteger(value, fallback, min, max);
      this.saveToSettings();
    },
    setExtractRules(value: ContentReplaceRulePair[]): void {
      this.extractRules = coerceRulePairs(value);
      const cfg = ensureSettingsShape();
      cfg.extractRules = normalizeExtractRules_ACU(this.extractRules, this.extractTags);
      cfg.extractTags = this.extractTags;
      persist();
    },
    setExcludeRules(value: ContentReplaceRulePair[]): void {
      this.excludeRules = coerceRulePairs(value);
      const cfg = ensureSettingsShape();
      cfg.excludeRules = normalizeExcludeRules_ACU(this.excludeRules, this.excludeTags);
      cfg.excludeTags = this.excludeTags;
      persist();
    },
    addPromptSegment(position: 'top' | 'bottom'): void {
      const segment: ContentReplacePromptSegment = { role: 'USER', content: '', deletable: true };
      if (position === 'top') this.promptGroup.unshift(segment);
      else this.promptGroup.push(segment);
      this.promptDirty = true;
    },
    updatePromptSegment(index: number, patch: Partial<ContentReplacePromptSegment>): void {
      if (index < 0 || index >= this.promptGroup.length) return;
      this.promptGroup[index] = { ...this.promptGroup[index], ...patch };
      this.promptDirty = true;
    },
    deletePromptSegment(index: number): void {
      const target = this.promptGroup[index];
      if (!target || target.deletable === false) return;
      this.promptGroup.splice(index, 1);
      this.promptDirty = true;
    },
    resetPromptGroup(): void {
      this.promptGroup = defaultPromptGroup();
      this.promptDirty = true;
      setMessage(this, 'warning', 'Đã nạp nhóm prompt thay thế nội dung mặc định, lưu để áp dụng.');
    },
    savePromptGroup(): void {
      this.saveToSettings();
      clearMessageAndToast(this, 'success', 'Đã lưu prompt thay thế nội dung.');
    },
    savePromptGroupToPreset(name: string): void {
      const normalized = String(name || '').trim();
      if (!normalized || normalized === CUSTOM_CONTENT_REPLACE_PRESET_VALUE) {
        this.savePromptGroup();
        return;
      }
      const index = this.promptPresets.findIndex(p => p.name === normalized);
      if (index < 0) {
        setMessage(this, 'warning', 'Không tìm thấy preset thay thế nội dung cần lưu.');
        return;
      }
      this.promptPresets[index] = {
        name: normalized,
        promptGroup: normalizePromptGroup(this.promptGroup),
      };
      this.activePresetHint = normalized;
      this.presetNameDraft = normalized;
      this.saveToSettings();
      clearMessageAndToast(this, 'success', `Đã cập nhật preset "${normalized}".`);
    },
    selectPreset(name: string): void {
      const normalized = String(name || '').trim();
      if (normalized === CUSTOM_CONTENT_REPLACE_PRESET_VALUE) return;
      if (!normalized) {
        this.activePresetHint = '';
        this.presetNameDraft = '';
        this.promptGroup = defaultPromptGroup();
        this.saveToSettings();
        this.message = null;
        return;
      }
      const preset = this.promptPresets.find(p => p.name === normalized);
      if (!preset) return;
      this.activePresetHint = preset.name;
      this.presetNameDraft = preset.name;
      this.promptGroup = clone(preset.promptGroup);
      this.saveToSettings();
      this.message = null;
    },
    savePreset(): void {
      const selected = this.hasSelectedPreset ? this.selectedPresetName : '';
      const name = String(this.presetNameDraft || selected || '').trim();
      if (!name) {
        setMessage(this, 'warning', 'Vui lòng nhập tên preset trước.');
        return;
      }
      if (name === DEFAULT_CONTENT_REPLACE_PRESET_NAME || name === CUSTOM_CONTENT_REPLACE_PRESET_VALUE) {
        setMessage(this, 'warning', '「Preset mặc định」là preset có sẵn, vui lòng đổi tên khác để lưu.');
        return;
      }
      const nextPreset = { name, promptGroup: normalizePromptGroup(this.promptGroup) };
      const existingIndex = this.promptPresets.findIndex(p => p.name === name);
      if (existingIndex >= 0) this.promptPresets[existingIndex] = nextPreset;
      else this.promptPresets.push(nextPreset);
      this.activePresetHint = name;
      this.presetNameDraft = name;
      this.saveToSettings();
      clearMessageAndToast(this, 'success', `Đã lưu preset "${name}".`);
    },
    createPresetFromDefault(): void {
      const name = uniquePresetName(this.promptPresets, 'Preset thay thế nội dung mới');
      const nextPreset = { name, promptGroup: defaultPromptGroup() };
      this.promptPresets.push(nextPreset);
      this.activePresetHint = name;
      this.presetNameDraft = name;
      this.promptGroup = clone(nextPreset.promptGroup);
      this.saveToSettings();
      this.message = null;
    },
    deletePreset(): void {
      this.deletePresetByName(this.selectedPresetName);
    },
    deletePresetByName(name: string): void {
      if (!name) return;
      this.promptPresets = this.promptPresets.filter(p => p.name !== name);
      if (this.selectedPresetName === name) {
        this.activePresetHint = '';
        this.promptGroup = defaultPromptGroup();
      }
      if (this.presetNameDraft === name) this.presetNameDraft = '';
      this.saveToSettings();
      this.message = null;
    },
    renamePreset(oldName: string, newName: string): void {
      const source = String(oldName || '').trim();
      const target = String(newName || '').trim();
      if (!source || !target || source === target) return;
      if (target === DEFAULT_CONTENT_REPLACE_PRESET_NAME || target === CUSTOM_CONTENT_REPLACE_PRESET_VALUE) {
        setMessage(this, 'warning', '「Preset mặc định」là preset có sẵn, vui lòng đổi tên khác.');
        return;
      }
      const sourceIndex = this.promptPresets.findIndex(p => p.name === source);
      if (sourceIndex < 0) {
        setMessage(this, 'warning', 'Không tìm thấy preset thay thế nội dung cần đổi tên.');
        return;
      }
      if (this.promptPresets.some(p => p.name === target)) {
        setMessage(this, 'warning', `Preset "${target}" đã tồn tại, vui lòng đổi tên khác.`);
        return;
      }
      this.promptPresets[sourceIndex] = {
        ...this.promptPresets[sourceIndex],
        name: target,
      };
      if (this.activePresetHint === source) this.activePresetHint = target;
      if (this.presetNameDraft === source) this.presetNameDraft = target;
      this.saveToSettings();
      this.message = null;
    },
    exportSelectedPreset(): void {
      this.exportPresetByName(this.selectedPresetName);
    },
    exportPresetByName(name: string): void {
      const preset = this.promptPresets.find(p => p.name === name);
      if (!preset) {
        setMessage(this, 'warning', 'Vui lòng chọn preset cần xuất trước.');
        return;
      }
      this.busyAction = 'export-preset';
      try {
        const safeName = preset.name.replace(/[^a-z0-9_\-\u4e00-\u9fa5]/gi, '_');
        downloadJson(`optimization_preset_${safeName}.json`, [preset]);
        clearMessageAndToast(this, 'success', 'Đã xuất JSON preset thay thế nội dung.');
      } finally {
        this.busyAction = '';
      }
    },
    async importPresets(file: File): Promise<void> {
      this.busyAction = 'import-presets';
      try {
        const text = await readFileText(file);
        const imported = normalizePresets(JSON.parse(text));
        if (!imported.length) throw new Error('Không tìm thấy preset thay thế nội dung hợp lệ.');
        let added = 0;
        let replaced = 0;
        for (const preset of imported) {
          const index = this.promptPresets.findIndex(p => p.name === preset.name);
          if (index >= 0) {
            this.promptPresets[index] = preset;
            replaced += 1;
          } else {
            this.promptPresets.push(preset);
            added += 1;
          }
        }
        this.activePresetHint = imported[0].name;
        this.presetNameDraft = imported[0].name;
        this.promptGroup = clone(imported[0].promptGroup);
        this.saveToSettings();
        clearMessageAndToast(this, 'success', `Đã nhập ${added} preset thay thế nội dung, ghi đè ${replaced} preset trùng tên.`, { muteable: false });
      } catch (e: any) {
        logError_ACU('[ACU-V2] import content replace presets failed', e);
        setMessage(this, 'error', `Nhập preset thất bại: ${e?.message || 'Lỗi không xác định'}`);
      } finally {
        this.busyAction = '';
      }
    },
    async runTest(): Promise<void> {
      const input = this.testInput.trim();
      if (input.length < 10) {
        setMessage(this, 'warning', 'Vui lòng nhập văn bản thử nghiệm tối thiểu 10 ký tự.');
        return;
      }
      this.busyAction = 'test';
      this.testOutput = 'Đang gọi AI để thử nghiệm thay thế nội dung...';
      try {
        const result = await performContentOptimization_ACU(input, { currentLoop: 1, userMessage: '' });
        this.testOutput = formatOptimizationResult(result);
        if (result?.success) {
          clearMessageAndToast(this, 'success', 'Thử nghiệm thay thế nội dung hoàn tất.', { muteable: false });
        } else {
          setMessage(this, 'error', 'Lần thử nghiệm thay thế nội dung trước thất bại, vui lòng kiểm tra cấu hình hoặc xem nhật ký chạy.');
          useToastStore().error(`Thử nghiệm thay thế nội dung thất bại: ${result?.error || 'Lỗi không xác định'}`, { muteable: false });
        }
      } catch (e: any) {
        logError_ACU('[ACU-V2] content replace test failed', e);
        this.testOutput = `Lỗi khi tối ưu: ${e?.message || 'Lỗi không xác định'}`;
        setMessage(this, 'error', 'Lần thử nghiệm thay thế nội dung trước thất bại, vui lòng kiểm tra cấu hình hoặc xem nhật ký chạy.');
        useToastStore().error(`Thử nghiệm thay thế nội dung thất bại: ${e?.message || 'Lỗi không xác định'}`, { muteable: false });
      } finally {
        this.busyAction = '';
      }
    },
    async reoptimizeLatest(): Promise<void> {
      if (!this.enabled) {
        setMessage(this, 'warning', 'Chức năng thay thế nội dung chưa được bật.');
        return;
      }
      const messageIndex = getLastOptimizedMessageIndex_ACU();
      this.lastOptimizedMessageIndex = messageIndex;
      if (messageIndex < 0) {
        setMessage(this, 'warning', 'Hiện chưa có phản hồi AI nào đã được thay thế nội dung.');
        return;
      }
      this.busyAction = 'reoptimize';
      try {
        const originalContent = getOriginalContent_ACU(messageIndex);
        if (!originalContent) throw new Error('Không thể lấy bản gốc trước lần thay thế trước.');
        const result = await performContentOptimization_ACU(originalContent, { currentLoop: 1, userMessage: '' });
        if (!result?.success) throw new Error(result?.error || 'Thay thế nội dung thất bại.');
        if (!Array.isArray(result.optimizations) || result.optimizations.length === 0) {
          clearMessageAndToast(this, 'info', 'Bản gốc đã đủ tốt, không cần thay thế lại.', { muteable: false });
          return;
        }
        const success = await replaceChatMessage_ACU(messageIndex, result.optimizedContent, { originalContent });
        if (!success) throw new Error('Ghi lại tin nhắn trò chuyện thất bại.');
        this.refreshFromSettings();
        clearMessageAndToast(this, 'success', `Đã tối ưu lại và thay thế ${result.optimizations.length} chỗ nội dung.`, { muteable: false });
      } catch (e: any) {
        logError_ACU('[ACU-V2] reoptimize latest failed', e);
        setMessage(this, 'error', 'Lần tối ưu lại trước thất bại, vui lòng kiểm tra cấu hình hoặc xem nhật ký chạy.');
        useToastStore().error(`Tối ưu lại thất bại: ${e?.message || 'Lỗi không xác định'}`, { muteable: false });
      } finally {
        this.busyAction = '';
      }
    },
  },
});
