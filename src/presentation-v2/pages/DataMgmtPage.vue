<template>
  <section class="acu-v2-data-mgmt-page">
    <AcuMessage v-if="flow.message.value" :kind="flow.message.value.kind">
      {{ flow.message.value.text }}
    </AcuMessage>

    <AcuPanelGrid class="acu-v2-data-mgmt-page__layout">
      <div class="acu-v2-data-mgmt-page__panel-stack">
        <AcuPanel v-if="SHOW_LEGACY_DATA_MGMT_UI"
          :title="dataMgmtCopy.panels.isolation.title"
          :description="dataMgmtCopy.panels.isolation.description"
        >
          <div class="acu-v2-data-mgmt-page__form-stack">
            <AcuFormRow label="Mã định danh" :hint="isolationCodeHint">
              <AcuInput
                :model-value="flow.isolationCode.value"
                type="text"
                placeholder="Nhập mã định danh"
                @update:model-value="flow.isolationCode.value = String($event)"
              />
            </AcuFormRow>

            <AcuDisclosureGroup
              class="acu-v2-data-mgmt-page__history"
              label="Định danh lịch sử"
              :meta="historyMetaLabel"
              :expanded="historyExpanded"
              body-id="acu-data-isolation-history"
              body-mode="if"
              @toggle="historyExpanded = !historyExpanded"
            >
              <div
                v-if="flow.isolationHistory.value.length"
                class="acu-v2-data-mgmt-page__history-list"
              >
                <div
                  v-for="code in flow.isolationHistory.value"
                  :key="code"
                  class="acu-v2-data-mgmt-page__history-item"
                >
                  <AcuButton
                    class="acu-v2-data-mgmt-page__history-fill"
                    size="sm"
                    :title="`Điền định danh lịch sử: ${code}`"
                    :disabled="!!flow.busyAction.value || runtimeDiagnostic.busy.value"
                    @click="selectHistory(code)"
                  >
                    <span class="acu-v2-data-mgmt-page__history-code">{{
                      code
                    }}</span>
                    <span
                      v-if="code === flow.currentIsolationLabel.value"
                      class="acu-v2-data-mgmt-page__history-current"
                    >
                      Hiện tại
                    </span>
                  </AcuButton>
                  <AcuIconButton
                    icon="fa-solid fa-trash-can"
                    variant="danger"
                    :title="`Xóa định danh lịch sử: ${code}`"
                    :aria-label="`Xóa định danh lịch sử: ${code}`"
                    :disabled="!!flow.busyAction.value || runtimeDiagnostic.busy.value"
                    @click="onRemoveHistory(code)"
                  />
                </div>
              </div>
              <p v-else class="acu-v2-data-mgmt-page__history-empty">
                Chưa có định danh lịch sử.
              </p>
            </AcuDisclosureGroup>
          </div>

          <div class="acu-v2-data-mgmt-page__actions">
            <AcuButton
              :disabled="runtimeDiagnostic.busy.value"
              :loading="flow.busyAction.value === 'delete-isolation-entries'"
              @click="onDeleteCurrentIsolationEntries"
            >
              Xóa mục chèn của định danh hiện tại
            </AcuButton>
            <AcuButton
              variant="primary"
              :disabled="runtimeDiagnostic.busy.value"
              :loading="flow.busyAction.value === 'apply-isolation'"
              @click="onApplyIsolation"
            >
              Lưu và áp dụng
            </AcuButton>
          </div>
        </AcuPanel>

        <AcuPanel
          :title="dataMgmtCopy.panels.backup.title"
          :description="dataMgmtCopy.panels.backup.description"
        >
          <div v-if="SHOW_LEGACY_DATA_MGMT_UI" class="acu-v2-data-mgmt-page__command-grid">
            <AcuFileButton
              variant="primary"
              block
              accept=".json,application/json"
              :disabled="!!flow.busyAction.value || runtimeDiagnostic.busy.value"
              @file="flow.importCombinedSettings"
            >
              <i class="fa-solid fa-download"></i>
              Nhập gộp (mẫu + chỉ dẫn)
            </AcuFileButton>
            <AcuButton
              block
              :disabled="!!flow.busyAction.value || runtimeDiagnostic.busy.value"
              @click="flow.exportCombinedSettings"
            >
              <i class="fa-solid fa-upload"></i>
              Xuất gộp (mẫu + chỉ dẫn)
            </AcuButton>
            <AcuButton
              block
              :disabled="!!flow.busyAction.value || runtimeDiagnostic.busy.value"
              @click="flow.exportJsonData"
            >
              <i class="fa-solid fa-upload"></i>
              Xuất đặc biệt
            </AcuButton>
            <AcuButton
              block
              :disabled="runtimeDiagnostic.busy.value"
              :loading="flow.busyAction.value === 'override-latest'"
              @click="onOverrideLatestLayer"
            >
              Mẫu ghi đè dữ liệu tầng mới nhất
            </AcuButton>
          </div>
          <section class="acu-v2-data-mgmt-page__checkpoint-section" aria-labelledby="acu-checkpoint-title">
            <h3 id="acu-checkpoint-title" class="acu-v2-data-mgmt-page__section-title">Checkpoint của cuộc trò chuyện hiện tại</h3>
            <p class="acu-v2-data-mgmt-page__section-description">
              Xuất bảng, mẫu của cuộc trò chuyện và bảng chỉ dẫn của định danh cô lập hiện tại. Nhập sẽ xóa toàn bộ tầng AI của cuộc trò chuyện hiện tại và dữ liệu bảng cục bộ của mọi định danh cô lập,
              chỉ dựng lại dữ liệu ở tầng AI mới nhất của khóa cô lập đang kích hoạt; mẫu bảng của cuộc trò chuyện hiện tại sẽ chuyển sang mẫu trong tệp, các lần cập nhật sau sẽ dùng mẫu này.
              Mẫu toàn cục và nội dung chat không đổi.
            </p>
            <div class="acu-v2-data-mgmt-page__checkpoint-actions">
              <AcuButton block :disabled="!!flow.busyAction.value || runtimeDiagnostic.busy.value" @click="flow.exportTableCheckpoint">
                Xuất Checkpoint
              </AcuButton>
              <AcuFileButton
                block
                accept=".json,application/json"
                :disabled="!!flow.busyAction.value || runtimeDiagnostic.busy.value"
                @file="onImportTableCheckpoint"
              >
                Nhập Checkpoint
              </AcuFileButton>
            </div>
          </section>
          <section
            v-if="flow.mixedStorageDecision.value"
            class="acu-v2-data-mgmt-page__checkpoint-section"
            aria-labelledby="acu-mixed-storage-title"
          >
            <h3 id="acu-mixed-storage-title" class="acu-v2-data-mgmt-page__section-title">Quyết định lưu trữ hỗn hợp</h3>
            <p class="acu-v2-data-mgmt-page__section-description">
              Cuộc trò chuyện hiện tại phát hiện đồng thời dữ liệu legacy-v1 và V2. Quyết định: {{ flow.mixedStorageDecision.value.kind }}.
              <template v-if="flow.mixedStorageDecision.value.diagnosticCodes.length">
                Chẩn đoán: {{ flow.mixedStorageDecision.value.diagnosticCodes.join(', ') }}.
              </template>
              <template v-if="flow.mixedStorageDecision.value.anchorStatus || flow.mixedStorageDecision.value.replayStatus">
                Điểm neo: {{ flow.mixedStorageDecision.value.anchorStatus }}; phát lại: {{ flow.mixedStorageDecision.value.replayStatus }};
                số bảng tĩnh: {{ flow.mixedStorageDecision.value.staticSheetKeyCount }}.
              </template>
              Có thể xuất trước hai snapshot độc lập; thao tác nộp chỉ tham chiếu quyết định hiện tại, không nhận hay ghi đè dữ liệu bảng từ trang.
            </p>
            <div class="acu-v2-data-mgmt-page__checkpoint-actions">
              <AcuButton block :disabled="runtimeDiagnostic.busy.value" :loading="flow.busyAction.value === 'export-mixed-storage-snapshots'" @click="flow.exportMixedStorageSnapshots">
                Xuất snapshot legacy/V2
              </AcuButton>
              <AcuButton
                v-if="flow.mixedStorageDecision.value.allowedActions.includes('keep_v2')"
                block
                :disabled="runtimeDiagnostic.busy.value"
                :loading="flow.busyAction.value === 'commit-mixed-storage-keep_v2'"
                @click="onCommitMixedStorageDecision('keep_v2')"
              >
                Giữ V2 và dọn legacy
              </AcuButton>
              <AcuButton
                v-if="flow.mixedStorageDecision.value.allowedActions.includes('commit_merge_candidate')"
                block
                :disabled="runtimeDiagnostic.busy.value"
                :loading="flow.busyAction.value === 'commit-mixed-storage-commit_merge_candidate'"
                @click="onCommitMixedStorageDecision('commit_merge_candidate')"
              >
                Nộp ứng viên gộp có giới hạn
              </AcuButton>
            </div>
          </section>
          <section
            v-if="flow.v2RecoverySummary.value"
            class="acu-v2-data-mgmt-page__checkpoint-section"
            aria-labelledby="acu-v2-recovery-title"
          >
            <h3 id="acu-v2-recovery-title" class="acu-v2-data-mgmt-page__section-title">Chẩn đoán khôi phục dữ liệu V2</h3>
            <p class="acu-v2-data-mgmt-page__section-description">
              {{ flow.v2RecoverySummary.value.message }}
              Khôi phục chỉ dùng ứng viên đã đóng băng phía máy chủ, không đọc hay nộp dữ liệu bảng có thể chỉnh sửa từ trang.
            </p>
            <div class="acu-v2-data-mgmt-page__checkpoint-actions">
              <AcuButton block :disabled="!!flow.busyAction.value || runtimeDiagnostic.busy.value" @click="flow.exportV2RecoveryBackups">
                Xuất bản sao lưu frame gốc đã lưu
              </AcuButton>
              <AcuButton
                v-if="flow.v2RecoverySummary.value.status === 'recoverable_repaired_checkpoint' || flow.v2RecoverySummary.value.status === 'recoverable_temporary_sheet_anchor' || flow.v2RecoverySummary.value.status === 'recoverable_redundant_full_checkpoint' || flow.v2RecoverySummary.value.status === 'recoverable_from_recovery_backup'"
                block
                variant="danger"
                :disabled="runtimeDiagnostic.busy.value"
                :loading="flow.busyAction.value === 'commit-v2-recovery'"
                @click="onCommitV2Recovery('checkpoint')"
              >
                Áp dụng sửa chữa/hội tụ Checkpoint
              </AcuButton>
              <AcuButton
                v-if="flow.v2RecoverySummary.value.status === 'recoverable_orphan_data_replace'"
                block
                variant="danger"
                :disabled="runtimeDiagnostic.busy.value"
                :loading="flow.busyAction.value === 'commit-v2-recovery'"
                @click="onCommitV2Recovery('orphan-data-replace')"
              >
                Xác nhận khôi phục data_replace không điểm neo
              </AcuButton>
              <AcuButton
                v-if="flow.v2RecoverySummary.value.status === 'recoverable_compat_tolerant_replay' && flow.v2RecoverySummary.value.planId"
                block
                variant="danger"
                :disabled="runtimeDiagnostic.busy.value"
                :loading="flow.busyAction.value === 'commit-v2-recovery'"
                @click="onCommitV2Recovery('compat-fixation')"
              >
                {{ flow.v2RecoverySummary.value.requiresConfirmation ? 'Xác nhận gộp định danh và cố định phát lại tương thích thành gốc chuyển tiếp' : 'Cố định phát lại tương thích thành gốc chuyển tiếp' }}
              </AcuButton>
            </div>
          </section>
          <section
            v-if="flow.v2IsolationDiagnostics.value.length"
            class="acu-v2-data-mgmt-page__checkpoint-section"
            aria-labelledby="acu-v2-isolation-diagnostics-title"
          >
            <h3 id="acu-v2-isolation-diagnostics-title" class="acu-v2-data-mgmt-page__section-title">Chẩn đoán khôi phục miền cô lập V2</h3>
            <div class="acu-v2-data-mgmt-page__form-stack">
              <div v-for="diagnostic in flow.v2IsolationDiagnostics.value" :key="diagnostic.isolationKey" class="acu-v2-data-mgmt-page__history-item">
                <strong>{{ diagnostic.isolationKey || 'Miền cô lập mặc định' }}</strong>
                <p>{{ diagnostic.message }}</p>
                <p v-if="!diagnostic.isCurrentIsolation">Hãy chuyển sang miền cô lập đó rồi chẩn đoán lại; lần nộp khôi phục hiện tại sẽ không thực hiện xuyên miền cô lập.</p>
                <p v-else-if="diagnostic.status.startsWith('recoverable_')">Miền cô lập hiện tại có ứng viên khôi phục được, hãy dùng “Chẩn đoán khôi phục dữ liệu V2” bên dưới để tạo kế hoạch có thể nộp.</p>
              </div>
            </div>
          </section>
          <section
            v-if="SHOW_LEGACY_DATA_MGMT_UI"
            class="acu-v2-data-mgmt-page__checkpoint-section acu-v2-data-mgmt-page__sqlite-runtime-section"
            aria-labelledby="acu-sqlite-runtime-title"
          >
            <h3 id="acu-sqlite-runtime-title" class="acu-v2-data-mgmt-page__section-title">
              {{ dataMgmtCopy.panels.backup.sqliteRuntime.title }}
            </h3>
            <p class="acu-v2-data-mgmt-page__meta">{{ dataMgmtCopy.panels.backup.sqliteRuntime.description }}</p>
            <dl class="acu-v2-data-mgmt-page__runtime-health" data-testid="sqlite-runtime-health">
              <div><dt>{{ dataMgmtCopy.panels.backup.sqliteRuntime.healthSnapshot.status }}</dt><dd>{{ runtimeDiagnostic.health.value.status }}</dd></div>
              <div><dt>{{ dataMgmtCopy.panels.backup.sqliteRuntime.healthSnapshot.expectedMode }}</dt><dd>{{ runtimeDiagnostic.health.value.expectedMode }}</dd></div>
              <div><dt>{{ dataMgmtCopy.panels.backup.sqliteRuntime.healthSnapshot.activeMode }}</dt><dd>{{ runtimeDiagnostic.health.value.activeMode || dataMgmtCopy.panels.backup.sqliteRuntime.healthSnapshot.unavailable }}</dd></div>
              <div><dt>{{ dataMgmtCopy.panels.backup.sqliteRuntime.healthSnapshot.source }}</dt><dd>{{ runtimeDiagnostic.health.value.source || dataMgmtCopy.panels.backup.sqliteRuntime.healthSnapshot.unavailable }}</dd></div>
              <div><dt>{{ dataMgmtCopy.panels.backup.sqliteRuntime.healthSnapshot.loadToken }}</dt><dd>{{ runtimeDiagnostic.health.value.loadToken }}</dd></div>
              <div><dt>{{ dataMgmtCopy.panels.backup.sqliteRuntime.healthSnapshot.failureCode }}</dt><dd>{{ runtimeDiagnostic.health.value.failureCode || dataMgmtCopy.panels.backup.sqliteRuntime.healthSnapshot.unavailable }}</dd></div>
            </dl>
            <div v-if="runtimeDiagnostic.isVisible.value" class="acu-v2-data-mgmt-page__checkpoint-actions">
              <AcuButton
                block
                variant="primary"
                :disabled="!!flow.busyAction.value"
                :loading="runtimeDiagnostic.busy.value"
                @click="onReloadSqliteRuntime"
              >
                {{ dataMgmtCopy.panels.backup.sqliteRuntime.reloadLabel }}
              </AcuButton>
            </div>
          </section>
          <!-- 恢复入口不受 legacy UI 开关控制：写入门闸的错误提示会把用户引导到这里。 -->
          <div class="acu-v2-data-mgmt-page__checkpoint-actions" data-testid="v2-recovery-actions">
            <AcuButton block :disabled="runtimeDiagnostic.busy.value" :loading="flow.busyAction.value === 'scan-v2-isolation-diagnostics'" @click="flow.scanV2IsolationDiagnostics">
              Quét tất cả miền cô lập V2
            </AcuButton>
            <AcuButton block :disabled="runtimeDiagnostic.busy.value" :loading="flow.busyAction.value === 'prepare-v2-recovery'" @click="flow.prepareV2Recovery">
              Chẩn đoán khôi phục dữ liệu V2
            </AcuButton>
          </div>
        </AcuPanel>
      </div>

      <div class="acu-v2-data-mgmt-page__panel-stack">
        <AcuPanel
          :title="dataMgmtCopy.panels.cleanup.title"
          :description="dataMgmtCopy.panels.cleanup.description"
        >
          <section
            class="acu-v2-data-mgmt-page__cleanup-section"
            aria-labelledby="acu-cleanup-auto-title"
          >
            <h3
              id="acu-cleanup-auto-title"
              class="acu-v2-data-mgmt-page__section-title"
            >
              Dọn dẹp tự động
            </h3>
            <div class="acu-v2-data-mgmt-page__form-stack">
              <AcuFormRow
                label="Số tầng dữ liệu giữ lại"
                hint="Sau khi tự động cập nhật xong, dữ liệu plugin của các tầng cũ vượt phạm vi giữ lại sẽ bị dọn; không ảnh hưởng nội dung chat."
              >
                <AcuInput
                  type="number"
                  :min="0"
                  :step="1"
                  :disabled="runtimeDiagnostic.busy.value"
                  :model-value="flow.retainRecentLayers.value"
                  @change="flow.setRetainRecentLayers($event)"
                />
              </AcuFormRow>
            </div>
          </section>

          <section
            class="acu-v2-data-mgmt-page__cleanup-section"
            aria-labelledby="acu-cleanup-manual-title"
          >
            <h3
              id="acu-cleanup-manual-title"
              class="acu-v2-data-mgmt-page__section-title"
            >
              Xóa thủ công
            </h3>
            <p class="acu-v2-data-mgmt-page__meta">
              Cuộc trò chuyện hiện tại có {{ flow.aiMessageCount.value }} tầng AI · sẽ xử lý: {{
                flow.rangeLabel.value
              }}
            </p>

            <div class="acu-v2-data-mgmt-page__form-grid">
              <AcuFormRow
                label="Tầng bắt đầu"
                hint="Bắt đầu từ phản hồi AI ở tầng thứ N, để trống là tầng 1."
              >
                <AcuInput
                  :model-value="flow.deleteRange.startFloor"
                  type="number"
                  :min="1"
                  :step="1"
                  @update:model-value="flow.deleteRange.startFloor = $event"
                />
              </AcuFormRow>
              <AcuFormRow label="Tầng kết thúc" hint="Để trống là tầng mới nhất.">
                <AcuInput
                  :model-value="flow.deleteRange.endFloor"
                  type="number"
                  :min="1"
                  :step="1"
                  placeholder="Đến cuối"
                  @update:model-value="flow.deleteRange.endFloor = $event"
                />
              </AcuFormRow>
            </div>

            <div
              v-if="flow.deletableSheetOptions.value.length > 0"
              class="acu-v2-data-mgmt-page__sheet-filter"
              role="group"
              aria-labelledby="acu-cleanup-sheet-filter-title"
            >
              <div class="acu-v2-data-mgmt-page__sheet-filter-head">
                <span id="acu-cleanup-sheet-filter-title" class="acu-v2-data-mgmt-page__sheet-filter-title">Giới hạn bảng (tùy chọn)</span>
                <button
                  v-if="flow.hasDeleteSheetSelection.value"
                  type="button"
                  class="acu-v2-data-mgmt-page__sheet-filter-clear"
                  :disabled="runtimeDiagnostic.busy.value"
                  @click="flow.clearDeleteSheetSelection"
                >
                  Bỏ chọn
                </button>
              </div>
              <div class="acu-v2-data-mgmt-page__sheet-filter-list">
                <AcuCheckbox
                  v-for="option in flow.deletableSheetOptions.value"
                  :key="option.sheetKey"
                  :model-value="flow.deleteSheetKeys.value.includes(option.sheetKey)"
                  :label="option.name"
                  :disabled="runtimeDiagnostic.busy.value"
                  :data-sheet-key="option.sheetKey"
                  @update:model-value="flow.toggleDeleteSheetKey(option.sheetKey, $event)"
                />
              </div>
              <p class="acu-v2-data-mgmt-page__meta">
                Khi tích, chỉ xóa dữ liệu của các bảng đã chọn trong phạm vi tầng (gồm cả dữ liệu của các bảng này trong checkpoint), các bảng khác, mẫu và bảng chỉ dẫn đều không bị ảnh hưởng; không tích thì xóa theo toàn bộ tầng.
              </p>
            </div>

          </section>


            <p class="acu-v2-data-mgmt-page__meta">
              {{ flow.hasDeleteSheetSelection.value
                ? `Hiện đã giới hạn ${flow.deleteSheetKeys.value.length} bảng: ${flow.selectedDeleteSheetNames.value.join(', ')}. Xóa theo bảng sẽ không xóa sạch cứng, kể cả khi phạm vi bao phủ toàn bộ tầng.`
                : 'Phạm vi tầng áp dụng cho cả hai nút xóa. «Xóa tất cả dữ liệu cục bộ» sẽ xóa sạch cứng khi phạm vi bao phủ toàn bộ tầng AI, còn khi phạm vi chỉ là một phần thì chỉ xóa dữ liệu điền bảng của các tầng tương ứng.' }}
            </p>

          <div
            class="acu-v2-data-mgmt-page__command-grid acu-v2-data-mgmt-page__command-grid--cleanup"
          >
            <AcuButton v-if="SHOW_LEGACY_DATA_MGMT_UI"
              block
              :disabled="runtimeDiagnostic.busy.value"
              :loading="flow.busyAction.value === 'delete-current-local'"
              @click="onDeleteLocalData('current')"
            >
              Xóa dữ liệu cục bộ của định danh hiện tại
            </AcuButton>
            <AcuButton
              block
              variant="danger"
              :disabled="runtimeDiagnostic.busy.value"
              :loading="flow.busyAction.value === 'purge-all-local' || flow.busyAction.value === 'delete-all-local'"
              @click="onDeleteLocalData('all')"
            >
              {{ flow.hasDeleteSheetSelection.value ? `Xóa dữ liệu của ${flow.deleteSheetKeys.value.length} bảng đã chọn` : 'Xóa tất cả dữ liệu cục bộ' }}
            </AcuButton>
            <AcuButton
              block
              :disabled="runtimeDiagnostic.busy.value"
              :loading="flow.busyAction.value === 'reset-defaults'"
              @click="onResetAllDefaults"
            >
              Khôi phục cấu hình mặc định
            </AcuButton>
            <AcuButton
              block
              variant="danger"
              :disabled="runtimeDiagnostic.busy.value || !!flow.busyAction.value"
              :loading="flow.busyAction.value === 'cleanup-legacy-isolation'"
              @click="onCleanupLegacyIsolationProfiles"
            >
              Dọn nhãn cô lập cũ toàn cục
            </AcuButton>
          </div>
          <p class="acu-v2-data-mgmt-page__meta">
            Dọn toàn bộ nhãn cô lập đã ngừng dùng cùng cài đặt toàn cục/mẫu bảng của chúng, và chuyển về dữ liệu mặc định; không xóa nội dung chat hay dữ liệu bảng lịch sử đã lưu của từng cuộc trò chuyện. Hiện phát hiện {{ flow.legacyIsolationCount.value }} nhãn cô lập cũ.
          </p>
        </AcuPanel>
      </div>
    </AcuPanelGrid>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import AcuButton from "../components/_lib/AcuButton.vue";
