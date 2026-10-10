<template>
  <section class="acu-v2-continuation-page">
    <AcuPanel title="Phiên Agent" description="Dùng như trò chuyện với coding agent: nhập bất cứ lúc nào, ngắt bất cứ lúc nào. Agent chính giao Agent phụ khi cần và quản lý dàn ý, nội dung cuối cùng vẫn do mô hình SillyTavern tạo.">
      <ContinuationChat
        :task="runtime.task.value"
        :entries="session.entries.value"
        :running="session.running.value"
        :draft="messageDraft"
        :sending="messageSending"
        :status-text="runtime.statusText.value"
        :stage-text="stageText"
        :completed-turns="runtime.activeStage.value?.completedTurns ?? 0"
        :total-turns="runtime.activeRevision.value?.outline.totalTurns ?? 0"
        :revision-text="runtime.activeStage.value ? `revision ${runtime.activeStage.value.activeRevision}` : ''"
        :deadline-text="deadlineText"
        :awaiting-host="runtime.isAwaitingHostResult.value"
        @send="sendMessage"
        @update:draft="messageDraft = $event"
        @stop="runtime.stopTask"
      />
    </AcuPanel>

    <AcuPanel v-if="runtime.task.value && runtime.task.value.status === 'awaiting_outline_review' && runtime.activeRevision.value" title="Dàn ý chờ xác nhận" description="Trước khi xác nhận, tầng miền sẽ chạy lại kiểm tra Schema nghiêm ngặt và revision; trang không ghi trực tiếp vào mảng chat.">
      <AcuTextarea :model-value="outlineDraft" :rows="16" @update:model-value="outlineDraft = $event" />
      <p v-if="outlineDraftError" class="acu-v2-continuation-page__error">{{ outlineDraftError }}</p>
      <div class="acu-v2-continuation-page__actions">
        <AcuButton variant="primary" :loading="runtime.busy.value" @click="acceptOutlineDraft">Xác nhận dàn ý và tiếp tục</AcuButton>
      </div>
    </AcuPanel>

    <!-- 会话独占整宽，资料与设置并列在其下：会话是主操作面，资料与设置是查阅面。 -->
    <AcuPanelGrid class="acu-v2-continuation-page__layout">
      <AcuPanel title="Tài liệu hiện có" description="Dàn ý giai đoạn và tài liệu cục bộ đều có thể sửa và lưu trực tiếp; xóa sạch một chạm chỉ bỏ tác vụ, bản ghi phiên và tài liệu cục bộ, không động tới nội dung tiểu thuyết.">
        <ContinuationMaterialsPanel
          ref="materialsPanel"
          :task="runtime.task.value"
          :active-stage="runtime.activeStage.value"
          :active-revision="runtime.activeRevision.value"
          :busy="runtime.busy.value"
          @save-outline="saveOutline"
          @clear="clearData"
        />
      </AcuPanel>

      <AcuPanel v-if="settingsDraft" title="Cài đặt viết tiếp" description="Tự động lưu sau khi sửa; có thể sửa cả khi tác vụ đang chạy, thay đổi sẽ được ghi xuống ở khoảng nghỉ của lượt này và có hiệu lực từ lượt sau. Mục thường dùng hiển thị sẵn, các tham số còn lại gập theo chủ đề, giá trị mặc định đã đáp ứng đa số tình huống.">
        <div class="acu-v2-continuation-page__settings-grid">
          <AcuFormRow label="Dùng gọi công cụ" hint="Khi bật, cả quyết định và bàn giao đều hoàn tất qua gọi hàm; một số kênh không hỗ trợ trường tools sẽ báo lỗi. Có hiệu lực toàn cục, không lưu theo hội thoại.">
            <AcuToggle :model-value="runtime.nativeToolEnabled.value" aria-label="Dùng gọi công cụ" @update:model-value="runtime.setNativeToolEnabled($event)" />
          </AcuFormRow>
          <AcuFormRow label="Quy mô giai đoạn" hint="Một giai đoạn lên kế hoạch bao nhiêu lượt nội dung; càng nhiều lượt thì cốt truyện một dàn ý bao phủ càng dài.">
            <select v-model="settingsDraft.stageSize">
              <option value="short">Ngắn (3–5)</option>
              <option value="standard">Chuẩn (6–10)</option>
              <option value="long">Dài (11–20)</option>
              <option value="custom">Tùy chỉnh</option>
            </select>
          </AcuFormRow>
          <AcuFormRow label="Số tập của tổng cương truyện" hint="Tổng cương truyện dự kiến chia thành bao nhiêu tập để đẩy, ảnh hưởng tới việc hoạch định nhịp tổng thể của Agent phụ tổng cương.">
            <select v-model="settingsDraft.storyArcVolumePlan">
              <option value="short">Tuyến ngắn (7–8 tập)</option>
              <option value="medium">Tuyến vừa (10–14 tập)</option>
              <option value="long">Tuyến dài (20 tập)</option>
              <option value="custom">Tùy chỉnh</option>
            </select>
          </AcuFormRow>
          <AcuFormRow v-if="settingsDraft.storyArcVolumePlan === 'custom'" label="Số tập tổng cương tùy chỉnh" hint="Số nguyên từ 1–50.">
            <AcuInput v-model="settingsDraft.customStoryArcVolumeCount" type="number" :min="1" :max="50" />
          </AcuFormRow>
          <AcuFormRow v-if="settingsDraft.stageSize === 'custom'" label="Số lượt tối thiểu" hint="Số nguyên từ 1–50 và không được lớn hơn số lượt tối đa.">
            <AcuInput v-model="settingsDraft.customTurnMin" type="number" :min="1" :max="50" />
          </AcuFormRow>
          <AcuFormRow v-if="settingsDraft.stageSize === 'custom'" label="Số lượt tối đa" hint="Số nguyên từ 1–50.">
            <AcuInput v-model="settingsDraft.customTurnMax" type="number" :min="1" :max="50" />
          </AcuFormRow>
          <AcuFormRow label="Preset API (mặc định toàn cục)" hint="Tất cả Agent mặc định dùng preset này; khi cần chỉ định riêng cho một Agent, hãy mở «Kênh từng Agent» bên dưới. Agent cần công cụ phải dùng kết nối loại Chat Completion: API tùy chỉnh, preset kết nối SillyTavern Chat Completion hoặc kết nối chính Chat Completion đều được; kết nối Text Completion không trả về được lệnh gọi công cụ.">
            <AcuSelect
              :options="continuationApiPresetOptions"
              :model-value="continuationApiPresetValue"
              :placeholder="followActiveApiLabel"
              @update:model-value="applyContinuationApiPreset"
            />
          </AcuFormRow>
          <AcuFormRow label="Tổng thời lượng (phút)" hint="Đến giờ sẽ tự động dừng tác vụ, 0 là không giới hạn.">
            <AcuInput v-model="settingsDraft.totalDurationMinutes" type="number" :min="0" />
          </AcuFormRow>
        </div>
        <div class="acu-v2-continuation-page__toggles">
          <AcuCheckbox v-model="settingsDraft.outlinePreview" label="Xem trước dàn ý rồi mới thực thi" />
          <AcuCheckbox v-model="settingsDraft.finalReview.enabled" label="Bật duyệt cuối Sổ thế giới trước khi gửi" />
          <AcuCheckbox v-model="settingsDraft.webResearch.enabled" label="Bật tra cứu bách khoa mở đầu (khuyến nghị cho đồng nhân)" />
        </div>

        <div class="acu-v2-continuation-page__groups">
          <AcuDisclosureGroup
            class="acu-v2-continuation-page__group"
            :label="continuationCopy.workflow.title"
            :meta="workflowGroupMeta"
            :expanded="isGroupExpanded('workflow')"
            body-id="acu-continuation-group-workflow"
            @toggle="toggleGroup('workflow')"
          >
            <p class="acu-v2-continuation-page__meta">{{ continuationCopy.workflow.description }}</p>
            <div class="acu-v2-continuation-page__settings-grid">
              <AcuFormRow label="Giới hạn trả lại ở duyệt cuối" hint="Số lần instruction-composer sửa tăng dần theo danh sách phản hồi. Phạm vi 1–10.">
                <AcuInput v-model="settingsDraft.workflow.reviseLimit" type="number" :min="1" :max="10" />
              </AcuFormRow>
            </div>
          </AcuDisclosureGroup>
          <AcuDisclosureGroup
            class="acu-v2-continuation-page__group"
            label="Chạy và thử lại"
            :meta="runGroupMeta"
            :expanded="isGroupExpanded('run')"
            body-id="acu-continuation-group-run"
            @toggle="toggleGroup('run')"
          >
            <div class="acu-v2-continuation-page__settings-grid">
              <AcuFormRow label="Giới hạn giai đoạn tự động" hint="Sau khi tự động đẩy liên tiếp bao nhiêu giai đoạn thì tạm dừng, chờ bạn xác nhận.">
                <AcuInput v-model="settingsDraft.maxAutomaticStages" type="number" :min="1" />
              </AcuFormRow>
              <AcuFormRow label="Số lần thử lại nội dung" hint="Số lần thử lại tối đa khi SillyTavern tạo thất bại hoặc bị coi là bị cắt.">
                <AcuInput v-model="settingsDraft.generationRetryLimit" type="number" :min="0" />
              </AcuFormRow>
              <AcuFormRow label="Số token tối thiểu của nội dung" hint="Nội dung SillyTavern tạo ra thấp hơn giá trị này được coi là bị cắt hoặc lỗi và tự động thử lại, 0 là không kiểm tra.">
                <AcuInput v-model="settingsDraft.minGenerationTokens" type="number" :min="0" />
              </AcuFormRow>
              <AcuFormRow label="Số lần thử lại AI nội bộ" hint="Số lần thử lại khi chính Agent gọi API thất bại.">
                <AcuInput v-model="settingsDraft.internalAiRetryLimit" type="number" :min="0" />
              </AcuFormRow>
              <AcuFormRow label="Độ trễ giữa các lượt (giây)" hint="Chờ bao lâu sau khi mỗi lượt nội dung xong rồi mới bắt đầu lượt tiếp theo.">
                <AcuInput v-model="settingsDraft.loopDelaySeconds" type="number" :min="0" />
              </AcuFormRow>
              <AcuFormRow label="Độ trễ thử lại (giây)" hint="Chờ bao lâu sau khi thất bại rồi mới thử lại; gặp giới hạn tốc độ 429 có thể tăng lên.">
                <AcuInput v-model="settingsDraft.retryDelaySeconds" type="number" :min="0" />
              </AcuFormRow>
              <AcuFormRow label="Giới hạn lượt áp lực cao liên tiếp" hint="Tích lũy xuyên giai đoạn bao nhiêu lượt không có lượt thường nhật/dư chấn thì bắt buộc sắp xếp một lượt, 0 là không yêu cầu. Độ chặt lỏng của từng giai đoạn do dàn ý tự chọn kiểu nhịp quyết định, ở đây chỉ chặn tình huống cực đoan.">
                <AcuInput v-model="settingsDraft.maxConsecutivePressureTurns" type="number" :min="0" :max="maxConsecutivePressureTurnsMax" />
              </AcuFormRow>
              <AcuFormRow label="Thẻ vòng lặp" hint="Phân cách bằng dấu phẩy; nội dung thiếu bất kỳ thẻ nào sẽ bị coi là tạo thất bại và thử lại. Để trống thì không kiểm tra.">
                <AcuInput v-model="settingsDraft.loopTags" type="text" />
              </AcuFormRow>
            </div>
          </AcuDisclosureGroup>

          <AcuDisclosureGroup
            class="acu-v2-continuation-page__group"
            label="Đọc nội dung và ngữ cảnh"
            :meta="contextGroupMeta"
            :expanded="isGroupExpanded('context')"
            body-id="acu-continuation-group-context"
            @toggle="toggleGroup('context')"
          >
            <div class="acu-v2-continuation-page__settings-grid">
              <AcuFormRow label="Số tầng cửa sổ nội dung có thể đọc" hint="Chỉ chừng này tầng AI gần nhất mới được Agent đọc/tìm kiếm, cốt truyện sớm hơn truy ngược qua kỷ yếu; 0 là không mở đọc nội dung.">
                <AcuInput v-model="settingsDraft.storyWindowFloors" type="number" :min="0" />
              </AcuFormRow>
              <AcuFormRow label="Số tầng cuối mục lục có toàn văn" hint="Vài tầng gần nhất được chèn toàn văn làm điểm neo nối tiếp, các tầng còn lại trong cửa sổ chỉ vào mục lục và tra cứu khi cần.">
                <AcuInput v-model="settingsDraft.storyTailFloors" type="number" :min="0" />
              </AcuFormRow>
              <AcuFormRow label="Ngưỡng tự động tóm tắt phiên (token)" hint="Tính theo toàn bộ ngữ cảnh Agent chính thực sự đọc (gồm prompt, kết quả công cụ và báo cáo Agent phụ); vượt ngưỡng sẽ cô đọng các lượt sớm nhất thành báo cáo bàn giao trước khi lượt tiếp theo bắt đầu; 0 là không tóm tắt.">
                <AcuInput v-model="settingsDraft.agentHistoryTokenBudget" type="number" :min="0" />
              </AcuFormRow>
              <AcuFormRow label="Giới hạn đọc mỗi lô" hint="Một lô công cụ read/search được chèn tối đa bao nhiêu token; vượt quá thì trả lại cả lô. Các lô khác nhau không cộng dồn; nhập số nguyên dương hoặc phần trăm dạng 20% (quy đổi theo ngưỡng tóm tắt).">
                <AcuInput v-model="settingsDraft.agentReadTokenBudget" type="text" />
              </AcuFormRow>
              <AcuFormRow label="Hạn mức đọc kỹ khi sắp tóm tắt (token)" hint="Khi ngữ cảnh sắp kích hoạt tóm tắt, chỉ các lần đọc một lô không vượt quá kích thước này mới được cho qua; mặc định 6000.">
                <AcuInput v-model="settingsDraft.agentReadFallbackTokens" type="number" :min="1" />
              </AcuFormRow>
            </div>
          </AcuDisclosureGroup>

          <AcuDisclosureGroup
            class="acu-v2-continuation-page__group"
            label="Ngân sách chạy của Agent"
            :meta="budgetGroupMeta"
            :expanded="isGroupExpanded('budget')"
            body-id="acu-continuation-group-budget"
            @toggle="toggleGroup('budget')"
          >
            <div class="acu-v2-continuation-page__settings-grid">
              <AcuFormRow label="Giới hạn vòng lặp của Agent chính" hint="Số lần ra quyết định tối đa trong một lần lên kế hoạch (giao việc/sửa dàn ý/bàn giao mỗi loại tính một lần; lô công cụ read/search không tính). Phạm vi 1–30.">
                <AcuInput v-model="settingsDraft.agentRunBudget.maxIterations" type="number" :min="1" :max="30" />
              </AcuFormRow>
              <AcuFormRow label="Giới hạn tổng số lần giao việc" hint="Số tác vụ Agent phụ được giao tối đa trong một lần lên kế hoạch, 0 là cấm giao việc. Phạm vi 0–20.">
                <AcuInput v-model="settingsDraft.agentRunBudget.maxDelegations" type="number" :min="0" :max="20" />
              </AcuFormRow>
              <AcuFormRow label="Giới hạn giao việc mỗi Agent" hint="Cùng một Agent phụ được giao tối đa bao nhiêu lần trong một lần lên kế hoạch. Phạm vi 1–10.">
                <AcuInput v-model="settingsDraft.agentRunBudget.maxSameAgent" type="number" :min="1" :max="10" />
              </AcuFormRow>
              <AcuFormRow label="Giới hạn giao việc đồng thời" hint="Số Agent phụ chạy đồng thời tối đa trong cùng một đợt; giảm xuống khi API giới hạn tốc độ nghiêm ngặt. Phạm vi 1–6.">
                <AcuInput v-model="settingsDraft.agentRunBudget.maxConcurrent" type="number" :min="1" :max="6" />
              </AcuFormRow>
              <AcuFormRow label="Giới hạn lô đọc" hint="Số lô công cụ read/search tối đa của Agent chính trong một lần lên kế hoạch, 0 là cấm đọc. Phạm vi 0–30.">
                <AcuInput v-model="settingsDraft.agentRunBudget.maxReads" type="number" :min="0" :max="30" />
              </AcuFormRow>
              <AcuFormRow label="Giới hạn vòng công cụ của Agent phụ" hint="Ngoài vòng đầu, Agent phụ còn được phép thêm mấy vòng đọc bổ sung read/search, 0 là chỉ dựa vào phần chèn cố định và hạt giống giao việc. Phạm vi 0–10.">
                <AcuInput v-model="settingsDraft.agentRunBudget.maxExtraReads" type="number" :min="0" :max="10" />
              </AcuFormRow>
            </div>
          </AcuDisclosureGroup>

          <AcuDisclosureGroup
            class="acu-v2-continuation-page__group"
            label="Duyệt cuối trước khi gửi"
            :meta="finalReviewGroupMeta"
            :expanded="isGroupExpanded('finalReview')"
            body-id="acu-continuation-group-final-review"
            @toggle="toggleGroup('finalReview')"
          >
            <div class="acu-v2-continuation-page__settings-grid">
              <AcuFormRow label="Giới hạn đọc mỗi lô của duyệt cuối" hint="Mỗi lô công cụ read/search của duyệt cuối được chèn tối đa bao nhiêu token; vượt quá thì trả lại cả lô. Nhập số nguyên dương hoặc phần trăm dạng 20% (quy đổi theo ngưỡng tóm tắt).">
                <AcuInput v-model="settingsDraft.finalReview.readTokenBudget" type="text" />
              </AcuFormRow>
              <AcuFormRow label="Số vòng đọc bổ sung của duyệt cuối" hint="Số lần được phép thêm read/search ngoài vòng đầu của duyệt cuối, 0 là chỉ dùng chứng cứ cố định. Phạm vi 0–10.">
                <AcuInput v-model="settingsDraft.finalReview.maxExtraReads" type="number" :min="0" :max="10" />
              </AcuFormRow>
            </div>
            <p class="acu-v2-continuation-page__meta">Duyệt cuối mặc định tắt; khi bật sẽ gọi thêm final-reviewer, xem mục lục Sổ thế giới và bản xem trước các mục khớp, rồi search/read kỹ các mục theo nhu cầu thực tế. Nó dùng giới hạn đọc mỗi lô và vòng công cụ riêng, không chiếm hạn mức đọc của Agent chính. Khi tắt, sẽ không lắp ráp chứng cứ duyệt cuối, không đọc thêm Sổ thế giới và cũng không phát lệnh gọi duyệt cuối.</p>
          </AcuDisclosureGroup>

          <AcuDisclosureGroup
            class="acu-v2-continuation-page__group"
            label="Tra cứu web"
            :meta="webResearchGroupMeta"
            :expanded="isGroupExpanded('webResearch')"
            body-id="acu-continuation-group-web-research"
            @toggle="toggleGroup('webResearch')"
          >
            <p class="acu-v2-continuation-page__meta">Khi bật, trước lần lên kế hoạch đầu tiên của tác vụ mới sẽ tự động giao web-researcher tra rõ nhân vật, tổ chức, năng lực và thiết lập của tác phẩm gốc từ các bách khoa đã tích, ghi theo từng thực thể vào «Kho tư liệu bách khoa» (bảng tài liệu → Tư liệu bách khoa); về sau Agent chính cũng có thể giao lại khi cần. Mọi truy cập ra ngoài chỉ do Agent phụ này thực hiện: Wikipedia và Moegirl kết nối trực tiếp từ trình duyệt, Baidu và việc thu thập trang web được chuyển tiếp qua máy chủ SillyTavern cùng nguồn.</p>
            <div class="acu-v2-continuation-page__toggles">
              <AcuCheckbox v-model="settingsDraft.webResearch.sources.moegirl" label="Moegirl" />
              <AcuCheckbox v-model="settingsDraft.webResearch.sources.wikipediaZh" label="Wikipedia tiếng Trung" />
              <AcuCheckbox v-model="settingsDraft.webResearch.sources.wikipediaEn" label="Wikipedia tiếng Anh" />
              <AcuCheckbox v-model="settingsDraft.webResearch.sources.baidu" label="Baidu Baike (qua SillyTavern chuyển tiếp)" />
            </div>
            <div class="acu-v2-continuation-page__settings-grid">
              <AcuFormRow label="Công cụ tìm kiếm" hint="Tìm kiếm dự phòng khi bách khoa không tra được. DuckDuckGo không cần key; Serper / Tavily dùng key đã cấu hình trong «Khóa API» của SillyTavern; SearXNG cần nhập địa chỉ instance.">
                <AcuSelect v-model="settingsDraft.webResearch.searchProvider" :options="webSearchProviderOptions" />
              </AcuFormRow>
              <AcuFormRow v-if="settingsDraft.webResearch.searchProvider === 'searxng'" label="Địa chỉ instance SearXNG" hint="Dạng như https://searx.example.org">
                <AcuInput v-model="settingsDraft.webResearch.searxngBaseUrl" type="text" />
              </AcuFormRow>
              <AcuFormRow label="Giới hạn vòng công cụ mỗi lần" hint="Số vòng tìm kiếm/thu thập/tra cứu cục bộ tối đa trong một lần giao việc cho web-researcher. Phạm vi 1–20.">
                <AcuInput v-model="settingsDraft.webResearch.maxToolRounds" type="number" :min="1" :max="20" />
              </AcuFormRow>
              <AcuFormRow label="Giới hạn số trang thu thập mỗi lần" hint="Số trang bên ngoài được đọc tối đa trong một lần tra cứu. Nội dung trang chỉ dùng trong ngữ cảnh lần đó của Agent phụ tra cứu, không ghi vào chat. Phạm vi 1–30.">
                <AcuInput v-model="settingsDraft.webResearch.maxPages" type="number" :min="1" :max="30" />
              </AcuFormRow>
              <AcuFormRow label="Giới hạn số ký tự đọc mỗi trang" hint="Giới hạn nội dung một trang mà Agent phụ tra cứu được đọc khi tổng hợp tư liệu; nội dung không được lưu. Phạm vi 500–20000.">
                <AcuInput v-model="settingsDraft.webResearch.pageCharLimit" type="number" :min="500" :max="20000" />
              </AcuFormRow>
              <AcuFormRow label="Danh sách đen tên miền" hint="Các tên miền web_read không được thu thập, phân cách bằng dấu phẩy hoặc xuống dòng; mạng nội bộ và chính SillyTavern luôn bị chặn.">
                <AcuTextarea v-model="settingsDraft.webResearch.blockedDomains" :rows="3" />
              </AcuFormRow>
            </div>
          </AcuDisclosureGroup>

          <AcuDisclosureGroup
            class="acu-v2-continuation-page__group"
            label="Kênh từng Agent"
            :meta="channelGroupMeta"
            :expanded="isGroupExpanded('channels')"
            body-id="acu-continuation-group-channels"
            @toggle="toggleGroup('channels')"
          >
            <p class="acu-v2-continuation-page__meta">Gán preset API khác nhau cho từng Agent: ví dụ Agent chính dùng mô hình mạnh, Agent phụ rà soát dùng mô hình rẻ và nhanh. «Theo mặc định toàn cục» nghĩa là dùng preset API ở trên.</p>
            <div class="acu-v2-continuation-page__settings-grid">
              <AcuFormRow v-for="channel in agentChannelRoles" :key="channel.role" :label="channel.label">
                <AcuSelect
                  :options="agentChannelOptions"
                  :model-value="agentChannelValue(channel.role)"
                  @update:model-value="value => applyAgentChannel(channel.role, value)"
                />
              </AcuFormRow>
            </div>
          </AcuDisclosureGroup>

          <AcuDisclosureGroup
            class="acu-v2-continuation-page__group"
            label="Quy tắc trích xuất và loại trừ ngữ cảnh"
            :meta="rulesGroupMeta"
            :expanded="isGroupExpanded('rules')"
            body-id="acu-continuation-group-rules"
            @toggle="toggleGroup('rules')"
          >
            <p class="acu-v2-continuation-page__meta">Quy tắc trích xuất chỉ giữ nội dung nằm giữa các dấu «bắt đầu–kết thúc» khớp trong nội dung; quy tắc loại trừ thì loại bỏ các đoạn khớp. Khi cả hai đều trống thì dùng toàn bộ nội dung.</p>
            <AcuRulePairList v-model="settingsDraft.contextExtractRules" label="Quy tắc trích xuất ngữ cảnh" />
            <AcuRulePairList v-model="settingsDraft.contextExcludeRules" label="Quy tắc loại trừ ngữ cảnh" />
          </AcuDisclosureGroup>
        </div>

        <p v-if="settingsError" class="acu-v2-continuation-page__error">{{ settingsError }}</p>
        <p v-if="settingsNotice" class="acu-v2-continuation-page__meta">{{ settingsNotice }}</p>
      </AcuPanel>
    </AcuPanelGrid>

    <AcuPanel v-if="settingsDraft" title="Prompt giả Role" description="Chỉ các đoạn được bật mới tham gia lệnh gọi nội bộ; placeholder được phân giải theo nhu cầu khi thực sự xuất hiện. Tự động lưu sau khi sửa.">
      <div class="acu-v2-continuation-page__actions acu-v2-continuation-page__actions--start">
        <AcuButton @click="exportPrompts">Xuất JSON prompt</AcuButton>
        <AcuButton @click="promptImportInput?.click()">Nhập JSON prompt</AcuButton>
        <input ref="promptImportInput" type="file" accept=".json,application/json" class="acu-v2-continuation-page__file-input" @change="onImportPromptsFile" />
      </div>
      <p v-if="promptIoError" class="acu-v2-continuation-page__error">{{ promptIoError }}</p>
      <p v-if="promptIoNotice" class="acu-v2-continuation-page__meta">{{ promptIoNotice }}</p>

      <div class="acu-v2-continuation-page__groups">
        <AcuDisclosureGroup
          v-for="group in promptGroups"
          :key="group.key"
          class="acu-v2-continuation-page__group"
          :label="group.title"
          :meta="promptGroupMeta(group.key)"
          :expanded="isGroupExpanded(`prompt:${group.key}`)"
          :body-id="`acu-continuation-prompt-${group.key}`"
          @toggle="toggleGroup(`prompt:${group.key}`)"
        >
          <AcuPromptSegments
            :segments="promptDisplay(group.key)"
            :role-options="continuationRoleOptions"
            :show-slot="false"
            :show-enabled="true"
            :allow-move="true"
            @add="position => addPrompt(group.key, position)"
            @delete="index => deletePrompt(group.key, index)"
            @move="(index, delta) => movePrompt(group.key, index, delta)"
            @update="(index, patch) => updatePrompt(group.key, index, patch)"
          />
          <div class="acu-v2-continuation-page__actions"><AcuButton @click="restorePrompt(group.kind)">{{ group.restoreLabel }}</AcuButton></div>
          <p v-if="group.note" class="acu-v2-continuation-page__meta">{{ group.note }}</p>
        </AcuDisclosureGroup>

        <AcuDisclosureGroup
          class="acu-v2-continuation-page__group"
          label="Tra nhanh placeholder"
          meta="Tham khảo"
          :expanded="isGroupExpanded('prompt:reference')"
          body-id="acu-continuation-prompt-reference"
          @toggle="toggleGroup('prompt:reference')"
        >
          <h4 class="acu-v2-continuation-page__subheading">Agent phụ dàn ý</h4>
          <p class="acu-v2-continuation-page__meta">Placeholder dùng được trong dàn ý: $USER_REQUIREMENTS (yêu cầu tích lũy của người dùng), $ORIGIN_INSTRUCTION (nguyên văn yêu cầu ban đầu khi tạo tác vụ, prompt tùy chỉnh vẫn dùng được), $1, $STORY_OVERVIEW (tổng quan sự kiện: toàn bộ tổng quan bảng kỷ yếu + kỷ yếu mở ra qua mã AM truy hồi), $STORY_TAIL (toàn văn các tầng cuối), $STAGE_HISTORY, $COMPLETED_STAGE_PART, $REPLAN_INSTRUCTION, $TURN_RANGE, $REMAINING_TURNS, $STORY_ARC (tổng cương truyện), $STAGE_WORD_BUDGET (dung lượng số chữ của giai đoạn này), $PACING_CONTEXT (trạng thái nhịp xuyên giai đoạn: kiểu của giai đoạn trước và số lượt áp lực cao liên tiếp), $VALIDATION_ERRORS.</p>
          <h4 class="acu-v2-continuation-page__subheading">Agent chính</h4>
          <p class="acu-v2-continuation-page__meta">$HISTORY_ANCHOR đánh dấu vị trí chèn bản ghi phiên của chính Agent chính (đầu vào người dùng, đầu ra các vòng lặp trước của nó, kết quả công cụ được đưa lại và tài liệu đã tra cứu), bản thân đoạn này không được gửi; xóa nó thì bản ghi phiên sẽ lùi về đầu chuỗi. Chèn nội dung ba lớp: $STORY_OVERVIEW (tổng quan sự kiện: toàn bộ tổng quan bảng kỷ yếu, kỷ yếu tương ứng được mở ra qua mã AM truy hồi), $STORY_TAIL (toàn văn các tầng cuối), $STORY_CATALOG (chỉ mục thuần của tầng: số tầng, số chữ, trích đoạn đầu, địa chỉ đọc). Placeholder mục lục và trạng thái: $OUTLINE_STATE (trạng thái một dòng của dàn ý), $WORLDBOOK_CATALOG (mục lục Sổ thế giới đã bật, kèm ước lượng token), $WORLDBOOK_HITS (gợi ý các mục Sổ thế giới khớp ngữ cảnh lượt này), $AGENT_READ_CATALOG (bảng từ vựng địa chỉ read/search). Các placeholder khả dụng khác: $USER_REQUIREMENTS (các yêu cầu người dùng đã nêu tích lũy cho tác vụ), $USER_INTENT (nguyên văn yêu cầu ban đầu khi tạo tác vụ, prompt tùy chỉnh vẫn dùng được), $CURRENT_TURN_GOAL, $CURRENT_TURN_PACING (nhịp và ràng buộc viết của lượt này), $STORY_ARC_STATE (trạng thái tổng cương), $HISTORY_UNSETTLED (toàn bộ nội dung chưa kết toán, chỉ tầng AI), $AGENT_CATALOG, $MODULE_CATALOG, $TABLE_CATALOG, $BUDGET; $OUTLINE_WINDOW, $ACTIVE_CONSTRAINTS, $TOOL_RESULTS của bản cũ vẫn dùng được trong prompt tùy chỉnh.</p>
          <h4 class="acu-v2-continuation-page__subheading">Các Agent phụ</h4>
          <p class="acu-v2-continuation-page__meta">Placeholder dùng được cho Agent phụ: $USER_REQUIREMENTS (yêu cầu tích lũy của người dùng), $AGENT_READ_MATERIALS (tài liệu phân giải từ tập đọc hạt giống giao việc), $AGENT_TASK (tác vụ giao lần này), $AGENT_WRITE_SCOPE (phạm vi ghi cố định theo trách nhiệm), $AGENT_READ_CATALOG (bảng từ vựng địa chỉ read/search), $STORY_OVERVIEW / $STORY_TAIL / $HISTORY_UNSETTLED (ngữ cảnh nội dung chèn cố định theo vai trò), $HOOKS_LEDGER / $INFO_GAP / $ACTIVE_CONSTRAINTS / $STORY_ARC / $CHRONOLOGY / $WEB_REFS (tài liệu cục bộ; $WEB_REFS chỉ cho bản xem trước gồm tên + giới thiệu một câu), $STORY_CATALOG, $TABLE_CATALOG, $WORLDBOOK_CATALOG, $WORLDBOOK_HITS (mục lục tài liệu và gợi ý khớp); Agent phụ tra cứu web còn có $WEB_TOOL_CATALOG (mô tả công cụ ra ngoài và hạn mức lần này). Khác biệt về chèn cố định: Agent chính, Agent tổng cương, hai loại Agent hoạch định, rà soát tính liên tục và duyệt cuối luôn nhận $OUTLINE_WINDOW hoặc $USER_REQUIREMENTS trong đoạn tác vụ; Agent dàn ý mặc định dùng $USER_REQUIREMENTS, đoạn tùy chỉnh vẫn dùng được $ORIGIN_INSTRUCTION; Agent bảo trì phục bút và nhận thức không còn được chèn nguyên văn yêu cầu ban đầu, chỉ nhận danh sách yêu cầu người dùng tích lũy.</p>
        </AcuDisclosureGroup>
      </div>
      <p v-if="settingsError" class="acu-v2-continuation-page__error">{{ settingsError }}</p>
    </AcuPanel>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { isAgentFormatAnswer_ACU } from '../../shared/agent-prompt-qa';
