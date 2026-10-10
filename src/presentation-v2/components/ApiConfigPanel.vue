<template>
  <AcuPanel
    :title="apiCopy.panels.preset.title"
    :description="apiCopy.panels.preset.description"
  >
    <AcuMessage v-if="!store.hasPresets" kind="warning">
      Chưa có preset API khả dụng, hãy tạo mới và đặt làm hiện tại hoặc mặc định toàn cục.
    </AcuMessage>

    <AcuFormRow label="Preset API hiện tại" hint="Dấu sao là preset mặc định cho cuộc trò chuyện mới.">
      <div class="acu-api-config-panel__select-row">
        <AcuPresetDropdown
          :items="presetDropdownItems"
          :model-value="store.activePresetName"
          :default-name="store.defaultApiPresetName"
          :disabled="!store.hasPresets"
          placeholder="Chưa chọn preset API"
          @update:model-value="selectPreset"
          @set-default="store.setDefaultPreset($event)"
        />
        <AcuIconButton
          icon="fa-solid fa-plus"
          title="Tạo preset mới"
          @click="startCreateDraft"
        />
        <AcuIconButton
          icon="fa-solid fa-trash-can"
          variant="danger"
          title="Xóa preset hiện tại"
          :disabled="!store.activePreset"
          @click="store.activePreset && deletePreset(store.activePreset.name)"
        />
      </div>
    </AcuFormRow>

    <form
      v-if="formMode !== 'empty'"
      class="acu-api-config-panel__editor"
      @submit.prevent="saveActiveDraft"
    >
      <AcuFormRow label="Tên preset">
        <AcuInput v-model="activeDraft.name" type="text" autocomplete="off" />
      </AcuFormRow>

      <div class="acu-api-config-panel__editor-section">
        <AcuFormRow label="Kiểu kết nối">
          <AcuSegmentedControl
            :options="connectionModeOptions"
            :model-value="activeConnectionMode"
            aria-label="Kiểu kết nối"
            @update:model-value="setActiveConnectionMode($event)"
          />
        </AcuFormRow>

        <AcuFormRow label="Hết thời gian chờ (giây)" hint="Mặc định 300 giây; một yêu cầu vượt quá thời hạn này được coi là lỗi và dùng số lần thử lại của chức năng hiện tại.">
          <AcuInput v-model="activeDraft.requestTimeoutSeconds" type="number" :min="1" :step="1" />
        </AcuFormRow>

        <template v-if="activeConnectionMode === 'custom'">
          <AcuFormRow label="Gửi qua kênh SillyTavern" hint="Mặc định bật, do backend SillyTavern chuyển tiếp; khi tắt, plugin kết nối thẳng tới endpoint của preset, endpoint phải cho phép CORS. Nhật ký chạy cho biết kênh thực tế, hãy kiểm tra quyền riêng tư trước khi chia sẻ.">
            <AcuToggle v-model="activeDraft.sendViaTavern" aria-label="Gửi qua kênh SillyTavern" />
          </AcuFormRow>
          <AcuFormRow
            label="Giao thức API"
            hint="Kết nối trực tiếp gọi /chat/completions, /responses, /messages hoặc /interactions theo giao thức đã chọn. Kênh SillyTavern dùng bộ chuyển đổi giao thức của host. Với endpoint thuần gốc, «Tải mô hình» có thể thất bại, hãy nhập tên mô hình thủ công."
          >
            <AcuSelect
              :options="customApiFormatOptions"
              :model-value="activeDraft.customApiFormat"
              @update:model-value="setCustomApiFormat"
            />
          </AcuFormRow>
          <AcuFormRow label="Endpoint (URL cơ sở)">
            <AcuInput
              v-model="activeDraft.url"
              type="text"
              placeholder="https://example.com/v1"
            />
          </AcuFormRow>
          <AcuFormRow label="Khóa API">
            <AcuInput
              v-model="activeDraft.apiKey"
              type="password"
              autocomplete="off"
            />
          </AcuFormRow>
          <AcuFormRow label="Tên mô hình">
            <AcuInput v-model="activeDraft.model" type="text" />
          </AcuFormRow>
          <div class="acu-api-config-panel__inline-action">
            <AcuButton @click="loadModelsForActive">Tải mô hình</AcuButton>
            <span
              v-if="store.modelLoadStatus === 'loading'"
              class="acu-api-config-panel__muted"
              >Đang tải...</span
            >
            <span
              v-else-if="store.modelLoadStatus === 'error'"
              class="acu-api-config-panel__danger"
              >{{ store.modelLoadError }}</span
            >
          </div>
          <AcuFormRow v-if="store.modelOptions.length" label="Danh sách mô hình">
            <AcuSelect
              :options="modelSelectOptions"
              :model-value="activeDraft.model"
              placeholder="Vui lòng chọn"
              @update:model-value="activeDraft.model = $event"
            />
          </AcuFormRow>
        </template>

        <template v-if="activeConnectionMode === 'tavern'">
          <AcuFormRow label="Preset kết nối SillyTavern">
            <AcuSelect
              :options="tavernProfileOptions"
              :model-value="activeDraft.tavernProfile"
              placeholder="Vui lòng chọn"
              @update:model-value="activeDraft.tavernProfile = $event"
            />
          </AcuFormRow>
          <div class="acu-api-config-panel__inline-action">
            <AcuButton @click="store.refreshTavernProfiles">Làm mới danh sách</AcuButton>
          </div>
        </template>
      </div>

      <div
        v-if="activeConnectionMode === 'custom'"
        class="acu-api-config-panel__two-col"
      >
        <AcuFormRow label="Độ dài phản hồi tối đa">
          <AcuInput
            v-model="activeDraft.max_tokens"
            type="number"
            :min="1"
            :step="1"
          />
        </AcuFormRow>
        <AcuFormRow label="Nhiệt độ">
          <AcuInput
            v-model="activeDraft.temperature"
            type="number"
            :min="0"
            :max="2"
            :step="0.05"
          />
        </AcuFormRow>
      </div>

      <div
        v-if="activeConnectionMode === 'custom'"
        class="acu-api-config-panel__editor-section"
      >
        <AcuFormRow label="Tham số body bổ sung" hint="SillyTavern custom_include_body, nhập YAML object, sẽ được gộp vào body yêu cầu mô hình cuối cùng.">
          <AcuTextarea
            v-model="activeDraft.bodyParams"
            :rows="3"
            placeholder="response_format:&#10;  type: json_object&#10;top_k: 50"
          />
        </AcuFormRow>
        <AcuFormRow label="Tham số body loại trừ" hint="Được chuyển thành SillyTavern custom_exclude_body, xóa các trường chỉ định khỏi body yêu cầu mô hình cuối cùng.">
          <AcuTextarea
            v-model="activeDraft.excludeBodyParams"
            :rows="2"
            placeholder="top_p, reasoning_effort"
          />
        </AcuFormRow>
        <AcuFormRow
          label="Xử lý hậu kỳ prompt"
          hint="Chỉ có hiệu lực với kênh SillyTavern, mặc định gộp các lượt nói liên tiếp cùng vai trò (gồm công cụ). Kết nối trực tiếp của plugin giữ nguyên thứ tự tin nhắn, không gộp, hỗ trợ công cụ và giữ vai trò system."
        >
          <AcuSelect
            :options="promptPostProcessingOptions"
            :model-value="activeDraft.promptPostProcessing"
            :disabled="!activeDraft.sendViaTavern"
            placeholder="Chưa chọn"
            @update:model-value="setPromptPostProcessing"
          />
        </AcuFormRow>
        <AcuFormRow label="Header yêu cầu bổ sung" hint="Mỗi dòng một Header: Value, được thêm vào header yêu cầu.">
          <AcuTextarea
            v-model="activeDraft.requestHeaders"
            :rows="2"
            placeholder="X-Custom-Header: value"
          />
        </AcuFormRow>
      </div>

      <AcuMessage v-if="activeDraftError" kind="error">{{
        activeDraftError
      }}</AcuMessage>

      <div class="acu-api-config-panel__actions">
        <AcuButton :disabled="!activeDraftDirty" @click="syncActiveDraft"
          >Bỏ thay đổi</AcuButton
        >
        <AcuButton
          variant="primary"
          native-type="submit"
          :disabled="!activeDraftDirty"
        >
          {{ formMode === "create" ? "Lưu và chọn preset" : "Lưu preset hiện tại" }}
        </AcuButton>
      </div>
    </form>

    <AcuMessage v-else kind="warning">
      Chưa có preset API khả dụng, hãy tạo mới và đặt làm hiện tại hoặc mặc định toàn cục.
    </AcuMessage>
  </AcuPanel>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import {
  apiPresetDraftFromPreset,
  apiPresetFromDraft,
  applyConnectionMode,
  connectionModeFromDraft,
  createEmptyApiPresetDraft,
  type ApiPresetDraft,
  type ConnectionMode,
} from "../composables/useApiPresetManagement";
import {
  normalizeCustomApiFormat_ACU,
  normalizePromptPostProcessing_ACU,
} from "../../service/settings/api-preset-service";
import { useUiCloseGuard } from "../composables/useUiCloseGuard";
import { apiCopy } from "../copy/api-copy";
import {
  useApiPresetStore,
  type AcuV2ApiPreset,
} from "../stores/api-preset-store";
import { useDialogStore } from "../stores/dialog-store";
import { useToastStore } from "../stores/toast-store";
import AcuButton from "./_lib/AcuButton.vue";
import AcuFormRow from "./_lib/AcuFormRow.vue";
import AcuIconButton from "./_lib/AcuIconButton.vue";
import AcuInput from "./_lib/AcuInput.vue";
import AcuMessage from "./_lib/AcuMessage.vue";
import AcuPanel from "./_lib/AcuPanel.vue";
import AcuTextarea from "./_lib/AcuTextarea.vue";
import type { PresetDropdownItem } from "./_lib/AcuPresetDropdown.vue";
import AcuPresetDropdown from "./_lib/AcuPresetDropdown.vue";
import type { AcuSegmentedOption } from "./_lib/AcuSegmentedControl.vue";
import AcuSegmentedControl from "./_lib/AcuSegmentedControl.vue";
import AcuSelect, { type AcuSelectOption } from "./_lib/AcuSelect.vue";
import AcuToggle from "./_lib/AcuToggle.vue";

