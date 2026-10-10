<template>
  <section class="acu-v2-content-replace-page">
    <AcuMobilePanelNav :items="panelNavItems" />

    <AcuMessage v-if="store.message" :kind="store.message.kind">
      {{ store.message.text }}
    </AcuMessage>

    <AcuPanelGrid class="acu-v2-content-replace-page__layout">
      <AcuPanel
        id="content-replace-basic-panel"
        :title="contentReplaceCopy.panels.basic.title"
        :description="contentReplaceCopy.panels.basic.description"
      >
        <AcuFormRow
          label="Preset API"
          hint="Mặc định dùng API hiện tại; sau khi chọn chỉ ảnh hưởng việc thay thế nội dung."
        >
          <AcuSelect
            :options="apiOptions"
            :model-value="store.apiPreset"
            :placeholder="followActiveApiLabel"
            @update:model-value="store.setString('apiPreset', $event)"
          />
        </AcuFormRow>

        <div class="acu-v2-content-replace-page__number-grid">
          <AcuFormRow label="Độ dài nội dung tối thiểu" hint="Thấp hơn giá trị này thì bỏ qua tối ưu.">
            <AcuInput
              :model-value="store.minLength"
              type="number"
              :min="0"
              :step="10"
              @change="store.setNumber('minLength', $event)"
            />
          </AcuFormRow>
          <AcuFormRow label="Số mục thay thế tối đa" hint="Số đề xuất tối đa chấp nhận trong một lần.">
            <AcuInput
              :model-value="store.maxOptimizations"
              type="number"
              :min="1"
              :max="100"
              :step="1"
              @change="store.setNumber('maxOptimizations', $event)"
            />
          </AcuFormRow>
          <AcuFormRow
            label="Số vòng tối ưu"
            hint="Kiểm tra lại kết quả tối ưu; đặt quá cao sẽ tăng thời gian chờ."
          >
            <AcuInput
              :model-value="store.loopCount"
              type="number"
              :min="1"
              :max="10"
              :step="1"
              @change="store.setNumber('loopCount', $event)"
            />
          </AcuFormRow>
          <AcuFormRow label="Số lần tự thử lại" hint="Số lần thử lại tối đa khi thất bại.">
            <AcuInput
              :model-value="store.retryCount"
              type="number"
              :min="1"
              :max="10"
              :step="1"
              @change="store.setNumber('retryCount', $event)"
            />
          </AcuFormRow>
        </div>
      </AcuPanel>

      <AcuPanel
        id="content-replace-mode-panel"
        :title="contentReplaceCopy.panels.mode.title"
        :description="contentReplaceCopy.panels.mode.description"
      >
        <div class="acu-v2-content-replace-page__choice-list">
          <AcuCheckbox
            :model-value="store.seamlessMode"
            label="Chế độ thay thế êm"
            @update:model-value="store.setBoolean('seamlessMode', $event)"
          />
          <AcuCheckbox
            :model-value="store.autoApply"
            label="Tự động áp dụng kết quả thay thế"
            @update:model-value="store.setBoolean('autoApply', $event)"
          />
          <AcuCheckbox
            :model-value="store.showDiff"
            label="Hiển thị so sánh tối ưu"
            @update:model-value="store.setBoolean('showDiff', $event)"
          />
          <AcuCheckbox
            :model-value="store.parallelMode"
            label="Chạy song song điền bảng và thay thế nội dung"
            @update:model-value="store.setBoolean('parallelMode', $event)"
          />
        </div>

        <div class="acu-v2-content-replace-page__mini-status">
          <span>Gần nhất có thể tối ưu lại</span>
          <strong>{{ store.lastOptimizedLabel }}</strong>
        </div>

        <div class="acu-v2-content-replace-page__actions">
          <AcuButton
            :loading="store.busyAction === 'reoptimize'"
            :disabled="store.lastOptimizedMessageIndex < 0"
            @click="store.reoptimizeLatest"
          >
            <i class="fa-solid fa-rotate-right"></i>
            Tối ưu lại lần gần nhất
          </AcuButton>
        </div>
      </AcuPanel>

      <AcuPanel
        id="content-replace-preset-panel"
        :title="contentReplaceCopy.panels.preset.title"
        :description="contentReplaceCopy.panels.preset.description"
      >
        <template #actions>
          <AcuBadge :variant="promptTemplateBadgeVariant">{{
            promptTemplateBadgeLabel
          }}</AcuBadge>
        </template>

        <p class="acu-v2-content-replace-page__status-line">
          Prompt hiện tại:
          <strong>{{ store.activePresetLabel }}</strong>
          <span class="acu-v2-content-replace-page__badge">
            {{ store.promptSegmentCount }} đoạn prompt
          </span>
        </p>

        <div class="acu-v2-content-replace-page__select-row">
          <AcuPresetDropdown
            :items="presetDropdownItems"
            :model-value="store.selectedPresetName"
            default-name=""
            empty-text="Chưa có preset thay thế nội dung"
            placeholder="Prompt tùy chỉnh"
            :show-default-action="false"
            @update:model-value="store.selectPreset($event)"
          />
          <AcuIconButton
            icon="fa-solid fa-pen"
            :title="
              canEditCurrentPrompt
                ? 'Sửa prompt hiện tại'
                : 'Không thể sửa trực tiếp preset mặc định, hãy tạo mới từ mặc định rồi sửa'
            "
            :disabled="!canEditCurrentPrompt"
            @click="openPromptDrawerForCurrent"
          />
          <AcuFileButton
            icon-only
            title="Nhập JSON preset"
            accept="application/json,.json"
            :disabled="!!store.busyAction"
            @file="store.importPresets"
          >
            <i class="fa-solid fa-download"></i>
          </AcuFileButton>
          <AcuIconButton
            icon="fa-solid fa-gear"
            title="Quản lý preset"
            @click="presetDrawerOpen = true"
          />
        </div>

        <AcuMessage v-if="promptGroupMissingContent" kind="warning">
          Prompt thay thế nội dung thiếu
          $CONTENT; khi placeholder trống, lúc chạy không biết phải kiểm tra đoạn nội dung nào; hãy mở trình sửa để nạp prompt mặc định hoặc bổ sung lại placeholder.
        </AcuMessage>
      </AcuPanel>

      <AcuPanel
        id="content-replace-filter-panel"
        :title="contentReplaceCopy.panels.filter.title"
        :description="contentReplaceCopy.panels.filter.description"
      >
        <div class="acu-v2-content-replace-page__form-grid">
          <AcuFormRow label="Thẻ trích xuất" hint="Nhiều thẻ phân cách bằng dấu phẩy, để trống thì không trích xuất.">
            <AcuInput
              :model-value="store.extractTags"
              type="text"
              placeholder="Ví dụ: content,正文"
              @update:model-value="
                store.setString('extractTags', String($event))
              "
            />
          </AcuFormRow>
          <AcuFormRow label="Thẻ loại trừ" hint="Nhiều thẻ phân cách bằng dấu phẩy, để trống thì không loại trừ.">
            <AcuInput
              :model-value="store.excludeTags"
              type="text"
              placeholder="Ví dụ: think,thinking"
              @update:model-value="
                store.setString('excludeTags', String($event))
              "
            />
          </AcuFormRow>
        </div>

        <div class="acu-v2-content-replace-page__rule-stack">
          <AcuRulePairList
            label="Quy tắc trích xuất thẻ nội dung"
            :model-value="store.extractRules"
            start-placeholder="Từ bắt đầu (ví dụ: <content>)"
            end-placeholder="Từ kết thúc (ví dụ: </content>)"
            add-label="Thêm quy tắc trích xuất"
            @update:model-value="store.setExtractRules"
          />
          <AcuRulePairList
            label="Quy tắc loại trừ thẻ"
            :model-value="store.excludeRules"
            start-placeholder="Từ bắt đầu (ví dụ: <think>)"
            end-placeholder="Từ kết thúc (ví dụ: </think>)"
            add-label="Thêm quy tắc loại trừ"
            @update:model-value="store.setExcludeRules"
          />
        </div>
      </AcuPanel>

      <AcuPanel
        id="content-replace-test-panel"
        :title="contentReplaceCopy.panels.test.title"
        :description="contentReplaceCopy.panels.test.description"
      >
        <AcuFormRow
          label="Văn bản kiểm thử"
          hint="Nhập một đoạn nội dung AI mô phỏng để kiểm tra prompt và định dạng trả về."
        >
          <AcuTextarea
            :model-value="store.testInput"
            :rows="5"
            placeholder="Nhập nội dung mô phỏng để kiểm tra prompt và định dạng trả về."
            @update:model-value="store.setString('testInput', $event)"
          />
        </AcuFormRow>

        <div class="acu-v2-content-replace-page__actions">
          <AcuButton
            variant="primary"
            :loading="store.busyAction === 'test'"
            @click="store.runTest"
          >
            Chạy thử tối ưu
          </AcuButton>
        </div>

        <pre
          v-if="store.testOutput"
          class="acu-v2-content-replace-page__test-output"
          >{{ store.testOutput }}</pre
        >
      </AcuPanel>
    </AcuPanelGrid>

    <ContentReplacePresetDrawer
      :is-open="presetDrawerOpen"
      :presets="store.promptPresets"
      :message="store.message"
      @close="presetDrawerOpen = false"
      @create-from-default="store.createPresetFromDefault"
      @edit="onEditPreset"
      @rename="onRenamePreset"
      @delete="onDeletePreset"
      @export="store.exportPresetByName($event)"
    />

    <ContentReplacePromptDrawer
      :is-open="promptDrawerOpen"
      :segments="promptSegmentsForView"
      :dirty="store.promptDirty"
      :message="store.message"
      @close="closePromptDrawer"
      @save="onSavePromptGroup"
      @reset="onResetPromptGroup"
      @add="store.addPromptSegment($event)"
      @delete="store.deletePromptSegment($event)"
      @update="onPromptUpdate"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import AcuBadge, {
  type AcuBadgeVariant,
} from "../components/_lib/AcuBadge.vue";
import AcuButton from "../components/_lib/AcuButton.vue";
import AcuCheckbox from "../components/_lib/AcuCheckbox.vue";
import AcuFileButton from "../components/_lib/AcuFileButton.vue";
import AcuFormRow from "../components/_lib/AcuFormRow.vue";
import AcuIconButton from "../components/_lib/AcuIconButton.vue";
import AcuInput from "../components/_lib/AcuInput.vue";
import AcuMessage from "../components/_lib/AcuMessage.vue";
import AcuMobilePanelNav from "../components/_lib/AcuMobilePanelNav.vue";
import AcuPanel from "../components/_lib/AcuPanel.vue";
import AcuPanelGrid from "../components/_lib/AcuPanelGrid.vue";
import AcuPresetDropdown, {
  type PresetDropdownItem,
} from "../components/_lib/AcuPresetDropdown.vue";
import type { PromptSegment } from "../components/_lib/AcuPromptSegments.vue";
import AcuRulePairList from "../components/_lib/AcuRulePairList.vue";
import AcuSelect from "../components/_lib/AcuSelect.vue";
import AcuTextarea from "../components/_lib/AcuTextarea.vue";
import ContentReplacePresetDrawer from "../components/ContentReplacePresetDrawer.vue";
import ContentReplacePromptDrawer from "../components/ContentReplacePromptDrawer.vue";
import { useApiPresetSelectOptions } from "../composables/useApiPresetSelectOptions";
import { useChatChangedTick } from "../composables/useChatChangedListener";
import { useUiCloseGuard } from "../composables/useUiCloseGuard";
import { contentReplaceCopy } from "../copy/content-replace-copy";
import {
  CUSTOM_CONTENT_REPLACE_PRESET_VALUE,
  useContentReplaceStore,
  type ContentReplacePromptSegment,
} from "../stores/content-replace-store";
import { useDialogStore } from "../stores/dialog-store";