import AcuDisclosureGroup from "../components/_lib/AcuDisclosureGroup.vue";
import AcuFileButton from "../components/_lib/AcuFileButton.vue";
import AcuFormRow from "../components/_lib/AcuFormRow.vue";
import AcuIconButton from "../components/_lib/AcuIconButton.vue";
import AcuInput from "../components/_lib/AcuInput.vue";
import AcuMessage from "../components/_lib/AcuMessage.vue";
import AcuPanel from "../components/_lib/AcuPanel.vue";
import AcuPanelGrid from "../components/_lib/AcuPanelGrid.vue";
import AcuCheckbox from "../components/_lib/AcuCheckbox.vue";
import { useChatChangedTick } from "../composables/useChatChangedListener";
import { useSqliteRuntimeDiagnostic } from "../composables/useSqliteRuntimeDiagnostic";
import {
  useDataManagement,
  type ResetDefaultsCleanupKey,
  type ResetDefaultsCleanupOptions,
} from "../composables/useDataManagement";
import { dataMgmtCopy } from "../copy/data-mgmt-copy";
import { useDialogStore } from "../stores/dialog-store";
import type { MixedStorageCommitAction_ACU } from "../../shared/models/mixed-storage-commit-action";

/**
 * 旧数据管理入口的 UI 显示开关。
 *
 * 本次仅隐藏 UI，不改变业务逻辑：useDataManagement、SQLite 运行时诊断、
 * busy 联动和全部 service 链路仍会初始化并随聊天切换刷新。改为 true 即可
 * 恢复以下区块：数据隔离、备份四按钮、当前标识本地数据删除、SQLite 诊断和
 * V2 隔离域/恢复诊断触发按钮。
 *
 * 隐藏这些入口意味着隔离标识切换及手工 V2 恢复诊断不再能从页面触达；已持久化
 * 的隔离逻辑不受影响。
 */