const store = useApiPresetStore();
const dialogStore = useDialogStore();
const toast = useToastStore();
const formMode = ref<"empty" | "edit" | "create">("empty");
const activeDraft = reactive<ApiPresetDraft>(createEmptyApiPresetDraft());
const activeDraftOriginalName = ref("");
const activeDraftSnapshot = ref("");
const activeDraftError = ref("");
const activeDraftSavedAt = ref<number | null>(null);

const activeConnectionMode = computed<ConnectionMode>(() =>
  connectionModeFromDraft(activeDraft),
);
const activeDraftDirty = computed(() => {
  if (formMode.value === "create")
    return JSON.stringify(activeDraft) !== activeDraftSnapshot.value;
  return (
    !!store.activePreset &&
    JSON.stringify(activeDraft) !== activeDraftSnapshot.value
  );
});
const connectionModeOptions: AcuSegmentedOption[] = [
  { value: "main", label: "API chính của SillyTavern" },
  { value: "custom", label: "Tùy chỉnh" },
  { value: "tavern", label: "Preset SillyTavern" },
];
// 选项与 SillyTavern「提示词后处理」下拉一致；默认 merge_tools。
const promptPostProcessingOptions: AcuSelectOption[] = [
  { value: "", label: "Chưa chọn" },
  {
    value: "merge_tools",
    label: "Gộp các lượt nói liên tiếp cùng vai trò (gồm công cụ)",
    group: "With Tools",
  },
  {
    value: "semi_tools",
    label: "Bán nghiêm ngặt (buộc vai trò luân phiên) (gồm công cụ)",
    group: "With Tools",
  },
  {
    value: "strict_tools",
    label: "Nghiêm ngặt (buộc vai trò luân phiên, người dùng trước) (gồm công cụ)",
    group: "With Tools",
  },
  { value: "merge", label: "Gộp các lượt nói liên tiếp cùng vai trò", group: "No Tools" },
  { value: "semi", label: "Bán nghiêm ngặt (buộc vai trò luân phiên)", group: "No Tools" },
  {
    value: "strict",
    label: "Nghiêm ngặt (buộc vai trò luân phiên, người dùng trước)",
    group: "No Tools",
  },
  { value: "single", label: "Một tin nhắn người dùng duy nhất (không công cụ)" },
];
// 接口协议选项（对齐 TT 主 API 四个「自定义」选项，custom_api_format 契约）；值集合以
// api-preset-service 的 CUSTOM_API_FORMAT_VALUES_ACU 为唯一来源，此处只补人类可读标签。
const customApiFormatOptions: AcuSelectOption[] = [
  { value: "openai_compat", label: "Tương thích OpenAI" },
  { value: "openai_responses", label: "Tương thích OpenAI Responses" },
  { value: "claude_messages", label: "Tương thích Claude Messages" },
  { value: "gemini_interactions", label: "Tương thích Gemini Interactions" },
];
const modelSelectOptions = computed<AcuSelectOption[]>(() =>
  store.modelOptions.map((m) => ({ value: m, label: m })),
);
const tavernProfileOptions = computed<AcuSelectOption[]>(() =>
  store.tavernProfiles.map((p) => ({ value: p.id, label: p.name })),
);
const presetDropdownItems = computed<PresetDropdownItem[]>(() =>
  store.presets.map((p) => ({
    name: p.name,
    meta: presetMeta(p),
  })),
);

