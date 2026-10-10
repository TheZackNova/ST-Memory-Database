<template>
  <div v-if="task" class="acu-v2-plot-task-editor">
    <fieldset class="acu-v2-plot-task-editor__section">
      <legend>Trường cơ bản</legend>
      <div class="acu-v2-plot-task-editor__grid">
        <AcuFormRow label="Tên tác vụ">
          <AcuInput
            type="text"
            :model-value="task.name"
            placeholder="Ví dụ: tác vụ truy hồi ký ức"
            @change="patch({ name: String($event) })"
          />
        </AcuFormRow>
        <AcuFormRow label="Số giai đoạn" hint="Cùng giai đoạn chạy song song, khác giai đoạn chạy tuần tự">
          <AcuInput
            type="number"
            :min="1"
            :step="1"
            :model-value="task.stage"
            @change="patch({ stage: Math.max(1, Math.round(Number($event))) })"
          />
        </AcuFormRow>
        <AcuFormRow label="Số lần thử lại tối đa">
          <AcuInput
            type="number"
            :min="1"
            :step="1"
            :model-value="task.maxRetries"
            @change="
              patch({ maxRetries: Math.max(1, Math.round(Number($event))) })
            "
          />
        </AcuFormRow>
        <AcuFormRow label="Bật tác vụ">
          <AcuToggle
            :model-value="task.enabled"
            :label="task.enabled ? 'Đã bật' : 'Đã tắt'"
            @update:model-value="patch({ enabled: $event })"
          />
        </AcuFormRow>
      </div>
      <div class="acu-v2-plot-task-editor__grid">
        <AcuFormRow
          label="Trích theo thẻ"
          hint="Ví dụ recall,supplement, chỉ áp dụng cho tác vụ này"
        >
          <AcuInput
            type="text"
            :model-value="task.extractTags"
            @change="patch({ extractTags: String($event) })"
          />
        </AcuFormRow>
        <AcuFormRow label="Thẻ ghi khi trích xuất" hint="Ưu tiên cao hơn trích theo thẻ; để trống thì không thêm">
          <AcuInput
            type="text"
            :model-value="task.extractInjectTags"
            @change="patch({ extractInjectTags: String($event) })"
          />
        </AcuFormRow>
        <AcuFormRow label="Độ dài phản hồi tối thiểu" hint="Ngắn hơn mức này sẽ tự thử lại">
          <AcuInput
            type="number"
            :min="0"
            :step="10"
            :model-value="task.minLength"
            @change="
              patch({ minLength: Math.max(0, Math.round(Number($event))) })
            "
          />
        </AcuFormRow>
      </div>
    </fieldset>

    <fieldset class="acu-v2-plot-task-editor__section">
      <legend>Điều khiển tác vụ Agent</legend>
      <p class="acu-v2-plot-task-editor__hint">
        Mô tả và điều kiện kích hoạt là căn cứ để chế độ agent quyết định tác vụ có chạy không, có nối chuỗi không và thứ tự trước sau. Khi để trống hết và chưa bật điều khiển Agent, vẫn chạy theo trạng thái bật, số giai đoạn và thứ tự ban đầu.
      </p>
      <div class="acu-v2-plot-task-editor__grid acu-v2-plot-task-editor__grid--wide">
        <AcuFormRow
          label="Mô tả tác vụ"
          hint="Mô tả tác vụ đẩy này phụ trách việc gì. Để trống thì không tham gia phán đoán của Agent Skill."
        >
          <AcuTextarea
            :model-value="task.description"
            :rows="2"
            :max-rows="6"
            auto-resize
            placeholder="Ví dụ: chọn từ ký ức dài hạn những sự kiện liên quan nhất tới cốt truyện hiện tại."
            @update:model-value="patch({ description: $event })"
          />
        </AcuFormRow>
        <AcuFormRow
          label="Điều kiện kích hoạt"
          hint="Mô tả khi nào nên chạy tác vụ này. Để trống thì giữ logic ban đầu."
        >
          <AcuTextarea
            :model-value="task.triggerWhen"
            :rows="2"
            :max-rows="6"
            auto-resize
            placeholder="Ví dụ: kích hoạt khi đầu vào người dùng nhắc tới sự kiện cũ, lời hứa, thay đổi quan hệ nhân vật hoặc mạch truyện chưa giải quyết."
            @update:model-value="patch({ triggerWhen: $event })"
          />
        </AcuFormRow>
      </div>

      <div class="acu-v2-plot-task-editor__toggles">
        <AcuToggle
          :model-value="task.agentControl.enabled"
          :label="task.agentControl.enabled ? 'Agent có thể điều khiển tác vụ này' : 'Agent không điều khiển tác vụ này'"
          @update:model-value="patchAgentControl({ enabled: $event })"
        />
        <AcuToggle
          :model-value="task.agentControl.selectable"
          label="Cho phép Agent chọn/bỏ qua"
          @update:model-value="patchAgentControl({ selectable: $event })"
        />
        <AcuToggle
          :model-value="task.agentControl.defaultSelected"
          label="Mặc định chọn khi Agent không quyết định"
          @update:model-value="patchAgentControl({ defaultSelected: $event })"
        />
        <AcuToggle
          :model-value="task.agentControl.allowSequential"
          label="Cho phép nối chuỗi"
          @update:model-value="patchAgentControl({ allowSequential: $event })"
        />
        <AcuToggle
          :model-value="task.agentControl.allowParallel"
          label="Cho phép chạy song song"
          @update:model-value="patchAgentControl({ allowParallel: $event })"
        />
      </div>

      <div class="acu-v2-plot-task-editor__grid">
        <AcuFormRow label="Giai đoạn ưu tiên" hint="Tham chiếu sắp xếp của Agent; để trống thì không chỉ định.">
          <AcuInput
            type="number"
            :min="1"
            :step="1"
            :model-value="task.agentControl.preferredStage ?? ''"
            @change="patchAgentControl({ preferredStage: parseOptionalPositiveInteger($event) })"
          />
        </AcuFormRow>
        <AcuFormRow label="Thứ tự ưu tiên" hint="Tham chiếu sắp xếp trong giai đoạn; để trống thì không chỉ định.">
          <AcuInput
            type="number"
            :min="0"
            :step="1"
            :model-value="task.agentControl.preferredOrder ?? ''"
            @change="patchAgentControl({ preferredOrder: parseOptionalNonNegativeInteger($event) })"
          />
        </AcuFormRow>
      </div>

      <div class="acu-v2-plot-task-editor__grid acu-v2-plot-task-editor__grid--wide">
        <AcuFormRow
          label="ID tác vụ phụ thuộc"
          hint="Phân cách bằng dấu phẩy. Agent khi sắp xếp nên chạy các tác vụ này trước; phụ thuộc không hợp lệ hoặc vòng sẽ được kiểm tra lúc chạy."
        >
          <AcuInput
            type="text"
            :model-value="formatTaskIdList(task.agentControl.dependsOnTaskIds)"
            placeholder="Ví dụ: recallTask, summaryTask"
            @change="patchAgentControl({ dependsOnTaskIds: parseTaskIdList($event) })"
          />
        </AcuFormRow>
        <AcuFormRow
          label="ID tác vụ chặn"
          hint="Phân cách bằng dấu phẩy. Dùng để báo Agent biết tác vụ này không nên chạy cùng với những tác vụ nào."
        >
          <AcuInput
            type="text"
            :model-value="formatTaskIdList(task.agentControl.blocksTaskIds)"
            placeholder="Ví dụ: legacyRecallTask"
            @change="patchAgentControl({ blocksTaskIds: parseTaskIdList($event) })"
          />
        </AcuFormRow>
      </div>
    </fieldset>

    <fieldset class="acu-v2-plot-task-editor__section">
      <legend>API dùng cho tác vụ hiện tại</legend>
      <AcuFormRow
        label="Preset API"
        hint="Chọn riêng preset API cho tác vụ hiện tại, mặc định kế thừa trang đẩy cốt truyện. Ưu tiên: tác vụ > trang đẩy cốt truyện > API đang dùng. Lưu toàn cục, không ghi vào preset."
      >
        <AcuSelect
          :options="taskApiSelectOptions"
          :model-value="taskApiOverride"
          placeholder="Kế thừa preset API đẩy cốt truyện"
          @update:model-value="$emit('task-api-override', $event)"
        />
      </AcuFormRow>
    </fieldset>

    <fieldset class="acu-v2-plot-task-editor__section">
      <legend>Đoạn prompt (promptGroup)</legend>
      <PlotPromptSegments
        :segments="task.promptGroup"
        @add="$emit('segment-add', $event)"
        @delete="$emit('segment-delete', $event)"
        @move="(index, delta) => $emit('segment-move', index, delta)"
        @update="(index, patch) => $emit('segment-update', index, patch)"
      />
    </fieldset>
  </div>
  <div v-else class="acu-v2-plot-task-editor__empty">
    Hãy chọn một tác vụ ở trên để chỉnh sửa.
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type {
  PlotTaskAgentControlDraft,
  PlotPromptSegment,
  PlotTaskDraft,
} from "../composables/usePlotTaskEditing";
import AcuFormRow from "./_lib/AcuFormRow.vue";
import AcuInput from "./_lib/AcuInput.vue";
import type { AcuSelectOption } from "./_lib/AcuSelect.vue";
import AcuSelect from "./_lib/AcuSelect.vue";
import AcuTextarea from "./_lib/AcuTextarea.vue";
import AcuToggle from "./_lib/AcuToggle.vue";
import PlotPromptSegments from "./PlotPromptSegments.vue";

