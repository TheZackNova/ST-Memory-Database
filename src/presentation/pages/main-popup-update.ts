// main-popup-update.ts
// 更新标签页 HTML生成
// 承接原status页的更新配置 + 原prompt页的更新任务提示词

import { SCRIPT_ID_PREFIX_ACU } from '../../shared/constants';
import { DEFAULT_AUTO_UPDATE_FREQUENCY_ACU, DEFAULT_AUTO_UPDATE_THRESHOLD_ACU, DEFAULT_AUTO_UPDATE_TOKEN_THRESHOLD_ACU } from '../../shared/defaults';

/**
 * 生成更新标签页的 HTML 片段
 * 包含：基础设置、内容筛选、更新任务提示词
 */
export function generateUpdateTabHTML(): string {
    return `
                <div id="acu-tab-update" class="acu-tab-content">
                    <!-- A. 基础设置 -->
                    <div class="acu-card">
                        <h3>Cài đặt cơ bản</h3>
                        <div class="acu-grid-2x2">
                            <div>
                                <label for="${SCRIPT_ID_PREFIX_ACU}-auto-update-threshold">Số tầng ngữ cảnh AI đọc:</label>
                                <div class="input-group">
                                    <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-auto-update-threshold" min="0" step="1" placeholder="${DEFAULT_AUTO_UPDATE_THRESHOLD_ACU}">
                                </div>
                            </div>
                            <div>
                                <label for="${SCRIPT_ID_PREFIX_ACU}-auto-update-frequency">Tự động cập nhật mỗi N tầng:</label>
                                <div class="input-group">
                                    <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-auto-update-frequency" min="1" step="1" placeholder="${DEFAULT_AUTO_UPDATE_FREQUENCY_ACU}">
                                </div>
                            </div>
                            <div>
                                <label for="${SCRIPT_ID_PREFIX_ACU}-update-batch-size">Số tầng cập nhật mỗi lô:</label>
                                <div class="input-group">
                                    <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-update-batch-size" min="1" step="1" placeholder="2">
                                </div>
                            </div>
                            <div>
                                <label for="${SCRIPT_ID_PREFIX_ACU}-max-concurrent-groups">Số luồng đồng thời tối đa:</label>
                                <div class="input-group">
                                    <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-max-concurrent-groups" min="1" step="1" placeholder="1">
                                </div>
                            </div>
                            <div>
                                <label for="${SCRIPT_ID_PREFIX_ACU}-skip-update-floors">Giữ X tầng không cập nhật:</label>
                                <div class="input-group">
                                    <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-skip-update-floors" min="0" step="1" placeholder="0">
                                </div>
                            </div>
                            <div>
                                <label for="${SCRIPT_ID_PREFIX_ACU}-retain-recent-layers">Giữ dữ liệu N tầng phản hồi AI gần nhất:</label>
                                <div class="input-group">
                                    <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-retain-recent-layers" min="0" step="1" placeholder="Trống = giữ tất cả">
                                </div>
                                <div class="notes" style="margin-top:4px;font-size:11px;opacity:0.7;">Chỉ đếm theo tầng phản hồi AI; sau khi đạt cửa sổ giữ lại và qua đệm 20 tầng AI sẽ cuộn để tạo checkpoint ranh giới, rồi dọn dữ liệu cũ</div>
                            </div>
                        </div>
                    </div>

                    <!-- B. 内容筛选 -->
                    <div class="acu-card">
                        <h3>Lọc nội dung</h3>
                        <div class="acu-grid">
                            <div>
                            <label for="${SCRIPT_ID_PREFIX_ACU}-auto-update-token-threshold">Độ dài phản hồi tối thiểu để không bỏ qua cập nhật:</label>
                                <div class="input-group">
                                <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-auto-update-token-threshold" min="0" step="100" placeholder="${DEFAULT_AUTO_UPDATE_TOKEN_THRESHOLD_ACU}">
                                </div>
                                <small class="notes" style="font-size: 0.85em; color: #888;">Bỏ qua tự động điền bảng khi phản hồi AI ngắn hơn độ dài này</small>
                            </div>
                            <div>
                            <label for="${SCRIPT_ID_PREFIX_ACU}-table-max-retries">Số lần tự động thử lại điền bảng:</label>
                                <div class="input-group">
                                <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-table-max-retries" min="1" max="10" step="1" value="3">
                                </div>
                                <small class="notes" style="font-size: 0.85em; color: #888;">Số lần tự động thử lại khi lỗi hoặc phản hồi rỗng (mặc định 3 lần)</small>
                            </div>
                        </div>
                        <p class="notes">Khi tự động cập nhật, nếu Token ngữ cảnh (xấp xỉ số ký tự) thấp hơn giá trị này thì bỏ qua lần cập nhật này.</p>

                        <hr>

                        <div style="display: flex; flex-direction: column; gap: 6px;">
                            <label style="white-space: nowrap; font-size: 0.9em;">Quy tắc trích xuất thẻ nội dung:</label>
                            <div id="${SCRIPT_ID_PREFIX_ACU}-table-context-extract-rules"></div>
                            <button type="button" id="${SCRIPT_ID_PREFIX_ACU}-table-context-extract-add-rule" class="button" style="align-self: flex-start;">Thêm quy tắc</button>
                            <small class="notes">Mỗi quy tắc điền từ bắt đầu và từ kết thúc, chỉ trích xuất nhóm nội dung khớp cuối cùng (không ảnh hưởng quy tắc từ chèn).</small>
                        </div>

                        <hr>

                        <div style="display: flex; flex-direction: column; gap: 6px;">
                            <label style="white-space: nowrap; font-size: 0.9em;">Quy tắc loại trừ thẻ:</label>
                            <div id="${SCRIPT_ID_PREFIX_ACU}-table-context-exclude-rules"></div>
                            <button type="button" id="${SCRIPT_ID_PREFIX_ACU}-table-context-exclude-add-rule" class="button" style="align-self: flex-start;">Thêm quy tắc</button>
                            <small class="notes">Mỗi quy tắc điền từ bắt đầu và từ kết thúc, chỉ loại bỏ nhóm nội dung khớp cuối cùng.</small>
                        </div>

                        <hr>

                        <div class="checkbox-group">
                            <input type="checkbox" id="${SCRIPT_ID_PREFIX_ACU}-tableedit-last-pair-only-checkbox">
                            <label for="${SCRIPT_ID_PREFIX_ACU}-tableedit-last-pair-only-checkbox">Chỉ nhận diện cặp thẻ &lt;tableEdit&gt; cuối cùng (bỏ qua chuỗi suy nghĩ/bản nháp phía trước)</label>
                        </div>
                    </div>

                    <!-- C. 更新任务提示词（原prompt页） -->
                    <div class="acu-card">
                        <h3>Prompt tác vụ cập nhật</h3>
                        <p class="notes">Chỉ thị tác vụ của preset cập nhật cơ sở dữ liệu. Các prompt này được gửi cho AI mỗi lần điền bảng.</p>
                        <div id="${SCRIPT_ID_PREFIX_ACU}-prompt-constructor-area">
                            <div class="button-group" style="margin-bottom: 10px; justify-content: center;"><button class="${SCRIPT_ID_PREFIX_ACU}-add-prompt-segment-btn" data-position="top" title="Thêm lượt hội thoại ở trên">+</button></div>
                            <div id="${SCRIPT_ID_PREFIX_ACU}-prompt-segments-container">
                                <!-- Segments will be dynamically inserted here -->
                            </div>
                            <div class="button-group" style="margin-top: 10px; justify-content: center;"><button class="${SCRIPT_ID_PREFIX_ACU}-add-prompt-segment-btn" data-position="bottom" title="Thêm lượt hội thoại ở dưới">+</button></div>
                        </div>
                        <div class="button-group">
                            <button id="${SCRIPT_ID_PREFIX_ACU}-save-char-card-prompt" class="primary">Lưu</button>
                            <button id="${SCRIPT_ID_PREFIX_ACU}-load-char-card-prompt-from-json">Đọc mẫu JSON</button>
                            <button id="${SCRIPT_ID_PREFIX_ACU}-export-char-card-prompt-to-json">Xuất mẫu JSON</button>
                            <button id="${SCRIPT_ID_PREFIX_ACU}-reset-char-card-prompt">Khôi phục mặc định</button>
                        </div>
                    </div>
                </div>`;
}
