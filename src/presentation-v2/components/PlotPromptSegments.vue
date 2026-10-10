<template>
  <AcuPromptSegments
    :segments="segments"
    :show-slot="true"
    :allow-move="true"
    :rows="6"
    empty-text="Tác vụ hiện tại chưa có đoạn prompt. Bấm nút bên dưới để thêm đoạn đầu tiên."
    @add="$emit('add', $event)"
    @delete="$emit('delete', $event)"
    @move="(index, delta) => $emit('move', index, delta)"
    @update="(i, p) => $emit('update', i, p)"
  />
</template>

<script setup lang="ts">
import AcuPromptSegments from './_lib/AcuPromptSegments.vue';
import type { PromptSegment } from './_lib/AcuPromptSegments.vue';

export type { PromptSegment as PlotPromptSegment };

defineProps<{
  segments: PromptSegment[];
}>();

defineEmits<{
  (e: 'add', position: 'top' | 'bottom'): void;
  (e: 'delete', index: number): void;
  (e: 'move', index: number, delta: -1 | 1): void;
  (e: 'update', index: number, patch: Partial<PromptSegment>): void;
}>();
</script>
