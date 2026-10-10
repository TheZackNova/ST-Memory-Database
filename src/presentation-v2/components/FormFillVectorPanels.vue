<template>
  <div class="acu-v2-vector-index-page">
    <AcuPanelGrid class="acu-v2-vector-index-page__main-grid">
      <div class="acu-v2-vector-index-page__panel-stack">
        <AcuPanel
          id="vector-index-status-panel"
          :title="vectorIndexCopy.panels.status.title"
          :description="vectorIndexCopy.panels.status.description"
        >
          <template #actions>
            <AcuBadge :variant="vector.statusVariant.value">{{
              vector.statusLabel.value
            }}</AcuBadge>
          </template>

          <AcuStatsList :items="vector.statusStatsItems.value" />

          <p class="acu-v2-vector-index-page__hint">
            {{ isCrossfire ? CROSSFIRE_FLOW_HINT : VECTOR_FLOW_HINT }}
          </p>

          <div
            class="acu-v2-vector-index-page__maintenance-spacer"
            aria-hidden="true"
          ></div>

          <div class="acu-v2-vector-index-page__actions">
            <AcuButton
              variant="primary"
              :disabled="vector.buildBusy.value || vector.maintenanceBusy.value"
              @click="vector.buildNow"
            >
              <i class="fa-solid fa-brain"></i>
              {{
                vector.buildBusy.value ? "Đang xây lại..." : "Dựng chỉ mục kỷ yếu giao hỏa ngay"
              }}
            </AcuButton>
            <p class="acu-v2-vector-index-page__hint">
              Khi phát hiện phương án vector cũ sẽ nhắc «Phương án vector đã được tối ưu, cần xây lại». Xung đột chuỗi và checkpoint không khớp dấu vân tay sẽ tự sửa, không hỏi xác nhận.
            </p>
            <AcuButton v-if="SHOW_LEGACY_VECTOR_MAINTENANCE_UI"
              :disabled="vector.maintenanceBusy.value || vector.buildBusy.value"
              @click="vector.migrateLegacyIndex"
            >
              Di chuyển chỉ mục cũ (không phá hủy)
            </AcuButton>
            <AcuButton
              :disabled="vector.maintenanceBusy.value || vector.buildBusy.value"
              @click="vector.clearIndexCache"
            >
              Xóa bộ nhớ đệm tạm
            </AcuButton>
            <AcuButton
              variant="danger"
              :disabled="vector.maintenanceBusy.value || vector.buildBusy.value"
              @click="onDeleteCurrentIndex"
            >
              Xóa chỉ mục hiện tại
            </AcuButton>
          </div>
        </AcuPanel>

        <AcuPanel
          v-if="isCrossfire"
          id="vector-index-keyword-panel"
          :title="vectorIndexCopy.panels.keyword.title"
          :description="vectorIndexCopy.panels.keyword.description"
        >
          <AcuFormRow
            label="AI bổ sung từ khóa"
            hint="Khi bật, trước mỗi lần gửi sẽ gọi thêm một lần AI để tạo từ khóa truy xuất; khi tắt chỉ dùng chính đầu vào của người dùng để truy hồi, tiết kiệm một lượt gọi."
          >
            <AcuToggle
              :model-value="vector.form.keywordGenerationEnabled"
              label="Dùng AI bổ sung từ khóa truy xuất trước khi gửi"
              @update:model-value="
                vector.setBooleanField('keywordGenerationEnabled', $event)
              "
            />
          </AcuFormRow>
          <AcuFormRow
            label="Preset API từ khóa"
            hint="Mặc định dùng API hiện tại, chỉ dùng để tạo từ khóa trước khi gửi."
          >
            <AcuSelect
              :options="keywordApiOptions"
              :model-value="vector.form.keywordApiPreset"
              :placeholder="followActiveApiLabel"
              @update:model-value="
                vector.setApiField('keywordApiPreset', $event)
              "
            />
          </AcuFormRow>
          <div class="acu-v2-vector-index-page__number-grid">
            <AcuFormRow
              label="Số tầng ngữ cảnh đọc"
              hint="Số tầng hội thoại gần nhất được đọc khi tạo từ khóa; 1 tầng = 1 phản hồi AI + 1 đầu vào người dùng phía trên nó."
            >
              <AcuInput
                :model-value="vector.form.keywordContextPairCount"
                type="number"
                :min="1"
                :step="1"
                @change="
                  vector.setNumberField('keywordContextPairCount', $event)
                "
              />
            </AcuFormRow>
            <AcuFormRow
              label="Số lần thử tối đa"
              hint="Khi tạo từ khóa thất bại sẽ quay về dùng chính đầu vào người dùng để truy hồi, không chặn việc gửi gốc."
            >
              <AcuInput
                :model-value="vector.form.keywordGenerationMaxAttempts"
                type="number"
                :min="1"
                :step="1"
                @change="
                  vector.setNumberField('keywordGenerationMaxAttempts', $event)
                "
              />
            </AcuFormRow>
          </div>
        </AcuPanel>
      </div>

      <div class="acu-v2-vector-index-page__panel-stack">
        <AcuPanel
          id="vector-index-api-panel"
          :title="vectorIndexCopy.panels.api.title"
          :description="vectorIndexCopy.panels.api.description"
        >
          <form
            class="acu-v2-vector-api-form"
            @submit.prevent="saveVectorApiConfig"
          >
            <fieldset class="acu-v2-vector-api-form__section">
              <legend>Embedding</legend>
              <AcuFormRow label="URL">
                <AcuInput
                  v-model="vectorApiConfig.form.embeddingEndpoint"
                  type="text"
                  placeholder="https://example.com/embeddings"
                />
              </AcuFormRow>
              <AcuFormRow label="Tên mô hình">
                <AcuInput
                  v-model="vectorApiConfig.form.embeddingModel"
                  type="text"
                  placeholder="text-embedding-3-large"
                />
              </AcuFormRow>
              <AcuFormRow label="Khóa API">
                <AcuInput
                  v-model="vectorApiConfig.form.embeddingApiKey"
                  type="password"
                  autocomplete="off"
                />
              </AcuFormRow>
            </fieldset>

            <fieldset class="acu-v2-vector-api-form__section">
              <legend>Rerank</legend>
              <AcuFormRow label="URL">
                <AcuInput
                  v-model="vectorApiConfig.form.rerankEndpoint"
                  type="text"
                  placeholder="https://example.com/rerank"
                />
              </AcuFormRow>
              <AcuFormRow label="Tên mô hình">
                <AcuInput
                  v-model="vectorApiConfig.form.rerankModel"
                  type="text"
                  placeholder="bge-reranker-v2-m3"
                />
              </AcuFormRow>
              <AcuFormRow label="Khóa API">
                <AcuInput
                  v-model="vectorApiConfig.form.rerankApiKey"
                  type="password"
                  autocomplete="off"
                />
              </AcuFormRow>
              <AcuFormRow
                label="Chỉ thị xếp hạng lại"
                hint="Mặc định bật; khi để trống sẽ không gửi instruction tới dịch vụ Rerank, dùng để tương thích dịch vụ không hỗ trợ trường này."
              >
                <textarea
                  v-model="vectorApiConfig.form.rerankInstruction"
                  class="acu-v2-vector-api-form__instruction-textarea"
                  rows="3"
                  placeholder="Để trống thì không gửi instruction"
                ></textarea>
              </AcuFormRow>
              <AcuFormRow
                label="Số mục mỗi lô"
                :hint="`Khi ứng viên vượt số này sẽ chia lô gọi song song rồi gộp điểm. Nhà cung cấp thường giới hạn dưới 500 mục mỗi yêu cầu, phạm vi ${RERANK_BATCH_SIZE_LIMITS.min}–${RERANK_BATCH_SIZE_LIMITS.max}, mặc định ${RERANK_BATCH_SIZE_LIMITS.default}.`"
              >
                <AcuInput
                  :model-value="vectorApiConfig.form.rerankBatchSize"
                  type="number"
                  :min="RERANK_BATCH_SIZE_LIMITS.min"
                  :max="RERANK_BATCH_SIZE_LIMITS.max"
                  :step="10"
                  @change="onRerankBatchSizeChange($event)"
                />
              </AcuFormRow>
            </fieldset>

            <AcuMessage v-if="vectorApiConfig.errors.value.length" kind="error">
              <p v-for="error in vectorApiConfig.errors.value" :key="error">
                {{ error }}
              </p>
            </AcuMessage>
            <div class="acu-v2-vector-api-form__actions">
              <AcuButton variant="primary" native-type="submit">Lưu</AcuButton>
            </div>
          </form>
        </AcuPanel>

        <AcuPanel
          v-if="isCrossfire"
          id="vector-index-prompt-panel"
          :title="vectorIndexCopy.panels.prompt.title"
          :description="vectorIndexCopy.panels.prompt.description"
        >
          <template #actions>
            <AcuBadge :variant="promptTemplateBadgeVariant">{{
              promptTemplateBadgeLabel
            }}</AcuBadge>
          </template>

          <AcuMessage v-if="keywordPromptEmpty" kind="warning">
            Prompt tạo từ khóa đang trống, trước khi gửi sẽ dùng thẳng đầu vào người dùng để truy hồi; nên nạp prompt mặc định rồi lưu.
          </AcuMessage>

          <div class="acu-v2-vector-index-page__prompt-actions">
            <AcuButton variant="primary" @click="promptDrawerOpen = true"
              >Sửa prompt</AcuButton
            >
          </div>
        </AcuPanel>
      </div>
    </AcuPanelGrid>

    <AcuPanelGrid
      class="acu-v2-vector-index-page__advanced-grid"
    >
      <AcuPanel
        v-if="isCrossfire"
        id="vector-index-recall-panel"
        :title="vectorIndexCopy.panels.recall.title"
        :description="vectorIndexCopy.panels.recall.description"
      >
        <div class="acu-v2-vector-index-page__number-grid">
          <AcuFormRow
            label="Truy hồi kết hợp"
            hint="Khi bật, truy hồi thưa BM25 được hợp nhất với kết quả vector; khi tắt chỉ dùng truy hồi vector."
          >
            <AcuToggle
              :model-value="vector.form.hybridRetrievalEnabled"
              label="Bật truy hồi kết hợp BM25"
              @update:model-value="vector.setBooleanField('hybridRetrievalEnabled', $event)"
            />
          </AcuFormRow>
          <AcuFormRow
            label="Ngưỡng kích hoạt"
            hint="Khi số hàng kỷ yếu hợp lệ đạt ngưỡng, trước khi gửi sẽ tạo từ khóa và truy hồi các phân đoạn; chưa đạt thì giữ quy trình chỉ mục gốc."
          >
            <AcuInput
              :model-value="vector.form.summaryIndexKeywordMinRows"
              type="number"
              :min="1"
              :step="1"
              @change="
                vector.setNumberField('summaryIndexKeywordMinRows', $event)
              "
            />
          </AcuFormRow>
          <AcuFormRow
            label="TopK"
            hint="Số hàng sắp xếp tối đa đưa vào mục lục chỉ mục kỷ yếu (các hàng chèn cố định gần nhất tính riêng); khi số hàng ứng viên không vượt quá số này sẽ bỏ qua Rerank, khi ghi khôi phục thứ tự gốc."
          >
            <AcuInput
              :model-value="vector.form.topK"
              type="number"
              :min="1"
              :step="1"
              @change="vector.setNumberField('topK', $event)"
            />
          </AcuFormRow>
          <AcuFormRow
            label="Điểm sàng lọc tối thiểu"
            hint="Ngưỡng điểm cosine của Embedding, thấp hơn sẽ không vào nhóm ứng viên. Khi văn bản nguồn chứa nội dung kỷ yếu, phân bố điểm nhìn chung thấp hơn, mặc định 0.35."
          >
            <AcuInput
              :model-value="vector.form.minScore"
              type="number"
              :min="0"
              :max="1"
              :step="0.01"
              @change="vector.setMinScore($event)"
            />
          </AcuFormRow>
          <AcuFormRow
            label="Giới hạn ứng viên"
            hint="Số phân đoạn ứng viên mà dense/BM25 mỗi bên giữ lại, cũng là giới hạn nhóm ứng viên sau khi hợp nhất; Rerank tự chia lô theo số mục mỗi lô. Không được nhỏ hơn TopK."
          >
            <AcuInput
              :model-value="vector.form.recallCandidateLimit"
              type="number"
              :min="1"
              :step="1"
              @change="vector.setNumberField('recallCandidateLimit', $event)"
            />
          </AcuFormRow>
          <AcuFormRow
            label="Ghi cố định"
            hint="N kỷ yếu gần nhất được ghi cố định, không tham gia xếp hạng; tính vào ngưỡng kích hoạt, không tính vào TopK."
          >
            <AcuInput
              :model-value="vector.form.recentFixedInjectCount"
              type="number"
              :min="1"
              :step="1"
              @update:model-value="vector.previewRecentFixedInjectCount($event)"
              @change="vector.setNumberField('recentFixedInjectCount', $event)"
            />
          </AcuFormRow>
          <AcuFormRow
            label="Không gian tên"
            hint="Dùng để phân biệt bộ nhớ đệm chỉ mục của các cuộc trò chuyện khác nhau, sẽ nối với định danh cuộc trò chuyện hiện tại."
          >
            <AcuInput
              :model-value="vector.form.vectorNamespace"
              type="text"
              placeholder="chat"
              @change="vector.setApiField('vectorNamespace', $event)"
            />
          </AcuFormRow>
        </div>
      </AcuPanel>

      <AcuPanel
        id="vector-index-archive-panel"
        :title="vectorIndexCopy.panels.archive.title"
        :description="vectorIndexCopy.panels.archive.description"
      >
        <div class="acu-v2-vector-index-page__number-grid">
          <AcuFormRow
            label="Chia nội dung kỷ yếu theo câu"
            hint="Mặc định tắt: mỗi hàng một vector (tổng quan + toàn bộ nội dung kỷ yếu), dung lượng chỉ mục chỉ tăng theo số hàng. Khi bật sẽ chia nội dung theo số câu bên dưới, truy hồi mịn hơn nhưng số phân đoạn tăng gấp bội; sau khi đổi cần xây lại chỉ mục."
          >
            <AcuToggle
              :model-value="vector.form.summaryIndexChunkChronicleBySentence"
              label="Chia nội dung kỷ yếu thành nhiều phân đoạn"
              @update:model-value="
                vector.setBooleanField('summaryIndexChunkChronicleBySentence', $event)
              "
            />
          </AcuFormRow>
          <AcuFormRow
            label="Số câu mỗi khối"
            hint="Chỉ có hiệu lực khi bật chia theo câu: số câu mỗi phân đoạn, càng nhỏ càng mịn và càng nhiều phân đoạn."
          >
            <AcuInput
              :model-value="vector.form.summaryChunkSentenceCount"
              type="number"
              :min="1"
              :step="1"
              :disabled="!vector.form.summaryIndexChunkChronicleBySentence"
              @change="
                vector.setNumberField('summaryChunkSentenceCount', $event)
              "
            />
          </AcuFormRow>
          <AcuFormRow label="Số hàng tối đa mỗi yêu cầu" hint="Số hàng kỷ yếu tối đa mà một yêu cầu embedding bao phủ; cùng với ngân sách ký tự giới hạn kích thước yêu cầu.">
            <AcuInput
              :model-value="vector.form.summaryIndexArchiveMaxConcurrency"
              type="number"
              :min="1"
              :step="1"
              @change="
                vector.setNumberField(
                  'summaryIndexArchiveMaxConcurrency',
                  $event,
                )
              "
            />
          </AcuFormRow>
          <AcuFormRow label="Ngân sách ký tự mỗi yêu cầu" hint="Giới hạn ký tự đầu vào cục bộ của một yêu cầu embedding, không đồng nghĩa với giới hạn token của nhà cung cấp. Khi một hàng vượt quá sẽ được gọi riêng và ghi chẩn đoán.">
            <AcuInput
              :model-value="vector.form.summaryIndexArchiveMaxInputChars"
              type="number"
              :min="1"
              :step="1"
              @change="vector.setNumberField('summaryIndexArchiveMaxInputChars', $event)"
            />
          </AcuFormRow>
          <AcuFormRow label="Số yêu cầu đồng thời" hint="Số yêu cầu HTTP embedding tối đa chạy đồng thời; đặt 1 để chạy tuần tự cho tương thích.">
            <AcuInput
              :model-value="vector.form.summaryIndexArchiveEmbeddingConcurrency"
              type="number"
              :min="1"
              :step="1"
              @change="vector.setNumberField('summaryIndexArchiveEmbeddingConcurrency', $event)"
            />
          </AcuFormRow>
          <AcuFormRow v-if="SHOW_LEGACY_VECTOR_MAINTENANCE_UI"
            label="Gia tăng cuộn"
            hint="Hiện đang tạm dừng do yêu cầu vòng đời phát hành bất biến của V2. Dù cấu hình cũ đã bật, việc lưu trữ vẫn ghi an toàn vào snapshot một tệp V2."
          >
            <AcuToggle
              :model-value="vector.form.summaryIndexRollingDeltaEnabled"
              label="Ghi gia tăng cuộn tạm thời không khả dụng"
              :disabled="true"
            />
          </AcuFormRow>
          <AcuFormRow v-if="SHOW_LEGACY_VECTOR_MAINTENANCE_UI"
            label="Ngưỡng gộp K"
            hint="Chỉ giữ để tương thích cấu hình cũ; không có hiệu lực cho đến khi gia tăng cuộn khôi phục ngữ nghĩa phát hành an toàn V2."
          >
            <AcuInput
              :model-value="vector.form.summaryIndexRollingDeltaFoldThreshold || 15"
              type="number"
              :min="1"
              :step="1"
              disabled
            />
          </AcuFormRow>
        </div>
        <AcuFormRow
          v-if="SHOW_LEGACY_VECTOR_MAINTENANCE_UI"
          label="Cổng ghi V2"
          hint="Mặc định bật (người dùng cài mới hoặc chưa cấu hình rõ ràng mặc định đi đường lưu trữ V2). Tắt chỉ chặn ghi snapshot V2 mới; snapshot V2 đã phát hành vẫn đọc được, tuyệt đối không quay lại ghi đè đường cũ."
        >
          <AcuToggle
            :model-value="vector.form.summaryIndexV2WriteEnabled"
            label="Cho phép ghi snapshot V2"
            @update:model-value="vector.setBooleanField('summaryIndexV2WriteEnabled', $event)"
          />
        </AcuFormRow>
        <AcuFormRow
          v-if="SHOW_LEGACY_VECTOR_MAINTENANCE_UI"
          label="Danh sách cho phép scope ghi V2"
          hint="Mỗi dòng một canonical scope fingerprint. Để trống nghĩa là không giới hạn thêm writer đã bật rõ ràng; scope sai sẽ không được ghi."
        >
          <textarea
            :value="vector.form.summaryIndexV2WriteScopeAllowlistText"
            class="acu-v2-vector-index-page__scope-allowlist"
            rows="4"
            spellcheck="false"
            placeholder="Mỗi dòng một scope fingerprint"
            @change="vector.setV2WriteScopeAllowlist(($event.target as HTMLTextAreaElement).value)"
          ></textarea>
        </AcuFormRow>
      </AcuPanel>
      <div v-if="!isCrossfire" aria-hidden="true"></div>
    </AcuPanelGrid>

    <VectorIndexPromptDrawer
      :is-open="promptDrawerOpen"
      :segments="promptSegmentsForView"
      :dirty="vector.promptDirty.value"
      :message="vector.message.value"
      :role-options="ROLE_OPTIONS"
      @close="promptDrawerOpen = false"
      @save="vector.savePromptGroup"
      @reset="vector.resetPromptGroup"
      @add="vector.addPromptSegment($event)"
      @delete="vector.deletePromptSegment($event)"
      @update="onPromptUpdate"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import AcuBadge, {
  type AcuBadgeVariant,
} from "../components/_lib/AcuBadge.vue";
import AcuButton from "../components/_lib/AcuButton.vue";
import AcuFormRow from "../components/_lib/AcuFormRow.vue";
import AcuInput from "../components/_lib/AcuInput.vue";
import AcuMessage from "../components/_lib/AcuMessage.vue";
import AcuPanel from "../components/_lib/AcuPanel.vue";
import AcuPanelGrid from "../components/_lib/AcuPanelGrid.vue";
import type { PromptSegment } from "../components/_lib/AcuPromptSegments.vue";
import AcuSelect, {
  type AcuSelectOption,
} from "../components/_lib/AcuSelect.vue";
import AcuStatsList from "../components/_lib/AcuStatsList.vue";
import AcuToggle from "../components/_lib/AcuToggle.vue";
import VectorIndexPromptDrawer from "../components/VectorIndexPromptDrawer.vue";
import { useApiPresetSelectOptions } from "../composables/useApiPresetSelectOptions";
import { useChatChangedTick } from "../composables/useChatChangedListener";

