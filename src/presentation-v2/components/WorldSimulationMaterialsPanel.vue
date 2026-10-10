<template>
  <div class="acu-v2-ws-materials">
    <div class="acu-v2-ws-materials__tabs">
      <button
        v-for="tab in TABS"
        :key="tab.id"
        type="button"
        class="acu-v2-ws-materials__tab"
        :class="{ 'acu-v2-ws-materials__tab--active': activeTab === tab.id }"
        @click="activeTab = tab.id"
      >{{ tab.label }}</button>
      <div class="acu-v2-ws-materials__tab-actions">
        <AcuButton :loading="busy" @click="emit('refresh')">Làm mới</AcuButton>
        <AcuButton variant="danger" :loading="busy" @click="clearPending = true">Xóa sạch một chạm</AcuButton>
      </div>
    </div>

    <p v-if="clearPending" class="acu-v2-ws-materials__confirm">
      Xóa sạch sẽ xóa tác vụ Mô phỏng thế giới hiện tại, sổ cái thế giới, bản ghi phiên của Agent chính và snapshot tài liệu trên các tầng (trạng thái sổ cái, ứng viên và trạng thái khôi phục khi chạy).
      Các tầng nội dung tiểu thuyết và các đoạn 〈与此同时〉 đã ghi vào nội dung không bị ảnh hưởng; sau khi xóa, lần hoàn tất nội dung hoặc gửi chỉ dẫn tiếp theo sẽ mô phỏng lại từ sổ cái trống.
      <span class="acu-v2-ws-materials__confirm-actions">
        <AcuButton variant="danger" :loading="busy" @click="confirmClear">Xác nhận xóa sạch</AcuButton>
        <AcuButton @click="clearPending = false">Hủy</AcuButton>
      </span>
    </p>

    <!-- 世界状态：锚点与时钟概览 + 分模块卡片，与 ContinuationMaterialsPanel 同一套视觉结构 -->
    <template v-if="activeTab === 'state'">
      <div class="acu-v2-ws-materials__overview">
        <div><strong>Điểm neo đóng băng</strong><span>{{ anchorText }}</span></div>
        <div><strong>Sửa đổi sổ cái</strong><span>{{ ledger ? `revision ${ledger.revision}` : 'Chưa thiết lập' }}</span></div>
        <div><strong>Thời gian truyện</strong><span>{{ ledger?.clock.storyTime || 'Không rõ' }}<template v-if="ledger"> · ngày {{ ledger.clock.day }}</template><template v-if="ledger?.clock.slot"> · {{ ledger.clock.slot }}</template></span></div>
      </div>
      <p v-if="materials.snapshot" class="acu-v2-ws-materials__meta">
        Tài liệu được gộp từ baseline gần nhất; sau khi xóa tầng, delta của tầng đó cũng được hoàn lại theo.
        Tầng baseline {{ materials.checkpointIndex ?? 'Không' }} · đã gộp {{ materials.foldedDeltaCount ?? 0 }} delta · revision {{ materials.snapshot.ledgerRevision }} · {{ materials.snapshot.evidenceRefs.length }} tham chiếu chứng cứ.
      </p>
      <p v-else class="acu-v2-ws-materials__meta">Hiện không có baseline cũng không có delta theo tầng. Sau lần nộp đầu tiên, delta của sổ cái sẽ được ghi vào tầng assistant đã đóng băng.</p>

      <p v-if="!ledger || !ledgerGroups.some(group => group.items.length)" class="acu-v2-ws-materials__empty">Sổ cái vẫn trống. Sau khi gửi một chỉ dẫn hoặc chờ nội dung tạo xong, lượt đầu sẽ lập thang thế cục, phục tuyến và danh sách nhân vật.</p>
      <p v-if="archivedNote" class="acu-v2-ws-materials__meta">{{ archivedNote }}</p>
      <details v-for="group in ledgerGroups" :key="group.key" class="acu-v2-ws-materials__block" open>
        <summary>{{ group.label }} · {{ group.items.length }} mục</summary>
        <p v-if="!group.items.length" class="acu-v2-ws-materials__empty">Chưa có bản ghi.</p>
        <div v-else class="acu-v2-ws-materials__cards">
          <article v-for="item in group.items" :key="item.id" class="acu-v2-ws-materials__card">
            <p class="acu-v2-ws-materials__card-head"><strong>{{ item.title }}</strong><span v-if="item.badge" class="acu-v2-ws-materials__badge">{{ item.badge }}</span></p>
            <p class="acu-v2-ws-materials__card-body">{{ item.detail }}</p>
            <p v-if="item.meta" class="acu-v2-ws-materials__card-meta">{{ item.meta }}</p>
            <details v-if="item.timeline?.length" class="acu-v2-ws-materials__timeline">
              <summary>Dòng thời gian trải nghiệm · {{ item.timeline.length }} mục</summary>
              <ol class="acu-v2-ws-materials__list">
                <li v-for="(line, lineIndex) in item.timeline" :key="lineIndex">{{ line }}</li>
              </ol>
            </details>
          </article>
        </div>
      </details>

      <!-- 逐栏记录：按模块/ID 展示分栏视图；partial 只在这里可见，字段值不在这里展示 -->
      <details class="acu-v2-ws-materials__block">
        <summary>Bản ghi theo cột · {{ fieldRecordTotal }} mục</summary>
        <p class="acu-v2-ws-materials__meta">
          Bản ghi theo cột đến từ việc Agent phụ ghi từng cột: mục «Một phần» chưa ghi đủ cột bắt buộc, không gộp vào sổ cái đầy đủ ở trên; mục «Mục sổ cái cũ» đến từ sổ cái nguyên mục cũ, nguồn không thể tách theo cột.
          Ở đây chỉ liệt kê tên cột và định danh sửa đổi; giá trị trường xem trong mục đầy đủ của từng mô-đun phía trên.
        </p>
        <p v-if="!fieldRecordGroups.length" class="acu-v2-ws-materials__empty">Chưa có bản ghi ghi theo cột.</p>
        <details v-for="group in fieldRecordGroups" :key="group.module" class="acu-v2-ws-materials__block">
          <summary>{{ group.label }} · {{ group.records.length }} mục</summary>
          <div class="acu-v2-ws-materials__cards">
            <article v-for="record in group.records" :key="record.id" class="acu-v2-ws-materials__card">
              <p class="acu-v2-ws-materials__card-head">
                <strong>{{ record.id }}</strong>
                <span class="acu-v2-ws-materials__badge">{{ FIELD_STATUS_LABELS[record.status] ?? record.status }}</span>
              </p>
              <p class="acu-v2-ws-materials__card-meta">Trường đã ghi: {{ record.fieldNames.join(', ') || '(không có)' }}</p>
              <p v-if="record.missingFields.length" class="acu-v2-ws-materials__card-meta">Thiếu cột: {{ record.missingFields.join(', ') }}</p>
              <p class="acu-v2-ws-materials__card-meta">
                Cập nhật gần nhất {{ formatTimestamp(record.updatedAt) }}<template v-if="record.maxRevision > 0"> · số sửa đổi cột cao nhất {{ record.maxRevision }}</template>
              </p>
            </article>
          </div>
        </details>
        <template v-if="ledger?.pendingFixes.length">
          <p class="acu-v2-ws-materials__meta">Lần ghi cần sửa ({{ ledger.pendingFixes.length }} mục):</p>
          <div class="acu-v2-ws-materials__cards">
            <article
              v-for="(fix, fixIndex) in ledger.pendingFixes"
              :key="`${fix.module}-${fix.candidateId}-${fixIndex}`"
              class="acu-v2-ws-materials__card acu-v2-ws-materials__card--failed"
            >
              <p class="acu-v2-ws-materials__card-head">
                <strong>{{ LEDGER_MODULE_LABELS[fix.module] ?? fix.module }} · {{ fix.candidateId }}</strong>
                <span class="acu-v2-ws-materials__badge">{{ fix.completion === 'partial' ? 'Chấp nhận một phần' : 'Thất bại' }}</span>
              </p>
              <p class="acu-v2-ws-materials__card-meta">
                Đường dẫn lỗi: {{ fix.violations.map(item => `${item.path} (${item.message})`).join('; ') || fix.lastError || '(chưa ghi nhận)' }}
              </p>
              <p class="acu-v2-ws-materials__card-meta">
                <template v-if="fix.anchor">Nguồn {{ fix.anchor.logicalRef ? `lượt logic ${fix.anchor.logicalRef.turnId}` : `tin nhắn host ${fix.anchor.messageKey}` }} · </template>đã chấp nhận {{ fix.acceptedKeys.length }} cột · thử {{ fix.attempts }} lần · lần thất bại đầu tiên ở ngày {{ fix.firstFailedAtDay }}
              </p>
            </article>
          </div>
        </template>
      </details>
    </template>

    <!-- 候选轨迹：派工 / 阶段计划 / 交付 / 阻断，卡片结构与续写资料面板一致 -->
    <template v-else-if="activeTab === 'candidates'">
      <p v-if="!candidateEntries.length" class="acu-v2-ws-materials__empty">Chưa có bản ghi ứng viên, giao việc hoặc duyệt cuối.</p>
      <div v-else class="acu-v2-ws-materials__cards">
        <article v-for="item in candidateEntries" :key="item.id" class="acu-v2-ws-materials__card" :class="{ 'acu-v2-ws-materials__card--failed': item.status === 'failed' }">
          <p class="acu-v2-ws-materials__card-head"><strong>{{ item.title }}</strong><span>{{ agentLabel(item) }}</span></p>
          <p class="acu-v2-ws-materials__card-body">{{ item.detail }}</p>
        </article>
      </div>
    </template>

    <!-- 场外信号预览：将写入正文的〈与此同时〉段与可感知信号 -->
    <template v-else-if="activeTab === 'projection'">
      <p class="acu-v2-ws-materials__meta">Đoạn 〈与此同时〉 được dựng theo sổ cái hiện tại, khi nộp sẽ được ghi vào nội dung của tầng assistant đã đóng băng; chỉ trình bày các tín hiệu ngoài cảnh mà nhân vật có thể nhận biết qua kênh hợp lý.</p>
      <details class="acu-v2-ws-materials__block" open>
        <summary>Tín hiệu ngoài cảnh · {{ ledger?.guidance.signals.length ?? 0 }} mục</summary>
        <p v-if="!ledger?.guidance.signals.length" class="acu-v2-ws-materials__empty">Hiện không có tín hiệu ngoài cảnh.</p>
        <ul v-else class="acu-v2-ws-materials__list"><li v-for="(signal, index) in ledger.guidance.signals" :key="signal.sourceId || String(index)">{{ signal.text }}</li></ul>
      </details>
      <pre class="acu-v2-ws-materials__projection">{{ projectionPreview || 'Hiện không có đoạn 〈与此同时〉.' }}</pre>
    </template>

    <template v-else-if="activeTab === 'chronicle'">
      <p v-if="!chronicleRows.length" class="acu-v2-ws-materials__empty">Kỷ yếu hậu trường vẫn trống. Sau khi nộp sẽ đối chiếu ngày xảy ra với ngày người chơi biết.</p>
      <div v-else class="acu-v2-ws-materials__cards">
        <article v-for="row in chronicleRows" :key="row.id" class="acu-v2-ws-materials__card">
          <p class="acu-v2-ws-materials__card-head"><strong>{{ row.summary }}</strong></p>
          <p class="acu-v2-ws-materials__card-body">{{ row.at }}</p>
          <p class="acu-v2-ws-materials__card-meta">{{ chronicleMeta(row) }}</p>
        </article>
      </div>
    </template>

    <template v-else-if="activeTab === 'missed'">
      <p class="acu-v2-ws-materials__meta">Do AI bảo trì xác định khi chỉnh lý kỷ yếu hậu trường: các sự kiện hậu trường quan trọng mà nhân vật chính bỏ lỡ vì vắng mặt, không hay biết hoặc đã lỡ thời cơ.</p>
      <p v-if="!missedItems.length" class="acu-v2-ws-materials__empty">Hiện không có sự kiện hậu trường quan trọng nào nhân vật chính bỏ lỡ.</p>
      <div v-else class="acu-v2-ws-materials__cards">
        <article v-for="item in missedItems" :key="item.id" class="acu-v2-ws-materials__card">
          <p class="acu-v2-ws-materials__card-head"><strong>{{ item.title }}</strong><span class="acu-v2-ws-materials__badge">Bỏ lỡ</span></p>
          <p class="acu-v2-ws-materials__card-body">{{ item.detail }}</p>
          <p class="acu-v2-ws-materials__card-meta">{{ missedMeta(item) }}</p>
        </article>
      </div>
    </template>

    <template v-else-if="activeTab === 'rumors'">
      <p v-if="!rumorQueue" class="acu-v2-ws-materials__empty">Hiện không có tin đồn nào để hiển thị.</p>
      <template v-else>
        <p class="acu-v2-ws-materials__meta">Trạng thái tiếp xúc: {{ CONTACT_LABELS[rumorQueue.contact] ?? rumorQueue.contact }} · vị trí hiện tại: {{ rumorQueue.playerRegion || 'Không rõ' }}</p>
        <p v-if="rumorQueue.revealed.length || rumorQueue.dead.length" class="acu-v2-ws-materials__meta">Các tin đồn đã kết thúc (đã biết {{ rumorQueue.revealed.length }}, đã mất hiệu lực {{ rumorQueue.dead.length }}) đã được lưu trữ, không hiển thị ở đây.</p>
        <details v-for="group in rumorQueueGroups" :key="group.key" class="acu-v2-ws-materials__block" open>
          <summary>{{ group.label }} · {{ group.items.length }} mục</summary>
          <p v-if="!group.items.length" class="acu-v2-ws-materials__empty">Chưa có bản ghi.</p>
          <div v-else class="acu-v2-ws-materials__cards">
            <article v-for="item in group.items" :key="item.id" class="acu-v2-ws-materials__card">
              <p class="acu-v2-ws-materials__card-head"><strong>{{ item.fact }}</strong><span class="acu-v2-ws-materials__badge">{{ RUMOR_STATUS_LABELS[item.status] ?? item.status }}</span></p>
              <p class="acu-v2-ws-materials__card-meta">{{ rumorMeta(item) }}</p>
            </article>
          </div>
        </details>
      </template>
    </template>

    <!-- 读取诊断 -->
    <template v-else-if="activeTab === 'diagnostics'">
      <p v-if="!diagnostics.length" class="acu-v2-ws-materials__empty">Hiện không có chẩn đoán đọc.</p>
      <ul v-else class="acu-v2-ws-materials__diagnostics"><li v-for="item in diagnostics" :key="item">{{ item }}</li></ul>
    </template>

    <template v-else-if="activeTab === 'userRequirements'">
      <p class="acu-v2-ws-materials__meta">
        Yêu cầu người dùng được duy trì thủ công trong kho tài liệu. Khi tạo tác vụ, yêu cầu ban đầu được ghi thành mục đầu tiên; mỗi thẻ là một yêu cầu, khi lưu tự chuyển thành mảng chuỗi.
      </p>
      <p v-if="userRequirements.snapshot" class="acu-v2-ws-materials__meta">
        Mục {{ userRequirements.snapshot.requirements.length }}
      </p>
      <p v-if="userRequirements.diagnostics.length" class="acu-v2-ws-materials__error">{{ userRequirements.diagnostics.join('；') }}</p>
      <p v-if="!userRequirements.diagnostics.length && !userRequirements.snapshot?.requirements.length" class="acu-v2-ws-materials__empty">
        Chưa có mục yêu cầu người dùng. Có thể bấm thêm thẻ để thêm thủ công.
      </p>
      <!-- 合法为空（从未写过、也没有读取诊断）时允许写入首条；只有读取失败时锁定，避免覆盖损坏快照。 -->
      <UserRequirementsEditor
        editor-id="simulation"
        :items="requirementsDraft"
        :dirty="requirementsDirty"
        :error="requirementsError"
        :saving="requirementsSaving"
        :disabled="busy || !!userRequirements.diagnostics.length"
        @update:items="updateRequirementsDraft"
        @discard="discardRequirementsDraft"
        @save="saveRequirementsDraft"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import AcuButton from './_lib/AcuButton.vue';