const SHOW_LEGACY_DATA_MGMT_UI = false;

const resetDefaultsCleanupOptions: Array<{
  value: ResetDefaultsCleanupKey;
  label: string;
  description: string;
  defaultChecked: boolean;
}> = [
  {
    value: "restore-template-prompts",
    label: "Mẫu bảng và prompt mặc định",
    description: "Khôi phục mẫu bảng mặc định, prompt điền bảng và prompt tóm tắt gộp.",
    defaultChecked: true,
  },
  {
    value: "clear-template-snapshots",
    label: "Snapshot mẫu bảng của cuộc trò chuyện hiện tại",
    description: "Dọn mẫu bảng tạm, snapshot preset và bảng chỉ dẫn được nhập từ giao diện hoặc thẻ nhân vật dưới định danh hiện tại.",
    defaultChecked: true,
  },
  {
    value: "clear-plot-snapshots",
    label: "Snapshot preset đẩy cốt truyện của cuộc trò chuyện hiện tại",
    description: "Dọn phần ghi đè đẩy cốt truyện tạm của cuộc trò chuyện hiện tại để nó theo lại cài đặt toàn cục.",
    defaultChecked: true,
  },
  {
    value: "clear-table-locks",
    label: "Khóa bảng của cuộc trò chuyện hiện tại",
    description: "Dọn trạng thái khóa hàng, cột, ô của bảng trong cuộc trò chuyện hiện tại và định danh hiện tại.",
    defaultChecked: true,
  },
  {
    value: "clear-table-order",
    label: "Bộ nhớ đệm thứ tự bảng",
    description: "Xóa bộ nhớ đệm thứ tự bảng cũ, về sau hiển thị lại theo thứ tự mẫu hiện tại.",
    defaultChecked: true,
  },
];