const store = useContentReplaceStore();
const dialogStore = useDialogStore();
const {
  apiStore,
  followActiveApiLabel,
  apiPresetSelectOptions: apiOptions,
} = useApiPresetSelectOptions();
const presetDrawerOpen = ref(false);
const promptDrawerOpen = ref(false);
const editingPresetName = ref("");
const panelNavItems = [
  { id: "content-replace-basic-panel", label: contentReplaceCopy.nav.basic },
  { id: "content-replace-mode-panel", label: contentReplaceCopy.nav.mode },
  { id: "content-replace-preset-panel", label: contentReplaceCopy.nav.preset },
  { id: "content-replace-filter-panel", label: contentReplaceCopy.nav.filter },
  { id: "content-replace-test-panel", label: contentReplaceCopy.nav.test },
];

const presetDropdownItems = computed<PresetDropdownItem[]>(() =>
  store.selectedPresetName === CUSTOM_CONTENT_REPLACE_PRESET_VALUE
    ? [
        {
          value: CUSTOM_CONTENT_REPLACE_PRESET_VALUE,
          label: "Prompt tùy chỉnh",
          meta: "Chưa lưu thành preset",
        },
        {
          value: "",
          label: "Preset mặc định",
          meta: `${store.defaultPromptSegmentCount} đoạn prompt`,
        },
        ...store.promptPresets.map((preset) => ({
          value: preset.name,
          label: preset.name,
          meta: `${preset.promptGroup.length} đoạn prompt`,
        })),
      ]
    : [
        {
          value: "",
          label: "Preset mặc định",
          meta: `${store.defaultPromptSegmentCount} đoạn prompt`,
        },
        ...store.promptPresets.map((preset) => ({
          value: preset.name,
          label: preset.name,
          meta: `${preset.promptGroup.length} đoạn prompt`,
        })),
      ],
);

