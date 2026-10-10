import { computed, ref, type ComputedRef, type Ref } from "vue";
import { settings_ACU } from "../../service/runtime/state-manager";
import { saveSettings_ACU } from "../../service/settings/settings-service";
import { setFeatureApiPreset_ACU } from "../../service/settings/feature-preset-reference-service";
import { setUpdateNumberFields_ACU, setTableContextRules_ACU, setCharCardPrompt_ACU } from "../../service/settings/settings-write-service";
import { getCurrentStorageMode } from "../../service/table/storage-mode";
import { buildTableFillDefaultPromptSegments_ACU } from "../../service/ai/prompt-builder/table-fill-tools";
import {
  DEFAULT_AUTO_UPDATE_FREQUENCY_ACU,
  DEFAULT_AUTO_UPDATE_THRESHOLD_ACU,
  DEFAULT_AUTO_UPDATE_TOKEN_THRESHOLD_ACU,
} from "../../shared/defaults";
import {
  DEFAULT_CHAR_CARD_PROMPT_ACU,
  DEFAULT_CHAR_CARD_PROMPT_STRICT_JSON_ACU,
  DEFAULT_CHAR_CARD_PROMPT_SQL_STRICT_JSON_ACU,
} from "../../shared/defaults-json.js";
import {
  normalizeExcludeRules_ACU,
  normalizeExtractRules_ACU,
  normalizeNonNegativeInteger_ACU,
  normalizePositiveInteger_ACU,
} from "../../shared/utils";
import { useToastStore } from "../stores/toast-store";

type MessageKind = "info" | "success" | "warning" | "error";

export interface FormFillPromptSegment {
  role: string;
  content: string;
  deletable?: boolean;
  mainSlot?: "A" | "B" | "";
  isMain?: boolean;
  isMain2?: boolean;
}

export interface FormFillRulePair {
  start: string;
  end: string;
}

export interface FormFillNumberField {
  key: NumberSettingKey;
  label: string;
  value: number;
  min: number;
  step: number;
  hint: string;
}

export interface FormFillMessage {
  kind: MessageKind;
  text: string;
  scope: "settings" | "prompt";
}

export type NumberSettingKey =
  | "autoUpdateThreshold"
  | "autoUpdateFrequency"
  | "updateBatchSize"
  | "maxConcurrentGroups"
  | "skipUpdateFloors"
  | "retainRecentLayers"
  | "autoUpdateTokenThreshold"
  | "tableMaxRetries";

export interface FormFillSettingsState {
  numberFields: ComputedRef<FormFillNumberField[]>;
  tableApiPreset: Ref<string>;
  tableEditLastPairOnly: Ref<boolean>;
  strictJsonTableFillEnabled: Ref<boolean>;
  tableFillNativeToolEnabled: Ref<boolean>;
  discardUnauthorizedTableEditsEnabled: Ref<boolean>;
  extractRules: Ref<FormFillRulePair[]>;
  excludeRules: Ref<FormFillRulePair[]>;
  promptSegments: Ref<FormFillPromptSegment[]>;
  promptTemplateMode: ComputedRef<"default" | "custom">;
  message: Ref<FormFillMessage | null>;
  promptDirty: Ref<boolean>;
  refresh: () => void;
  setTableApiPreset: (value: string) => void;
  setNumber: (key: NumberSettingKey, value: number | string) => void;
  setNumbers: (
    patch: Partial<Record<NumberSettingKey, number | string>>,
  ) => void;
  setTableEditLastPairOnly: (value: boolean) => void;
  setStrictJsonTableFillEnabled: (value: boolean) => void;
  setTableFillNativeToolEnabled: (value: boolean) => void;
  setDiscardUnauthorizedTableEditsEnabled: (value: boolean) => void;
  setExtractRules: (rules: FormFillRulePair[]) => void;
  setExcludeRules: (rules: FormFillRulePair[]) => void;
  addPromptSegment: (position: "top" | "bottom") => void;
  deletePromptSegment: (index: number) => void;
  updatePromptSegment: (
    index: number,
    patch: Partial<FormFillPromptSegment>,
  ) => void;
  savePrompt: () => void;
  resetPrompt: () => void;
  importPromptFile: (file: File) => Promise<void>;
  exportPrompt: () => void;
}

