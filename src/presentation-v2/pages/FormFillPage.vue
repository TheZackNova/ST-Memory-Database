<template>
  <section class="acu-v2-form-fill-page">
    <AcuMobilePanelNav :items="panelNavItems" />

    <!-- 运行状态与自动更新 -->
    <AcuPanelGrid class="acu-v2-form-fill-page__grid">
      <AcuPanel
        id="form-fill-status-panel"
        :title="formFillCopy.panels.status.title"
        :description="formFillCopy.panels.status.description"
      >
        <AcuText
          variant="status-line"
          class="acu-v2-form-fill-page__status-line"
          aria-label="Tổng quan trạng thái bảng"
        >
          Cuộc trò chuyện hiện tại:
          <strong
            class="acu-text__value acu-v2-form-fill-page__status-chat"
            :title="dashboard.chatFileIdentifier.value || 'Chưa khởi tạo'"
          >
            {{ dashboard.chatFileIdentifier.value || "Chưa khởi tạo" }}
          </strong>
          · Số tầng phản hồi AI tích lũy:
          <strong class="acu-text__value">{{
            dashboard.aiMessageCount.value
          }}</strong>
          · full checkpoint hiện tại:
          <strong class="acu-text__value acu-v2-form-fill-page__checkpoint-label">
            {{ manualUpdate.checkpointFloorsLabel.value }}
          </strong>
        </AcuText>

        <AcuMessage kind="info">
          Theo cài đặt điền bảng thủ công hiện tại, phạm vi dự kiến xử lý: {{ manualUpdate.manualRefillRangeLabel.value }}.
        </AcuMessage>

        <AcuMessage v-if="!dashboard.hasTables.value" kind="info">
          Hiện chưa tải bảng CSDL.
        </AcuMessage>

        <div class="acu-v2-form-fill-page__table-wrap">
          <table class="acu-v2-form-fill-page__status-table">
            <thead>
              <tr>
                <th>Bảng</th>
                <th>Tần suất</th>
                <th>Chưa ghi nhận</th>
                <th>Cập nhật lần trước</th>
                <th>Kích hoạt lần sau</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!dashboard.tableRows.value.length">
                <td colspan="5" class="acu-v2-form-fill-page__empty">
                  Chưa có dữ liệu
                </td>
              </tr>
              <tr
                v-for="row in dashboard.tableRows.value"
                :key="row.key"
                :class="{
                  'acu-v2-form-fill-page__status-row--ready': row.ready,
                }"
              >
                <td>{{ row.name }}</td>
                <td>{{ row.frequencyLabel }}</td>
                <td>{{ row.unrecordedLabel }}</td>
                <td>{{ row.lastUpdatedLabel }}</td>
                <td>
                  <AcuBadge v-if="row.ready" variant="success">Sẵn sàng</AcuBadge>
                  <span v-else>{{ row.nextTriggerLabel }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </AcuPanel>

      <FormFillUpdateSettingsPanel id="form-fill-update-panel" />
    </AcuPanelGrid>

    <!-- 手动填表与模板 -->
    <AcuPanelGrid class="acu-v2-form-fill-page__grid">
      <AcuPanel
        id="form-fill-manual-panel"
        class="acu-v2-form-fill-page__panel--manual"
        :title="formFillCopy.panels.manual.title"
        :description="formFillCopy.panels.manual.description"
      >
        <div class="acu-v2-form-fill-page__number-grid">
          <AcuFormRow
            label="Xử lý thủ công N tầng gần nhất"
            hint="Lấy N tầng gần nhất từ các phản hồi AI khả dụng để điền bảng thủ công."
          >
            <AcuInput
              type="number"
              :min="0"
              :step="1"
              :model-value="manualUpdate.manualContextDepth.value"
              @change="manualUpdate.setManualContextDepth($event)"
            />
          </AcuFormRow>

          <AcuFormRow
            label="Gộp mỗi N tầng thành một lần điền bảng"
            hint="Số tầng phản hồi AI được nén thành một yêu cầu điền bảng."
          >
            <AcuInput
              type="number"
              :min="1"
              :step="1"
              :model-value="manualUpdate.manualBatchSize.value"
              @change="manualUpdate.setManualBatchSize($event)"
            />
          </AcuFormRow>
        </div>

        <AcuMessage kind="info">
          full checkpoint hiện tại: {{ manualUpdate.checkpointFloorsLabel.value }}; theo cài đặt hiện tại, phạm vi dự kiến xử lý: {{ manualUpdate.manualRefillRangeLabel.value }}.
          Bảng đã chọn: {{ manualUpdate.selectedSheetSummary.value }}.
        </AcuMessage>

        <TableSelector
          :sheet-keys="manualUpdate.sheetKeys.value"
          :selected-keys="manualUpdate.selectedManualTableKeys.value"
          :sheet-names="manualUpdate.sheetNames.value"
          :disabled="!manualUpdate.runtimeReady.value"
          empty-text="Hiện không có bảng nào có thể điền thủ công."
          @update:selected-keys="manualUpdate.setManualSelectedKeys($event)"
          @select-all="manualUpdate.selectAllManualTables"
          @select-none="manualUpdate.selectNoManualTables"
        />

        <AcuFormRow
          class="acu-v2-form-fill-page__manual-extra"
          label="Yêu cầu bổ sung cho lần điền bảng này"
          hint="Để trống thì không thêm yêu cầu bổ sung cho lần điền bảng thủ công này."
        >
          <AcuTextarea
            :model-value="manualUpdate.manualExtraHint.value"
            :rows="4"
            placeholder="Chỉ dùng cho lần điền bảng thủ công này..."
            @update:model-value="manualUpdate.manualExtraHint.value = $event"
          />
        </AcuFormRow>

        <AcuMessage v-if="manualUpdate.vectorIndexWarning.value" kind="warning">
          Khi chỉ mục kỷ yếu chế độ giao hỏa đang bật, không nên cập nhật bảng thủ công; trong tình huống đặc biệt vẫn có thể bấm thực thi.
        </AcuMessage>
        <AcuMessage kind="info">
          {{ formFillCopy.panels.manual.catchUpBoundary }}
        </AcuMessage>

        <div class="acu-v2-form-fill-page__actions">
          <AcuButton
            variant="secondary"
            :disabled="
              manualUpdate.manualUpdateBusy.value ||
              manualUpdate.catchUpBusy.value ||
              !manualUpdate.selectedManualTableKeys.value.length
            "
            @click="manualUpdate.runManualCatchUp"
          >
            {{
              manualUpdate.catchUpBusy.value
                ? formFillCopy.panels.manual.catchUpBusyLabel
                : formFillCopy.panels.manual.catchUpLabel
            }}
          </AcuButton>
          <AcuButton
            variant="primary"
            :disabled="
              manualUpdate.manualUpdateBusy.value ||
              manualUpdate.catchUpBusy.value ||
              !manualUpdate.selectedManualTableKeys.value.length
            "
            @click="manualUpdate.runManualUpdate"
          >
            {{
              manualUpdate.manualUpdateBusy.value
                ? "Đang điền bảng..."
                : manualUpdate.vectorIndexWarning.value
                  ? "Chỉ mục giao hỏa đã bật"
                  : formFillCopy.panels.manual.runLabel
            }}
          </AcuButton>
        </div>
      </AcuPanel>

      <TableTemplatePresetPanel id="form-fill-template-panel" />
    </AcuPanelGrid>

    <!-- 填表规则 -->
    <AcuPanelGrid class="acu-v2-form-fill-page__grid">
      <div class="acu-v2-form-fill-page__col">
        <AcuPanel
          id="form-fill-prompt-panel"
          :title="formFillCopy.panels.prompt.title"
          :description="formFillCopy.panels.prompt.description"
        >
          <template #actions>
            <AcuBadge :variant="promptTemplateBadgeVariant">{{
              promptTemplateBadgeLabel
            }}</AcuBadge>
          </template>

          <AcuMessage
            v-if="!promptSlotSummary.hasA || !promptSlotSummary.hasB"
            kind="warning"
          >
            Prompt điền bảng thiếu slot chính cần thiết, nên nạp prompt mặc định trong trình sửa rồi lưu.
          </AcuMessage>

          <div class="acu-v2-form-fill-page__actions">
            <AcuButton variant="primary" @click="promptDrawerOpen = true">
              Sửa prompt
            </AcuButton>
          </div>
        </AcuPanel>

        <AcuPanel
          id="form-fill-filter-panel"
          :title="formFillCopy.panels.filter.title"
          :description="formFillCopy.panels.filter.description"
        >
          <div class="acu-v2-form-fill-page__filter">
            <AcuFormRow
              label="Loại bỏ câu SQL vượt quyền thuần túy"
              hint="Mặc định bật. Chỉ loại bỏ SQL độc lập có thể chứng minh chỉ ảnh hưởng bảng không phải mục tiêu; câu lệnh liên bảng đích hoặc không xác định được thuộc về đâu vẫn bị từ chối và thử lại."
            >
              <AcuToggle
                :model-value="settings.discardUnauthorizedTableEditsEnabled.value"
                aria-label="Loại bỏ câu SQL vượt quyền thuần túy"
                data-acu-setting-key="discardUnauthorizedTableEditsEnabled"
                @update:model-value="settings.setDiscardUnauthorizedTableEditsEnabled($event)"
              />
            </AcuFormRow>

            <AcuFormRow
              label="Chỉ nhận diện cặp thẻ &lt;tableEdit&gt; cuối cùng"
              hint="Mặc định bật, dùng để bỏ qua các chỉ dẫn cũ trong chuỗi suy nghĩ hoặc bản nháp phía trước."
            >
              <AcuToggle
                :model-value="settings.tableEditLastPairOnly.value"
                aria-label="Chỉ nhận diện cặp thẻ tableEdit cuối cùng"
                data-acu-setting-key="tableEditLastPairOnly"
                @update:model-value="settings.setTableEditLastPairOnly($event)"
              />
            </AcuFormRow>

            <AcuRulePairList
              label="Quy tắc trích xuất"
              :model-value="settings.extractRules.value"
              start-placeholder="Biên bắt đầu trích xuất"
              end-placeholder="Biên kết thúc trích xuất"
              add-label="Thêm quy tắc trích xuất"
              @update:model-value="settings.setExtractRules($event)"
            />

            <AcuRulePairList
              label="Quy tắc loại trừ"
              :model-value="settings.excludeRules.value"
              start-placeholder="Biên bắt đầu loại trừ"
              end-placeholder="Biên kết thúc loại trừ"
              add-label="Thêm quy tắc loại trừ"
              @update:model-value="settings.setExcludeRules($event)"
            />
          </div>
        </AcuPanel>
      </div>

      <div class="acu-v2-form-fill-page__col">
        <AcuPanel
          id="form-fill-injection-target-panel"
          :title="tableCopy.panels.injectionTarget.title"
          :description="tableCopy.panels.injectionTarget.description"
        >
          <DanglingReferenceBanner scope="worldbook" />
          <WorldbookSelector
            :model-value="injectionTarget.selectorValue.value"
            :names="injectionWb.names.value"
            :char-primary="injectionWb.charPrimary.value"
            :status="injectionWb.status.value"
            :error="injectionWb.error.value"
            show-character-option
            character-option-label="Sổ thế giới gắn với thẻ nhân vật"
            filterable
            @update:model-value="onInjectionTargetChange($event)"
          />
          <p class="acu-v2-form-fill-page__hint">
            Hiện đã chọn: <strong>{{ injectionTargetLabel }}</strong>
          </p>
        </AcuPanel>

        <AcuPanel
          id="form-fill-entries-panel"
          :title="tableCopy.panels.entries.title"
          :description="tableCopy.panels.entries.description"
        >
          <WorldbookEntryPickerBody
            :source="entriesSource.source.value"
            :selected-names="entriesSource.manualSelection.value"
            :names="entriesWb.names.value"
            :selector-status="entriesWb.status.value"
            :selector-error="entriesWb.error.value"
            :current-label="entriesSourceLabel"
            v-model:filter="entryFilter"
            :groups="entries.groups.value"
            :loading="entries.status.value === 'loading'"
            :empty-text="entryEmptyText"
            @update:source="onEntriesSourceChange($event)"
            @toggle-book="onEntriesManualBookToggle"
            @select-all="entries.selectAll()"
            @deselect-all="entries.deselectAll()"
            @toggle="(bookName: string, uid: number, checked: boolean) => entries.toggleEntry(bookName, uid, checked)"
            @toggle-group="entries.toggleGroupExpanded($event)"
          />
        </AcuPanel>
      </div>
    </AcuPanelGrid>

    <FormFillPromptDrawer
      :is-open="promptDrawerOpen"
      :segments="settings.promptSegments.value"
      :dirty="settings.promptDirty.value"
      :message="promptMessage"
      @close="promptDrawerOpen = false"
      @save="settings.savePrompt"
      @reset="settings.resetPrompt"
      @import-file="settings.importPromptFile($event)"
      @export="settings.exportPrompt"
      @add="settings.addPromptSegment($event)"
      @delete="settings.deletePromptSegment($event)"
      @update="updatePromptSegment"
    />
  </section>
</template>


<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import AcuBadge, { type AcuBadgeVariant } from "../components/_lib/AcuBadge.vue";
import AcuButton from "../components/_lib/AcuButton.vue";
import AcuFormRow from "../components/_lib/AcuFormRow.vue";
import AcuInput from "../components/_lib/AcuInput.vue";
import AcuMessage from "../components/_lib/AcuMessage.vue";
import AcuMobilePanelNav from "../components/_lib/AcuMobilePanelNav.vue";
import AcuPanel from "../components/_lib/AcuPanel.vue";
import AcuPanelGrid from "../components/_lib/AcuPanelGrid.vue";
import AcuRulePairList from "../components/_lib/AcuRulePairList.vue";
import AcuText from "../components/_lib/AcuText.vue";
import AcuTextarea from "../components/_lib/AcuTextarea.vue";
import AcuToggle from "../components/_lib/AcuToggle.vue";
import DanglingReferenceBanner from "../components/DanglingReferenceBanner.vue";
import FormFillPromptDrawer from "../components/FormFillPromptDrawer.vue";
import FormFillUpdateSettingsPanel from "../components/FormFillUpdateSettingsPanel.vue";
import TableSelector from "../components/TableSelector.vue";
import TableTemplatePresetPanel from "../components/TableTemplatePresetPanel.vue";
import WorldbookEntryPickerBody from "../components/WorldbookEntryPickerBody.vue";
import WorldbookSelector from "../components/WorldbookSelector.vue";
import { useChatChangedTick } from "../composables/useChatChangedListener";
import { useDashboardPage } from "../composables/useDashboardPage";
import { useFormFillInjectionTarget } from "../composables/useFormFillInjectionTarget";
import {
  useFormFillSettings,
  type FormFillPromptSegment,
} from "../composables/useFormFillSettings";
import { useFormFillWorldbookConfig } from "../composables/useFormFillWorldbookConfig";
import { useFormFillWorldbookEntries } from "../composables/useFormFillWorldbookEntries";
import { useManualUpdate } from "../composables/useManualUpdate";
import { useTemplateRuntimeChangeTick } from "../composables/useTemplateRuntimeChangeListener";
import { useUiCloseGuard } from "../composables/useUiCloseGuard";
import { useWorldbookSelector } from "../composables/useWorldbookSelector";
import { formFillCopy } from "../copy/form-fill-copy";
import { tableCopy } from "../copy/table-copy";
import { useDialogStore } from "../stores/dialog-store";

type WorldbookSource = "character" | "manual";

const dashboard = useDashboardPage();
const manualUpdate = useManualUpdate();
const dialogStore = useDialogStore();
const settings = useFormFillSettings();
const injectionTarget = useFormFillInjectionTarget();
const entriesSource = useFormFillWorldbookConfig();
const entries = useFormFillWorldbookEntries();
const injectionWb = useWorldbookSelector();
const entriesWb = useWorldbookSelector();
const entryFilter = ref("");
const injectionTargetLabel = ref("");
const entriesSourceLabel = ref("");
const entryEmptyText = ref(tableCopy.worldbook.emptyDefault);
const promptDrawerOpen = ref(false);

const panelNavItems = [
  { id: "form-fill-status-panel", label: formFillCopy.nav.status },
  { id: "form-fill-update-panel", label: formFillCopy.nav.update },
  { id: "form-fill-manual-panel", label: formFillCopy.nav.manual },
  { id: "form-fill-template-panel", label: tableCopy.panels.templatePreset.title },
  { id: "form-fill-prompt-panel", label: formFillCopy.nav.prompt },
  { id: "form-fill-filter-panel", label: formFillCopy.nav.filter },
  { id: "form-fill-injection-target-panel", label: tableCopy.panels.injectionTarget.title },
  { id: "form-fill-entries-panel", label: tableCopy.panels.entries.title },
];

const promptSlotSummary = computed(() => ({
  hasA: settings.promptSegments.value.some(
    (segment) => segment.mainSlot === "A" || segment.isMain === true,
  ),
  hasB: settings.promptSegments.value.some(
    (segment) => segment.mainSlot === "B" || segment.isMain2 === true,
  ),
}));
const promptTemplateBadgeLabel = computed(() =>
  settings.promptTemplateMode.value === "default"
    ? "Dùng prompt mặc định"
    : "Đã tùy chỉnh prompt",
);
const promptTemplateBadgeVariant = computed<AcuBadgeVariant>(() =>
  settings.promptTemplateMode.value === "default" ? "neutral" : "accent",
);
const promptMessage = computed(() =>
  settings.message.value?.scope === "prompt" ? settings.message.value : null,
);

async function refreshInjectionLabel(): Promise<void> {
  injectionTargetLabel.value = await injectionTarget.describeTarget();
}

function confirmPromptClose(): boolean | Promise<boolean> {
  if (!promptDrawerOpen.value || !settings.promptDirty.value) return true;
  return dialogStore.confirm({
    title: "Đóng UI mới",
    message: "Bạn có thay đổi prompt điền bảng chưa lưu, chắc chắn đóng UI mới?",
    confirmLabel: "Đóng UI mới",
    confirmVariant: "danger",
  });
}

function updatePromptSegment(
  index: number,
  patch: Partial<FormFillPromptSegment>,
): void {
  settings.updatePromptSegment(index, patch);
}

async function refreshEntriesGroups(): Promise<void> {
  const names = await entriesSource.resolveBookNames();
  entryEmptyText.value = resolveEntryEmptyText(names);
  await entries.loadEntries(names);
  if (entriesSource.source.value === "character") {
    const charPrimary = entriesWb.charPrimary.value;
    entriesSourceLabel.value = charPrimary
      ? `Tất cả sổ thế giới của thẻ nhân vật · sổ chính ${charPrimary}`
      : "Tất cả sổ thế giới của thẻ nhân vật";
  } else {
    const manualNames = entriesSource.manualSelection.value;
    entriesSourceLabel.value = manualNames.length ? manualNames.join(", ") : "(Chưa chọn)";
  }
}

function resolveEntryEmptyText(names: string[]): string {
  if (entriesSource.source.value === "character" && names.length === 0) {
    return tableCopy.worldbook.emptyCharacter;
  }
  if (entriesSource.source.value === "manual" && entriesSource.manualSelection.value.length === 0) {
    return tableCopy.worldbook.emptyManual;
  }
  return tableCopy.worldbook.emptyDefault;
}

function onEntriesSourceChange(value: WorldbookSource): void {
  entriesSource.setSource(value);
  void refreshEntriesGroups();
}

function onEntriesManualBookToggle(name: string, checked: boolean): void {
  entriesSource.toggleManualBook(name, checked);
  void refreshEntriesGroups();
}

async function onInjectionTargetChange(value: string): Promise<void> {
  await injectionTarget.onSelectorChange(value);
  await refreshInjectionLabel();
}

async function refreshAll(): Promise<void> {
  manualUpdate.refresh();
  settings.refresh();
  injectionTarget.refreshFromSettings();
  entriesSource.refreshFromSettings();
  await dashboard.refresh();
  await Promise.all([injectionWb.refresh(), entriesWb.refresh()]);
  await Promise.all([refreshInjectionLabel(), refreshEntriesGroups()]);
}

onMounted(() => {
  void refreshAll();
});
watch(useChatChangedTick(), () => {
  void refreshAll();
});
watch(useTemplateRuntimeChangeTick(), () => {
  void refreshAll();
});
useUiCloseGuard(confirmPromptClose);
</script>

<style scoped>
.acu-v2-form-fill-page {
  min-height: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--acu-page-gap, 14px);
}