const props = defineProps<{
  task: PlotTaskDraft | null;
  apiPresetOptions: Array<{ name: string }>;
  taskApiOverride: string;
}>();

const emit = defineEmits<{
  (e: "patch", patch: Partial<PlotTaskDraft>): void;
  (e: "task-api-override", value: string): void;
  (e: "segment-add", position: "top" | "bottom"): void;
  (e: "segment-delete", index: number): void;
  (e: "segment-move", index: number, delta: -1 | 1): void;
  (e: "segment-update", index: number, patch: Partial<PlotPromptSegment>): void;
}>();

const taskApiSelectOptions = computed<AcuSelectOption[]>(() => [
  { value: "", label: "Kế thừa preset API đẩy cốt truyện" },
  ...props.apiPresetOptions.map((o) => ({ value: o.name, label: o.name })),
]);

function patch(value: Partial<PlotTaskDraft>): void {
  emit("patch", value);
}

function patchAgentControl(patchValue: Partial<PlotTaskAgentControlDraft>): void {
  if (!props.task) return;
  patch({
    agentControl: {
      ...props.task.agentControl,
      ...patchValue,
    },
  });
}

function parseTaskIdList(value: unknown): string[] {
  return String(value ?? "")
    .split(/[，,\n]/g)
    .map(item => item.trim())
    .filter((item, index, array) => item && array.indexOf(item) === index);
}