import type { ContinuationPromptKind_ACU } from '../../service/continuation/prompt-template'; // arch-ok: 仅类型导入，用于本页状态标注，编译后无运行时依赖
import type { ContinuationPromptSegment_ACU, ContinuationSettings_ACU, StageOutline_ACU } from '../../service/continuation/model'; // arch-ok: 仅类型导入，用于本页状态标注，编译后无运行时依赖
import AcuButton from '../components/_lib/AcuButton.vue';
import AcuCheckbox from '../components/_lib/AcuCheckbox.vue';
import AcuToggle from '../components/_lib/AcuToggle.vue';
import AcuDisclosureGroup from '../components/_lib/AcuDisclosureGroup.vue';
import AcuFormRow from '../components/_lib/AcuFormRow.vue';
import AcuInput from '../components/_lib/AcuInput.vue';
import AcuPanel from '../components/_lib/AcuPanel.vue';
import AcuPanelGrid from '../components/_lib/AcuPanelGrid.vue';
import AcuPromptSegments from '../components/_lib/AcuPromptSegments.vue';
import AcuRulePairList from '../components/_lib/AcuRulePairList.vue';
import AcuSelect from '../components/_lib/AcuSelect.vue';
import AcuTextarea from '../components/_lib/AcuTextarea.vue';
import ContinuationChat from '../components/ContinuationChat.vue';
import ContinuationMaterialsPanel from '../components/ContinuationMaterialsPanel.vue';
import { useApiPresetSelectOptions } from '../composables/useApiPresetSelectOptions';
import { useChatChangedTick, useChatMutationTick } from '../composables/useChatChangedListener';
import { CONTINUATION_MAX_CONSECUTIVE_PRESSURE_TURNS_MAX_UI_ACU, useContinuationRuntime } from '../composables/useContinuationRuntime';
import { useContinuationSession } from '../composables/useContinuationSession';
import { useDialogStore } from '../stores/dialog-store';
import { continuationCopy } from '../copy/continuation-copy';