function refreshAll(): void {
  store.refreshFromSettings();
  store.refreshTavernProfiles();
  syncActiveDraft();
}

onMounted(() => {
  refreshAll();
});
useUiCloseGuard(async () => {
  if (!activeDraftDirty.value) return true;
  return dialogStore.confirm({
    title: "Đóng UI mới",
    message: "Bạn có thay đổi API hiện tại chưa lưu, chắc chắn đóng UI mới?",
    confirmLabel: "Đóng UI mới",
    confirmVariant: "danger",
  });
});

function syncActiveDraft(): void {
  const preset = store.activePreset;
  if (!preset) {
    Object.assign(activeDraft, createEmptyApiPresetDraft());
    activeDraftOriginalName.value = "";
    formMode.value = "empty";
  } else {
    Object.assign(
      activeDraft,
      createEmptyApiPresetDraft(),
      apiPresetDraftFromPreset(preset),
    );
    activeDraftOriginalName.value = preset.name;
    formMode.value = "edit";
  }
  activeDraftSnapshot.value = JSON.stringify(activeDraft);
  activeDraftError.value = "";
  activeDraftSavedAt.value = null;
}

function startCreateDraft(): void {
  Object.assign(activeDraft, createEmptyApiPresetDraft());
  activeDraftOriginalName.value = "";
  formMode.value = "create";
  activeDraftSnapshot.value = JSON.stringify(activeDraft);
  activeDraftError.value = "";
  activeDraftSavedAt.value = null;
}