function formatTaskIdList(value: string[] | undefined): string {
  return Array.isArray(value) ? value.join(", ") : "";
}

function parseOptionalPositiveInteger(value: unknown): number | undefined {
  if (value === "" || value === null || value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  const normalized = Math.trunc(n);
  return normalized > 0 ? normalized : undefined;
}

function parseOptionalNonNegativeInteger(value: unknown): number | undefined {
  if (value === "" || value === null || value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  const normalized = Math.trunc(n);
  return normalized >= 0 ? normalized : undefined;
}
</script>

<style scoped>
.acu-v2-plot-task-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.acu-v2-plot-task-editor__section {
  margin: 0;
  padding: 0 0 14px;
  border: 0;
  border-bottom: 1px solid
    color-mix(in srgb, var(--acu-text-3) 16%, transparent);
  border-radius: 0;
  background: transparent;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
.acu-v2-plot-task-editor__section:last-of-type {
  padding-bottom: 0;
  border-bottom: 0;
}
.acu-v2-plot-task-editor__section legend {
  padding: 0;
  font-size: var(--acu-font-size-section-title, 12px);
  font-weight: 600;
  color: var(--acu-text-2);
}

.acu-v2-plot-task-editor__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}

.acu-v2-plot-task-editor__grid--wide {
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
}

.acu-v2-plot-task-editor__toggles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(180px, 100%), 1fr));
  gap: 8px 12px;
  padding: 8px 0;
  min-width: 0;
}

.acu-v2-plot-task-editor__toggles :deep(.acu-toggle) {
  align-items: flex-start;
  width: 100%;
  min-width: 0;
  min-height: var(--acu-control-height-sm, 26px);
}

.acu-v2-plot-task-editor__toggles :deep(.acu-toggle__label) {
  min-width: 0;
  white-space: normal;
  line-height: var(--acu-line-height-body, 1.45);
  overflow-wrap: anywhere;
}

.acu-v2-plot-task-editor__hint {
  margin: 0;
  font-size: var(--acu-font-size-caption, 11px);
  color: var(--acu-text-3);
  line-height: var(--acu-line-height-caption, 1.5);
}

.acu-v2-plot-task-editor__empty {
  padding: 18px 0;
  border: 0;
  border-top: 1px solid color-mix(in srgb, var(--acu-text-3) 14%, transparent);
  border-bottom: 1px solid
    color-mix(in srgb, var(--acu-text-3) 14%, transparent);
  border-radius: 0;
  background: transparent;
  text-align: center;
  color: var(--acu-text-3);
  font-size: var(--acu-font-size-body, 12px);
}
</style>