const promptSegmentsForView = computed<PromptSegment[]>(() =>
  store.promptGroup.map((segment) => ({
    role: segment.role,
    content: segment.content,
    deletable: segment.deletable,
    mainSlot: segment.mainSlot,
    isMain: segment.isMain,
    isMain2: segment.isMain2,
  })),
);

const promptGroupMissingContent = computed(
  () =>
    !store.promptGroup.some((segment) =>
      String(segment.content || "").includes("$CONTENT"),
    ),
);
const promptTemplateBadgeLabel = computed(() =>
  store.promptTemplateMode === "default" ? "Dùng prompt mặc định" : "Đã tùy chỉnh prompt",
);
const promptTemplateBadgeVariant = computed<AcuBadgeVariant>(() =>
  store.promptTemplateMode === "default" ? "neutral" : "accent",
);
const canEditCurrentPrompt = computed(() => store.selectedPresetName !== "");

async function onDeletePreset(name: string): Promise<void> {
  if (!name) return;
  const confirmed = await dialogStore.confirm({
    title: "Xóa preset thay thế nội dung",
    message: `Xóa preset thay thế nội dung "${name}"?`,
    confirmLabel: "Xóa preset",
    confirmVariant: "danger",
  });
  if (!confirmed) return;
  store.deletePresetByName(name);
}