const runtime = useContinuationRuntime();
const dialog = useDialogStore();
const session = useContinuationSession();
const { apiStore, followActiveApiLabel, apiPresetSelectOptions: continuationApiPresetOptions } = useApiPresetSelectOptions();
const settingsDraft = ref<ContinuationSettings_ACU | null>(null);
const outlineDraft = ref('');
const messageDraft = ref('');
const messageSending = ref(false);
const outlineDraftError = ref('');
const settingsError = ref('');
const settingsNotice = ref('');
const materialsPanel = ref<InstanceType<typeof ContinuationMaterialsPanel> | null>(null);
const clock = ref(Date.now());
let countdownTimer: ReturnType<typeof setInterval> | undefined;

const stageText = computed(() => {
  const stage = runtime.activeStage.value;
  if (!runtime.task.value) return 'Chưa tạo tác vụ';
  if (!stage) return 'Dàn ý chờ tạo';
  const turn = runtime.activeRevision.value?.outline.nodes[stage.activeNodeIndex]?.turns[stage.activeTurnIndex];
  const label = stage.agentTurnLabel;
  return label && label.revision === stage.activeRevision && label.turnId === turn?.id
    ? `Giai đoạn ${stage.stageNumber} · ${label.text}` : `Giai đoạn ${stage.stageNumber}`;
});