function selectPreset(name: string): void {
  store.setActivePresetForCurrentChat(name);
}

async function deletePreset(name: string): Promise<void> {
  const confirmed = await dialogStore.confirm({
    title: "Xóa preset API",
    message: `Xóa preset API "${name}"?`,
    confirmLabel: "Xóa preset",
    confirmVariant: "danger",
  });
  if (!confirmed) return;
  store.deletePreset(name);
}

function presetMeta(preset: AcuV2ApiPreset): string {
  if (preset.apiMode === "tavern") return "Preset SillyTavern";
  return preset.apiConfig.useMainApi
    ? "API chính của SillyTavern"
    : preset.apiConfig.model || "Tùy chỉnh";
}

function validateActiveDraft(): boolean {
  if (!activeDraft.name.trim()) {
    activeDraftError.value = "Tên preset không được để trống.";
    return false;
  }
  if (activeDraft.apiMode === "tavern" && !activeDraft.tavernProfile.trim()) {
    activeDraftError.value = "Vui lòng chọn preset kết nối SillyTavern.";
    return false;
  }
  if (activeDraft.apiMode === "custom" && !activeDraft.useMainApi) {
    if (!activeDraft.url.trim()) {
      activeDraftError.value = "API tùy chỉnh cần nhập endpoint (URL cơ sở).";
      return false;
    }
    if (!activeDraft.model.trim()) {
      activeDraftError.value = "API tùy chỉnh cần nhập mô hình.";
      return false;
    }
  }
  activeDraftError.value = "";
  return true;
}