const dialogStore = useDialogStore();
const flow = useDataManagement();
const runtimeDiagnostic = useSqliteRuntimeDiagnostic();
const historyExpanded = ref(false);

const isolationCodeHint = computed(
  () =>
    `Đang sử dụng: ${flow.currentIsolationLabel.value}. Để trống nghĩa là dữ liệu mặc định; sau khi sửa phải bấm “Lưu và áp dụng” mới chuyển.`,
);
const historyMetaLabel = computed(
  () => `${flow.isolationHistory.value.length} mục`,
);

function selectHistory(value: string): void {
  if (value && !runtimeDiagnostic.busy.value) flow.isolationCode.value = value;
}

async function onApplyIsolation(): Promise<void> {
  if (runtimeDiagnostic.busy.value) return;
  await flow.applyIsolation();
}

async function onRemoveHistory(code: string): Promise<void> {
  if (runtimeDiagnostic.busy.value) return;
  await flow.removeHistory(code);
}

async function onDeleteCurrentIsolationEntries(): Promise<void> {
  if (runtimeDiagnostic.busy.value) return;
  const confirmed = await dialogStore.confirm({
    title: "Xóa mục chèn",
    message:
      "Xóa mục chèn CSDL của định danh hiện tại? Việc này không xóa nội dung chat nhưng sẽ gỡ các mục do plugin tạo trong Sổ thế giới.",
    confirmLabel: "Xóa mục chèn",
    confirmVariant: "danger",
  });
  if (!confirmed)
    return;
  if (runtimeDiagnostic.busy.value) return;
  void flow.deleteCurrentIsolationEntries();
}