import UserRequirementsEditor from './UserRequirementsEditor.vue';
import type { WorldSimulationTargetAnchor_ACU, WorldSimulationConversationView_ACU, WorldSimulationMaterialsReadResult_ACU, WorldSimulationUserRequirementsReadResult_ACU } from '../../service/simulation/agent/agent-model'; // arch-ok: 仅类型导入，用于 props 标注，编译后无运行时依赖
import type { WorldSimulationSessionEntry_ACU } from '../../service/simulation/agent/agent-session-log'; // arch-ok: 仅类型导入，用于 props 标注，编译后无运行时依赖
import type { WorldActorAction_ACU, WorldActorExperience_ACU, WorldSimulationLedger_ACU, WorldSimulationLedgerFieldSnapshot_ACU, WorldSimulationLedgerModule_ACU, WorldSimulationTimelineEntry_ACU } from '../../service/simulation/model'; // arch-ok: 仅类型导入，用于 props 标注，编译后无运行时依赖
import { worldSimulationAgentLabel_ACU } from '../copy/world-simulation-copy';
import { buildWorldChronicleContrast_ACU, buildWorldMissedList_ACU, buildWorldRumorQueue_ACU, type WorldChronicleContrastRow_ACU, type WorldMissedItem_ACU, type WorldRumorQueueItem_ACU } from '../simulation/world-simulation-dynamics-views';