const NUMBER_FIELD_META: Array<Omit<FormFillNumberField, "value">> = [
  {
    key: "autoUpdateThreshold",
    label: "Số tầng ngữ cảnh điền bảng",
    min: 0,
    step: 1,
    hint: "Khi tự động điền bảng được kích hoạt, tối đa xử lý N tầng phản hồi AI gần nhất.",
  },
  {
    key: "autoUpdateFrequency",
    label: "Tần suất tự động điền bảng",
    min: 1,
    step: 1,
    hint: "Cứ mỗi N tầng phản hồi AI thì cập nhật một lần.",
  },
  {
    key: "updateBatchSize",
    label: "Số tầng mỗi lô",
    min: 1,
    step: 1,
    hint: "Mỗi lần điền bảng gộp xử lý N tầng phản hồi AI.",
  },
  {
    key: "maxConcurrentGroups",
    label: "Số luồng đồng thời tối đa",
    min: 1,
    step: 1,
    hint: "Số nhóm bảng xử lý đồng thời, mặc định là 1.",
  },
  {
    key: "skipUpdateFloors",
    label: "Số phản hồi mới nhất bỏ qua",
    min: 0,
    step: 1,
    hint: "Bỏ qua N tầng phản hồi mới nhất, tránh ghi nội dung chưa ổn định.",
  },
  {
    key: "retainRecentLayers",
    label: "Số tầng dữ liệu giữ lại",
    min: 0,
    step: 1,
    hint: "Dọn dữ liệu vượt phạm vi giữ lại, ảnh hưởng dung lượng tệp và việc truy ngược tầng, không ảnh hưởng lịch sử trò chuyện và hiển thị dữ liệu.",
  },
  {
    key: "autoUpdateTokenThreshold",
    label: "Độ dài tối thiểu của phản hồi AI",
    min: 0,
    step: 1,
    hint: "Thấp hơn giá trị này sẽ bỏ qua tự động điền bảng.",
  },
  {
    key: "tableMaxRetries",
    label: "Số lần thử lại tối đa khi điền bảng",
    min: 1,
    step: 1,
    hint: "Giới hạn số lần thử lại khi thất bại.",
  },
];

const FALLBACKS: Record<NumberSettingKey, number> = {
  autoUpdateThreshold: DEFAULT_AUTO_UPDATE_THRESHOLD_ACU,
  autoUpdateFrequency: DEFAULT_AUTO_UPDATE_FREQUENCY_ACU,
  updateBatchSize: 3,
  maxConcurrentGroups: 1,
  skipUpdateFloors: 0,
  retainRecentLayers: 100,
  autoUpdateTokenThreshold: DEFAULT_AUTO_UPDATE_TOKEN_THRESHOLD_ACU,
  tableMaxRetries: 3,
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? null));
}

function normalizeNumber(key: NumberSettingKey, value: unknown): number {
  const meta = NUMBER_FIELD_META.find((item) => item.key === key);
  const fallback = FALLBACKS[key];
  const normalized =
    (meta?.min ?? 0) > 0
      ? normalizePositiveInteger_ACU(value, fallback)
      : normalizeNonNegativeInteger_ACU(value, fallback);
  return Math.max(meta?.min ?? 0, normalized);
}

function normalizeRules(
  rules: unknown,
  legacy = "",
  kind: "extract" | "exclude",
): FormFillRulePair[] {
  const normalized =
    kind === "extract"
      ? normalizeExtractRules_ACU(rules, legacy)
      : normalizeExcludeRules_ACU(rules, legacy);
  return normalized.map((rule: any) => ({
    start: String(rule.start || ""),
    end: String(rule.end || ""),
  }));
}