import { useUiCloseGuard } from "../composables/useUiCloseGuard";
import { RERANK_BATCH_SIZE_LIMITS, useVectorApiConfig } from "../composables/useVectorApiConfig";
import { useVectorIndexConfig } from "../composables/useVectorIndexConfig";
import { vectorIndexCopy } from "../copy/vector-index-copy";
import { useDialogStore } from "../stores/dialog-store";

/**
 * 交火索引页遗留维护入口的 UI 显示开关。
 *
 * V2 快照写入已经是默认行为，并由 settings-service 的一次性 marker 处理
 * 旧配置迁移；这里仅停止暴露可关闭 writer、约束 scope 与已停用滚动增量的
 * 页面控件。composable、配置字段和持久化逻辑不受影响，改为 true 即可恢复。
 *
 * 隐藏非破坏迁移按钮会使 legacy 索引不再有页面级主动迁移入口；其读取路径
 * 与保留策略不变。
 */
const SHOW_LEGACY_VECTOR_MAINTENANCE_UI = false;

const CROSSFIRE_FLOW_HINT =
  'Quy trình trước khi gửi: tạo từ khóa (có thể tắt) → gộp đầu vào người dùng với từ khóa rồi embedding → truy hồi kết hợp vector "tổng quan + nội dung kỷ yếu" và BM25 (có thể tắt) → Rerank tùy chọn (xếp hạng tinh theo lô trên nội dung kỷ yếu, bỏ qua khi ứng viên không quá TopK) → ghi đè các mục chỉ mục tổng quan gốc theo thứ tự gốc của bảng kỷ yếu.';
