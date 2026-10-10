// main-popup-datamgmt.ts
// 数据管理标签页 HTML生成
// 承接原data页的数据隔离、删除清理、备份恢复、Medusa合并

import { SCRIPT_ID_PREFIX_ACU } from '../../shared/constants';

/**
 * 生成数据管理标签页的 HTML 片段
 * 包含：数据隔离、删除与清理、备份与恢复、纪要合并(Medusa)
 */
export function generateDataMgmtTabHTML(): string {
    return `
                <div id="acu-tab-datamgmt" class="acu-tab-content">
                    <!-- A. 数据隔离（已退役：留空即默认槽 ''，新功能禁止再按 isolationKey 真值做门禁） -->
                    <div class="acu-card">
                        <h3>Cô lập dữ liệu <span style="font-size: 0.75em; font-weight: 400; color: var(--acu-text-3);">(đã ngừng dùng)</span></h3>
                        <p class="notes">Cô lập theo nhãn đã ngừng dùng. Để trống sẽ dùng ô dữ liệu mặc định. Đừng phụ thuộc mã cô lập cho tính năng mới; mã định danh trống là ô mặc định hợp lệ, không phải "không có dữ liệu".</p>
                        <div class="setting-item" style="margin-bottom: 15px; border-bottom: 1px dashed var(--acu-border-2); padding-bottom: 15px;">
                            <div id="${SCRIPT_ID_PREFIX_ACU}-data-isolation-input-area" style="margin-top: 10px;">
                                <label for="${SCRIPT_ID_PREFIX_ACU}-data-isolation-code">Mã định danh:</label>
                                <div class="acu-data-isolation-row" style="display: flex; gap: 10px; margin-top: 5px; align-items: flex-start;">
                                    <div id="${SCRIPT_ID_PREFIX_ACU}-data-isolation-combo" style="position: relative; flex-grow: 1; display: flex; align-items: center;">
                                        <input type="text" id="${SCRIPT_ID_PREFIX_ACU}-data-isolation-code" placeholder="Nhập mã định danh (để trống thì không cô lập)" style="flex-grow: 1; padding-right: 36px;">
                                        <button type="button" id="${SCRIPT_ID_PREFIX_ACU}-data-isolation-history-toggle" title="Mã định danh trước đây" style="position: absolute; right: 6px; top: 50%; transform: translateY(-50%); border: 1px solid var(--acu-border-2); background: var(--acu-bg-1); color: var(--acu-text-1); padding: 4px 6px; border-radius: 4px; cursor: pointer; font-size: 12px; line-height: 1;">▼</button>
                                        <ul id="${SCRIPT_ID_PREFIX_ACU}-data-isolation-history-list" style="display: none; position: absolute; top: calc(100% + 6px); left: 0; right: 0; background: var(--acu-bg-0); border: 1px solid var(--acu-border-2); border-radius: 6px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18); list-style: none; margin: 0; padding: 6px 0; max-height: 220px; overflow-y: auto; z-index: 9999;"></ul>
                                    </div>
                                    <button id="${SCRIPT_ID_PREFIX_ACU}-data-isolation-save" class="primary" style="white-space: nowrap;">Lưu và áp dụng</button>
                                </div>
                                <p class="notes" style="margin-top: 5px;">Sau khi nhập mã và bấm lưu, dữ liệu cục bộ tương ứng sẽ được tải lại.</p>
                            </div>
                            <div style="margin-top: 10px; text-align: right;">
                        <button id="${SCRIPT_ID_PREFIX_ACU}-data-isolation-delete-entries" class="btn-danger" style="padding: 5px 10px; border-radius: 4px; font-size: 0.9em;">Xóa các mục đã chèn của mã định danh hiện tại</button>
                            </div>
                        </div>
                    </div>

                    <!-- B. 备份与恢复 -->
                    <div class="acu-card">
                        <h3>Sao lưu và khôi phục</h3>
                        <p class="notes">Nhập/xuất cơ sở dữ liệu của hội thoại hiện tại, hoặc quản lý mẫu toàn cục.</p>
                        <div class="button-group acu-data-mgmt-buttons">
                            <button id="${SCRIPT_ID_PREFIX_ACU}-import-combined-settings" class="primary">Nhập gộp (mẫu + chỉ thị)</button>
                            <button id="${SCRIPT_ID_PREFIX_ACU}-export-combined-settings" class="primary">Xuất gộp (mẫu + chỉ thị)</button>
                        </div>
                        <hr style="border-color: var(--acu-border-2); margin: 15px 0;">
                        <div class="button-group acu-data-mgmt-buttons">
                            <button id="${SCRIPT_ID_PREFIX_ACU}-export-json-data">Xuất dữ liệu JSON</button>
                            <button id="${SCRIPT_ID_PREFIX_ACU}-reset-all-defaults" class="btn-warning">Khôi phục mẫu và prompt mặc định</button>
                            <button id="${SCRIPT_ID_PREFIX_ACU}-override-with-template" class="btn-danger">Mẫu ghi đè dữ liệu tầng mới nhất</button>
                        </div>
                    </div>

                    <!-- C. 删除与清理 -->
                    <div class="acu-card">
                        <h3>Xóa và dọn dẹp</h3>
                        <!-- 楼层范围选择 -->
                        <div style="background: var(--acu-bg-2); padding: 12px; border-radius: 6px; margin-bottom: 10px;">
                            <h4 style="margin: 0 0 8px 0; font-size: 0.9em; color: var(--acu-text-1); font-weight: 500;">Cài đặt phạm vi xóa</h4>
                            <div class="acu-grid">
                                <div>
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-delete-start-floor" style="font-weight: 500; font-size: 0.85em;">Tầng AI bắt đầu:</label>
                                    <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-delete-start-floor" min="1" value="1" placeholder="1" style="width: 100%; padding: 4px 8px; border: 1px solid var(--acu-border-2); border-radius: 4px; background: var(--acu-control-bg, var(--acu-bg-1)); color: var(--acu-control-text, var(--acu-text-1));">
                                </div>
                                <div>
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-delete-end-floor" style="font-weight: 500; font-size: 0.85em;">Tầng AI kết thúc:</label>
                                    <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-delete-end-floor" min="1" placeholder="Để trống để xóa đến cuối" style="width: 100%; padding: 4px 8px; border: 1px solid var(--acu-border-2); border-radius: 4px; background: var(--acu-control-bg, var(--acu-bg-1)); color: var(--acu-control-text, var(--acu-text-1));">
                                </div>
                            </div>
                            <div style="margin-top: 6px; font-size: 0.8em; color: var(--acu-text-3);">
                                Mặc định chọn tất cả tầng AI, có thể đặt phạm vi để xóa chính xác (chỉ tính phản hồi AI). Phạm vi tầng áp dụng cho cả hai nút xóa; "Xóa toàn bộ dữ liệu cục bộ" chỉ xóa sạch hoàn toàn khi phạm vi bao trùm tất cả tầng AI.
                            </div>
                        </div>

                        <div class="button-group acu-data-mgmt-buttons">
                            <button id="${SCRIPT_ID_PREFIX_ACU}-delete-current-local-data" class="btn-warning">Xóa dữ liệu cục bộ của mã định danh hiện tại</button>
                            <button id="${SCRIPT_ID_PREFIX_ACU}-delete-all-local-data" class="btn-danger">Xóa toàn bộ dữ liệu cục bộ (dùng thận trọng)</button>
                        </div>
                    </div>

                    <!-- D. 交火模式索引管理 -->
                    <div class="acu-card">
                        <h3>Quản lý chỉ mục chế độ giao hỏa</h3>
                        <p class="notes">Lịch sử trò chuyện chỉ lưu manifest nhẹ; phân đoạn vector lưu ở /user/files, IndexedDB chỉ là bộ nhớ đệm tạm có thể bỏ.</p>
                        <div style="background: var(--acu-bg-2); padding: 12px; border-radius: 6px; margin-bottom: 10px;">
                            <label for="${SCRIPT_ID_PREFIX_ACU}-vector-index-mode-enabled" style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin-bottom: 6px;">
                                <input type="checkbox" id="${SCRIPT_ID_PREFIX_ACU}-vector-index-mode-enabled" style="width: 14px; height: 14px; cursor: pointer;">
                                <span style="font-weight: 600;">Bật phương án giao hỏa tăng cường vector hỗn hợp</span>
                            </label>
                            <small class="notes">Đây là lối bật/tắt chế độ giao hỏa; khi bật sẽ tự duy trì tệp chỉ mục ngoài theo việc thêm/xóa/sửa dữ liệu bảng kỷ yếu. Các nút bên dưới chỉ phụ trách làm mới trạng thái, xóa bộ nhớ đệm hoặc xóa tài nguyên chỉ mục hiện tại.</small>
                        </div>
                        <div id="${SCRIPT_ID_PREFIX_ACU}-vector-index-stats" style="background: var(--acu-bg-2); padding: 12px; border-radius: 6px; margin-bottom: 10px; font-size: 0.9em; line-height: 1.7;">
                            <div>Trạng thái: <span data-acu-vector-index-field="status">Chưa tải</span></div>
                            <div>ID chỉ mục: <span data-acu-vector-index-field="indexId">-</span></div>
                            <div>Backend: <span data-acu-vector-index-field="backend">-</span></div>
                            <div>Hàng / Khối: <span data-acu-vector-index-field="rowsChunks">0 / 0</span></div>
                            <div>Phân đoạn Base / Delta: <span data-acu-vector-index-field="shards">0 / 0</span></div>
                            <div>Tombstone hàng / khối: <span data-acu-vector-index-field="tombstones">0 / 0</span></div>
                            <div>Dung lượng snapshot ngoài hiện tại: <span data-acu-vector-index-field="externalBytes">0 B</span></div>
                            <div>Dung lượng bộ nhớ đệm tạm của chỉ mục hiện tại: <span data-acu-vector-index-field="cacheBytes">0 B</span></div>
                            <div>Hàng đợi lưu trữ chống rung: <span data-acu-vector-index-field="flushQueue">0 pending / 0 failed</span></div>
                            <div>Lỗi lưu trữ chống rung: <span data-acu-vector-index-field="flushError">-</span></div>
                            <div>Thời gian cập nhật: <span data-acu-vector-index-field="updatedAt">-</span></div>
                        </div>
                        <div class="button-group acu-data-mgmt-buttons">
                            <button id="${SCRIPT_ID_PREFIX_ACU}-vector-index-refresh">Làm mới trạng thái chỉ mục</button>
                            <button id="${SCRIPT_ID_PREFIX_ACU}-vector-index-migrate-legacy">Di chuyển không phá hủy chỉ mục cũ</button>
                            <button id="${SCRIPT_ID_PREFIX_ACU}-vector-index-clear-cache" class="btn-warning">Xóa bộ nhớ đệm tạm</button>
                            <button id="${SCRIPT_ID_PREFIX_ACU}-vector-index-delete-current" class="btn-danger">Xóa chỉ mục giao hỏa hiện tại</button>
                        </div>
                    </div>

                </div>`;
}