async function onOverrideLatestLayer(): Promise<void> {
  if (runtimeDiagnostic.busy.value) return;
  const confirmed = await dialogStore.confirm({
    title: "Ghi đè dữ liệu tầng mới nhất",
    message:
      "Dùng mẫu đang có hiệu lực để ghi đè dữ liệu bảng của tầng AI mới nhất? Việc này sẽ xóa các hàng dữ liệu của bảng trong mẫu, chỉ giữ tiêu đề.",
    confirmLabel: "Ghi đè dữ liệu",
    confirmVariant: "danger",
  });
  if (!confirmed)
    return;
  if (runtimeDiagnostic.busy.value) return;
  void flow.overrideLatestLayerWithTemplate();
}

async function onImportTableCheckpoint(file: File): Promise<void> {
  if (runtimeDiagnostic.busy.value) return;
  const checkpoint = await flow.parseTableCheckpoint(file);
  if (!checkpoint) return;
  const sourceStorageMode = checkpoint.source.storageMode;
  const targetStorageMode = flow.getCheckpointTargetStorageMode();
  const confirmed = await dialogStore.confirm({
    title: "Khôi phục Checkpoint của cuộc trò chuyện hiện tại",
    message: `Nhập sẽ xóa toàn bộ tầng AI của cuộc trò chuyện hiện tại và dữ liệu bảng cục bộ của mọi định danh cô lập.
Chỉ dựng lại dữ liệu bảng trong tệp ở tầng AI mới nhất của khóa cô lập đang kích hoạt.
Mẫu bảng của cuộc trò chuyện hiện tại sẽ chuyển sang mẫu trong tệp, các lần cập nhật sau sẽ dùng mẫu này.
Mẫu toàn cục và nội dung chat không đổi. Chế độ nguồn: ${sourceStorageMode}; chế độ đích: ${targetStorageMode}. Xác nhận tiếp tục?`,
    confirmLabel: "Khôi phục Checkpoint",
    confirmVariant: "danger",
  });
  if (!confirmed) return;
  if (runtimeDiagnostic.busy.value) return;
  void flow.restoreTableCheckpoint(checkpoint);
}

