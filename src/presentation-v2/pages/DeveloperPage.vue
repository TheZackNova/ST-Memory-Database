<template>
  <section class="acu-v2-developer-page">
    <AcuPanelGrid class="acu-v2-developer-page__grid">
      <AcuPanel
        :title="developerCopy.panels.gatedFields.title"
        :description="developerCopy.panels.gatedFields.description"
      >
        <div class="acu-v2-developer-page__toggle-list">
          <ToggleRow
            v-for="item in toggles"
            :key="item.key"
            :item="item"
            @change="handleToggleChange(item.key, $event)"
          />
        </div>
      </AcuPanel>

      <AcuPanel
        title="Tùy chọn nâng cao điền bảng"
        description="Chỉ bật khi cần ràng buộc nghiêm ngặt phản hồi điền bảng của mô hình. Khi bật sẽ chuyển sang prompt cô lập và luồng phân tích JSON nghiêm ngặt."
      >
        <div class="acu-v2-developer-page__toggle-list">
          <ToggleRow
            :item="strictJsonTableFillToggle"
            @change="settings.setStrictJsonTableFillEnabled($event)"
          />
        </div>
      </AcuPanel>

      <AcuPanel
        :title="developerCopy.panels.formFillRuntime.title"
        :description="developerCopy.panels.formFillRuntime.description"
      >
        <AcuFormRow
          label="Số nhóm cập nhật đồng thời tối đa"
          hint="Khi lớn hơn 1, nhiều nhóm bảng có thể gọi API điền bảng cùng lúc. Giá trị càng lớn càng nhanh, nhưng áp lực API và độ khó điều tra khi thất bại cũng cao hơn."
        >
          <AcuInput
            type="number"
            :min="1"
            :step="1"
            :model-value="maxConcurrentGroups"
            @change="settings.setNumber('maxConcurrentGroups', $event)"
          />
        </AcuFormRow>
      </AcuPanel>
    </AcuPanelGrid>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AcuFormRow from "../components/_lib/AcuFormRow.vue";
import AcuInput from "../components/_lib/AcuInput.vue";
import AcuPanel from "../components/_lib/AcuPanel.vue";
import AcuPanelGrid from "../components/_lib/AcuPanelGrid.vue";
import ToggleRow from "../components/DashboardToggleRow.vue";
import { useDevOptions } from "../composables/useDevOptions";
import { useFormFillSettings } from "../composables/useFormFillSettings";
import { developerCopy } from "../copy/developer-copy";

const devOptions = useDevOptions();
const settings = useFormFillSettings();

interface DeveloperFieldItem {
  key: string;
  label: string;
  description: string;
  value: boolean;
}

const toggles = computed<DeveloperFieldItem[]>(() => [
  {
    key: "plotAdvanced",
    label: "Đẩy cốt truyện",
    description: 'Hiển thị trường "Khớp và thay thế" trong ngăn kéo bên khi sửa preset đẩy cốt truyện.',
    value: devOptions.plotAdvanced.value,
  },
  {
    key: "legacyUiMenuVisible",
    label: "Lối vào UI cũ",
    description: "Hiển thị lối vào UI cũ trong menu tiện ích mở rộng của SillyTavern. Mặc định ẩn; có thể bật tạm khi UI mới gặp sự cố.",
    value: devOptions.legacyUiMenuVisible.value,
  },
]);
const strictJsonTableFillToggle = computed<DeveloperFieldItem>(() => ({
  key: "strictJsonTableFillEnabled",
  label: "Phản hồi điền bảng JSON nghiêm ngặt",
  description: "Mặc định tắt. Khi bật, bảng gốc xuất thao tác có cấu trúc, SQLite xuất script SQL được bọc trong JSON.",
  value: settings.strictJsonTableFillEnabled.value,
}));
const maxConcurrentGroups = computed(
  () =>
    settings.numberFields.value.find(
      (field) => field.key === "maxConcurrentGroups",
    )?.value ?? 1,
);

function handleToggleChange(key: string, value: boolean): void {
  if (key === "plotAdvanced") {
    devOptions.setPlotAdvanced(value);
  }
  if (key === "legacyUiMenuVisible") {
    devOptions.setLegacyUiMenuVisible(value);
  }
}
</script>

<style scoped>
.acu-v2-developer-page {
  min-height: 100%;
  min-width: 0;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.acu-v2-developer-page__toggle-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

@media (max-width: 860px) {
  .acu-v2-developer-page {
    padding: 14px;
  }
}
</style>
