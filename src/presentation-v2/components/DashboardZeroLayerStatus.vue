<template>
  <div class="acu-dashboard-zero-layer" data-acu-zero-layer-status aria-live="polite">
    <div class="acu-dashboard-zero-layer__head">
      <strong>Chế độ thẻ Tầng 0 · cuộc trò chuyện hiện tại</strong>
      <AcuBadge :variant="badgeVariant">{{ status.view.value.label }}</AcuBadge>
    </div>
    <p>{{ intentLabel }}</p>
    <p>{{ status.view.value.detail }}</p>
    <p v-if="status.view.value.revision !== null">
      Phiên bản lưu {{ status.view.value.revision }} · head logic hiện tại: {{ status.view.value.headTurnId ?? 'Chưa có lượt nào được phát hành' }}
    </p>
    <AcuSelect v-model="preset" :options="presetOptions" size="sm" placeholder="Chọn preset API độc lập cho nội dung"
      :disabled="locked || status.view.value.intent === true" />
    <AcuToggle :model-value="status.view.value.intent === true" label="Bật Tầng 0 cho cuộc trò chuyện này"
      :disabled="!!enableBlockedReason" :title="enableBlockedReason || undefined"
      @update:model-value="value => status.setEnabled(value, preset)" />
    <p v-if="status.view.value.intent === false">{{ activationHint }}</p>
    <label for="acu-zero-layer-wi-rounds">Số lượt hội thoại Tầng 0 gần nhất tham gia quét Sổ thế giới (toàn cục, 0 là tắt)</label>
    <AcuInput id="acu-zero-layer-wi-rounds" v-model="worldInfoRounds" type="number" size="sm"
      :min="0" :max="100" :step="1" @change="commitWorldInfoRounds" />
    <p>Một lượt là một phản hồi AI, các đầu vào người dùng xen giữa cũng được quét; đầu vào của lượt này luôn được quét. Chỉ dùng để kích hoạt mục Sổ thế giới, không vào prompt, có hiệu lực từ lượt sau.</p>
    <div class="acu-dashboard-zero-layer__actions">
      <AcuButton size="sm" :disabled="locked" @click="refresh">Làm mới trạng thái (chỉ đọc)</AcuButton>
      <AcuButton size="sm" :disabled="locked" @click="status.recover()">Đọc lại và khôi phục giai đoạn đã lưu</AcuButton>
      <AcuButton size="sm" @click="status.stop()">Dừng tác vụ Tầng 0</AcuButton>
      <AcuButton size="sm" :disabled="locked || !status.controls.value.canExit" @click="status.exit()">Xác nhận thoát về chế độ thường</AcuButton>
    </div>
    <template v-if="status.controls.value.pendingTurn">
      <p>Lượt chưa đóng {{ status.controls.value.pendingTurn.turnId }} · {{ pendingPhaseLabel }}: nội dung chưa được lưu. Bỏ qua chỉ ghi là hủy và giữ lại bản ghi, không yêu cầu lại mô hình; lượt viết tiếp nên khôi phục từ bảng Viết tiếp.</p>
      <AcuButton size="sm" :disabled="locked" @click="status.abandon()">Xác nhận bỏ lượt chưa lưu (không gửi lại)</AcuButton>
    </template>
    <p v-if="status.actionError.value" class="acu-dashboard-zero-layer__error" role="alert">{{ status.actionError.value }}</p>
    <label for="acu-zero-layer-input">Đầu vào lượt này</label>
    <AcuInput id="acu-zero-layer-input" v-model="input" placeholder="Nhập hành động trong game; giữ bản nháp khi thất bại hoặc dừng" :disabled="status.working.value" />
    <AcuButton size="sm" :disabled="!!sendBlockedReason" :title="sendBlockedReason || undefined"
      :aria-describedby="sendBlockedReason ? 'acu-zero-layer-send-hint' : undefined" @click="send">Gửi lượt logic</AcuButton>
    <p v-if="sendBlockedReason" id="acu-zero-layer-send-hint">{{ sendBlockedReason }}</p>
    <details v-if="status.controls.value.branches.length">
      <summary>Nhánh và lịch sử chỉ đọc</summary>
      <div class="acu-dashboard-zero-layer__tools">
        <AcuSelect v-model="branch" :options="status.controls.value.branches" size="sm" :disabled="locked" />
        <AcuButton size="sm" :disabled="locked || !status.controls.value.canSend" @click="status.selectBranch(branch)">Chuyển sang nhánh đã chọn</AcuButton>
        <AcuSelect v-model="head" :options="status.controls.value.heads" size="sm" placeholder="Điểm tách nhánh" :disabled="locked" />
        <AcuInput v-model="newBranch" placeholder="Tên nhánh mới (không ghi đè nhánh có sẵn)" :disabled="locked" />
        <AcuButton size="sm" :disabled="locked || !status.controls.value.canSend || !newBranch.trim()"
          @click="status.forkBranch(newBranch.trim(), head)">Tách nhánh từ điểm đã chọn</AcuButton>
        <AcuToggle v-model="diagnostic" label="Chẩn đoán host: gồm cả lượt chưa phát hành" :disabled="locked || status.historyLoading.value" />
        <AcuButton size="sm" :disabled="locked || status.historyLoading.value || !branch"
          @click="status.loadHistory(branch, diagnostic)">Đọc lịch sử nhánh đã chọn</AcuButton>
        <p v-if="status.historyError.value" role="alert">{{ status.historyError.value }}</p>
        <AcuButton v-if="status.historyHasMore.value" size="sm" :disabled="locked || status.historyLoading.value"
          @click="status.loadHistory(branch, diagnostic, true)">Đọc các lượt cũ hơn</AcuButton>
        <details v-for="turn in status.history.value" :key="turn.turnId">
          <summary>{{ turn.turnId }}{{ turn.diagnostic ? ` · ${turn.diagnostic.phase}` : '' }}</summary>
          <p>{{ turn.input }}</p>
          <pre>{{ turn.body }}</pre>
        </details>
      </div>
    </details>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import AcuBadge from './_lib/AcuBadge.vue';