const deadlineText = computed(() => {
  const deadlineAt = runtime.task.value?.deadlineAt;
  if (deadlineAt === null || deadlineAt === undefined) return 'Chưa đặt';
  const remainingSeconds = Math.max(0, Math.ceil((deadlineAt - clock.value) / 1_000));
  const hours = Math.floor(remainingSeconds / 3_600);
  const minutes = Math.floor((remainingSeconds % 3_600) / 60);
  const seconds = remainingSeconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
});

const continuationApiPresetValue = computed(() => {
  if (!settingsDraft.value) return '';
  return settingsDraft.value.apiPresetMode === 'fixed'
    ? settingsDraft.value.fixedApiPresetName
    : '';
});

function applyContinuationApiPreset(value: string): void {
  if (!settingsDraft.value) return;
  const trimmed = String(value || '').trim();
  if (trimmed) {
    settingsDraft.value.apiPresetMode = 'fixed';
    settingsDraft.value.fixedApiPresetName = trimmed;
  } else {
    settingsDraft.value.apiPresetMode = 'current';
    settingsDraft.value.fixedApiPresetName = '';
  }
  // 渠道选择与填表工作台一致：选择即保存，不等防抖窗口，避免用户离开页面时选择丢失。
  saveSettingsImmediately();
}

const continuationRoleOptions = [
  { value: 'system', label: 'SYSTEM' },
  { value: 'user', label: 'USER' },
  { value: 'assistant', label: 'ASSISTANT' },
];