async function onRenamePreset(name: string): Promise<void> {
  const next = await dialogStore.prompt({
    title: "Đổi tên preset thay thế nội dung",
    message: `Đổi tên preset thay thế nội dung "${name}" thành:`,
    label: "Tên preset",
    defaultValue: name,
    confirmLabel: "Đổi tên",
  });
  if (!next) return;
  store.renamePreset(name, next);
}

function onEditPreset(name: string): void {
  store.selectPreset(name);
  editingPresetName.value = name;
  presetDrawerOpen.value = false;
  promptDrawerOpen.value = true;
}

function openPromptDrawerForCurrent(): void {
  editingPresetName.value = store.hasSelectedPreset
    ? store.selectedPresetName
    : "";
  promptDrawerOpen.value = true;
}

function closePromptDrawer(): void {
  promptDrawerOpen.value = false;
  editingPresetName.value = "";
}

function onSavePromptGroup(): void {
  if (editingPresetName.value)
    store.savePromptGroupToPreset(editingPresetName.value);
  else store.savePromptGroup();
}

async function onResetPromptGroup(): Promise<void> {
  const confirmed = await dialogStore.confirm({
    title: "Nạp nhóm prompt mặc định",
    message:
      "Nạp nhóm prompt thay thế nội dung mặc định? Việc này sẽ ghi đè nội dung prompt trong trình sửa hiện tại, cần lưu mới có hiệu lực.",
    confirmLabel: "Nạp mặc định",
    confirmVariant: "danger",
  });
  if (!confirmed)
    return;
  store.resetPromptGroup();
}