import AcuButton from './_lib/AcuButton.vue';
import AcuToggle from './_lib/AcuToggle.vue';
import AcuSelect from './_lib/AcuSelect.vue';
import AcuInput from './_lib/AcuInput.vue';
import { useApiPresetStore } from '../stores/api-preset-store';
import { useZeroLayerStatus } from '../composables/useZeroLayerStatus';

const status = useZeroLayerStatus();
const presets = useApiPresetStore();
const preset = ref('');
const input = ref('');
const branch = ref('');
const head = ref('');
const newBranch = ref('');
const diagnostic = ref(false);
const worldInfoRounds = ref<string | number>(status.worldInfoScanRounds.value);
watch(() => status.worldInfoScanRounds.value, value => { worldInfoRounds.value = value; });
function commitWorldInfoRounds(value: string | number) {
  // 非法输入不保存，输入框回到当前生效值。
  if (!status.setWorldInfoScanRounds(value)) worldInfoRounds.value = status.worldInfoScanRounds.value;
}
const locked = computed(() => status.working.value || status.view.value.status === 'loading');
const presetOptions = computed(() => presets.presets.filter(item => item.apiMode === 'custom'
  && !item.apiConfig.useMainApi && !item.apiConfig.sendViaTavern && item.apiConfig.url && item.apiConfig.model)
  .map(item => ({ value: item.name, label: item.name })));