const VECTOR_FLOW_HINT =
  'Quy trình trước khi gửi: đầu vào người dùng được embedding và truy hồi trực tiếp → Rerank xếp hạng tinh rồi cắt theo «số kỷ yếu liên quan cần giữ» → các mục kỷ yếu được chọn chuyển sang đèn xanh (thường trực) để chèn vào, phần còn lại giữ nguyên loại mục; mục chỉ mục kỷ yếu giữ nguyên mục lục đầy đủ, không lọc theo kết quả truy hồi; khi số hàng kỷ yếu hợp lệ ít hơn «số kỷ yếu liên quan cần giữ» thì không truy hồi, toàn bộ mục kỷ yếu chuyển sang đèn xanh. Bảng vector không tạo từ khóa, không truy hồi kết hợp, không kích hoạt đẩy cốt truyện; khi Rerank chưa cấu hình hoặc thất bại, lượt truy hồi này bị coi là thất bại và thu hồi đèn xanh, không âm thầm quay về xếp hạng embedding. Tham số truy hồi được đặt riêng ở bảng «Chế độ điền bảng» phía trên.';

const props = defineProps<{
  /** 当前填表模式：向量表格只显示索引、向量服务与分块面板；交火模式显示全部参数。 */
  mode: "vector" | "crossfire";
}>();
const isCrossfire = computed(() => props.mode === "crossfire");