async function onDeleteLocalData(mode: "current" | "all"): Promise<void> {
  if (runtimeDiagnostic.busy.value) return;
  const path = flow.resolveDeletionPath(mode);

  if (flow.hasDeleteSheetSelection.value) {
    const names = flow.selectedDeleteSheetNames.value;
    const confirmed = await dialogStore.confirm({
      title: "Xóa dữ liệu bảng đã chọn",
      message:
        `Xóa dữ liệu của bảng 「${names.join("」「")}」 trong ${flow.rangeLabel.value} của cuộc trò chuyện hiện tại?\n` +
        "Gồm phần thuộc các bảng này trong full checkpoint, checkpoint đơn bảng và nhật ký điền bảng trong phạm vi đó;\n" +
        "Dữ liệu của các bảng khác, scope mẫu cấp cuộc trò chuyện và container guide đều được giữ lại, không thực hiện xóa sạch cứng.\n" +
        "Chỉ áp dụng cho định danh cô lập hiện tại. Thao tác này không thể khôi phục.",
      confirmLabel: "Xóa dữ liệu bảng đã chọn",
      confirmVariant: "danger",
    });
    if (!confirmed) return;
    if (runtimeDiagnostic.busy.value) return;
    void flow.deleteLocalData(mode);
    return;
  }

  if (path === "range") {
    const scopeText = mode === "current" ? "thuộc định danh hiện tại" : "của mọi định danh";
    const confirmed = await dialogStore.confirm({
      title: mode === "current" ? "Xóa dữ liệu cục bộ của định danh hiện tại" : "Xóa dữ liệu cục bộ của các tầng chỉ định",
      message:
        `Xóa dữ liệu CSDL ${scopeText} trong ${flow.rangeLabel.value} của cuộc trò chuyện hiện tại?\n` +
        "Chỉ xóa dữ liệu điền bảng của các tầng trong phạm vi đó; scope mẫu cấp cuộc trò chuyện và container guide được giữ lại,\n" +
        "dữ liệu của các tầng không nằm trong phạm vi không bị ảnh hưởng. Thao tác này không thể khôi phục.",
      confirmLabel: "Xóa dữ liệu",
      confirmVariant: "danger",
    });
    if (!confirmed) return;
    if (runtimeDiagnostic.busy.value) return;
    void flow.deleteLocalData(mode);
    return;
  }

  // path === 'purge'：范围覆盖全部 AI 楼层，将执行硬清空，保留两级确认。
  const confirmed = await dialogStore.confirm({
    title: "Xóa tất cả dữ liệu cục bộ",
    message:
      "Phạm vi xóa hiện tại bao phủ toàn bộ tầng AI, sẽ xóa sạch cứng toàn bộ trạng thái CSDL cục bộ của cuộc trò chuyện hiện tại:\n" +
      "· Xóa dữ liệu cục bộ của mọi định danh cô lập (không chỉ định danh hiện tại);\n" +
      "· Gồm cả các trường trên tin nhắn đầu tiên của người dùng;\n" +
      "· Xóa scope mẫu cấp cuộc trò chuyện và container guide (lựa chọn mẫu quay về kế thừa toàn cục);\n" +
      "· Không giữ điểm neo init, khi điền bảng lại sheetKey sẽ được cấp phát lại;\n" +
      "· Kết quả tương đương phiên hoàn toàn mới, không thể khôi phục.\n" +
      "Nếu chỉ muốn xóa một số tầng, hãy đặt phạm vi tầng bắt đầu/kết thúc ở phía trên trước.\n" +
      "Mẫu toàn cục, prompt và nội dung chat không bị ảnh hưởng. Xác nhận tiếp tục?",
    confirmLabel: "Xóa tất cả dữ liệu cục bộ",
    confirmVariant: "danger",
  });
  if (!confirmed) return;
  if (!(await dialogStore.confirm({
    title: "Xác nhận xóa lần nữa",
    message: "Xác nhận lại: đưa cuộc trò chuyện hiện tại về trạng thái hoàn toàn mới chưa từng điền bảng? Thao tác này không thể hoàn tác.",
    confirmLabel: "Xác nhận xóa sạch cứng",
    confirmVariant: "danger",
  }))) return;
  if (runtimeDiagnostic.busy.value) return;
  void flow.deleteLocalData("all");
}

async function onCleanupLegacyIsolationProfiles(): Promise<void> {
  if (runtimeDiagnostic.busy.value) return;
  const codes = flow.legacyIsolationCodes.value;
  const codeText = codes.length > 0 ? `：${codes.join("、")}` : "";
  const confirmed = await dialogStore.confirm({
    title: "Dọn nhãn cô lập cũ toàn cục",
    message:
      `Sẽ dọn toàn bộ ${codes.length} nhãn cô lập cũ${codeText}.\n` +
      "· Nếu có định danh đang kích hoạt, sẽ chuyển về dữ liệu mặc định;\n" +
      "· Xóa cài đặt toàn cục và mẫu bảng tương ứng với các nhãn này;\n" +
      "· Không xóa nội dung chat, cũng không ghi lại dữ liệu bảng lịch sử đã lưu trong từng cuộc trò chuyện;\n" +
      "· Nếu xóa một nhãn thất bại, bản đăng ký sẽ được giữ để thử lại.\n" +
      "Thao tác này không thể khôi phục. Xác nhận tiếp tục?",
    confirmLabel: "Dọn nhãn cô lập cũ",
    confirmVariant: "danger",
  });
  if (!confirmed) return;
  if (runtimeDiagnostic.busy.value) return;
  await flow.cleanupLegacyIsolationProfiles();
}


