<template>
  <AcuPanel
    :title="formFillCopy.panels.update.title"
    :description="formFillCopy.panels.update.description"
  >
    <div class="acu-form-fill-update-settings-panel__settings-groups">
      <section class="acu-form-fill-update-settings-panel__setting-group">
        <AcuFormRow
          label="Preset API điền bảng"
          hint="Mặc định dùng API hiện tại; sau khi chọn chỉ ảnh hưởng chức năng điền bảng."
        >
          <AcuSelect
            :options="tableApiPresetOptions"
            :model-value="settings.tableApiPreset.value"
            :placeholder="followActiveApiLabel"
            @update:model-value="settings.setTableApiPreset($event)"
          />
        </AcuFormRow>

        <AcuFormRow
          label="Khoảng cách tự động điền bảng"
          hint="Sau khi tích lũy đủ số phản hồi AI có thể cập nhật đã chọn, tự động điền bảng một lần."
        >
          <AcuSelect
            :options="updateEveryOptions"
            :model-value="selectedUpdateEvery"
            :placeholder="selectedUpdateEvery === 'custom' ? 'Tùy chỉnh' : 'Chọn khoảng cập nhật'"
            @update:model-value="applyUpdateEvery"
          />
        </AcuFormRow>

        <AcuFormRow
          :label="skipLatestLayerLabel"
          :hint="skipLatestLayerHint"
        >
          <AcuToggle
            :model-value="skipLatestLayer"
            @update:model-value="setSkipLatestLayer"
          />
        </AcuFormRow>
      </section>

      <AcuDisclosureGroup
        v-if="showAdvanced"
        class="acu-form-fill-update-settings-panel__advanced"
        label="Tham số nâng cao"
        :meta="advancedMetaLabel"
        :expanded="advancedExpanded"
        body-id="acu-form-fill-update-advanced"
        body-mode="if"
        @toggle="advancedExpanded = !advancedExpanded"
      >
        <div class="acu-form-fill-update-settings-panel__number-grid">
          <AcuFormRow
            v-for="field in advancedFields"
            :key="field.key"
            :label="field.label"
            :hint="field.hint"
          >
            <AcuInput
              type="number"
              :min="field.min"
              :step="field.step"
              :model-value="field.value"
              @change="settings.setNumber(field.key, $event)"
            />
          </AcuFormRow>
        </div>
      </AcuDisclosureGroup>
    </div>
  </AcuPanel>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useChatChangedTick } from "../composables/useChatChangedListener";
import { useApiPresetSelectOptions } from "../composables/useApiPresetSelectOptions";
import {
  useFormFillSettings,
  type NumberSettingKey,
} from "../composables/useFormFillSettings";
import { formFillCopy } from "../copy/form-fill-copy";
import AcuDisclosureGroup from "./_lib/AcuDisclosureGroup.vue";
import AcuFormRow from "./_lib/AcuFormRow.vue";
import AcuInput from "./_lib/AcuInput.vue";
import AcuPanel from "./_lib/AcuPanel.vue";
import AcuSelect, { type AcuSelectOption } from "./_lib/AcuSelect.vue";
import AcuToggle from "./_lib/AcuToggle.vue";

type UpdateEveryId = "1" | "3" | "5" | "custom";

withDefaults(
  defineProps<{
    showAdvanced?: boolean;
  }>(),
  {
    showAdvanced: true,
  },
);

const settings = useFormFillSettings();
const {
  apiStore,
  followActiveApiLabel,
  apiPresetSelectOptions: tableApiPresetOptions,
} = useApiPresetSelectOptions();
const advancedExpanded = ref(false);