function coerceRulePairs(rules: unknown): FormFillRulePair[] {
  return Array.isArray(rules)
    ? rules.map((rule: any) => ({
        start: String(rule?.start ?? ""),
        end: String(rule?.end ?? ""),
      }))
    : [];
}

function normalizeRole(raw: unknown): string {
  const role = String(raw || "USER").trim();
  if (role === "assistant") return "assistant";
  if (role.toUpperCase() === "SYSTEM") return "SYSTEM";
  if (role.toUpperCase() === "USER") return "USER";
  if (role.toUpperCase() === "ASSISTANT") return "assistant";
  return role || "USER";
}

function normalizePromptSegment(raw: any): FormFillPromptSegment {
  const slot =
    raw?.mainSlot === "A" || raw?.isMain === true
      ? "A"
      : raw?.mainSlot === "B" || raw?.isMain2 === true
        ? "B"
        : "";
  return {
    role: normalizeRole(raw?.role),
    content: String(raw?.content ?? ""),
    deletable: slot ? false : raw?.deletable !== false,
    mainSlot: slot,
    isMain: slot === "A",
    isMain2: slot === "B",
  };
}

function normalizePromptSegments(input: unknown): FormFillPromptSegment[] {
  const source = Array.isArray(input)
    ? input
    : typeof input === "string" && input.trim()
      ? [{ role: "USER", content: input }]
      : DEFAULT_CHAR_CARD_PROMPT_ACU;
  const segments = source.map(normalizePromptSegment);
  return ensureUniqueSlots(segments);
}

function ensureUniqueSlots(
  segments: FormFillPromptSegment[],
): FormFillPromptSegment[] {
  const next = segments.map((seg) => ({ ...seg }));
  for (const slot of ["A", "B"] as const) {
    let first = -1;
    for (let i = 0; i < next.length; i += 1) {
      if (next[i].mainSlot !== slot) continue;
      if (first === -1) {
        first = i;
        next[i].deletable = false;
        next[i].isMain = slot === "A";
        next[i].isMain2 = slot === "B";
      } else {
        next[i].mainSlot = "";
        next[i].isMain = false;
        next[i].isMain2 = false;
        next[i].deletable = next[i].deletable !== false;
      }
    }
  }
  return next;
}

function preparePromptForSave(
  segments: FormFillPromptSegment[],
): FormFillPromptSegment[] {
  return ensureUniqueSlots(segments).map((seg) => ({
    role: normalizeRole(seg.role),
    content: String(seg.content || ""),
    deletable: seg.mainSlot ? false : seg.deletable !== false,
    mainSlot: seg.mainSlot || "",
    isMain: seg.mainSlot === "A",
    isMain2: seg.mainSlot === "B",
  }));
}

function currentDefaultPromptSegments(): FormFillPromptSegment[] {
  if (settings_ACU.strictJsonTableFillEnabled === true) {
    const defaults =
      getCurrentStorageMode() === "sqlite"
        ? DEFAULT_CHAR_CARD_PROMPT_SQL_STRICT_JSON_ACU
        : DEFAULT_CHAR_CARD_PROMPT_STRICT_JSON_ACU;
    return normalizePromptSegments(defaults);
  }
  // 正文/工具两套默认主段按填表工具开关对齐，否则关着工具时编辑器会显示要求调用工具的默认提示词。
  return normalizePromptSegments(buildTableFillDefaultPromptSegments_ACU(
    getCurrentStorageMode() === "sqlite",
    settings_ACU.tableFillNativeToolEnabled === true,
  ));
}

function currentPromptSettingKey(): "charCardPrompt" | "strictJsonCharCardPrompt" | "strictJsonSqlCharCardPrompt" {
  if (settings_ACU.strictJsonTableFillEnabled === true) {
    return getCurrentStorageMode() === "sqlite"
      ? "strictJsonSqlCharCardPrompt"
      : "strictJsonCharCardPrompt";
  }
  return "charCardPrompt";
}

function currentPromptSource(): unknown {
  const key = currentPromptSettingKey();
  const value = settings_ACU[key];
  return Array.isArray(value) && value.length > 0 ? value : currentDefaultPromptSegments();
}