const props = withDefaults(defineProps<{
  conversation: WorldSimulationConversationView_ACU;
  materials: WorldSimulationMaterialsReadResult_ACU;
  fieldSnapshot: WorldSimulationLedgerFieldSnapshot_ACU;
  userRequirements: WorldSimulationUserRequirementsReadResult_ACU;
  saveRequirements: (requirements: string[]) => Promise<boolean>;
  session: WorldSimulationSessionEntry_ACU[];
  ledger: WorldSimulationLedger_ACU | null;
  anchor: WorldSimulationTargetAnchor_ACU | null;
  projectionPreview: string | null;
  busy?: boolean;
  timeline?: WorldSimulationTimelineEntry_ACU[];
}>(), { busy: false, timeline: () => [] });
const emit = defineEmits<{
  (event: 'refresh' | 'clear'): void;
}>();

const TABS = [
  { id: 'state', label: 'Tổng quan sổ cái' },
  { id: 'userRequirements', label: 'Yêu cầu người dùng' },
  { id: 'candidates', label: 'Quỹ đạo ứng viên' },
  { id: 'chronicle', label: 'Kỷ yếu hậu trường' },
  { id: 'missed', label: 'Danh sách bỏ lỡ' },
  { id: 'rumors', label: 'Tin đồn' },
  { id: 'projection', label: 'Tín hiệu ngoài cảnh' },
  { id: 'diagnostics', label: 'Chẩn đoán đọc' },
] as const;