async function onCommitMixedStorageDecision(action: MixedStorageCommitAction_ACU): Promise<void> {
  if (runtimeDiagnostic.busy.value) return;
  const isMerge = action === 'commit_merge_candidate';
  const confirmed = await dialogStore.confirm({
    title: isMerge ? 'Nộp ứng viên gộp lưu trữ hỗn hợp' : 'Giữ dữ liệu V2 và dọn legacy',
    message: isMerge
      ? 'Chỉ nộp ứng viên gộp đã được đóng băng phía máy chủ và qua kiểm toán. Trang sẽ không nộp bất kỳ dữ liệu bảng có thể chỉnh sửa nào. Xác nhận tiếp tục?'
      : 'Sẽ giữ dữ liệu V2 đã xác minh và dọn dữ liệu legacy-v1 dư thừa. Xác nhận tiếp tục?',
    confirmLabel: isMerge ? 'Tiếp tục nộp ứng viên' : 'Giữ V2',
    confirmVariant: 'danger',
  });
  if (!confirmed) return;
  if (isMerge) {
    const secondConfirmed = await dialogStore.confirm({
      title: 'Xác nhận lại ứng viên gộp',
      message: 'Nội dung ứng viên lấy quyết định đã đóng băng phía máy chủ làm chuẩn; sau khi nộp sẽ không dùng dữ liệu legacy ghi đè V2. Xác nhận nộp?',
      confirmLabel: 'Xác nhận nộp ứng viên',
      confirmVariant: 'danger',
    });
    if (!secondConfirmed) return;
  }
  if (runtimeDiagnostic.busy.value) return;
  void flow.commitMixedStorageDecision(action);
}

type V2RecoveryCommitMode = 'checkpoint' | 'orphan-data-replace' | 'compat-fixation';

async function onCommitV2Recovery(mode: V2RecoveryCommitMode): Promise<void> {
  if (runtimeDiagnostic.busy.value) return;
  const isOrphan = mode === 'orphan-data-replace';
  const isCompatFixation = mode === 'compat-fixation';
  const compatRequiresIdentityConfirmation = isCompatFixation && !!flow.v2RecoverySummary.value?.requiresConfirmation;
  const confirmed = await dialogStore.confirm({
    title: isOrphan
      ? 'Xác nhận khôi phục data_replace không điểm neo'
      : isCompatFixation
        ? 'Cố định phát lại tương thích thành gốc chuyển tiếp'
        : 'Áp dụng sửa chữa V2 Checkpoint',
    message: isOrphan
      ? 'Chỉ nộp ứng viên data_replace không điểm neo đã được đóng băng phía máy chủ. frame gốc sẽ được giữ làm bản sao lưu cô lập, trang sẽ không nộp bất kỳ dữ liệu bảng có thể chỉnh sửa nào. Xác nhận tiếp tục?'
      : isCompatFixation
        ? 'Sẽ ghi kết quả đọc của phát lại tương thích khoan dung hiện tại thành gốc chuyển tiếp có thể phát lại nghiêm ngặt (ghi trong tagData của tin nhắn, không ghi lại bất kỳ storage frame nào). Sau khi cố định, việc ghi và bắt kịp trở lại bình thường; lịch sử gốc vẫn được giữ đầy đủ. Xác nhận tiếp tục?'
        : 'Chỉ nộp ứng viên sửa chữa Checkpoint đã được đóng băng phía máy chủ và qua kiểm toán. frame gốc sẽ được giữ làm bản sao lưu cô lập. Xác nhận tiếp tục?',
    confirmLabel: isOrphan ? 'Tiếp tục khôi phục' : isCompatFixation ? 'Cố định' : 'Áp dụng sửa chữa',
    confirmVariant: 'danger',
  });
  if (!confirmed) return;
  if (isOrphan) {
    const secondConfirmed = await dialogStore.confirm({
      title: 'Xác nhận lại khôi phục không điểm neo',
      message: 'data_replace không điểm neo sẽ được nâng thành full checkpoint mới. Nội dung khôi phục hoàn toàn lấy ứng viên đã đóng băng phía máy chủ làm chuẩn. Xác nhận nộp?',
      confirmLabel: 'Xác nhận nộp khôi phục',
      confirmVariant: 'danger',
    });
    if (!secondConfirmed) return;
  }
  if (compatRequiresIdentityConfirmation) {
    const secondConfirmed = await dialogStore.confirm({
      title: 'Xác nhận lại việc gộp định danh sheetKey',
      message: 'Kết quả phát lại tương thích đã gộp các bảng cùng tên nhưng khác key theo mức ưu tiên key: khi trùng row_id, hàng bị ghi đè sẽ bị bỏ vĩnh viễn, cột không chuyển đổi định danh. Sau khi cố định, kết quả gộp này trở thành căn cứ định danh của lịch sử bền vững. Xác nhận nộp?',
      confirmLabel: 'Xác nhận gộp và cố định',
      confirmVariant: 'danger',
    });
    if (!secondConfirmed) return;
  }
  if (runtimeDiagnostic.busy.value) return;
  void flow.commitV2Recovery({
    confirmOrphanDataReplace: isOrphan,
    confirmCompatTolerantFixation: compatRequiresIdentityConfirmation,
  });
}

async function onReloadSqliteRuntime(): Promise<void> {
  if (runtimeDiagnostic.busy.value || flow.busyAction.value) return;
  const confirmed = await dialogStore.confirm({
    title: "Khởi tạo lại runtime SQLite của cuộc trò chuyện hiện tại",
    message:
      "Việc này chỉ dựng lại CSDL SQLite trong bộ nhớ của cuộc trò chuyện hiện tại, không sửa nội dung chat, Checkpoint, mẫu hay Sổ thế giới. Xác nhận tiếp tục?",
    confirmLabel: "Khởi tạo lại runtime",
    confirmVariant: "primary",
  });
  if (!confirmed) return;
  if (runtimeDiagnostic.busy.value || flow.busyAction.value) return;
  await runtimeDiagnostic.reload();
}