const enableBlockedReason = computed(() => {
  if (status.working.value) return 'Thao tác Tầng 0 đang chạy, hãy chờ hoàn tất hoặc dừng tác vụ.';
  if (status.view.value.status === 'loading') return 'Đang đọc trạng thái cuộc trò chuyện hiện tại.';
  if (status.view.value.intent === null) return status.view.value.detail;
  if (!status.view.value.intent && !presetOptions.value.some(item => item.value === preset.value)) {
    return 'Hãy chọn preset API độc lập cho nội dung khả dụng trước.';
  }
  return '';
});
const activationHint = computed(() => !presetOptions.value.length
  ? 'Hãy cấu hình preset kết nối trực tiếp (endpoint và mô hình) ở trang API, rồi chọn preset và bật “Bật Tầng 0 cho cuộc trò chuyện này”.'
  : 'Chọn preset API độc lập cho nội dung, bật “Bật Tầng 0 cho cuộc trò chuyện này”, rồi nhập hành động và gửi lượt logic.');
const sendBlockedReason = computed(() => {
  if (status.working.value) return 'Thao tác Tầng 0 đang chạy, hãy chờ hoàn tất hoặc dừng tác vụ.';
  if (status.view.value.status === 'loading') return 'Đang đọc trạng thái cuộc trò chuyện hiện tại.';
  if (status.view.value.intent === null) return status.view.value.detail;
  if (!status.controls.value.canSend) return status.view.value.status === 'disabled'
    ? 'Cuộc trò chuyện này chưa bật Tầng 0, hãy bật công tắc phía trên trước; bản nháp được giữ lại.'
    : status.view.value.detail;
  if (!input.value.trim()) return 'Vui lòng nhập hành động của lượt này.';
  return '';
});
watch(() => status.controls.value, value => {
  presets.refreshFromSettings();
  preset.value = value.apiPresetName || preset.value;
  branch.value = value.branchId;
  if (!value.heads.some(item => item.value === head.value)) head.value = '';
});
async function refresh() { presets.refreshFromSettings(); await status.refresh(); }
async function send() {
  if (sendBlockedReason.value) return;
  const draft = input.value;
  if (await status.submit(draft) && input.value === draft) input.value = '';
}
const pendingPhaseLabel = computed(() => ({ prepared: 'Chuẩn bị chưa xong', dispatching: 'Gửi bị gián đoạn',
  'delivery-unknown': 'Kết quả gửi không rõ' })[status.controls.value.pendingTurn?.phase ?? 'prepared']);
const intentLabel = computed(() => status.view.value.intent === null ? 'Ý định bật cấp cuộc trò chuyện: chưa xác nhận'
  : status.view.value.intent ? 'Ý định bật cấp cuộc trò chuyện: đã bật' : 'Ý định bật cấp cuộc trò chuyện: tắt');
const badgeVariant = computed(() => status.view.value.status === 'storage-read-failed' ? 'danger'
  : status.view.value.status === 'recovery-required' ? 'warning' : 'neutral');
</script>

<style scoped>
.acu-dashboard-zero-layer {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  min-width: 0;
}
.acu-dashboard-zero-layer__head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.acu-dashboard-zero-layer strong {
  font-size: var(--acu-font-size-body-lg, 13px);
  font-weight: 500;
}
.acu-dashboard-zero-layer p {
  margin: 0;
  color: var(--acu-text-3);
  font-size: var(--acu-font-size-caption, 11px);
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.acu-dashboard-zero-layer p.acu-dashboard-zero-layer__error { color: var(--acu-danger); font-size: var(--acu-font-size-body, 12px); }
.acu-dashboard-zero-layer__actions { display: flex; flex-wrap: wrap; gap: 6px; }
.acu-dashboard-zero-layer__tools { display: flex; flex-direction: column; gap: 8px; padding-top: 8px; }
.acu-dashboard-zero-layer > .acu-select,
.acu-dashboard-zero-layer > .acu-input-shell,
.acu-dashboard-zero-layer > details { width: 100%; }
.acu-dashboard-zero-layer summary { cursor: pointer; overflow-wrap: anywhere; }
.acu-dashboard-zero-layer pre { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; }
</style>
