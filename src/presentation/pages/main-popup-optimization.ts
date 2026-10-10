// main-popup-optimization.ts
// Optimization标签页（正文替换）HTML生成

import { SCRIPT_ID_PREFIX_ACU } from '../../shared/constants';

/**
 * 生成 Optimization 标签页的 HTML 片段
 */
export function generateOptimizationTabHTML(): string {
    return `
                <!-- 正文替换Tab -->
                <div id="acu-tab-optimization">
                    <div class="acu-card">
                        <div class="acu-card-header">
                            <div>
                                <h3>Cài đặt thay thế nội dung</h3>
                                <p class="notes">Sau khi AI tạo nội dung, tự động thay thế nội dung (thực hiện trước khi điền bảng)</p>
                            </div>
                            <div class="acu-row" style="gap: 8px;">
                                <label for="${SCRIPT_ID_PREFIX_ACU}-optimization-enabled" style="font-weight: 500; cursor: pointer;">Bật chức năng</label>
                                <label class="toggle-switch">
                                    <input id="${SCRIPT_ID_PREFIX_ACU}-optimization-enabled" type="checkbox" />
                                    <span class="slider"></span>
                                </label>
                            </div>
                        </div>

                        <!-- 基础设置 -->
                        <div class="acu-section">
                            <h4 class="acu-section-title"><i class="fa-solid fa-cog"></i> Cài đặt cơ bản</h4>
                            <div class="acu-grid-auto">
                                <div>
                                    <label class="acu-label" for="${SCRIPT_ID_PREFIX_ACU}-optimization-api-preset">Preset API</label>
                                    <select id="${SCRIPT_ID_PREFIX_ACU}-optimization-api-preset" class="text_pole">
                                        <option value="">Dùng cấu hình API hiện tại</option>
                                    </select>
                                    <small class="notes">Chọn cấu hình API dùng cho thay thế nội dung, để trống thì dùng API hiện tại của SillyTavern</small>
                                </div>
                                <div>
                                    <label class="acu-label" for="${SCRIPT_ID_PREFIX_ACU}-optimization-min-length">Độ dài tối ưu tối thiểu</label>
                                    <input id="${SCRIPT_ID_PREFIX_ACU}-optimization-min-length" type="number" class="text_pole" min="0" step="10" value="100">
                                    <small class="notes">Bỏ qua tối ưu khi độ dài nội dung nhỏ hơn giá trị này</small>
                                </div>
                                <div>
                                    <label class="acu-label" for="${SCRIPT_ID_PREFIX_ACU}-optimization-max-items">Số mục tối ưu tối đa</label>
                                    <input id="${SCRIPT_ID_PREFIX_ACU}-optimization-max-items" type="number" class="text_pole" min="1" max="100" step="1" value="10">
                                    <small class="notes">Số mục sửa tối đa trong một lần tối ưu (1-100)</small>
                                </div>
                                <div>
                                    <label class="acu-label" for="${SCRIPT_ID_PREFIX_ACU}-optimization-loop-count">Số lần tối ưu lặp</label>
                                    <input id="${SCRIPT_ID_PREFIX_ACU}-optimization-loop-count" type="number" class="text_pole" min="1" max="10" step="1" value="1">
                                    <small class="notes">Tối ưu lại sau khi hoàn tất để đạt hiệu quả tối ưu đầy đủ (1-10 lần)</small>
                                </div>
                                <div>
                                    <label class="acu-label" for="${SCRIPT_ID_PREFIX_ACU}-optimization-retry-count">Số lần tự động thử lại</label>
                                    <input id="${SCRIPT_ID_PREFIX_ACU}-optimization-retry-count" type="number" class="text_pole" min="1" max="10" step="1" value="3">
                                    <small class="notes">Tự động thử lại khi gọi API thất bại (1-10 lần, mặc định 3 lần)</small>
                                </div>
                            </div>
                        </div>

                        <!-- 优化模式 -->
                        <div class="acu-section">
                            <h4 class="acu-section-title"><i class="fa-solid fa-magic"></i> Chế độ tối ưu</h4>
                            <div class="acu-col">
                                <div class="checkbox-group">
                                    <input type="checkbox" id="${SCRIPT_ID_PREFIX_ACU}-optimization-seamless-mode" checked>
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-optimization-seamless-mode">Chế độ thay thế không cảm nhận</label>
                                </div>
                                <div class="checkbox-group">
                                    <input type="checkbox" id="${SCRIPT_ID_PREFIX_ACU}-optimization-auto-apply" checked>
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-optimization-auto-apply">Tự động áp dụng kết quả tối ưu</label>
                                </div>
                                <div class="checkbox-group">
                                    <input type="checkbox" id="${SCRIPT_ID_PREFIX_ACU}-optimization-show-diff" checked>
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-optimization-show-diff">Hiển thị so sánh tối ưu</label>
                                </div>
                                <div class="checkbox-group">
                                    <input type="checkbox" id="${SCRIPT_ID_PREFIX_ACU}-optimization-parallel-mode">
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-optimization-parallel-mode">Chạy song song điền bảng và thay thế nội dung</label>
                                </div>
                                <div class="acu-divider-dashed" style="margin: 8px 0;"></div>
                                <label class="acu-label">Thao tác nhanh</label>
                                <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                                    <button id="${SCRIPT_ID_PREFIX_ACU}-optimization-reoptimize-latest" title="Với phản hồi AI gần nhất đã được thay thế nội dung, tối ưu lại dựa trên nguyên văn trước khi thay và thay thế lần nữa" style="white-space: nowrap;">
                                        <i class="fa-solid fa-rotate-right"></i> Tối ưu lại
                                    </button>
                                </div>
                                <small class="notes">Xác định "phản hồi AI gần nhất đã được thay thế nội dung", dùng nguyên văn giữ lại trước khi thay để tối ưu lại rồi thay thế lần nữa. Để hủy tối ưu nội dung, hãy dùng nút "Hủy tối ưu" trong hộp thông báo đang chạy.</small>
                            </div>
                        </div>

                        <!-- 标签筛选 -->
                        <div class="acu-section">
                            <h4 class="acu-section-title"><i class="fa-solid fa-filter"></i> Lọc thẻ</h4>
                            <div class="acu-grid-auto" style="grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));">
                                <div>
                                    <label class="acu-label" for="${SCRIPT_ID_PREFIX_ACU}-optimization-extract-tags">Trích xuất thẻ</label>
                                    <input id="${SCRIPT_ID_PREFIX_ACU}-optimization-extract-tags" type="text" class="text_pole" placeholder="Ví dụ: think,plot">
                                    <small class="notes">Chỉ trích xuất nội dung trong thẻ chỉ định để tối ưu</small>
                                </div>
                                <div>
                                    <label class="acu-label">Quy tắc trích xuất thẻ nội dung</label>
                                    <div id="${SCRIPT_ID_PREFIX_ACU}-optimization-extract-rules"></div>
                                    <button type="button" id="${SCRIPT_ID_PREFIX_ACU}-optimization-extract-add-rule" class="button">Thêm quy tắc</button>
                                    <small class="notes">Mỗi quy tắc điền từ bắt đầu và từ kết thúc, chỉ trích xuất nhóm nội dung khớp cuối cùng</small>
                                </div>
                                <div>
                                    <label class="acu-label">Quy tắc loại trừ thẻ</label>
                                    <div id="${SCRIPT_ID_PREFIX_ACU}-optimization-exclude-rules"></div>
                                    <button type="button" id="${SCRIPT_ID_PREFIX_ACU}-optimization-exclude-add-rule" class="button">Thêm quy tắc</button>
                                    <small class="notes">Mỗi quy tắc điền từ bắt đầu và từ kết thúc, chỉ loại bỏ nhóm nội dung khớp cuối cùng</small>
                                </div>
                            </div>
                        </div>

                        <!-- 预设管理 -->
                        <div class="acu-section">
                            <h4 class="acu-section-title"><i class="fa-solid fa-bookmark"></i> Quản lý preset</h4>
                            <div>
                                <label class="acu-label" for="${SCRIPT_ID_PREFIX_ACU}-optimization-preset-select">Chọn preset</label>
                                <div class="acu-row-wrap" style="margin-top: 4px;">
                                    <select id="${SCRIPT_ID_PREFIX_ACU}-optimization-preset-select" class="text_pole" style="flex: 1; min-width: 160px;">
                                        <option value="">-- Chọn một preset --</option>
                                    </select>
                                    <button id="${SCRIPT_ID_PREFIX_ACU}-optimization-save-preset" class="acu-btn-icon" title="Ghi đè lưu preset hiện tại"><i class="fa-solid fa-save"></i></button>
                                    <button id="${SCRIPT_ID_PREFIX_ACU}-optimization-save-as-new-preset" class="acu-btn-icon" title="Lưu thành preset mới"><i class="fa-solid fa-file-export"></i></button>
                                    <button id="${SCRIPT_ID_PREFIX_ACU}-optimization-import-presets" class="acu-btn-icon" title="Nhập preset"><i class="fa-solid fa-upload"></i></button>
                                    <button id="${SCRIPT_ID_PREFIX_ACU}-optimization-export-presets" class="acu-btn-icon" title="Xuất preset hiện tại"><i class="fa-solid fa-download"></i></button>
                                    <button id="${SCRIPT_ID_PREFIX_ACU}-optimization-reset-defaults" class="acu-btn-icon" title="Khôi phục prompt mặc định" style="color: var(--acu-warning);"><i class="fa-solid fa-undo"></i></button>
                                    <button id="${SCRIPT_ID_PREFIX_ACU}-optimization-delete-preset" class="acu-btn-icon" title="Xóa preset đang chọn" style="display: none; color: var(--acu-danger);"><i class="fa-solid fa-trash-alt"></i></button>
                                    <input type="file" id="${SCRIPT_ID_PREFIX_ACU}-optimization-preset-file-input" style="display: none;" accept=".json">
                                </div>
                                <small class="notes">Chọn preset để áp dụng cài đặt nhóm prompt, hoặc lưu cấu hình hiện tại thành preset mới</small>
                            </div>
                        </div>

                        <!-- 优化提示词 -->
                        <div class="acu-section">
                            <h4 class="acu-section-title"><i class="fa-solid fa-edit"></i> Prompt tối ưu</h4>
                            <div class="acu-info-panel">
                                <small class="notes">
                                    <strong>Giải thích placeholder:</strong><br>
                                    <code>$CONTENT</code> - nội dung cần tối ưu<br>
                                    <code>$1</code> - nội dung sổ thế giới &nbsp; <code>$5</code> - bảng kỷ yếu/dàn ý &nbsp; <code>$6</code> - quy hoạch lượt trước<br>
                                    <code>$7</code> - ngữ cảnh phía trước &nbsp; <code>$8</code> - nội dung người dùng nhập lượt này<br>
                                    <code>$U</code> - thiết lập người dùng &nbsp; <code>$C</code> - mô tả nhân vật<br>
                                    <strong>Định dạng đầu ra:</strong> AI cần trả về chỉ thị tối ưu dạng JSON, chứa mảng optimizations
                                </small>
                            </div>
                            <div id="${SCRIPT_ID_PREFIX_ACU}-optimization-prompt-constructor-area">
                                <div class="button-group" style="margin-bottom: 10px; justify-content: center;"><button class="${SCRIPT_ID_PREFIX_ACU}-optimization-add-prompt-segment-btn" data-position="top" title="Thêm lượt hội thoại ở trên">+</button></div>
                                <div id="${SCRIPT_ID_PREFIX_ACU}-optimization-prompt-segments-container"></div>
                                <div class="button-group" style="margin-top: 10px; justify-content: center;"><button class="${SCRIPT_ID_PREFIX_ACU}-optimization-add-prompt-segment-btn" data-position="bottom" title="Thêm lượt hội thoại ở dưới">+</button></div>
                            </div>
                            <div class="button-group">
                                <button id="${SCRIPT_ID_PREFIX_ACU}-optimization-save-prompt-group" class="primary">Lưu nhóm prompt</button>
                                <button id="${SCRIPT_ID_PREFIX_ACU}-optimization-reset-prompt-group">Khôi phục nhóm prompt mặc định</button>
                            </div>
                        </div>

                        <!-- 手动测试 -->
                        <div class="acu-section">
                            <h4 class="acu-section-title"><i class="fa-solid fa-flask"></i> Thử thủ công</h4>
                            <div>
                                <label class="acu-label" for="${SCRIPT_ID_PREFIX_ACU}-optimization-test-input">Văn bản thử</label>
                                <textarea id="${SCRIPT_ID_PREFIX_ACU}-optimization-test-input" class="text_pole" rows="5" placeholder="Nhập văn bản cần tối ưu để thử..."></textarea>
                            </div>
                            <div class="button-group">
                                <button id="${SCRIPT_ID_PREFIX_ACU}-optimization-test-btn" class="primary">Chạy thử tối ưu</button>
                            </div>
                            <div id="${SCRIPT_ID_PREFIX_ACU}-optimization-test-result" style="display: none; margin-top: 12px;">
                                <label class="acu-label">Kết quả tối ưu</label>
                                <div id="${SCRIPT_ID_PREFIX_ACU}-optimization-test-output" class="acu-result-panel"></div>
                            </div>
                        </div>
                    </div>
                </div>`;
}