async function onResetAllDefaults(): Promise<void> {
  if (runtimeDiagnostic.busy.value) return;
  const selected = await dialogStore.selectMany<ResetDefaultsCleanupKey>({
    title: "Khôi phục cấu hình mặc định",
    message:
      "Chọn các mục cần khôi phục hoặc dọn lần này. Mặc định chọn tất cả; bỏ chọn một mục thì nội dung tương ứng được giữ lại. Quy trình này không xóa nội dung chat, dữ liệu tầng cục bộ, cấu hình API hay thư viện preset toàn cục.",
    options: resetDefaultsCleanupOptions,
    confirmLabel: "Khôi phục theo mục đã chọn",
    confirmVariant: "danger",
    requireNonEmpty: true,
  });
  if (!selected) return;
  if (runtimeDiagnostic.busy.value) return;

  const selectedSet = new Set(selected);
  const cleanup: ResetDefaultsCleanupOptions = {
    restoreTemplateAndPrompts: selectedSet.has("restore-template-prompts"),
    clearTemplateSnapshots: selectedSet.has("clear-template-snapshots"),
    clearPlotSnapshots: selectedSet.has("clear-plot-snapshots"),
    clearTableLocks: selectedSet.has("clear-table-locks"),
    clearTableOrder: selectedSet.has("clear-table-order"),
  };
  void flow.resetAllDefaults(cleanup);
}

function refreshAll(): void {
  flow.refresh();
  runtimeDiagnostic.refresh();
  historyExpanded.value = false;
}

onMounted(refreshAll);
watch(useChatChangedTick(), refreshAll);
</script>

<style scoped>
.acu-v2-data-mgmt-page {
  min-height: 100%;
  min-width: 0;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.acu-v2-data-mgmt-page__panel-stack {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.acu-v2-data-mgmt-page__form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.acu-v2-data-mgmt-page__form-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.acu-v2-data-mgmt-page__meta {
  margin: 0;
  color: var(--acu-text-3);
  font-size: var(--acu-font-size-body, 12px);
  line-height: 1.55;
}

.acu-v2-data-mgmt-page__cleanup-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.acu-v2-data-mgmt-page__sheet-filter {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--acu-border);
  border-radius: var(--acu-radius-md, 8px);
  background: var(--acu-bg-1);
}

.acu-v2-data-mgmt-page__sheet-filter-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.acu-v2-data-mgmt-page__sheet-filter-title {
  color: var(--acu-text-2);
  font-size: var(--acu-font-size-body, 12px);
  font-weight: 600;
}

.acu-v2-data-mgmt-page__sheet-filter-clear {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--acu-accent);
  font: inherit;
  font-size: var(--acu-font-size-body, 12px);
  cursor: pointer;
}

.acu-v2-data-mgmt-page__sheet-filter-clear:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.acu-v2-data-mgmt-page__sheet-filter-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 6px 12px;
}

.acu-v2-data-mgmt-page__cleanup-section
  + .acu-v2-data-mgmt-page__cleanup-section {
  margin-top: 4px;
  padding-top: 14px;
  border-top: 1px solid var(--acu-border);
}

.acu-v2-data-mgmt-page__section-title {
  margin: 0;
  color: var(--acu-text-1);
  font-size: var(--acu-font-size-body-lg, 13px);
  font-weight: 600;
  line-height: 1.35;
}

.acu-v2-data-mgmt-page__history {
  border: 1px solid var(--acu-border);
  border-radius: var(--acu-radius-sm);
  background: color-mix(in srgb, var(--acu-bg-2) 72%, transparent);
}

.acu-v2-data-mgmt-page__history :deep(.acu-disclosure-group__header) {
  border-radius: var(--acu-radius-sm);
}

.acu-v2-data-mgmt-page__history-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.acu-v2-data-mgmt-page__history-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}

.acu-v2-data-mgmt-page__history-fill {
  width: 100%;
  min-width: 0;
  justify-content: flex-start;
}

.acu-v2-data-mgmt-page__history-code {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--acu-font-mono, Consolas, Menlo, monospace);
}

.acu-v2-data-mgmt-page__history-current {
  flex-shrink: 0;
  color: var(--acu-text-3);
  font-size: var(--acu-font-size-caption, 11px);
}

.acu-v2-data-mgmt-page__history-empty {
  margin: 0;
  color: var(--acu-text-3);
  font-size: var(--acu-font-size-caption, 11px);
  line-height: 1.5;
}

.acu-v2-data-mgmt-page__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.acu-v2-data-mgmt-page__actions,
.acu-v2-data-mgmt-page__command-grid {
  padding-top: 12px;
  margin-top: 4px;
}

.acu-v2-data-mgmt-page__command-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.acu-v2-data-mgmt-page__command-grid--cleanup {
  margin-top: 12px;
}

.acu-v2-data-mgmt-page__checkpoint-section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--acu-border, rgba(255, 255, 255, 0.12));
}

.acu-v2-data-mgmt-page__runtime-health {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin: 12px 0 0;
}

.acu-v2-data-mgmt-page__runtime-health > div {
  min-width: 0;
  padding: 8px;
  border: 1px solid var(--acu-border);
  border-radius: var(--acu-radius-sm);
  background: color-mix(in srgb, var(--acu-bg-2) 72%, transparent);
}

.acu-v2-data-mgmt-page__runtime-health dt {
  color: var(--acu-text-3);
  font-size: var(--acu-font-size-caption, 11px);
}

.acu-v2-data-mgmt-page__runtime-health dd {
  margin: 4px 0 0;
  overflow-wrap: anywhere;
  color: var(--acu-text-1);
  font-family: var(--acu-font-mono, Consolas, Menlo, monospace);
}

.acu-v2-data-mgmt-page__checkpoint-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}

.acu-v2-data-mgmt-page__checkpoint-actions :deep(.acu-file-button),
.acu-v2-data-mgmt-page__checkpoint-actions :deep(.acu-btn) { width: 100%; min-width: 0; }

.acu-v2-data-mgmt-page__command-grid :deep(.acu-file-button),
.acu-v2-data-mgmt-page__command-grid :deep(.acu-btn) {
  width: 100%;
  min-width: 0;
}

@media (max-width: 860px) {
  .acu-v2-data-mgmt-page {
    padding: 14px;
  }

  .acu-v2-data-mgmt-page__form-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 560px) {
  .acu-v2-data-mgmt-page__command-grid {
    grid-template-columns: 1fr;
  }
  .acu-v2-data-mgmt-page__checkpoint-actions {
    grid-template-columns: 1fr;
  }
  .acu-v2-data-mgmt-page__runtime-health {
    grid-template-columns: 1fr;
  }
}
</style>