function onPromptUpdate(index: number, patch: Partial<PromptSegment>): void {
  store.updatePromptSegment(
    index,
    patch as Partial<ContentReplacePromptSegment>,
  );
}

function confirmPromptClose(): boolean | Promise<boolean> {
  if (!promptDrawerOpen.value || !store.promptDirty) return true;
  return dialogStore.confirm({
    title: "Đóng UI mới",
    message: "Bạn có thay đổi prompt thay thế nội dung chưa lưu, chắc chắn đóng UI mới?",
    confirmLabel: "Đóng UI mới",
    confirmVariant: "danger",
  });
}

function refreshAll(): void {
  store.refreshFromSettings();
  apiStore.refreshFromSettings();
}

onMounted(refreshAll);
watch(useChatChangedTick(), refreshAll);
useUiCloseGuard(confirmPromptClose);
</script>

<style scoped>
.acu-v2-content-replace-page {
  min-height: 100%;
  min-width: 0;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.acu-v2-content-replace-page__mini-status span {
  color: var(--acu-text-3);
  font-size: var(--acu-font-size-caption, 11px);
  line-height: 1.5;
}

.acu-v2-content-replace-page__number-grid,
.acu-v2-content-replace-page__form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.acu-v2-content-replace-page__choice-list,
.acu-v2-content-replace-page__rule-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.acu-v2-content-replace-page__mini-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 0;
  border: 0;
  border-top: 1px solid color-mix(in srgb, var(--acu-text-3) 14%, transparent);
  border-bottom: 1px solid
    color-mix(in srgb, var(--acu-text-3) 14%, transparent);
  border-radius: 0;
  background: transparent;
}

.acu-v2-content-replace-page__mini-status strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--acu-text-2);
  font-size: var(--acu-font-size-body, 12px);
  font-family: var(--acu-font-mono);
}

.acu-v2-content-replace-page__status-line {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin: 0 0 10px;
  color: var(--acu-text-3);
  font-size: var(--acu-font-size-body, 12px);
}

.acu-v2-content-replace-page__status-line strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--acu-text-1);
  font-size: var(--acu-font-size-body, 12px);
  font-family: var(--acu-font-mono);
}

.acu-v2-content-replace-page__badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  border-radius: var(--acu-radius-sm);
  background: color-mix(in srgb, var(--acu-text-3) 16%, transparent);
  color: var(--acu-text-2);
  font-size: var(--acu-font-size-caption, 11px);
  font-weight: 500;
}

.acu-v2-content-replace-page__select-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) repeat(3, max-content);
  gap: 6px;
  align-items: stretch;
  min-width: 0;
}

.acu-v2-content-replace-page__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
  padding-top: 12px;
  margin-top: 4px;
}

.acu-v2-content-replace-page__test-output {
  margin: 0;
  max-height: 280px;
  overflow: auto;
  padding: 10px 0;
  border: 0;
  border-top: 1px solid color-mix(in srgb, var(--acu-text-3) 14%, transparent);
  border-bottom: 1px solid
    color-mix(in srgb, var(--acu-text-3) 14%, transparent);
  border-radius: 0;
  background: transparent;
  color: var(--acu-text-2);
  font-family: var(--acu-font-mono);
  font-size: var(--acu-font-size-caption, 11px);
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}

@media (max-width: 860px) {
  .acu-v2-content-replace-page {
    padding: 14px;
  }

  .acu-v2-content-replace-page__number-grid,
  .acu-v2-content-replace-page__form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