function saveActiveDraft(): void {
  if (!validateActiveDraft()) return;
  const preset = apiPresetFromDraft(activeDraft);
  const ok = store.savePreset(preset, activeDraftOriginalName.value);
  if (!ok) {
    activeDraftError.value = "Lưu preset thất bại.";
    return;
  }
  if (formMode.value === "create") {
    const activateOk = store.setActivePresetForCurrentChat(preset.name);
    if (!activateOk) {
      activeDraftError.value = "Đã lưu preset nhưng chuyển sang preset của cuộc trò chuyện hiện tại thất bại.";
      return;
    }
  }
  store.refreshFromSettings();
  syncActiveDraft();
  activeDraftSavedAt.value = Date.now();
  toast.success("Đã lưu preset API hiện tại.");
}

function setActiveConnectionMode(value: string): void {
  applyConnectionMode(activeDraft, value as ConnectionMode);
  activeDraftSavedAt.value = null;
}

function setPromptPostProcessing(value: string): void {
  activeDraft.promptPostProcessing =
    normalizePromptPostProcessing_ACU(value);
  activeDraftSavedAt.value = null;
}

function setCustomApiFormat(value: string): void {
  activeDraft.customApiFormat = normalizeCustomApiFormat_ACU(value);
  activeDraftSavedAt.value = null;
}

async function loadModelsForActive(): Promise<void> {
  await store.loadModelsForConfig({
    url: activeDraft.url,
    apiKey: activeDraft.apiKey,
    sendViaTavern: activeDraft.sendViaTavern,
    requestTimeoutSeconds: activeDraft.requestTimeoutSeconds,
    customApiFormat: activeDraft.customApiFormat,
    requestHeaders: activeDraft.requestHeaders,
  });
}

watch(
  () => store.activePresetName,
  () => syncActiveDraft(),
  { flush: "sync" },
);
</script>

<style scoped>
.acu-api-config-panel__select-row {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) max-content max-content;
  gap: 6px;
  align-items: stretch;
}

.acu-api-config-panel__editor {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.acu-api-config-panel__editor-section {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.acu-api-config-panel__inline-action {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.acu-api-config-panel__two-col {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.acu-api-config-panel__muted {
  color: var(--acu-text-3);
  font-size: var(--acu-font-size-body, 12px);
}

.acu-api-config-panel__danger {
  color: var(--acu-danger);
  font-size: var(--acu-font-size-body, 12px);
}

.acu-api-config-panel__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