type TabId = typeof TABS[number]['id'];
const activeTab = ref<TabId>('state');
const clearPending = ref(false);
const requirementsDraft = ref<string[]>([]);
const requirementsDirty = ref(false);
const requirementsError = ref('');
const requirementsSaving = ref(false);
const awaitingRequirementsSnapshot = ref<string | null>(null);
let requirementsChatIdentity: string | null = null;
let latestRequirementsUpdatedAt = -1;

watch(() => [props.anchor?.chatIdentity, props.userRequirements.snapshot] as const, () => {
  const chatIdentity = props.anchor?.chatIdentity ?? null;
  if (chatIdentity !== requirementsChatIdentity) {
    requirementsChatIdentity = chatIdentity;
    latestRequirementsUpdatedAt = -1;
    awaitingRequirementsSnapshot.value = null;
    requirementsDirty.value = false;
  }
  if (requirementsDirty.value) return;
  const snapshot = props.userRequirements.snapshot;
  if (snapshot && snapshot.updatedAt < latestRequirementsUpdatedAt) return;
  const incoming = snapshot?.requirements ?? [];
  if (awaitingRequirementsSnapshot.value !== null) {
    if (JSON.stringify(incoming) === awaitingRequirementsSnapshot.value) return;
    awaitingRequirementsSnapshot.value = null;
  }
  if (snapshot) latestRequirementsUpdatedAt = snapshot.updatedAt;
  requirementsDraft.value = [...incoming];
  requirementsError.value = '';
}, { immediate: true });

