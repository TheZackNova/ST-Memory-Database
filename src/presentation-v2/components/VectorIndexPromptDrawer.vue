<template>
  <AcuDrawer
    :is-open="isOpen"
    title="Sửa prompt tạo từ khóa"
    width="720px"
    :before-close="confirmIfDirty"
    @close="$emit('close')"
  >
    <AcuMessage v-if="message" :kind="message.kind">
      {{ message.text }}
    </AcuMessage>

    <div class="acu-vector-prompt-drawer__toolbar">
      <AcuButton size="sm" @click="$emit('reset')">Nạp prompt mặc định</AcuButton>
    </div>

    <AcuPromptSegments
      :segments="segments"
      :show-slot="false"
      :role-options="roleOptions"
      :rows="8"
      empty-text="Chưa có đoạn prompt từ khóa. Bấm nút bên dưới để thêm đoạn đầu tiên."
      @add="$emit('add', $event)"
      @delete="$emit('delete', $event)"
      @update="(index, patch) => $emit('update', index, patch)"
    />

    <footer class="acu-vector-prompt-drawer__actions">
      <AcuButton @click="requestClose">Đóng</AcuButton>
      <AcuButton variant="primary" :disabled="!dirty" @click="$emit('save')">Lưu prompt</AcuButton>
    </footer>
  </AcuDrawer>
</template>

<script setup lang="ts">
import AcuButton from './_lib/AcuButton.vue';
import AcuDrawer from './_lib/AcuDrawer.vue';
import AcuMessage from './_lib/AcuMessage.vue';
import AcuPromptSegments, { type PromptSegment } from './_lib/AcuPromptSegments.vue';
import type { AcuSelectOption } from './_lib/AcuSelect.vue';
import type { VectorIndexMessage } from '../composables/useVectorIndexConfig';
import { useDialogStore } from '../stores/dialog-store';

const props = defineProps<{
  isOpen: boolean;
  segments: PromptSegment[];
  dirty: boolean;
  message: VectorIndexMessage | null;
  roleOptions: AcuSelectOption[];
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'save'): void;
  (e: 'reset'): void;
  (e: 'add', position: 'top' | 'bottom'): void;
  (e: 'delete', index: number): void;
  (e: 'update', index: number, patch: Partial<PromptSegment>): void;
}>();

const dialogStore = useDialogStore();

async function confirmIfDirty(): Promise<boolean> {
  if (!props.dirty) return true;
  return dialogStore.confirm({
    title: 'Đóng trình sửa prompt',
    message: 'Bạn có thay đổi prompt tạo từ khóa chưa lưu, chắc chắn đóng?',
    confirmLabel: 'Đóng',
    confirmVariant: 'danger',
  });
}

async function requestClose(): Promise<void> {
  if (await confirmIfDirty()) emit('close');
}
</script>

<style scoped>
.acu-vector-prompt-drawer__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.acu-vector-prompt-drawer__actions {
  position: sticky;
  bottom: -16px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 0 0;
  background: var(--acu-bg-1);
}
</style>