const dialogStore = useDialogStore();
const vector = useVectorIndexConfig();
const vectorApiConfig = useVectorApiConfig();

const {
  apiStore,
  followActiveApiLabel,
  apiPresetSelectOptions: keywordApiOptions,
} = useApiPresetSelectOptions();
const promptDrawerOpen = ref(false);

const ROLE_OPTIONS: AcuSelectOption[] = [
  { value: "system", label: "SYSTEM" },
  { value: "user", label: "USER" },
  { value: "assistant", label: "ASSISTANT" },
];

const promptSegmentsForView = computed<PromptSegment[]>(() =>
  vector.promptSegments.value.map((seg) => ({
    role: seg.role,
    content: seg.content,
    deletable: seg.deletable,
  })),
);
const keywordPromptEmpty = computed(() =>
  vector.promptSegments.value.every((seg) => !String(seg.content || "").trim()),
);
const promptTemplateBadgeLabel = computed(() =>
  vector.promptTemplateMode.value === "default"
    ? "Dùng prompt mặc định"
    : "Đã tùy chỉnh prompt",
);
const promptTemplateBadgeVariant = computed<AcuBadgeVariant>(() =>
  vector.promptTemplateMode.value === "default" ? "neutral" : "accent",
);

function confirmPromptClose(): boolean | Promise<boolean> {
  if (!promptDrawerOpen.value || !vector.promptDirty.value) return true;
  return dialogStore.confirm({
    title: "Đóng UI mới",
    message: "Bạn có thay đổi prompt tạo từ khóa chưa lưu, chắc chắn đóng UI mới?",
    confirmLabel: "Đóng UI mới",
    confirmVariant: "danger",
  });
}