function updateRequirementsDraft(value: string[]): void {
  requirementsDraft.value = value;
  requirementsDirty.value = JSON.stringify(value) !== JSON.stringify(props.userRequirements.snapshot?.requirements ?? []);
  requirementsError.value = '';
}

function discardRequirementsDraft(): void {
  requirementsDraft.value = [...(props.userRequirements.snapshot?.requirements ?? [])];
  requirementsDirty.value = false;
  requirementsError.value = '';
}

async function saveRequirementsDraft(): Promise<void> {
  // 与编辑器禁用条件同源：读取失败时拒绝写入；合法为空时允许写入首份快照。
  if (!requirementsDirty.value || requirementsSaving.value || props.busy || props.userRequirements.diagnostics.length) return;
  const payload = requirementsDraft.value.map(item => item.trim());
  if (payload.some(item => !item || item.length > 8000)) {
    requirementsError.value = 'Mỗi yêu cầu không được để trống hoặc vượt quá 8000 ký tự; hãy sửa hoặc xóa thẻ trống.';
    return;
  }
  requirementsSaving.value = true;
  try {
    const saved = await props.saveRequirements(payload);
    if (saved) {
      const observed = props.userRequirements.snapshot;
      if (observed && JSON.stringify(observed.requirements) === JSON.stringify(payload)) {
        latestRequirementsUpdatedAt = Math.max(latestRequirementsUpdatedAt, observed.updatedAt);
        awaitingRequirementsSnapshot.value = null;
      } else {
        awaitingRequirementsSnapshot.value = JSON.stringify(observed?.requirements ?? []);
      }
      requirementsDirty.value = false;
      requirementsDraft.value = [...payload];
      requirementsError.value = '';
    } else {
      requirementsError.value = 'Lưu thất bại, thay đổi vẫn được giữ lại. Hãy kiểm tra thông báo rồi thử lại.';
    }
  } catch (error) {
    requirementsError.value = error instanceof Error ? `Lưu thất bại, thay đổi vẫn được giữ lại: ${error.message}` : 'Lưu thất bại, thay đổi vẫn được giữ lại.';
  } finally {
    requirementsSaving.value = false;
  }
}

function confirmClear(): void {
  clearPending.value = false;
  emit('clear');
}

const anchorText = computed(() => {
  const anchor = props.anchor;
  return !anchor ? 'Hiện chưa phân giải được nội dung assistant đã lưu' : 'logicalRef' in anchor
    ? `Lượt logic ${anchor.logicalRef.turnId}`
    : `Tầng ${anchor.messageIndex + 1} · swipe ${Number(anchor.swipeId) + 1}`;
});

const diagnostics = computed(() => [...props.conversation.diagnostics, ...props.materials.diagnostics]);

const candidateEntries = computed(() => props.session.filter(item => ['delegation', 'finalize', 'block', 'stage_plan'].includes(item.kind)));

function agentLabel(item: WorldSimulationSessionEntry_ACU): string {
  return item.agentName ? worldSimulationAgentLabel_ACU(item.agentName) : 'Agent chính';
}

const SEED_STATUS_LABELS: Record<string, string> = {
  established: 'Đã thiết lập', incubating: 'Đang ủ', active: 'Hoạt động', converging: 'Đang hội tụ', resolved: 'Đã khép lại', retired: 'Đã nghỉ hưu',
};
const VISIBILITY_LABELS: Record<string, string> = { hidden: 'Hậu trường', limited: 'Hiển thị hạn chế', public: 'Công khai' };
const TREND_LABELS: Record<string, string> = { rising: 'Tăng', stable: 'Ổn định', falling: 'Giảm' };
const DIMENSION_KIND_LABELS: Record<string, string> = { pressure: 'Áp lực', growth: 'Tăng trưởng' };

interface LedgerCard { id: string; title: string; detail: string; badge?: string; meta?: string; timeline?: string[] }