.acu-v2-form-fill-page__col {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--acu-panel-grid-gap, 16px);
}

.acu-v2-form-fill-page__number-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.acu-v2-form-fill-page__filter {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.acu-v2-form-fill-page__status-line {
  margin: 0 0 10px;
  font-size: var(--acu-font-size-body, 12px);
  line-height: var(--acu-line-height-body, 1.45);
}

.acu-v2-form-fill-page__status-chat {
  max-width: min(42ch, 100%);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.acu-v2-form-fill-page__checkpoint-label {
  color: var(--acu-accent);
}

.acu-v2-form-fill-page__table-wrap {
  min-width: 0;
  overflow: auto;
  border: 0;
  border-radius: var(--acu-radius-sm);
  background: var(--acu-bg-0);
}

.acu-v2-form-fill-page__status-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 560px;
  font-size: var(--acu-font-size-body, 12px);
}

.acu-v2-form-fill-page__status-table th,
.acu-v2-form-fill-page__status-table td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--acu-border-2);
  text-align: left;
}

.acu-v2-form-fill-page__status-table th {
  color: var(--acu-text-3);
  font-weight: 600;
  background: var(--acu-bg-1);
}

.acu-v2-form-fill-page__status-table td {
  color: var(--acu-text-2);
}

.acu-v2-form-fill-page__status-table tr:last-child td {
  border-bottom: 0;
}

.acu-v2-form-fill-page__status-row--ready td {
  color: var(--acu-text-1);
}

.acu-v2-form-fill-page__empty {
  text-align: center !important;
  color: var(--acu-text-3) !important;
}

.acu-v2-form-fill-page__hint {
  margin: 0;
  font-size: var(--acu-font-size-body, 12px);
  color: var(--acu-text-3);
}

.acu-v2-form-fill-page__hint strong {
  color: var(--acu-text-1);
  font-weight: 500;
}

.acu-v2-form-fill-page__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 12px;
  margin-top: 4px;
}

@media (max-width: 860px) {
  .acu-v2-form-fill-page__number-grid {
    grid-template-columns: 1fr;
  }
}
</style>