const maxConsecutivePressureTurnsMax = CONTINUATION_MAX_CONSECUTIVE_PRESSURE_TURNS_MAX_UI_ACU;

/** 渠道下拉里「跟随全局默认」的哨兵值：空串已被「跟随当前活动 API」占用。 */
const INHERIT_CHANNEL_VALUE = '__inherit__';

const agentChannelRoles = [
  { role: 'main', label: 'Agent chính' },
  { role: 'outline', label: 'Agent phụ dàn ý' },
  { role: 'arcArchitect', label: 'Tổng cương truyện' },
  { role: 'maintainer', label: 'Bảo trì phục bút và nhận thức' },
  { role: 'mainlinePlanner', label: 'Hoạch định đẩy tuyến chính' },
  { role: 'beatPlanner', label: 'Hoạch định phục bút và nhịp' },
  { role: 'finalReviewer', label: 'Duyệt cuối trước khi gửi' },
  { role: 'webResearcher', label: 'Tra cứu web' },
  { role: 'instructionComposer', label: 'Biên soạn chỉ dẫn viết' },
] as const;

const webSearchProviderOptions = [
  { value: 'duckduckgo', label: 'DuckDuckGo (không cần key)' },
  { value: 'serper', label: 'Serper (Google, cần SillyTavern đã cấu hình key)' },
  { value: 'tavily', label: 'Tavily (cần SillyTavern đã cấu hình key)' },
  { value: 'searxng', label: 'SearXNG (tự dựng/instance công cộng)' },
];

type AgentChannelRole = typeof agentChannelRoles[number]['role'];

/** 折叠分组的展开状态：默认全部收起，只在本次打开面板期间记忆。 */
const expandedGroups = reactive<Record<string, boolean>>({});

function isGroupExpanded(key: string): boolean {
  return expandedGroups[key] === true;
}

function toggleGroup(key: string): void {
  expandedGroups[key] = !isGroupExpanded(key);
}

/** 折叠态下的一行摘要：让用户不展开也能看到关键取值。 */
const runGroupMeta = computed(() => {
  const s = settingsDraft.value;
  if (!s) return '';
  return `Giới hạn giai đoạn ${s.maxAutomaticStages} · thử lại nội dung ${s.generationRetryLimit} lần`;
});

const contextGroupMeta = computed(() => {
  const s = settingsDraft.value;
  if (!s) return '';
  return `Cửa sổ ${s.storyWindowFloors} tầng · ngưỡng tóm tắt ${s.agentHistoryTokenBudget}`;
});

const budgetGroupMeta = computed(() => {
  const s = settingsDraft.value;
  if (!s) return '';
  return `Vòng lặp ${s.agentRunBudget.maxIterations} · giao việc ${s.agentRunBudget.maxDelegations} · đồng thời ${s.agentRunBudget.maxConcurrent}`;
});

const finalReviewGroupMeta = computed(() => (settingsDraft.value?.finalReview.enabled ? 'Đã bật' : 'Đã tắt'));

const workflowGroupMeta = computed(() => {
  const workflow = settingsDraft.value?.workflow;
  if (!workflow) return '';
  return `Duyệt cuối trả lại ${workflow.reviseLimit} lần`;
});

const webResearchGroupMeta = computed(() => {
  const web = settingsDraft.value?.webResearch;
  if (!web) return '';
  if (!web.enabled) return 'Đã tắt';
  const sources = [web.sources.moegirl && 'Moegirl', web.sources.wikipediaZh && 'Wikipedia TQ', web.sources.wikipediaEn && 'Wikipedia Anh', web.sources.baidu && 'Baidu'].filter(Boolean);
  return `Đã bật · ${sources.length ? sources.join('/') : 'Không có nguồn bách khoa'} · ${web.searchProvider}`;
});

const channelGroupMeta = computed(() => {
  const presets = settingsDraft.value?.agentApiPresets;
  if (!presets) return '';
  const customized = agentChannelRoles.filter(channel => presets[channel.role]?.mode !== 'inherit').length;
  return customized ? `${customized} chỉ định riêng` : 'Tất cả theo mặc định';
});

const rulesGroupMeta = computed(() => {
  const s = settingsDraft.value;
  if (!s) return '';
  return `Trích xuất ${s.contextExtractRules.length} · loại trừ ${s.contextExcludeRules.length}`;
});

const agentChannelOptions = computed(() => [
  { value: INHERIT_CHANNEL_VALUE, label: 'Theo mặc định toàn cục' },
  ...continuationApiPresetOptions.value,
]);

function agentChannelValue(role: AgentChannelRole): string {
  const choice = settingsDraft.value?.agentApiPresets?.[role];
  if (!choice || choice.mode === 'inherit') return INHERIT_CHANNEL_VALUE;
  return choice.mode === 'fixed' ? choice.presetName : '';
}

function applyAgentChannel(role: AgentChannelRole, value: string): void {
  if (!settingsDraft.value) return;
  const trimmed = String(value ?? '').trim();
  if (trimmed === INHERIT_CHANNEL_VALUE) {
    settingsDraft.value.agentApiPresets[role] = { mode: 'inherit', presetName: '' };
  } else if (trimmed) {
    settingsDraft.value.agentApiPresets[role] = { mode: 'fixed', presetName: trimmed };
  } else {
    settingsDraft.value.agentApiPresets[role] = { mode: 'current', presetName: '' };
  }
  saveSettingsImmediately();
}

/** 立即触发保存：先取消挂起的防抖计时器再保存，保证渠道类改动不受 800ms 窗口影响。 */
function saveSettingsImmediately(): void {
  if (settingsSaveTimer !== undefined) {
    clearTimeout(settingsSaveTimer);
    settingsSaveTimer = undefined;
  }
  void saveSettingsNow();
}

function cloneSettings(settings: ContinuationSettings_ACU): ContinuationSettings_ACU {
  return {
    ...settings,
    contextExtractRules: settings.contextExtractRules.map(rule => ({ ...rule })),
    contextExcludeRules: settings.contextExcludeRules.map(rule => ({ ...rule })),
    agentRunBudget: { ...settings.agentRunBudget },
    finalReview: { ...settings.finalReview },
    workflow: { reviseLimit: settings.workflow?.reviseLimit ?? 3 },
    webResearch: { ...settings.webResearch, sources: { ...settings.webResearch.sources } },
    agentApiPresets: {
      main: { ...settings.agentApiPresets.main },
      outline: { ...settings.agentApiPresets.outline },
      arcArchitect: { ...settings.agentApiPresets.arcArchitect },
      maintainer: { ...settings.agentApiPresets.maintainer },
      mainlinePlanner: { ...settings.agentApiPresets.mainlinePlanner },
      beatPlanner: { ...settings.agentApiPresets.beatPlanner },
      finalReviewer: { ...settings.agentApiPresets.finalReviewer },
      webResearcher: { ...settings.agentApiPresets.webResearcher },
      instructionComposer: { ...(settings.agentApiPresets.instructionComposer ?? { mode: 'inherit', presetName: '' }) },
    },
    outlinePrompt: settings.outlinePrompt.map(segment => ({ ...segment })),
    agentPrompts: {
      main: settings.agentPrompts.main.map(segment => ({ ...segment })),
      arcArchitect: settings.agentPrompts.arcArchitect.map(segment => ({ ...segment })),
      maintainer: settings.agentPrompts.maintainer.map(segment => ({ ...segment })),
      mainlinePlanner: settings.agentPrompts.mainlinePlanner.map(segment => ({ ...segment })),
      beatPlanner: settings.agentPrompts.beatPlanner.map(segment => ({ ...segment })),
      finalReviewer: settings.agentPrompts.finalReviewer.map(segment => ({ ...segment })),
      webResearcher: settings.agentPrompts.webResearcher.map(segment => ({ ...segment })),
      instructionComposer: (settings.agentPrompts.instructionComposer ?? []).map(segment => ({ ...segment })),
    },
  };
}

function syncOutlineDraft(): void {
  outlineDraft.value = runtime.activeRevision.value
    ? JSON.stringify(runtime.activeRevision.value.outline, null, 2)
    : '';
  outlineDraftError.value = '';
}