function actionText(action: WorldActorAction_ACU | null | undefined): string {
  return action ? `${action.text} (dự kiến ${action.expectedDuration || 'chưa định'})` : 'Không';
}

function dayText(day: number | null, story: string): string {
  return day === null ? 'Không rõ thời điểm bắt đầu (sớm hơn bản ghi)' : `Ngày ${day}${story ? ` (${story})` : ''}`;
}

function experienceLine(item: WorldActorExperience_ACU): string {
  const span = item.startedAtDay === null ? '' : ` · kéo dài ${Math.max(0, item.endedAtDay - item.startedAtDay)} ngày`;
  const result = item.outcome
    ? ` · ${item.status === 'done' ? 'Kết quả' : 'Lý do dừng'}: ${item.outcome}`
    : item.status === 'abandoned' ? ' · Đã dừng' : '';
  return `${dayText(item.startedAtDay, item.startedAt)} → ${dayText(item.endedAtDay, item.endedAt)}${span} · ${item.text}${result}`;
}

/** 已结束的伏线与已故人物归档隐藏；账本与注入给 AI 的视图仍保留并标注「已结束」。 */
const archivedNote = computed(() => {
  const ledger = props.ledger;
  if (!ledger) return '';
  const seeds = ledger.seeds.filter(item => item.status === 'resolved' || item.status === 'retired').length;
  const actors = ledger.actors.filter(item => item.life === 'dead').length;
  return seeds || actors ? `${seeds} phục tuyến đã kết thúc và ${actors} nhân vật đã mất đã được lưu trữ, không hiển thị ở đây.` : '';
});

const ledgerGroups = computed<Array<{ key: string; label: string; items: LedgerCard[] }>>(() => {
  const ledger = props.ledger;
  if (!ledger) return [];
  return [
    {
      key: 'dimensions', label: 'Thang thế cục',
      items: ledger.dimensions.map(item => ({
        id: item.id, title: item.name,
        badge: `${DIMENSION_KIND_LABELS[item.kind] ?? item.kind} ${item.value} · ${TREND_LABELS[item.trend] ?? item.trend}`,
        detail: item.rationale || 'Chưa có tóm tắt căn cứ',
        meta: `revision ${item.revision} · chứng cứ ${item.evidenceRefs.join(', ') || 'không có'}`,
      })),
    },
    {
      key: 'seeds', label: 'Phục tuyến',
      items: ledger.seeds.filter(item => item.status !== 'resolved' && item.status !== 'retired').map(item => ({
        id: item.id, title: item.title,
        badge: `${SEED_STATUS_LABELS[item.status] ?? item.status} · L${item.level} · ${VISIBILITY_LABELS[item.visibility] ?? item.visibility}`,
        detail: item.catalyst || 'Chưa có điều kiện xúc tác',
        meta: `${item.actorIds.length ? `Nhân vật liên quan ${item.actorIds.join(', ')} · ` : ''}revision ${item.revision}${item.retiredReason ? ` · lý do rút lui: ${item.retiredReason}` : ''}`,
      })),
    },
    {
      key: 'actors', label: 'Danh sách nhân vật',
      items: ledger.actors.filter(item => item.life !== 'dead').map(item => ({
        id: item.id, title: item.name,
        badge: VISIBILITY_LABELS[item.visibility] ?? item.visibility,
        // 当前与长期行为（含预计持续时间）放首行；打算、关注与认知压到次要行，经历折叠。
        detail: `Đang làm: ${actionText(item.currentAction)} · dài hạn: ${actionText(item.longTermAction)} · vị trí: ${item.location || 'Không rõ'}`,
        meta: `Dự định: ${item.goals.join('; ') || 'không có'} · quan tâm: ${item.interests.join(', ') || 'không có'} · nhận thức: ${item.knownFacts.join(', ') || 'không có'}`,
        timeline: (item.experiences ?? []).map(experienceLine),
      })),
    },
    {
      key: 'chronicle', label: 'Kỷ yếu hậu trường',
      items: ledger.chronicle.map(item => ({
        id: item.id, title: item.at, detail: item.summary,
        meta: `${item.relatedIds.length ? `Liên quan ${item.relatedIds.join(', ')} · ` : ''}chứng cứ ${item.evidenceRefs.join(', ') || 'không có'}`,
      })),
    },
  ];
});

const CONTACT_LABELS: Record<string, string> = { open: 'Mở', secluded: 'Cách ly' };
const RUMOR_STATUS_LABELS: Record<string, string> = { latent: 'Tiềm ẩn', ripe: 'Chờ lệnh', revealed: 'Đã biết', dead: 'Đã mất hiệu lực' };
const HIT_STATE_LABELS: Record<string, string> = { 'open-hit': 'Mở, có thể trúng', 'secluded-delay': 'Cách ly, đang trì hoãn', waiting: 'Chờ ghé thăm' };

