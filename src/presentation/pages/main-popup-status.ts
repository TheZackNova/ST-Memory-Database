// main-popup-status.ts
// 仪表盘标签页 HTML生成
// 原status页拆分：仪表盘（本文件）+ 更新（main-popup-update.ts）

import { SCRIPT_ID_PREFIX_ACU } from '../../shared/constants';

/**
 * 生成仪表盘标签页的 HTML 片段
 * 包含：数据库状态总览、快速操作、核心功能开关、API快照
 */
export function generateDashboardTabHTML(): string {
    return `
                <div id="acu-tab-dashboard" class="acu-tab-content active">
                    <!-- A. 数据库状态 -->
                    <div class="acu-card">
                        <h3>Trạng thái cơ sở dữ liệu</h3>
                        <div class="acu-row-between" style="margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid var(--acu-border);">
                            <span id="${SCRIPT_ID_PREFIX_ACU}-total-messages-display">Tổng số tầng ngữ cảnh: N/A (chỉ tính tầng phản hồi AI)</span>
                            <span id="${SCRIPT_ID_PREFIX_ACU}-card-update-status-display">Đang lấy trạng thái...</span>
                        </div>
                        
                        <table class="acu-table">
                            <thead>
                                <tr>
                                    <th>Tên bảng</th>
                                    <th>Tần suất cập nhật</th>
                                    <th>Tầng chưa ghi</th>
                                    <th>Lần cập nhật trước</th>
                                    <th>Lần kích hoạt tiếp</th>
                                </tr>
                            </thead>
                            <tbody id="${SCRIPT_ID_PREFIX_ACU}-granular-status-table-body">
                                <tr><td colspan="5" style="text-align: center; padding: 10px;">Đang tải dữ liệu...</td></tr>
                            </tbody>
                        </table>

                        <p id="${SCRIPT_ID_PREFIX_ACU}-next-update-display" class="notes" style="border-top: 1px dashed var(--acu-border); padding-top: 10px; margin-top: 10px; text-align: right;">Lần cập nhật tiếp theo: đang tính...</p>
                    </div>

                    <!-- B. 快速操作 -->
                    <div class="acu-card">
                        <h3>Thao tác nhanh</h3>
                        <div class="acu-row" style="margin-bottom: 10px;">
                            <label style="white-space: nowrap;">Preset API điền bảng:</label>
                            <select id="${SCRIPT_ID_PREFIX_ACU}-table-api-preset-select" style="flex: 1;">
                                <option value="">Dùng cấu hình API hiện tại</option>
                            </select>
                        </div>
                        <div class="button-group" style="margin-bottom: 8px;">
                            <button id="${SCRIPT_ID_PREFIX_ACU}-manual-update-card" class="primary">Cập nhật thủ công ngay</button>
                        </div>
                        <div class="checkbox-group">
                            <input type="checkbox" id="${SCRIPT_ID_PREFIX_ACU}-manual-extra-hint-checkbox">
                            <label for="${SCRIPT_ID_PREFIX_ACU}-manual-extra-hint-checkbox">Prompt bổ sung (chỉ thêm tạm khi cập nhật thủ công)</label>
                        </div>
                        <p class="notes">Cập nhật thủ công dùng tham số UI hiện tại để cập nhật các bảng đã chọn; nếu chưa chọn thì mặc định cập nhật tất cả bảng.</p>
                    </div>

                    <!-- C. 手动更新表选择 -->
                    <div class="acu-card">
                        <h3>Chọn bảng cập nhật thủ công</h3>
                        <p class="notes" style="margin-bottom:6px;">Chọn các bảng cần cập nhật thủ công (chọn nhiều, mặc định chọn tất cả bảng mới):</p>
                        <div class="button-group" style="justify-content:flex-start; margin-bottom:8px;">
                            <button id="${SCRIPT_ID_PREFIX_ACU}-manual-table-select-all" class="button">Chọn tất cả</button>
                            <button id="${SCRIPT_ID_PREFIX_ACU}-manual-table-select-none" class="button">Bỏ chọn tất cả</button>
                        </div>
                        <div id="${SCRIPT_ID_PREFIX_ACU}-manual-table-selector" style="min-height:60px;">Đang tải danh sách bảng...</div>
                    </div>

                    <!-- D. 核心功能开关 -->
                    <div class="acu-card">
                        <h3>Công tắc chức năng cốt lõi</h3>
                        <div class="acu-col">
                            <div class="checkbox-group">
                                <input type="checkbox" id="${SCRIPT_ID_PREFIX_ACU}-auto-update-enabled-checkbox">
                                <label for="${SCRIPT_ID_PREFIX_ACU}-auto-update-enabled-checkbox">Bật tự động cập nhật</label>
                            </div>
                            <div class="checkbox-group">
                                <input type="checkbox" id="${SCRIPT_ID_PREFIX_ACU}-standardized-table-fill-enabled-checkbox">
                                <label for="${SCRIPT_ID_PREFIX_ACU}-standardized-table-fill-enabled-checkbox">Chức năng điền bảng chuẩn hóa (bảng tóm tắt và dàn ý tổng thể phải được thêm đồng bộ)</label>
                            </div>
                            <div class="checkbox-group">
                                <input type="checkbox" id="${SCRIPT_ID_PREFIX_ACU}-toast-mute-enabled-checkbox">
                                <label for="${SCRIPT_ID_PREFIX_ACU}-toast-mute-enabled-checkbox">Tắt thông báo (ngoài điền bảng/quy hoạch/nhập/báo lỗi, các thông báo khác không hiện)</label>
                            </div>
                            <div class="checkbox-group">
                                <input type="checkbox" id="${SCRIPT_ID_PREFIX_ACU}-prompt-template-enabled-checkbox">
                                <label for="${SCRIPT_ID_PREFIX_ACU}-prompt-template-enabled-checkbox">Bật chức năng mẫu có điều kiện (&lt;if&gt; kiểm tra điều kiện)</label>
                            </div>
                            <div class="checkbox-group">
                                <input type="checkbox" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-outline-entry-enabled">
                                <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-outline-entry-enabled">Chế độ chiếm 0TK</label>
                            </div>
                            <small class="notes">Chế độ chiếm 0TK vẫn tác động lên chuỗi chèn sổ thế giới, chỉ được chuyển đến đây để dễ thấy hơn.</small>

                            <div class="acu-divider-dashed" style="margin: 4px 0;"></div>
                            <label class="acu-label">Chế độ lưu trữ bảng:</label>
                            <div class="acu-row" style="gap: 16px;">
                                <label class="acu-row" style="cursor: pointer; gap: 6px;">
                                    <input type="radio" name="${SCRIPT_ID_PREFIX_ACU}-storage-mode" value="native" checked>
                                    <span>Chế độ gốc (JSON/DSL)</span>
                                </label>
                                <label class="acu-row" style="cursor: pointer; gap: 6px;">
                                    <input type="radio" name="${SCRIPT_ID_PREFIX_ACU}-storage-mode" value="sqlite">
                                    <span>Chế độ SQLite (SQL)</span>
                                </label>
                            </div>
                            <small class="notes">Chế độ gốc dùng mảng hai chiều JSON + lệnh DSL; chế độ SQLite dùng cơ sở dữ liệu trong bộ nhớ + câu lệnh SQL chuẩn. Sau khi chuyển sẽ tự động tải lại dữ liệu.</small>
                        </div>
                    </div>
                </div>`;
}
