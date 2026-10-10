<template>
  <AcuDrawer
    :is-open="isOpen"
    :title="title"
    width="640px"
    @close="$emit('close')"
  >
    <AcuMessage v-if="message" :kind="message.kind">{{ message.text }}</AcuMessage>

    <div class="acu-v2-table-drawer__top-actions">
      <AcuButton variant="primary" :disabled="busy" @click="$emit('create-blank')">
        <i class="fa-solid fa-plus"></i> Tạo mới từ mặc định
      </AcuButton>
    </div>

    <ul v-if="presetMeta.length" class="acu-v2-manage-list">
      <li v-for="meta in presetMeta" :key="meta.name" class="acu-v2-manage-item">
        <div class="acu-v2-manage-item__info">
          <AcuText as="span" variant="list-title" class="acu-v2-manage-item__name">{{ meta.label ?? meta.name }}</AcuText>
          <AcuText as="span" variant="caption" class="acu-v2-manage-item__meta">
            <template v-if="meta.kind === 'runtime'">{{ meta.meta ?? 'Đang có hiệu lực (bộ nhớ)' }}</template>
            <template v-else-if="meta.name === defaultPresetName">Mặc định toàn cục</template>
            <template v-else>Preset toàn cục</template>
          </AcuText>
        </div>
        <div class="acu-v2-manage-item__actions">
          <template v-if="meta.kind === 'runtime'">
            <!-- 只读 runtime 项：仅导出，不渲染 star/rename/edit/delete -->
            <AcuIconButton icon="fa-solid fa-upload" title="Xuất mẫu đang có hiệu lực" :disabled="busy" @click="$emit('export', meta.name)" />
          </template>
          <template v-else>
            <AcuIconButton
              :icon="meta.name === defaultPresetName ? 'fa-solid fa-star' : 'fa-regular fa-star'"
              title="Đặt làm mặc định toàn cục"
              :variant="meta.name === defaultPresetName ? 'accent' : 'default'"
              :disabled="busy"
              @click="$emit('set-default', meta.name)"
            />
            <AcuIconButton icon="fa-solid fa-upload" title="Xuất JSON" :disabled="busy" @click="$emit('export', meta.name)" />
            <AcuIconButton icon="fa-solid fa-i-cursor" title="Đổi tên" :disabled="busy" @click="$emit('rename', meta.name)" />
            <AcuIconButton icon="fa-solid fa-pen" title="Sửa (mở trình chỉnh sửa bảng trực quan)" :disabled="busy" @click="$emit('edit', meta.name)" />
            <AcuIconButton icon="fa-solid fa-trash-can" variant="danger" title="Xóa" :disabled="busy" @click="$emit('delete', meta.name)" />
          </template>
        </div>
      </li>
    </ul>
    <AcuText v-else variant="empty" class="acu-v2-table-drawer__empty">Chưa có preset toàn cục. Bấm "Tạo mới từ mặc định" ở trên, hoặc dùng nút nhập bên phải danh sách thả của bảng để tạo.</AcuText>

    <AcuText variant="hint" class="acu-v2-table-drawer__hint">
      Gợi ý: nội dung thực tế, tiêu đề cột và tham số cấp bảng của mẫu bảng vẫn được sửa trong «Trình chỉnh sửa bảng trực quan». Bấm "Sửa" trên hàng sẽ chuyển cuộc trò chuyện hiện tại sang preset này rồi mở trình chỉnh sửa.
    </AcuText>
  </AcuDrawer>
</template>

<script setup lang="ts">
import AcuDrawer from './_lib/AcuDrawer.vue';
import AcuButton from './_lib/AcuButton.vue';
import AcuIconButton from './_lib/AcuIconButton.vue';
import AcuMessage from './_lib/AcuMessage.vue';
import AcuText from './_lib/AcuText.vue';

defineProps<{
  isOpen: boolean;
  title: string;
  busy: boolean;
  message: { kind: 'success' | 'error' | 'info' | 'warning'; text: string } | null;
  presetMeta: Array<{ name: string; kind?: 'preset' | 'runtime'; label?: string; meta?: string; readOnly?: boolean }>;
  defaultPresetName: string;
}>();

defineEmits<{
  (e: 'close'): void;
  (e: 'create-blank'): void;
  (e: 'set-default', name: string): void;
  (e: 'export', name: string): void;
  (e: 'rename', name: string): void;
  (e: 'edit', name: string): void;
  (e: 'delete', name: string): void;
}>();
</script>

<style scoped>
.acu-v2-table-drawer__top-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.acu-v2-manage-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.acu-v2-manage-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--acu-text-3) 14%, transparent);
  border-radius: 0;
  background: transparent;
}

.acu-v2-manage-item:last-child {
  border-bottom: 0;
}

.acu-v2-manage-item__info {
  flex: 1;
  min-width: 0;
}

.acu-v2-manage-item__name {
  display: block;
  font-size: var(--acu-font-size-list-title, 13px);
  line-height: var(--acu-line-height-body, 1.45);
  font-weight: 500;
  color: var(--acu-text-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.acu-v2-manage-item__meta {
  display: block;
  margin-top: 2px;
  font-size: var(--acu-font-size-caption, 11px);
  line-height: var(--acu-line-height-caption, 1.5);
  color: var(--acu-text-3);
}

.acu-v2-manage-item__actions {
  display: flex;
  gap: 4px;
}

.acu-v2-table-drawer__empty {
  margin: 12px 0;
}

</style>