/** 分栏记录状态：complete 完整、partial 未写齐（只在分栏视图）、legacy_unknown 旧整条账本条目。 */
const FIELD_STATUS_LABELS: Record<string, string> = {
  complete: 'Đầy đủ',
  partial: 'Một phần (chưa nâng cấp)',
  legacy_unknown: 'Mục sổ cái cũ',
};
const LEDGER_MODULE_LABELS: Record<WorldSimulationLedgerModule_ACU, string> = {
  clock: 'Thời gian', dimensions: 'Thang thế cục', seeds: 'Phục tuyến', actors: 'Danh sách nhân vật',
  chronicle: 'Kỷ yếu hậu trường', guidance: 'Tín hiệu ngoài cảnh', rumors: 'Tin đồn', player: 'Trạng thái người chơi',
};

/** 账本分栏记录按模块分组：只取栏目名与修订身份，不取字段值。 */
const fieldRecordGroups = computed(() => {
  const records = props.fieldSnapshot.records;
  return (Object.keys(LEDGER_MODULE_LABELS) as WorldSimulationLedgerModule_ACU[])
    .map(module => {
      const bucket = records[module];
      const entries = bucket ? Object.values(bucket) : [];
      if (!entries.length) return null;
      return {
        module,
        label: LEDGER_MODULE_LABELS[module],
        records: entries
          .map(record => ({
            id: record.id,
            status: record.status,
            fieldNames: Object.keys(record.fields),
            missingFields: record.missingFields,
            maxRevision: Object.values(record.fields).reduce((max, field) => Math.max(max, field.revision), 0),
            updatedAt: record.updatedAt,
          }))
          .sort((left, right) => left.id.localeCompare(right.id)),
      };
    })
    .filter((group): group is NonNullable<typeof group> => group !== null);
});
const fieldRecordTotal = computed(() => fieldRecordGroups.value.reduce((total, group) => total + group.records.length, 0));

function formatTimestamp(value: number): string {
  return value > 0 ? new Date(value).toLocaleString() : '(chưa ghi nhận)';
}

const chronicleRows = computed(() => (props.ledger ? buildWorldChronicleContrast_ACU(props.ledger) : []));
const missedItems = computed(() => (props.ledger ? buildWorldMissedList_ACU(props.ledger) : []));
const rumorQueue = computed(() => (props.ledger ? buildWorldRumorQueue_ACU(props.ledger) : null));
const rumorQueueGroups = computed(() => {
  const queue = rumorQueue.value;
  if (!queue) return [];
  // 已得知与已失效的风声属于已结束条目，归档不显示。
  return [
    { key: 'latent', label: 'Tiềm ẩn', items: queue.latent },
    { key: 'ripe', label: 'Chờ lệnh', items: queue.ripe },
  ];
});

function chronicleMeta(row: WorldChronicleContrastRow_ACU): string {
  const occurred = row.occurredDay === null ? 'Ngày xảy ra không rõ' : `Ngày xảy ra: ngày ${row.occurredDay}`;
  if (row.revealedAtDay === null || row.lagDays === null) return occurred;
  return `${occurred} / ngày biết: ngày ${row.revealedAtDay} (trễ ${row.lagDays} ngày)`;
}

function missedMeta(item: WorldMissedItem_ACU): string {
  const parts = [`Xảy ra vào ${item.at}`];
  if (item.relatedIds.length) parts.push(`Liên quan ${item.relatedIds.join(', ')}`);
  return parts.join(' · ');
}

function rumorMeta(item: WorldRumorQueueItem_ACU): string {
  const channels = item.channels.length ? `Kênh ${item.channels.join(', ')}` : 'Không có kênh';
  if (item.status === 'latent' && item.countdownDays !== null) {
    return item.countdownDays > 0 ? `${channels} · có thể tiết lộ sau ${item.countdownDays} ngày` : `${channels} · đã đến hạn, chờ chuyển tiếp`;
  }
  if (item.status === 'ripe' && item.hitState) return `${channels} · ${HIT_STATE_LABELS[item.hitState] ?? item.hitState}`;
  if (item.status === 'revealed' && item.revealedAtDay !== null) return `${channels} · ngày biết: ngày ${item.revealedAtDay}`;
  return channels;
}

</script>