const updateEveryOptions: AcuSelectOption[] = [
  { value: "1", label: "Mỗi 1 tầng: kịp thời nhất" },
  { value: "3", label: "Mỗi 3 tầng: cân bằng" },
  { value: "5", label: "Mỗi 5 tầng: tần suất thấp, tiết kiệm API" },
];
const advancedKeys = new Set<NumberSettingKey>([
  "autoUpdateThreshold",
  "autoUpdateFrequency",
  "updateBatchSize",
  "skipUpdateFloors",
  "autoUpdateTokenThreshold",
  "tableMaxRetries",
]);

const advancedFields = computed(() =>
  settings.numberFields.value.filter((field) => advancedKeys.has(field.key)),
);
const advancedMetaLabel = computed(() => (isCustomCadence.value || isCustomSkip.value ? "Tùy chỉnh" : "Mặc định"));
const selectedUpdateEvery = computed<UpdateEveryId>(() => {
  for (const id of ["1", "3", "5"] as const) {
    const interval = Number(id);
    if (
      numberValue("autoUpdateThreshold") ===
        contextDepthForInterval(interval) &&
      numberValue("autoUpdateFrequency") === interval &&
      numberValue("updateBatchSize") === batchSizeForInterval(interval)
    ) {
      return id;
    }
  }
  return "custom";
});

const isCustomCadence = computed(() => selectedUpdateEvery.value === "custom");
const isCustomSkip = computed(() => numberValue("skipUpdateFloors") > 1);
const skipLatestLayer = computed(() => numberValue("skipUpdateFloors") >= 1);
const skipLatestLayerLabel = computed(() =>
  isCustomSkip.value ? "Không điền bảng tầng mới nhất: tùy chỉnh" : "Không điền bảng tầng mới nhất",
);
const skipLatestLayerHint = computed(() => {
  const skip = numberValue("skipUpdateFloors");
  if (skip > 1) {
    return `Tham số nâng cao hiện đặt bỏ qua ${skip} tầng mới nhất; tắt sẽ đổi thành không bỏ qua, bật sẽ đổi thành chỉ bỏ qua tầng mới nhất.`;
  }
  return "Khi bật, phản hồi AI mới nhất chưa được ghi vào bảng, đợi tầng kế tiếp xuất hiện mới xử lý; nên bật nếu thường phải reroll tầng mới nhất.";
});

function numberValue(
  key:
    | "autoUpdateThreshold"
    | "autoUpdateFrequency"
    | "updateBatchSize"
    | "skipUpdateFloors",
): number {
  return (
    settings.numberFields.value.find((field) => field.key === key)?.value ?? 0
  );
}

function contextDepthForInterval(interval: number): number {
  return interval <= 3 ? 3 : interval;
}

function batchSizeForInterval(interval: number): number {
  return interval === 1 ? 3 : interval;
}

function applyUpdateEvery(value: string): void {
  const interval = Number(value);
  if (!Number.isFinite(interval) || interval < 1) return;
  settings.setNumbers({
    autoUpdateThreshold: contextDepthForInterval(interval),
    autoUpdateFrequency: interval,
    updateBatchSize: batchSizeForInterval(interval),
  });
}

function setSkipLatestLayer(value: boolean): void {
  settings.setNumber("skipUpdateFloors", value ? 1 : 0);
}

function refreshAll(): void {
  settings.refresh();
  apiStore.refreshFromSettings();
}

onMounted(refreshAll);
watch(useChatChangedTick(), refreshAll);
</script>

<style scoped>
.acu-form-fill-update-settings-panel__settings-groups {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.acu-form-fill-update-settings-panel__setting-group {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.acu-form-fill-update-settings-panel__setting-group
  + .acu-form-fill-update-settings-panel__setting-group {
  padding-top: 14px;
  border-top: 1px solid var(--acu-border-2);
}

.acu-form-fill-update-settings-panel__advanced {
  border: 0;
  background: transparent;
}

.acu-form-fill-update-settings-panel__number-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

@media (max-width: 560px) {
  .acu-form-fill-update-settings-panel__number-grid {
    grid-template-columns: 1fr;
  }
}
</style>