function parseOutlineDraft(): StageOutline_ACU | null {
  try {
    const parsed: unknown = JSON.parse(outlineDraft.value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Dàn ý phải là một đối tượng JSON');
    return parsed as StageOutline_ACU;
  } catch (error) {
    outlineDraftError.value = error instanceof Error ? error.message : 'Không thể phân tích JSON dàn ý';
    return null;
  }
}

async function acceptOutlineDraft(): Promise<void> {
  const outline = parseOutlineDraft();
  if (!outline) return;
  if (await runtime.acceptOutline(outline)) syncOutlineDraft();
}

/** 首次发送（即将创建任务）前的高 RPM 风险确认：5 秒倒计时结束前只能取消。 */
async function confirmFirstSendRpmWarning(): Promise<boolean> {
  return dialog.confirm({
    title: 'Vui lòng xác nhận trước khi bắt đầu viết tiếp thông minh',
    message: 'Mỗi yêu cầu của chức năng này tốn không nhiều Token, nhưng Agent sẽ liên tục phát ra rất nhiều yêu cầu, cần API hỗ trợ RPM (số yêu cầu mỗi phút) rất cao.',
    dangerMessage: 'Cấm dùng bất kỳ trạm công ích nào, trừ khi nó nói rõ cho phép coding (mô hình yêu cầu của chức năng này tương tự coding). Dùng sai quy định có thể khiến tài khoản bị khóa.',
    confirmLabel: 'Tôi đã hiểu, bắt đầu',
    cancelLabel: 'Hủy',
    confirmVariant: 'danger',
    confirmCountdownSeconds: 5,
  });
}

/** 会话发送：没有任务时创建任务，运行中会打断当前迭代并带着这句话重新开始。 */
async function sendMessage(text: string): Promise<void> {
  if (messageSending.value) return;
  // 仅在本次发送将创建新任务（首次发送）时弹确认框；取消则保留草稿不发送。
  if (!runtime.task.value && !(await confirmFirstSendRpmWarning())) return;
  if (messageSending.value) return;
  messageSending.value = true;
  try {
    const accepted = await runtime.sendAgentMessage(text);
    if (accepted && messageDraft.value.trim() === text) messageDraft.value = '';
  } finally {
    messageSending.value = false;
  }
}

/** 用户手动改写的大纲保存成功后刷新资料面板，让它读到新的 revision。 */
async function saveOutline(outline: StageOutline_ACU): Promise<void> {
  if (await runtime.saveActiveOutline(outline)) materialsPanel.value?.reload();
}

async function clearData(): Promise<void> {
  if (await runtime.clearData()) materialsPanel.value?.reload();
}

function requiredInteger(value: unknown, label: string): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(numeric)) throw new Error(`${label} phải là số nguyên`);
  return numeric;
}

/** 有上界的整数设置；空串与 NaN 会让落盘校验报「字段必须是整数」，在这里先拦成可读提示。 */
function requiredBoundedInteger(value: unknown, label: string, maximum: number): number {
  return requiredRangeInteger(value, label, 0, maximum);
}

/** 上下界俱全的整数设置，用于 Agent 运行预算等有护栏的字段。 */
function requiredRangeInteger(value: unknown, label: string, minimum: number, maximum: number): number {
  const numeric = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  if (!Number.isInteger(numeric) || numeric < minimum || numeric > maximum) throw new Error(`${label} phải là số nguyên từ ${minimum} đến ${maximum}`);
  return numeric;
}

/** 读取预算接受两种形态：正整数（固定 token 数）或 1%-100% 的百分比串（按总结阈值折算）。 */
function normalizedReadBudget(value: unknown): number | string {
  const raw = String(value ?? '').trim();
  if (!raw) throw new Error('Ngân sách đọc không được để trống');
  if (raw.endsWith('%')) {
    const percent = Number.parseFloat(raw);
    if (!Number.isFinite(percent) || percent < 1 || percent > 100) throw new Error('Phần trăm ngân sách đọc phải nằm trong khoảng 1% đến 100%');
    return `${percent}%`;
  }
  const fixed = Number(raw);
  if (!Number.isInteger(fixed) || fixed < 1) throw new Error('Giới hạn đọc phải là số nguyên dương, hoặc phần trăm dạng 20%');
  return fixed;
}

function normalizeSettingsDraft(): ContinuationSettings_ACU {
  if (!settingsDraft.value) throw new Error('Cài đặt viết tiếp chưa được tải');
  const source = settingsDraft.value;
  const customTurnMin = source.stageSize === 'custom' ? requiredInteger(source.customTurnMin, 'Số lượt tối thiểu') : null;
  const customTurnMax = source.stageSize === 'custom' ? requiredInteger(source.customTurnMax, 'Số lượt tối đa') : null;
  const customStoryArcVolumeCount = source.storyArcVolumePlan === 'custom'
    ? requiredInteger(source.customStoryArcVolumeCount, 'Số tập tổng cương tùy chỉnh')
    : null;
  if (source.stageSize === 'custom' && (customTurnMin < 1 || customTurnMax < customTurnMin || customTurnMax > 50)) {
    throw new Error('Số lượt giai đoạn tùy chỉnh phải là khoảng số nguyên tăng dần từ 1 đến 50');
  }
  if (source.storyArcVolumePlan === 'custom' && (customStoryArcVolumeCount < 1 || customStoryArcVolumeCount > 50)) {
    throw new Error('Số tập tổng cương tùy chỉnh phải là số nguyên từ 1 đến 50');
  }
  const normalized = {
    ...cloneSettings(source),
    customTurnMin,
    customTurnMax,
    customStoryArcVolumeCount,
    maxAutomaticStages: requiredInteger(source.maxAutomaticStages, 'Giới hạn giai đoạn tự động'),
    generationRetryLimit: requiredInteger(source.generationRetryLimit, 'Số lần thử lại nội dung'),
    minGenerationTokens: requiredInteger(source.minGenerationTokens, 'Số token tối thiểu của nội dung'),
    internalAiRetryLimit: requiredInteger(source.internalAiRetryLimit, 'Số lần thử lại AI nội bộ'),
    loopDelaySeconds: requiredInteger(source.loopDelaySeconds, 'Độ trễ giữa các lượt'),
    retryDelaySeconds: requiredInteger(source.retryDelaySeconds, 'Độ trễ thử lại'),
    totalDurationMinutes: requiredInteger(source.totalDurationMinutes, 'Tổng thời lượng'),
    maxConsecutivePressureTurns: requiredBoundedInteger(source.maxConsecutivePressureTurns, 'Giới hạn lượt áp lực cao liên tiếp', CONTINUATION_MAX_CONSECUTIVE_PRESSURE_TURNS_MAX_UI_ACU),
    storyWindowFloors: requiredInteger(source.storyWindowFloors, 'Số tầng cửa sổ nội dung có thể đọc'),
    storyTailFloors: requiredInteger(source.storyTailFloors, 'Số tầng cuối mục lục có toàn văn'),
    agentHistoryTokenBudget: requiredInteger(source.agentHistoryTokenBudget, 'Ngưỡng tự động tóm tắt phiên'),
    agentReadTokenBudget: normalizedReadBudget(source.agentReadTokenBudget),
    agentReadFallbackTokens: requiredInteger(source.agentReadFallbackTokens, 'Hạn mức đọc kỹ khi sắp tóm tắt'),
    finalReview: {
      enabled: source.finalReview.enabled,
      readTokenBudget: normalizedReadBudget(source.finalReview.readTokenBudget),
      maxExtraReads: requiredRangeInteger(source.finalReview.maxExtraReads, 'Số vòng đọc bổ sung của duyệt cuối', 0, 10),
    },
    workflow: {
      reviseLimit: requiredRangeInteger(source.workflow.reviseLimit, 'Giới hạn trả lại ở duyệt cuối', 1, 10),
    },
    webResearch: {
      enabled: source.webResearch.enabled,
      sources: { ...source.webResearch.sources },
      searchProvider: source.webResearch.searchProvider,
      searxngBaseUrl: String(source.webResearch.searxngBaseUrl ?? '').trim(),
      maxToolRounds: requiredRangeInteger(source.webResearch.maxToolRounds, 'Giới hạn vòng công cụ mỗi lần của tra cứu web', 1, 20),
      maxPages: requiredRangeInteger(source.webResearch.maxPages, 'Giới hạn số trang thu thập mỗi lần của tra cứu web', 1, 30),
      pageCharLimit: requiredRangeInteger(source.webResearch.pageCharLimit, 'Giới hạn số ký tự đọc mỗi trang của tra cứu web', 500, 20000),
      blockedDomains: String(source.webResearch.blockedDomains ?? ''),
    },
    agentRunBudget: {
      maxIterations: requiredRangeInteger(source.agentRunBudget.maxIterations, 'Giới hạn vòng lặp của Agent chính', 1, 30),
      maxDelegations: requiredRangeInteger(source.agentRunBudget.maxDelegations, 'Giới hạn tổng số lần giao việc', 0, 20),
      maxSameAgent: requiredRangeInteger(source.agentRunBudget.maxSameAgent, 'Giới hạn giao việc mỗi Agent', 1, 10),
      maxConcurrent: requiredRangeInteger(source.agentRunBudget.maxConcurrent, 'Giới hạn giao việc đồng thời', 1, 6),
      maxReads: requiredRangeInteger(source.agentRunBudget.maxReads, 'Giới hạn lô đọc', 0, 30),
      maxExtraReads: requiredRangeInteger(source.agentRunBudget.maxExtraReads, 'Giới hạn vòng công cụ của Agent phụ', 0, 10),
    },
  };
  if (normalized.maxAutomaticStages < 1 || normalized.generationRetryLimit < 0 || normalized.minGenerationTokens < 0 || normalized.internalAiRetryLimit < 0 || normalized.loopDelaySeconds < 0 || normalized.retryDelaySeconds < 0 || normalized.totalDurationMinutes < 0 || normalized.storyWindowFloors < 0 || normalized.storyTailFloors < 0 || normalized.agentHistoryTokenBudget < 0 || normalized.agentReadFallbackTokens < 1) {
    throw new Error('Giá trị trong cài đặt viết tiếp không được thấp hơn phạm vi cho phép');
  }
  if (normalized.webResearch.enabled && normalized.webResearch.searchProvider === 'searxng' && !normalized.webResearch.searxngBaseUrl) {
    throw new Error('Khi chọn công cụ tìm kiếm SearXNG phải nhập địa chỉ instance');
  }
  if (normalized.apiPresetMode === 'fixed') {
    const presetName = normalized.fixedApiPresetName.trim();
    if (!presetName) throw new Error('Tên preset API cố định không được để trống');
    if (!presetExists(presetName)) throw new Error(`Preset API "${presetName}" không tồn tại, vui lòng chọn lại`);
  }
  for (const channel of agentChannelRoles) {
    const choice = normalized.agentApiPresets[channel.role];
    if (choice.mode !== 'fixed') continue;
    const presetName = choice.presetName.trim();
    if (!presetName) throw new Error(`Kênh cố định của ${channel.label} phải chọn preset`);
    if (!presetExists(presetName)) throw new Error(`Preset API "${presetName}" của kênh ${channel.label} không tồn tại, vui lòng chọn lại`);
  }
  return normalized;
}