function onPromptUpdate(index: number, patch: Partial<PromptSegment>): void {
  vector.updatePromptSegment(index, {
    ...(patch.role !== undefined ? { role: patch.role } : {}),
    ...(patch.content !== undefined ? { content: patch.content } : {}),
  });
}

function refreshAll(): void {
  vector.refresh();
  vectorApiConfig.refresh();
  void vector.refreshIndexStatus(false);
  apiStore.refreshFromSettings();
}

function saveVectorApiConfig(): void {
  if (vectorApiConfig.save()) vector.refresh();
}

function onRerankBatchSizeChange(raw: string | number): void {
  const value = Math.floor(Number(raw));
  vectorApiConfig.form.rerankBatchSize = Number.isFinite(value) && value > 0
    ? Math.min(RERANK_BATCH_SIZE_LIMITS.max, Math.max(RERANK_BATCH_SIZE_LIMITS.min, value))
    : RERANK_BATCH_SIZE_LIMITS.default;
}

async function onDeleteCurrentIndex(): Promise<void> {
  const confirmed = await dialogStore.confirm({
    title: "Xóa chỉ mục hiện tại",
    message:
      "Xóa chỉ mục giao hỏa của cuộc trò chuyện hiện tại? Việc này sẽ gỡ tham chiếu chỉ mục và dọn các tài sản ngoài có thể thu hồi, sau đó cần xây lại.",
    confirmLabel: "Xóa chỉ mục",
    confirmVariant: "danger",
  });
  if (!confirmed)
    return;
  void vector.deleteCurrentIndex();
}