function promptFingerprint(segments: FormFillPromptSegment[]): string {
  return JSON.stringify(preparePromptForSave(segments));
}

export function useFormFillSettings(): FormFillSettingsState {
  const toast = useToastStore();
  const values = ref<Record<NumberSettingKey, number>>({ ...FALLBACKS });
  const tableApiPreset = ref(String(settings_ACU.tableApiPreset || ""));
  const tableEditLastPairOnly = ref(
    settings_ACU.tableEditLastPairOnly !== false,
  );
  const strictJsonTableFillEnabled = ref(
    settings_ACU.strictJsonTableFillEnabled === true,
  );
  const tableFillNativeToolEnabled = ref(
    settings_ACU.tableFillNativeToolEnabled === true,
  );
  const discardUnauthorizedTableEditsEnabled = ref(
    settings_ACU.discardUnauthorizedTableEditsEnabled !== false,
  );
  const extractRules = ref<FormFillRulePair[]>([]);
  const excludeRules = ref<FormFillRulePair[]>([]);
  const promptSegments = ref<FormFillPromptSegment[]>([]);
  const message = ref<FormFillMessage | null>(null);
  const promptDirty = ref(false);

  const numberFields = computed<FormFillNumberField[]>(() =>
    NUMBER_FIELD_META.map((meta) => ({
      ...meta,
      value: values.value[meta.key],
    })),
  );
  const promptTemplateMode = computed<"default" | "custom">(() =>
    promptFingerprint(promptSegments.value) ===
    promptFingerprint(currentDefaultPromptSegments())
      ? "default"
      : "custom",
  );

  function refresh(): void {
    const nextValues = { ...FALLBACKS } as Record<NumberSettingKey, number>;
    for (const key of Object.keys(FALLBACKS) as NumberSettingKey[]) {
      const normalized = normalizeNumber(key, settings_ACU[key]);
      nextValues[key] = normalized;
      settings_ACU[key] = normalized;
    }
    values.value = nextValues;
    tableApiPreset.value = String(settings_ACU.tableApiPreset || "");
    tableEditLastPairOnly.value = settings_ACU.tableEditLastPairOnly !== false;
    strictJsonTableFillEnabled.value = settings_ACU.strictJsonTableFillEnabled === true;
    tableFillNativeToolEnabled.value = settings_ACU.tableFillNativeToolEnabled === true;
    discardUnauthorizedTableEditsEnabled.value = settings_ACU.discardUnauthorizedTableEditsEnabled !== false;
    extractRules.value = normalizeRules(
      settings_ACU.tableContextExtractRules,
      settings_ACU.tableContextExtractTags || "",
      "extract",
    );
    excludeRules.value = normalizeRules(
      settings_ACU.tableContextExcludeRules,
      settings_ACU.tableContextExcludeTags || "",
      "exclude",
    );
    promptSegments.value = normalizePromptSegments(currentPromptSource());
    promptDirty.value = false;
  }

  function setTableApiPreset(value: string): void {
    const result = setFeatureApiPreset_ACU("table", String(value || ""));
    if (!result.ok) {
      message.value = { kind: "error", text: result.message || "Cập nhật preset API thất bại.", scope: "settings" };
      return;
    }
    tableApiPreset.value = String(value || "");
    message.value = null;
  }

  function setNumber(key: NumberSettingKey, rawValue: number | string): void {
    const normalized = normalizeNumber(key, rawValue);
    const result = setUpdateNumberFields_ACU({ [key]: normalized });
    if (!result.ok) {
      message.value = { kind: "error", text: result.message || "Lưu cài đặt thất bại.", scope: "settings" };
      return;
    }
    values.value = { ...values.value, [key]: normalized };
    message.value = null;
  }

  function setNumbers(
    patch: Partial<Record<NumberSettingKey, number | string>>,
  ): void {
    const nextValues = { ...values.value };
    const normalizedPatch: Partial<Record<NumberSettingKey, number>> = {};
    for (const key of Object.keys(patch) as NumberSettingKey[]) {
      const normalized = normalizeNumber(key, patch[key]);
      nextValues[key] = normalized;
      normalizedPatch[key] = normalized;
    }
    const result = setUpdateNumberFields_ACU(normalizedPatch);
    if (!result.ok) {
      message.value = { kind: "error", text: result.message || "Lưu cài đặt thất bại.", scope: "settings" };
      return;
    }
    values.value = nextValues;
    message.value = null;
  }


  function setTableEditLastPairOnly(value: boolean): void {
    tableEditLastPairOnly.value = !!value;
    settings_ACU.tableEditLastPairOnly = tableEditLastPairOnly.value;
    saveSettings_ACU();
    message.value = null;
  }

  function setTableFillNativeToolEnabled(value: boolean): void {
    // 先按切换前的默认判定是否仍是默认提示词，再改开关，否则比对基准已变。
    const wasDefault = promptTemplateMode.value === "default";
    tableFillNativeToolEnabled.value = !!value;
    settings_ACU.tableFillNativeToolEnabled = tableFillNativeToolEnabled.value;
    // 仍用默认提示词时跟随切换到对应的默认主段；用户改写过的提示词原样保留。
    if (wasDefault) {
      promptSegments.value = currentDefaultPromptSegments();
      promptDirty.value = false;
    }
    saveSettings_ACU();
    message.value = null;
  }

  function setStrictJsonTableFillEnabled(value: boolean): void {
    strictJsonTableFillEnabled.value = !!value;
    settings_ACU.strictJsonTableFillEnabled = strictJsonTableFillEnabled.value;
    promptSegments.value = normalizePromptSegments(currentPromptSource());
    promptDirty.value = false;
    saveSettings_ACU();
    message.value = null;
  }

  function setDiscardUnauthorizedTableEditsEnabled(value: boolean): void {
    discardUnauthorizedTableEditsEnabled.value = !!value;
    settings_ACU.discardUnauthorizedTableEditsEnabled = discardUnauthorizedTableEditsEnabled.value;
    saveSettings_ACU();
    message.value = null;
  }

  function setExtractRules(rules: FormFillRulePair[]): void {
    extractRules.value = coerceRulePairs(rules);
    const result = setTableContextRules_ACU(
      "extract",
      normalizeRules(extractRules.value, "", "extract"),
    );
    if (!result.ok) {
      message.value = { kind: "error", text: result.message || "Lưu quy tắc thất bại.", scope: "settings" };
      return;
    }
    message.value = null;
  }

  function setExcludeRules(rules: FormFillRulePair[]): void {
    excludeRules.value = coerceRulePairs(rules);
    const result = setTableContextRules_ACU(
      "exclude",
      normalizeRules(excludeRules.value, "", "exclude"),
    );
    if (!result.ok) {
      message.value = { kind: "error", text: result.message || "Lưu quy tắc thất bại.", scope: "settings" };
      return;
    }
    message.value = null;
  }

  function addPromptSegment(position: "top" | "bottom"): void {
    const seg: FormFillPromptSegment = {
      role: "USER",
      content: "",
      deletable: true,
      mainSlot: "",
    };
    const next = promptSegments.value.slice();
    if (position === "top") next.unshift(seg);
    else next.push(seg);
    promptSegments.value = next;
    promptDirty.value = true;
  }

  function deletePromptSegment(index: number): void {
    const target = promptSegments.value[index];
    if (!target || target.deletable === false) return;
    const next = promptSegments.value.slice();
    next.splice(index, 1);
    promptSegments.value = next;
    promptDirty.value = true;
  }

  function updatePromptSegment(
    index: number,
    patch: Partial<FormFillPromptSegment>,
  ): void {
    if (!promptSegments.value[index]) return;
    const next = promptSegments.value.map(
      (seg: FormFillPromptSegment, i: number): FormFillPromptSegment => {
        if (i !== index) {
          if (
            (patch.mainSlot === "A" || patch.mainSlot === "B") &&
            seg.mainSlot === patch.mainSlot
          ) {
            return {
              ...seg,
              mainSlot: "",
              isMain: false,
              isMain2: false,
              deletable: true,
            };
          }
          return { ...seg };
        }
        const updated = { ...seg, ...patch };
        if (updated.mainSlot === "A" || updated.mainSlot === "B") {
          updated.deletable = false;
          updated.isMain = updated.mainSlot === "A";
          updated.isMain2 = updated.mainSlot === "B";
        } else {
          updated.mainSlot = "";
          updated.isMain = false;
          updated.isMain2 = false;
          updated.deletable = true;
        }
        return normalizePromptSegment(updated);
      },
    );
    promptSegments.value = ensureUniqueSlots(next);
    promptDirty.value = true;
  }

  function savePrompt(): void {
    const prepared = preparePromptForSave(promptSegments.value);
    const key = currentPromptSettingKey();
    let result: ReturnType<typeof setCharCardPrompt_ACU>;
    if (key === "charCardPrompt") {
      result = setCharCardPrompt_ACU(clone(prepared));
    } else {
      // strictJson 提示词：写入对应字段，保存失败回滚。
      const field = key;
      const snapshot = settings_ACU[field];
      settings_ACU[field] = clone(prepared);
      const saveResult = saveSettings_ACU();
      if (!saveResult.saved) {
        settings_ACU[field] = snapshot;
        message.value = { kind: "error", text: saveResult.warning || saveResult.error || "Lưu prompt thất bại.", scope: "prompt" };
        return;
      }
      result = { ok: true, code: "ok", changed: true, saveResult };
    }
    if (!result.ok) {
      message.value = { kind: "error", text: result.message || "Lưu prompt thất bại.", scope: "prompt" };
      return;
    }
    promptSegments.value = prepared;
    promptDirty.value = false;
    message.value = null;
    toast.success("Đã lưu prompt");
  }

  function resetPrompt(): void {
    promptSegments.value = currentDefaultPromptSegments();
    promptDirty.value = true;
    message.value = {
      kind: "warning",
      text: "Đã nạp prompt mặc định của chế độ lưu trữ hiện tại, lưu để áp dụng.",
      scope: "prompt",
    };
  }

  async function importPromptFile(file: File): Promise<void> {
    try {
      const parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed)) throw new Error("JSON prompt phải là mảng.");
      promptSegments.value = normalizePromptSegments(parsed);
      promptDirty.value = true;
      message.value = null;
      toast.success("Đã nạp JSON prompt, lưu để áp dụng");
    } catch (error: any) {
      message.value = {
        kind: "error",
        text: error?.message || "Đọc JSON prompt thất bại.",
        scope: "prompt",
      };
    }
  }

  function exportPrompt(): void {
    try {
      const text = JSON.stringify(
        preparePromptForSave(promptSegments.value),
        null,
        2,
      );
      const blob = new Blob([text], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "acu-form-fill-prompt.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      message.value = null;
      toast.success("Đã xuất JSON prompt");
    } catch (error: any) {
      message.value = {
        kind: "error",
        text: error?.message || "Xuất prompt thất bại.",
        scope: "prompt",
      };
    }
  }

  refresh();

  return {
    numberFields,
    tableApiPreset,
    tableEditLastPairOnly,
    strictJsonTableFillEnabled,
    tableFillNativeToolEnabled,
    discardUnauthorizedTableEditsEnabled,
    extractRules,
    excludeRules,
    promptSegments,
    promptTemplateMode,
    message,
    promptDirty,
    refresh,
    setTableApiPreset,
    setNumber,
    setNumbers,
    setTableEditLastPairOnly,
    setStrictJsonTableFillEnabled,
    setTableFillNativeToolEnabled,
    setDiscardUnauthorizedTableEditsEnabled,
    setExtractRules,
    setExcludeRules,
    addPromptSegment,
    deletePromptSegment,
    updatePromptSegment,
    savePrompt,
    resetPrompt,
    importPromptFile,
    exportPrompt,
  };
}