/**
 * 判断预设名是否存在于当前 API 预设列表中。
 * 保存前校验存在性，把悬挂引用（预设已被删除）从运行中途的任务失败提前到保存时报错。
 */
function presetExists(presetName: string): boolean {
  return apiStore.presets.some(preset => preset.name === presetName);
}

/** 记录最近一次从权威状态装载/保存成功的草稿快照，用于跳过无变化的自动保存并切断"保存→刷新→重建草稿"的循环。 */
let lastPersistedSettingsJson = '';
let settingsSaveTimer: ReturnType<typeof setTimeout> | undefined;

/** 设置修改后自动保存（防抖 800ms），与剧情推进/填表工作台的"改动即生效"一致。 */
function scheduleSettingsSave(): void {
  if (settingsSaveTimer !== undefined) clearTimeout(settingsSaveTimer);
  settingsSaveTimer = setTimeout(() => { void saveSettingsNow(); }, 800);
}

async function saveSettingsNow(): Promise<void> {
  if (!settingsDraft.value) return;
  if (JSON.stringify(settingsDraft.value) === lastPersistedSettingsJson) return;
  if (runtime.busy.value) {
    // 有续写操作正在执行时不抢租约，稍后重试本次保存。
    scheduleSettingsSave();
    return;
  }
  let candidate: ContinuationSettings_ACU;
  try {
    apiStore.refreshFromSettings();
    candidate = normalizeSettingsDraft();
  } catch (error) {
    settingsError.value = error instanceof Error ? error.message : 'Cài đặt viết tiếp không hợp lệ';
    return;
  }
  const outcome = await runtime.saveSettings(candidate);
  if (outcome === 'saved') {
    settingsError.value = '';
    settingsNotice.value = '';
  } else if (outcome === 'busy') {
    // Agent 正在规划，改动不能丢：告知用户并排队等空档（如等待宿主正文时）落盘。
    settingsNotice.value = 'Đã sửa cài đặt: Agent đang chạy, sẽ tự động lưu ở khoảng nghỉ của lượt này và có hiệu lực từ lượt sau.';
    scheduleSettingsSave();
  }
}

type PromptKey = 'outlinePrompt' | 'main' | 'arcArchitect' | 'maintainer' | 'mainlinePlanner' | 'beatPlanner' | 'finalReviewer' | 'webResearcher' | 'instructionComposer';

interface PromptGroupDef {
  key: PromptKey;
  kind: ContinuationPromptKind_ACU;
  title: string;
  restoreLabel: string;
  /** 只属于该组的补充说明；通用占位符收在「占位符速查」里。 */
  note?: string;
}

const promptGroups: PromptGroupDef[] = [
  { key: 'outlinePrompt', kind: 'outline', title: 'Prompt Agent phụ dàn ý (outline-architect)', restoreLabel: 'Khôi phục giá trị mặc định của prompt dàn ý' },
  { key: 'main', kind: 'agent_main', title: 'Prompt Agent chính', restoreLabel: 'Khôi phục giá trị mặc định của Agent chính', note: 'Đoạn $HISTORY_ANCHOR đánh dấu vị trí chèn bản ghi phiên, bản thân không được gửi; xóa nó thì bản ghi phiên sẽ lùi về đầu chuỗi.' },
  { key: 'arcArchitect', kind: 'agent_arc', title: 'Prompt Agent phụ tổng cương truyện (arc-architect)', restoreLabel: 'Khôi phục giá trị mặc định của Agent phụ tổng cương' },
  { key: 'maintainer', kind: 'agent_maintainer', title: 'Prompt Agent phụ bảo trì phục bút và nhận thức', restoreLabel: 'Khôi phục giá trị mặc định của Agent phụ bảo trì', note: 'Agent này không nhận mục tiêu người dùng hay dàn ý giai đoạn, tránh để kế hoạch làm nhiễm kết toán sự thật.' },
  { key: 'mainlinePlanner', kind: 'agent_mainline', title: 'Prompt Agent phụ hoạch định đẩy tuyến chính', restoreLabel: 'Khôi phục giá trị mặc định của hoạch định tuyến chính' },
  { key: 'beatPlanner', kind: 'agent_beat', title: 'Prompt Agent phụ hoạch định phục bút và nhịp', restoreLabel: 'Khôi phục giá trị mặc định của hoạch định nhịp' },
  { key: 'finalReviewer', kind: 'agent_final_reviewer', title: 'Prompt Agent phụ duyệt cuối trước khi gửi', restoreLabel: 'Khôi phục giá trị mặc định của Agent phụ duyệt cuối', note: 'Chỉ khi «Bật duyệt cuối Sổ thế giới trước khi gửi» được bật, luồng công việc cố định mới gọi nó sau instruction-composer.' },
  { key: 'instructionComposer', kind: 'agent_instruction_composer', title: continuationCopy.composer.title, restoreLabel: 'Khôi phục giá trị mặc định của biên soạn chỉ dẫn viết', note: continuationCopy.composer.note },
  { key: 'webResearcher', kind: 'agent_web_researcher', title: 'Prompt Agent phụ tra cứu web (web-researcher)', restoreLabel: 'Khôi phục giá trị mặc định của tra cứu web', note: 'Chỉ được gọi khi «Bật tra cứu bách khoa mở đầu» được bật. Placeholder riêng: $WEB_TOOL_CATALOG (mô tả công cụ ra ngoài và hạn mức lần này), $WEB_REFS (bản xem trước kho tư liệu bách khoa).' },
];

/** 折叠态摘要：启用段数 / 总段数。 */
function promptGroupMeta(key: PromptKey): string {
  const prompts = promptList(key);
  if (!prompts) return '';
  const enabled = prompts.filter(segment => segment.enabled !== false).length;
  return `${enabled}/${prompts.length} đoạn được bật`;
}

/** 取出指定提示词组的数组。大纲组在设置根层，其余 Agent 提示词在 agentPrompts 下。 */
function promptList(key: PromptKey): ContinuationPromptSegment_ACU[] | null {
  if (!settingsDraft.value) return null;
  if (key === 'outlinePrompt') return settingsDraft.value.outlinePrompt;
  return settingsDraft.value.agentPrompts[key];
}

function promptDisplay(key: PromptKey): ContinuationPromptSegment_ACU[] {
  const segments = promptList(key) ?? [];
  return key === 'outlinePrompt' ? segments : runtime.presentPromptSegments(key, segments);
}

function addPrompt(key: PromptKey, position: 'top' | 'bottom' = 'bottom'): void {
  const prompts = promptList(key);
  if (!prompts) return;
  const segment: ContinuationPromptSegment_ACU = { role: 'user', content: 'Vui lòng nhập nội dung prompt.', enabled: true, deletable: true };
  if (position === 'top') prompts.unshift(segment);
  else prompts.push(segment);
}

function deletePrompt(key: PromptKey, index: number): void {
  const prompts = promptList(key);
  if (!prompts || prompts[index]?.deletable === false || isAgentFormatAnswer_ACU(prompts[index])) return;
  prompts.splice(index, 1);
}

function movePrompt(key: PromptKey, index: number, delta: -1 | 1): void {
  const prompts = promptList(key);
  const target = index + delta;
  if (!prompts || target < 0 || target >= prompts.length) return;
  if (isAgentFormatAnswer_ACU(prompts[index]) || isAgentFormatAnswer_ACU(prompts[target])) return;
  [prompts[index], prompts[target]] = [prompts[target], prompts[index]];
}