<style scoped>
/* 与 ContinuationMaterialsPanel 保持同一套视觉语言：页签行、概览块、卡片、诊断列表。 */
.acu-v2-ws-materials { display: grid; gap: 12px; }
.acu-v2-ws-materials__tabs { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.acu-v2-ws-materials__tab { padding: 5px 12px; border: 1px solid color-mix(in srgb, var(--acu-text-3) 22%, transparent); border-radius: 999px; background: transparent; color: var(--acu-text-2); cursor: pointer; font: inherit; font-size: var(--acu-font-size-body, 12px); }
.acu-v2-ws-materials__tab--active { border-color: color-mix(in srgb, var(--acu-primary, #5b8def) 55%, transparent); background: color-mix(in srgb,var(--acu-primary, #5b8def) 14%, transparent); color: var(--acu-text-1); }
.acu-v2-ws-materials__tab-actions { display: flex; gap: 6px; margin-left: auto; }
.acu-v2-ws-materials__confirm { display: grid; gap: 8px; margin: 0; padding: 10px 12px; border: 1px solid color-mix(in srgb, var(--acu-danger, #d65b5b) 45%, transparent); border-radius: 7px; background: color-mix(in srgb, var(--acu-danger, #d65b5b) 8%, var(--acu-bg-2)); color: var(--acu-text-2); font-size: var(--acu-font-size-body, 12px); }
.acu-v2-ws-materials__confirm-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
.acu-v2-ws-materials__overview { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.acu-v2-ws-materials__overview > div { display: grid; gap: 5px; padding: 10px; border: 1px solid color-mix(in srgb, var(--acu-text-3) 20%, transparent); border-radius: 7px; }
.acu-v2-ws-materials__overview strong { color: var(--acu-text-1); font-size: var(--acu-font-size-body, 12px); }
.acu-v2-ws-materials__overview span { color: var(--acu-text-3); font-size: 12px; }
.acu-v2-ws-materials__block { padding: 10px; border: 1px solid color-mix(in srgb, var(--acu-text-3) 20%, transparent); border-radius: 7px; display: grid; gap: 8px; }
.acu-v2-ws-materials__block > summary { cursor: pointer; color: var(--acu-text-1); font-size: var(--acu-font-size-body, 12px); }
.acu-v2-ws-materials__cards { display: grid; gap: 8px; }
.acu-v2-ws-materials__card { display: grid; gap: 4px; padding: 8px 10px; border: 1px solid color-mix(in srgb, var(--acu-text-3) 16%, transparent); border-radius: 7px; }
.acu-v2-ws-materials__card--failed { border-left: 3px solid color-mix(in srgb, var(--acu-danger, #d65b5b) 75%, transparent); }
.acu-v2-ws-materials__card-head { margin: 0; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px; color: var(--acu-text-1); font-size: var(--acu-font-size-body, 12px); }
.acu-v2-ws-materials__card-head span { color: var(--acu-text-3); font-size: 11px; }
.acu-v2-ws-materials__badge { padding: 1px 7px; border-radius: 999px; background: color-mix(in srgb, var(--acu-text-3) 18%, transparent); color: var(--acu-text-2); font-size: var(--acu-font-size-caption, 11px); }
.acu-v2-ws-materials__card-body { margin: 0; color: var(--acu-text-2); font-size: var(--acu-font-size-body, 12px); white-space: pre-wrap; word-break: break-word; }
.acu-v2-ws-materials__card-meta { margin: 0; color: var(--acu-text-3); font-size: var(--acu-font-size-caption, 11px); white-space: pre-wrap; word-break: break-word; }
.acu-v2-ws-materials__meta { margin: 0; color: var(--acu-text-3); font-size: var(--acu-font-size-body, 12px); white-space: pre-wrap; }
.acu-v2-ws-materials__empty { margin: 0; color: var(--acu-text-3); font-size: var(--acu-font-size-body, 12px); }
.acu-v2-ws-materials__error { margin: 0; color: var(--acu-danger, #d65b5b); font-size: var(--acu-font-size-body, 12px); }
.acu-v2-ws-materials__json { display: grid; gap: 8px; padding: 10px; border: 1px solid color-mix(in srgb, var(--acu-text-3) 20%, transparent); border-radius: 7px; }
.acu-v2-ws-materials__json > summary { cursor: pointer; color: var(--acu-text-1); font-size: var(--acu-font-size-body, 12px); }
.acu-v2-ws-materials__actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
.acu-v2-ws-materials__list { margin: 0; padding-left: 18px; color: var(--acu-text-2); font-size: var(--acu-font-size-body, 12px); }
.acu-v2-ws-materials__timeline { display: grid; gap: 4px; }
.acu-v2-ws-materials__timeline > summary { cursor: pointer; color: var(--acu-text-3); font-size: var(--acu-font-size-caption, 11px); }
.acu-v2-ws-materials__projection { max-height: 320px; overflow: auto; margin: 0; padding: 10px; border: 1px solid color-mix(in srgb, var(--acu-text-3) 20%, transparent); border-radius: 7px; background: var(--acu-bg-2); color: var(--acu-text-2); font-size: var(--acu-font-size-body, 12px); white-space: pre-wrap; word-break: break-word; }
.acu-v2-ws-materials__diagnostics { margin: 0; padding: 10px 10px 10px 28px; border: 1px solid color-mix(in srgb, var(--acu-text-3) 20%, transparent); border-radius: 7px; color: var(--acu-text-2); font-size: var(--acu-font-size-body, 12px); }
@media (max-width: 640px) {
  .acu-v2-ws-materials__overview { grid-template-columns: 1fr; }
  .acu-v2-ws-materials__tab-actions { width: 100%; margin-left: 0; }
  .acu-v2-ws-materials__tab-actions > * { flex: 1 1 auto; }
}
</style>
