<template>
  <div class="acu-viz-table-management" data-acu-visualizer-table-management>
    <AcuPanel
      title="Quản lý bảng"
      description="Dùng để chỉnh thứ tự, thêm và xóa bảng trong cả bộ CSDL. Thay đổi chỉ vào bản nháp của trình chỉnh sửa, trước khi lưu sẽ không ghi lại vào cuộc trò chuyện hiện tại hay mẫu toàn cục; nếu lỡ xóa bảng, có thể hủy đóng hoặc tải lại trước khi lưu."
    >
      <template #actions>
        <AcuBadge variant="neutral">{{ sheetItems.length }} bảng</AcuBadge>
      </template>

      <div class="acu-viz-table-management__list">
        <article
          v-for="(item, index) in sheetItems"
          :key="item.key"
          class="acu-viz-table-management__item"
        >
          <div class="acu-viz-table-management__copy">
            <h3>
              <span>{{ item.name }}</span>
            </h3>
            <p>{{ item.rowCount }} hàng · {{ item.columnCount }} cột</p>
          </div>
          <div class="acu-viz-table-management__actions">
            <AcuIconButton
              icon="fa-solid fa-chevron-up"
              size="sm"
              title="Dời bảng lên"
              aria-label="Dời bảng lên"
              :disabled="index === 0"
              @click="$emit('move-sheet', item.key, 'up')"
            />
            <AcuIconButton
              icon="fa-solid fa-chevron-down"
              size="sm"
              title="Dời bảng xuống"
              aria-label="Dời bảng xuống"
              :disabled="index === sheetItems.length - 1"
              @click="$emit('move-sheet', item.key, 'down')"
            />
            <AcuIconButton
              icon="fa-solid fa-trash"
              size="sm"
              variant="danger"
              title="Xóa bảng"
              aria-label="Xóa bảng"
              @click="$emit('request-delete-sheet', item.key)"
            />
          </div>
        </article>

        <p v-if="sheetItems.length === 0" class="acu-viz-table-management__empty">
          CSDL hiện chưa có bảng nào. Có thể thêm bảng trước, rồi vào bảng để sửa dữ liệu, cấu trúc và trợ lý AI.
        </p>
      </div>

      <div class="acu-viz-table-management__operation">
        <AcuButton size="sm" variant="primary" @click="$emit('request-add-sheet')">
          <i class="fa-solid fa-plus"></i>
          Thêm bảng
        </AcuButton>
      </div>
    </AcuPanel>
  </div>
</template>

<script setup lang="ts">
import AcuBadge from '../../components/_lib/AcuBadge.vue';
import AcuButton from '../../components/_lib/AcuButton.vue';
import AcuIconButton from '../../components/_lib/AcuIconButton.vue';
import AcuPanel from '../../components/_lib/AcuPanel.vue';
import type { VisualizerSheetItem } from '../../stores/visualizer-store';

defineProps<{
  sheetItems: VisualizerSheetItem[];
}>();

defineEmits<{
  (e: 'move-sheet', key: string, direction: 'up' | 'down'): void;
  (e: 'request-add-sheet'): void;
  (e: 'request-delete-sheet', key: string): void;
}>();
</script>

<style scoped>
.acu-viz-table-management {
  min-width: 0;
  display: grid;
  gap: 12px;
}

.acu-viz-table-management__list {
  min-width: 0;
  display: grid;
  gap: 8px;
}

.acu-viz-table-management__item {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--acu-border);
  border-radius: var(--acu-radius-sm);
  background: var(--acu-bg-0);
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.acu-viz-table-management__copy {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.acu-viz-table-management__copy h3 {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: var(--acu-text-1);
  font-size: var(--acu-font-size-body-lg, 13px);
  line-height: 1.35;
}

.acu-viz-table-management__copy h3 > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.acu-viz-table-management__copy p,
.acu-viz-table-management__empty {
  margin: 0;
  color: var(--acu-text-2);
  font-size: var(--acu-font-size-body, 12px);
  line-height: 1.55;
}

.acu-viz-table-management__actions,
.acu-viz-table-management__operation {
  display: flex;
  align-items: center;
  gap: 6px;
}

.acu-viz-table-management__operation {
  justify-content: flex-end;
  padding-top: 2px;
}

@media (max-width: 767px) {
  .acu-viz-table-management__item {
    grid-template-columns: minmax(0, 1fr);
    align-items: stretch;
  }

  .acu-viz-table-management__actions {
    justify-content: flex-end;
  }

  .acu-viz-table-management__operation :deep(.acu-btn) {
    width: 100%;
  }
}
</style>