onMounted(() => {
  refreshAll();
});
watch(useChatChangedTick(), () => {
  refreshAll();
});
useUiCloseGuard(confirmPromptClose);
</script>

<style scoped>
.acu-v2-vector-index-page {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--acu-page-gap, 14px);
}

.acu-v2-vector-index-page__panel-stack {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.acu-v2-vector-index-page__number-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 10px;
}

.acu-v2-vector-api-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.acu-v2-vector-api-form__section {
  min-width: 0;
  margin: 0;
  padding: 0 0 18px;
  border: 0;
  border-bottom: 1px solid
    color-mix(in srgb, var(--acu-text-3) 16%, transparent);
  border-radius: 0;
  background: transparent;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.acu-v2-vector-api-form__section:last-of-type {
  padding-bottom: 0;
  border-bottom: 0;
}

.acu-v2-vector-api-form__section + .acu-v2-vector-api-form__section {
  padding-top: 2px;
}

.acu-v2-vector-api-form__section legend {
  width: 100%;
  margin: 0 0 2px;
  padding: 0;
  color: var(--acu-text-1);
  font-size: var(--acu-font-size-body, 12px);
  font-weight: 700;
  line-height: 1.35;
}

.acu-v2-vector-api-form__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 12px;
  margin-top: 4px;
}