function updatePrompt(key: PromptKey, index: number, patch: Partial<ContinuationPromptSegment_ACU>): void {
  const prompts = promptList(key);
  const current = prompts?.[index];
  if (!prompts || !current) return;
  if (isAgentFormatAnswer_ACU(current)) return;
  if (current.content.trim() === '$HISTORY_ANCHOR') return;
  if (current.content.trim() === '$RUNTIME_SNAPSHOT') {
    if (typeof patch.snapshotTemplate === 'string') prompts[index] = { ...current, snapshotTemplate: patch.snapshotTemplate };
    return;
  }
  prompts[index] = { ...current, ...patch };
}

function restorePrompt(kind: ContinuationPromptKind_ACU): void {
  if (!settingsDraft.value) return;
  settingsDraft.value = runtime.restorePromptDefault(settingsDraft.value, kind);
}

const promptImportInput = ref<HTMLInputElement | null>(null);
const promptIoError = ref('');
const promptIoNotice = ref('');

/** 导出全部提示词（大纲组 + 五组 Agent）为 JSON 文件下载。 */
function exportPrompts(): void {
  if (!settingsDraft.value) return;
  promptIoError.value = '';
  try {
    const source = cloneSettings(settingsDraft.value);
    const bundle = { version: 1, outlinePrompt: source.outlinePrompt, agentPrompts: source.agentPrompts };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'acu-continuation-prompts.json';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    promptIoNotice.value = 'Đã xuất JSON prompt.';
  } catch (error) {
    promptIoError.value = error instanceof Error ? error.message : 'Xuất prompt thất bại.';
  }
}

/** 导入提示词 JSON：逐组校验通过后整体写入草稿并立即保存，任何一组失败即整体拒绝。 */
async function onImportPromptsFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  // 允许连续选择同一个文件重复导入。
  input.value = '';
  if (!file || !settingsDraft.value) return;
  promptIoError.value = '';
  promptIoNotice.value = '';
  try {
    const bundle = runtime.parsePromptBundle(await file.text());
    settingsDraft.value.outlinePrompt = bundle.outlinePrompt;
    settingsDraft.value.agentPrompts = bundle.agentPrompts;
    saveSettingsImmediately();
    promptIoNotice.value = 'Đã nhập và lưu JSON prompt.';
  } catch (error) {
    promptIoError.value = error instanceof Error ? error.message : 'Đọc JSON prompt thất bại.';
  }
}

/** 刷新页面依赖的全部数据源：API 预设列表必须在挂载与聊天切换时重新读取，否则预设下拉是空的。 */
function refreshAll(): void {
  apiStore.refreshFromSettings();
  runtime.refresh();
  // 会话流是全局内存：切聊天必须清空并从新聊天的持久会话回灌，否则显示的是上一个聊天的记录。
  session.rehydrate();
}

/**
 * 当前聊天内楼层被删除 / swipe 后：任务游标、Agent 会话与资料快照都锚定在楼层上，
 * 存储层已随楼层回退，页面必须重读一遍，否则进度、会话流、资料仍停在删楼前。
 */
function refreshAfterChatMutation(): void {
  runtime.refresh();
  session.resyncAfterChatMutation();
  materialsPanel.value?.reload();
}

/**
 * Agent 运行中每次结算 / 立总纲 / 百科入库都会把新快照写到末楼，但那是领域层直接落盘，
 * 不经过任何 Vue 状态——面板若只在挂载与切聊天时读一次，用户看到的就一直是运行前的空库。
 * 会话流每追加一条记录就说明运行又推进了一步，按它去重读快照；运行结束再兜底刷一次。
 * 自动刷新只覆盖用户没在编辑的模块，手里的 JSON 草稿不会被冲掉。
 */
let materialsAutoRefreshTimer: ReturnType<typeof setTimeout> | undefined;
const MATERIALS_AUTO_REFRESH_DEBOUNCE_MS = 400;
function scheduleMaterialsAutoRefresh(): void {
  if (materialsAutoRefreshTimer !== undefined) clearTimeout(materialsAutoRefreshTimer);
  materialsAutoRefreshTimer = setTimeout(() => {
    materialsAutoRefreshTimer = undefined;
    materialsPanel.value?.reload({ preserveDirty: true });
  }, MATERIALS_AUTO_REFRESH_DEBOUNCE_MS);
}

onMounted(() => {
  apiStore.refreshFromSettings();
  void runtime.initialize();
  countdownTimer = setInterval(() => { clock.value = Date.now(); }, 1_000);
});
onBeforeUnmount(() => {
  if (countdownTimer !== undefined) clearInterval(countdownTimer);
  if (materialsAutoRefreshTimer !== undefined) {
    clearTimeout(materialsAutoRefreshTimer);
    materialsAutoRefreshTimer = undefined;
  }
  // 防抖窗口内离开页面时冲刷一次未落盘的改动，避免"改了像改了、重进没了"。
  if (settingsSaveTimer !== undefined) {
    clearTimeout(settingsSaveTimer);
    settingsSaveTimer = undefined;
    void saveSettingsNow();
  }
});
watch(useChatChangedTick(), refreshAll);
watch(useChatMutationTick(), refreshAfterChatMutation);
watch(() => [session.entries.value.length, session.running.value] as const, ([length, running], previous) => {
  // 条数增加 = 运行推进（可能刚写了快照）；running 由真变假 = 本轮收尾，兜底再读一次。
  if (!previous || length > previous[0] || (previous[1] && !running)) scheduleMaterialsAutoRefresh();
});
watch(runtime.settings, settings => {
  // 每次刷新信封都会产生新的 settings 引用；只有持久化内容真的变了（保存成功、切换聊天）
  // 才重建草稿。否则运行期间的每次状态刷新都会把用户尚未保存的改动悄悄冲掉。
  const persistedJson = settings ? JSON.stringify(cloneSettings(settings)) : '';
  if (persistedJson === lastPersistedSettingsJson && settingsDraft.value) return;
  settingsDraft.value = settings ? cloneSettings(settings) : null;
  lastPersistedSettingsJson = persistedJson;
}, { immediate: true });
watch(settingsDraft, () => {
  if (!settingsDraft.value) return;
  if (JSON.stringify(settingsDraft.value) === lastPersistedSettingsJson) return;
  scheduleSettingsSave();
}, { deep: true });
watch(() => `${runtime.activeStage.value?.stageId ?? ''}:${runtime.activeRevision.value?.revision ?? ''}`, syncOutlineDraft, { immediate: true });
</script>

<style scoped>
.acu-v2-continuation-page { min-height: 100%; padding: 20px; display: grid; gap: 18px; }
.acu-v2-continuation-page__layout { align-items: start; }
.acu-v2-continuation-page__actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 12px; }
.acu-v2-continuation-page__actions--start { justify-content: flex-start; margin-top: 0; margin-bottom: 12px; }
.acu-v2-continuation-page__file-input { display: none; }
.acu-v2-continuation-page__error { color: var(--acu-danger, #d65b5b); white-space: pre-wrap; }
.acu-v2-continuation-page__meta { color: var(--acu-text-3); font-size: var(--acu-font-size-body, 12px); white-space: pre-wrap; }
.acu-v2-continuation-page__settings-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: start; }
.acu-v2-continuation-page__settings-grid label { display: grid; gap: 5px; color: var(--acu-text-2); font-size: var(--acu-font-size-body, 12px); }
.acu-v2-continuation-page__settings-grid select { min-height: 30px; border: 1px solid color-mix(in srgb, var(--acu-text-3) 30%, transparent); border-radius: 4px; background: var(--acu-bg-2); color: var(--acu-text-1); }
.acu-v2-continuation-page__toggles { display: flex; flex-wrap: wrap; gap: 14px; margin: 14px 0; }
.acu-v2-continuation-page__groups { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
.acu-v2-continuation-page__group {
  border: 1px solid var(--acu-border, color-mix(in srgb, var(--acu-text-3) 18%, transparent));
  border-radius: var(--acu-radius-sm);
  background: color-mix(in srgb, var(--acu-bg-2) 72%, transparent);
}
.acu-v2-continuation-page__group :deep(.acu-disclosure-group__header) { border-radius: var(--acu-radius-sm); }
.acu-v2-continuation-page__group :deep(.acu-disclosure-group--expanded .acu-disclosure-group__header) { border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
.acu-v2-continuation-page__group :deep(.acu-disclosure-group__body) { gap: 12px; padding: 12px; }
.acu-v2-continuation-page__group :deep(.acu-disclosure-group__meta) { max-width: 55%; overflow: hidden; text-overflow: ellipsis; }
.acu-v2-continuation-page__group .acu-v2-continuation-page__actions { margin-top: 0; }
.acu-v2-continuation-page__subheading { margin: 4px 0 0; color: var(--acu-text-2); font-size: var(--acu-font-size-body, 12px); font-weight: 600; }
.acu-v2-continuation-page__subheading:first-child { margin-top: 0; }
@media (max-width: 860px) { .acu-v2-continuation-page { padding: 14px; } }
@media (max-width: 640px) {
  .acu-v2-continuation-page { padding: 10px; gap: 12px; }
  .acu-v2-continuation-page__settings-grid { grid-template-columns: 1fr; }
  .acu-v2-continuation-page__actions > * { flex: 1 1 auto; }
  .acu-v2-continuation-page__group :deep(.acu-disclosure-group__meta) { display: none; }
}
</style>