.acu-v2-vector-index-page__hint {
  margin: 0;
  font-size: var(--acu-font-size-body, 12px);
  color: var(--acu-text-3);
  line-height: 1.55;
}

.acu-v2-vector-index-page__maintenance-spacer {
  flex: 1 1 auto;
  min-height: 0;
}

.acu-v2-vector-index-page__actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 12px;
  margin-top: 4px;
}

.acu-v2-vector-index-page__prompt-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 12px;
  margin-top: 4px;
}

.acu-v2-vector-api-form__instruction-textarea {
  width: 100%;
  min-height: 60px;
  padding: 6px 8px;
  border: 1px solid color-mix(in srgb, var(--acu-text-3) 24%, transparent);
  border-radius: 4px;
  background: var(--acu-bg-2, transparent);
  color: var(--acu-text-1);
  font-size: var(--acu-font-size-body, 12px);
  line-height: 1.5;
  resize: vertical;
}

.acu-v2-vector-index-page__scope-allowlist {
  width: 100%;
  min-height: 72px;
  padding: 6px 8px;
  border: 1px solid color-mix(in srgb, var(--acu-text-3) 24%, transparent);
  border-radius: 4px;
  background: var(--acu-bg-2, transparent);
  color: var(--acu-text-1);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: var(--acu-font-size-small, 11px);
  line-height: 1.5;
  resize: vertical;
}
</style>
