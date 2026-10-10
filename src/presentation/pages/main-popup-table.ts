// main-popup-table.ts
// 表格标签页 HTML生成
// 聚合：表格模板预设（来自data页） + 世界书注入（来自worldbook页） + 表格工具入口

import { SCRIPT_ID_PREFIX_ACU } from '../../shared/constants';
import { DEFAULT_TEMPLATE_PRESET_OPTION_VALUE_ACU } from '../../shared/template-preset-utils';

/**
 * 生成表格标签页的 HTML 片段
 * 包含：模板预设（全局/当前聊天双作用域）、世界书注入设置、表格工具入口
 */
export function generateTableTabHTML(): string {
    return `
                <div id="acu-tab-table" class="acu-tab-content">
                    <!-- A. 表格模板预设 -->
                    <div class="acu-card">
                        <h3>Preset mẫu bảng</h3>
                        <div class="acu-template-presets" style="background: var(--acu-bg-2); padding: 12px; border-radius: 8px;">
                            <div class="acu-data-template-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; align-items: start;">
                                <div style="padding: 16px; background: var(--acu-bg-1); border-radius: 8px; border: 1px solid var(--acu-border); display: flex; flex-direction: column; gap: 12px;">
                                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
                                        <div>
                                            <div style="font-weight: 600; color: var(--acu-text-1);">Đang dùng toàn cục</div>
                                            <small id="${SCRIPT_ID_PREFIX_ACU}-template-global-scope-status" class="notes">Cuộc trò chuyện mới sẽ mặc định kế thừa mẫu bảng ở đây</small>
                                        </div>
                                        <span style="padding: 2px 8px; border-radius: 999px; background: color-mix(in srgb, var(--accent-primary) 12%, transparent); color: var(--accent-primary); font-size: 12px; font-weight: 600;">Toàn cục</span>
                                    </div>
                                    <div class="qrf_settings_block" style="margin-bottom: 0;">
                                        <label for="${SCRIPT_ID_PREFIX_ACU}-template-preset-select" style="font-weight: 500;">Preset mẫu toàn cục</label>
                                        <select id="${SCRIPT_ID_PREFIX_ACU}-template-preset-select" class="text_pole" style="width: 100%; margin-top: 5px;">
                                            <option value="${DEFAULT_TEMPLATE_PRESET_OPTION_VALUE_ACU}">Preset mặc định</option>
                                        </select>
                                    </div>
                                    <div class="acu-template-preset-toolbar" style="display: flex; flex-direction: column; gap: 10px;">
                                        <div class="acu-template-preset-left">
                                            <button id="${SCRIPT_ID_PREFIX_ACU}-import-template" class="acu-mini-btn" title="Nhập mẫu vào thư viện mẫu toàn cục và chuyển thành mẫu toàn cục hiện tại; các cuộc trò chuyện đã có preset cục bộ sẽ không bị tự động xóa.">
                                                <i class="fa-solid fa-file-import"></i><span>Nhập</span>
                                            </button>
                                            <button id="${SCRIPT_ID_PREFIX_ACU}-export-template" class="acu-mini-btn" title="Xuất mẫu toàn cục hiện tại (ưu tiên xuất preset toàn cục đang chọn)">
                                                <i class="fa-solid fa-file-export"></i><span>Xuất</span>
                                            </button>
                                            <button id="${SCRIPT_ID_PREFIX_ACU}-reset-template" class="acu-mini-btn" title="Khôi phục mẫu toàn cục mặc định; các cuộc trò chuyện chưa lưu cục bộ hoặc nhập sẽ tiếp tục theo mẫu toàn cục.">
                                                <i class="fa-solid fa-undo"></i><span>Khôi phục mặc định</span>
                                            </button>
                                        </div>
                                        <div class="acu-template-preset-actions">
                                            <button id="${SCRIPT_ID_PREFIX_ACU}-template-preset-saveas" class="acu-mini-btn" title="Lưu mẫu đang chạy thành preset toàn cục mới">
                                                <i class="fa-solid fa-copy"></i><span>Lưu thành</span>
                                            </button>
                                            <button id="${SCRIPT_ID_PREFIX_ACU}-template-preset-rename" class="acu-mini-btn" title="Đổi tên preset toàn cục đang chọn">
                                                <i class="fa-solid fa-i-cursor"></i><span>Đổi tên</span>
                                            </button>
                                            <button id="${SCRIPT_ID_PREFIX_ACU}-template-preset-delete" class="acu-mini-btn danger" title="Xóa preset toàn cục đang chọn">
                                                <i class="fa-solid fa-trash"></i><span>Xóa</span>
                                            </button>
                                        </div>
                                    </div>
                                    <small class="notes">Ở đây chỉ quản lý thư viện preset mẫu toàn cục (nhập / xuất / lưu thành / đổi tên / xóa); khi cần ghi đè lưu mẫu toàn cục, hãy dùng "Lưu vào toàn cục" ở đầu trình chỉnh sửa trực quan.</small>
                                </div>
                                <div style="padding: 16px; background: var(--acu-bg-1); border-radius: 8px; border: 1px solid var(--acu-border); display: flex; flex-direction: column; gap: 12px;">
                                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
                                        <div>
                                            <div style="font-weight: 600; color: var(--acu-text-1);">Cuộc trò chuyện hiện tại đang dùng</div>
                                            <small id="${SCRIPT_ID_PREFIX_ACU}-template-chat-scope-status" class="notes">Khi chưa lưu cấp cuộc trò chuyện, phần này sẽ theo mẫu toàn cục</small>
                                        </div>
                                        <span style="padding: 2px 8px; border-radius: 999px; background: color-mix(in srgb, var(--acu-success) 14%, transparent); color: var(--acu-success); font-size: 12px; font-weight: 600;">Trò chuyện</span>
                                    </div>
                                    <div class="qrf_settings_block" style="margin-bottom: 0;">
                                        <label for="${SCRIPT_ID_PREFIX_ACU}-template-chat-preset-select" style="font-weight: 500;">Preset mẫu cuộc trò chuyện hiện tại</label>
                                        <select id="${SCRIPT_ID_PREFIX_ACU}-template-chat-preset-select" class="text_pole" style="width: 100%; margin-top: 5px;">
                                            <option value="${DEFAULT_TEMPLATE_PRESET_OPTION_VALUE_ACU}">Preset mặc định</option>
                                        </select>
                                    </div>
                                    <div class="acu-template-preset-actions">
                                        <button id="${SCRIPT_ID_PREFIX_ACU}-template-chat-import-preset" class="acu-mini-btn" title="Nhập mẫu vào danh sách preset của cuộc trò chuyện hiện tại; preset cùng tên sẽ bị ghi đè">
                                            <i class="fa-solid fa-file-import"></i><span>Nhập vào cuộc trò chuyện hiện tại</span>
                                        </button>
                                        <button id="${SCRIPT_ID_PREFIX_ACU}-template-chat-export-preset" class="acu-mini-btn" title="Xuất preset mẫu cuộc trò chuyện hiện tại đang dùng">
                                            <i class="fa-solid fa-download"></i><span>Xuất cuộc trò chuyện hiện tại</span>
                                        </button>
                                    </div>
                                    <input type="file" id="${SCRIPT_ID_PREFIX_ACU}-template-chat-preset-file-input" style="display: none;" accept=".json">
                                    <small id="${SCRIPT_ID_PREFIX_ACU}-template-chat-origin-status" class="notes">Ở đây chỉ nhập / xuất preset mẫu của cuộc trò chuyện hiện tại; khi cần ghi đè lưu, hãy dùng "Lưu vào cuộc trò chuyện hiện tại" hoặc "Lưu vào toàn cục" trong trình chỉnh sửa trực quan.</small>
                                </div>
                            </div>
                        </div>
                        <p class="notes" style="margin-top: 10px;">Preset mẫu chia thành hai phạm vi: toàn cục và cuộc trò chuyện hiện tại. Cuộc trò chuyện mới mặc định kế thừa mẫu toàn cục, cũng có thể cấu hình riêng cho từng cuộc trò chuyện.</p>
                    </div>

                    <!-- B. 世界书注入（从原worldbook页迁入，不含0TK） -->
                    <div class="acu-card">
                        <h3>Chèn sổ thế giới</h3>
                        <p class="notes">Cấu hình mục cơ sở dữ liệu được chèn vào sổ thế giới nào, và AI dùng những sổ thế giới nào khi đọc ngữ cảnh.</p>
                        <div>
                            <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-injection-target">Đích chèn dữ liệu:</label>
                            <input type="text" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-injection-target-filter" placeholder="Lọc sổ thế giới..." style="width: 100%; margin: 6px 0 8px 0; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--acu-border-2); background: var(--acu-control-bg, var(--acu-bg-1)); color: var(--acu-control-text, var(--acu-text-1));">
                            <div class="input-group">
                                <select id="${SCRIPT_ID_PREFIX_ACU}-worldbook-injection-target" style="width: 100%;"></select>
                            </div>
                            <small class="notes">Chọn sổ thế giới mà các mục cơ sở dữ liệu (như toàn cục, nhân vật, dàn ý...) sẽ được tạo hoặc cập nhật vào.</small>
                        </div>
                        <hr>
                         <div class="qrf_settings_block_radio">
                            <label>Nguồn sổ thế giới (để AI đọc ngữ cảnh):</label>
                            <div class="qrf_radio_group">
                                <input type="radio" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-source-character" name="${SCRIPT_ID_PREFIX_ACU}-worldbook-source" value="character" checked>
                                <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-source-character">Gắn với thẻ nhân vật</label>
                                <input type="radio" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-source-manual" name="${SCRIPT_ID_PREFIX_ACU}-worldbook-source" value="manual">
                                <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-source-manual">Chọn thủ công</label>
                            </div>
                        </div>
                        <div id="${SCRIPT_ID_PREFIX_ACU}-worldbook-manual-select-block" style="display: none; margin-top: 10px;">
                            <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-select">Chọn sổ thế giới (chọn nhiều):</label>
                            <input type="text" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-select-filter" placeholder="Lọc sổ thế giới..." style="width: 100%; margin: 6px 0 8px 0; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--acu-border-2); background: var(--acu-control-bg, var(--acu-bg-1)); color: var(--acu-control-text, var(--acu-text-1));">
                            <div class="input-group">
                                <div id="${SCRIPT_ID_PREFIX_ACU}-worldbook-select" class="qrf_worldbook_list"></div>
                                <button id="${SCRIPT_ID_PREFIX_ACU}-refresh-worldbooks" title="Làm mới danh sách sổ thế giới">Làm mới</button>
                            </div>
                        </div>
                        <div style="margin-top: 15px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                                <label style="margin-bottom: 0;">Mục sổ thế giới được bật:</label>
                                <div class="button-group" style="margin: 0;">
                                    <button id="${SCRIPT_ID_PREFIX_ACU}-worldbook-select-all" class="button" style="padding: 2px 8px; font-size: 0.8em;">Chọn tất cả</button>
                                    <button id="${SCRIPT_ID_PREFIX_ACU}-worldbook-deselect-all" class="button" style="padding: 2px 8px; font-size: 0.8em;">Bỏ chọn tất cả</button>
                                </div>
                            </div>
                            <input type="text" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-entry-filter" placeholder="Lọc mục/sổ thế giới..." style="width: 100%; margin: 6px 0 8px 0; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--acu-border-2); background: var(--acu-control-bg, var(--acu-bg-1)); color: var(--acu-control-text, var(--acu-text-1));">
                            <div id="${SCRIPT_ID_PREFIX_ACU}-worldbook-entry-list" class="qrf_worldbook_entry_list">
                                <!-- 条目将动态加载于此 -->
                            </div>
                        </div>
                        <hr>
                        <div style="margin-top: 15px; padding: 12px; border: 1px solid var(--acu-border-2); border-radius: 8px; background: var(--acu-bg-2);">
                            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap;">
                                <div style="flex: 1 1 280px; min-width: 240px;">
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-summary-vector-index-mode-enabled" style="font-weight: 600; margin-bottom: 4px; display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                        <input type="checkbox" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-summary-vector-index-mode-enabled" style="width: 14px; height: 14px; cursor: pointer;">
                                        <span>Bật phương án giao hỏa tăng cường vector hỗn hợp</span>
                                    </label>
                                    <small class="notes">Khi bật, chỉ mục vector ngoài sẽ tự tích lũy theo cập nhật bảng kỷ yếu; lịch sử trò chuyện chỉ lưu manifest, phân đoạn vector ghi vào /user/files. Cấu hình Embedding, Rerank và tham số truy hồi ở bên dưới.</small>
                                </div>
                                <label id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-enabled-toggle-row" style="display: none; align-items: center; gap: 8px; margin: 0; white-space: nowrap;">
                                    <input type="checkbox" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-enabled">
                                    <span>Bật bộ nhớ vector</span>
                                </label>
                            </div>
                            <div id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-config-block" style="display: none; margin-top: 12px;">
                                <div class="acu-section" style="margin-bottom: 12px;">
                                    <div class="acu-section-title">Tham số chỉ mục kỷ yếu chế độ giao hỏa</div>
                                    <div class="acu-grid-auto">
                                        <input type="hidden" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-threshold">
                                        <input type="hidden" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-archive-trigger-count">
                                        <div class="acu-col-sm">
                                            <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-summary-index-keyword-min-rows">Ngưỡng kích hoạt giao hỏa trước khi gửi</label>
                                            <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-summary-index-keyword-min-rows" min="1" step="1" placeholder="100">
                                            <small class="notes">Khi số hàng hợp lệ của bảng kỷ yếu đạt giá trị này, trước khi gửi sẽ tạo từ khóa và truy hồi chunk cột tóm lược; nếu chưa đạt thì giữ quy trình chỉ mục tóm lược cũ.</small>
                                        </div>
                                        <div class="acu-col-sm">
                                            <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-topk">TopK ghi đè cuối cùng</label>
                                            <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-topk" min="1" step="1" placeholder="10">
                                            <small class="notes">Số kỷ yếu tối đa được chọn sau Rerank; khi ghi vào mục chỉ mục tóm lược gốc sẽ sắp xếp lại theo thứ tự gốc của bảng kỷ yếu.</small>
                                        </div>
                                        <div class="acu-col-sm">
                                            <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-min-score">Điểm tối thiểu lọc sơ bộ Embedding</label>
                                            <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-min-score" min="0" max="1" step="0.01" placeholder="0.40">
                                            <small class="notes">Trước khi gửi, dùng query embedding để lọc sơ bộ chunk kỷ yếu; Rerank chỉ xử lý các ứng viên đã qua lọc sơ bộ.</small>
                                        </div>
                                        <div class="acu-col-sm">
                                            <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-recall-candidate-limit">Giới hạn ứng viên lọc sơ bộ</label>
                                            <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-recall-candidate-limit" min="1" step="1" placeholder="1000">
                                            <small class="notes">Số ứng viên giữ lại sau khi lọc sơ bộ Embedding cục bộ, cũng là số đầu vào tối đa của Rerank; không được nhỏ hơn TopK.</small>
                                        </div>
                                        <div class="acu-col-sm">
                                            <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-recent-fixed-inject-count">Số mục chèn cố định gần nhất</label>
                                            <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-recent-fixed-inject-count" min="0" step="1" placeholder="50">
                                            <small class="notes">X kỷ yếu gần nhất được chèn cố định, không tham gia xếp hạng; X tính vào ngưỡng kích hoạt nhưng không tính vào TopK. Ví dụ ngưỡng 200, X=50 thì 50 mục gần nhất chèn cố định, các hàng cũ hơn tham gia truy hồi vector.</small>
                                        </div>
                                        <div class="acu-col-sm">
                                            <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-rolling-delta-enabled" style="display: flex; align-items: center; gap: 8px; cursor: not-allowed;">
                                                <input type="checkbox" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-rolling-delta-enabled" disabled style="width: 14px; height: 14px; cursor: not-allowed;">
                                                <span>Ghi tăng dần cuộn tạm thời không khả dụng</span>
                                            </label>
                                            <small class="notes">Tạm dừng do yêu cầu vòng đời phát hành bất biến của V2. Dù cấu hình cũ có bật, lưu trữ vẫn sẽ ghi an toàn vào snapshot một tệp V2.</small>
                                        </div>
                                        <div class="acu-col-sm">
                                            <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-rolling-delta-fold-threshold">Ngưỡng gộp tăng dần cuộn K</label>
                                            <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-rolling-delta-fold-threshold" min="1" step="1" placeholder="15" disabled>
                                            <small class="notes">Chỉ giữ để tương thích cấu hình cũ; không có hiệu lực cho đến khi ghi tăng dần cuộn khôi phục ngữ nghĩa phát hành an toàn của V2.</small>
                                        </div>
                                        <div class="acu-col-sm">
                                            <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-namespace">Tiền tố không gian tên chỉ mục</label>
                                            <input type="text" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-namespace" placeholder="chat">
                                            <small class="notes">Dùng để phân biệt bộ nhớ đệm chỉ mục ngoài giữa các cuộc trò chuyện; sẽ ghép với mã định danh cuộc trò chuyện hiện tại.</small>
                                        </div>
                                    </div>
                                </div>
                                <div class="acu-section" style="margin-bottom: 12px;">
                                    <div class="acu-section-title">Cài đặt Embedding</div>
                                    <div class="acu-grid-auto">
                                        <div class="acu-col-sm">
                                            <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-embedding-endpoint">Embedding Endpoint</label>
                                            <input type="text" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-embedding-endpoint" placeholder="https://example.com/embeddings">
                                            <small class="notes">Mặc định để trống, tránh gắn cứng địa chỉ dịch vụ cụ thể vào cấu hình mặc định toàn cục.</small>
                                        </div>
                                        <div class="acu-col-sm">
                                            <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-embedding-model">Embedding Model</label>
                                            <input type="text" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-embedding-model" placeholder="text-embedding-3-large">
                                            <small class="notes">Mặc định để trống; hãy tự điền mô hình embedding thực tế sử dụng.</small>
                                        </div>
                                        <div class="acu-col-sm">
                                            <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-embedding-api-key">Embedding API Key</label>
                                            <input type="password" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-embedding-api-key" placeholder="Để trống nghĩa là không kèm Authorization">
                                            <small class="notes">Thông tin nhạy cảm không ghi vào giá trị mặc định; khi cần hãy cấu hình riêng.</small>
                                        </div>
                                    </div>
                                </div>
                                <div class="acu-section" style="margin-bottom: 12px;">
                                    <div class="acu-section-title">Cài đặt Rerank (tùy chọn)</div>
                                    <div class="acu-grid-auto">
                                        <div class="acu-col-sm">
                                            <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-rerank-endpoint">Rerank Endpoint</label>
                                            <input type="text" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-rerank-endpoint" placeholder="https://example.com/rerank">
                                            <small class="notes">Để trống thì không bật Rerank thật; chỉ dùng lọc sơ bộ embedding + xếp hạng heuristic cục bộ.</small>
                                        </div>
                                        <div class="acu-col-sm">
                                            <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-rerank-model">Rerank Model</label>
                                            <input type="text" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-rerank-model" placeholder="bge-reranker-v2-m3">
                                            <small class="notes">Phải điền cùng với Endpoint; sau khi điền sẽ rerank thật các ứng viên đã lọc sơ bộ.</small>
                                        </div>
                                        <div class="acu-col-sm">
                                            <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-rerank-api-key">Rerank API Key</label>
                                            <input type="password" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-rerank-api-key" placeholder="Để trống nghĩa là không kèm Authorization">
                                            <small class="notes">Có thể dùng xác thực khác với Embedding; nếu dịch vụ không cần xác thực thì để trống.</small>
                                        </div>
                                        <div class="acu-col-sm" style="grid-column: 1 / -1;">
                                            <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-rerank-instruction">Rerank Instruction (chỉ thị xếp hạng lại)</label>
                                            <textarea id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-rerank-instruction" rows="3" placeholder="Tùy chọn: tham số instruction / query gửi cho Rerank API để định hướng xếp hạng lại. Để trống thì không kèm." style="width: 100%; resize: vertical;"></textarea>
                                            <small class="notes">Một số mô hình Rerank hỗ trợ tham số instruction (như bge-reranker-v2-m3); sau khi điền sẽ được gửi dưới dạng trường query/instruction.</small>
                                        </div>
                                        <div class="acu-col-sm">
                                            <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-rerank-batch-size">Số mục mỗi lô Rerank</label>
                                            <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-rerank-batch-size" min="10" max="500" step="10" placeholder="300">
                                            <small class="notes">Khi ứng viên vượt số này sẽ chia lô gửi song song rồi gộp điểm; nhà cung cấp thường giới hạn dưới 500 mục mỗi yêu cầu. document của Rerank là nội dung kỷ yếu, khi số hàng ứng viên không nhiều hơn TopK sẽ tự động bỏ qua.</small>
                                        </div>

                                    </div>
                                    <small class="notes" style="display: block; margin-top: 8px;">Sau khi bật Rerank thật, Embedding vẫn phụ trách lọc sơ bộ truy hồi, TopK vẫn kiểm soát số lượng chèn cuối cùng; ba thứ này không thay thế lẫn nhau.</small>
                                </div>
                                <div class="acu-section" style="margin-bottom: 12px;">
                                    <div class="acu-section-title">Tham số ghi chỉ mục ngoài</div>
                                    <div class="acu-grid-auto">
                                        <div class="acu-col-sm">
                                            <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-chunk-chronicle-by-sentence" style="display: flex; align-items: center; gap: 6px;">
                                                <input type="checkbox" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-chunk-chronicle-by-sentence">
                                                Chia nội dung kỷ yếu theo câu
                                            </label>
                                            <small class="notes">Mặc định tắt: mỗi hàng một vector (tổng quan + toàn bộ nội dung kỷ yếu). Khi bật sẽ chia nội dung theo số câu bên dưới, truy hồi chi tiết hơn nhưng số phân đoạn tăng gấp bội; sau khi thay đổi cần dựng lại chỉ mục.</small>
                                        </div>
                                        <div class="acu-col-sm">
                                            <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-overview-sentence-limit">Số câu mỗi khối</label>
                                            <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-overview-sentence-limit" min="1" step="1" placeholder="2">
                                            <small class="notes">Chỉ có hiệu lực khi bật chia theo câu. Giá trị càng nhỏ truy hồi càng chi tiết nhưng số phân đoạn ngoài càng tăng.</small>
                                        </div>
                                        <div class="acu-col-sm">
                                            <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-archive-max-concurrency">Số hàng lưu trữ mỗi lô</label>
                                            <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-archive-max-concurrency" min="1" step="1" placeholder="30">
                                            <small class="notes">Sau khi điền bảng lưu xong sẽ lưu trữ ngay; nhiều kỷ yếu mới/đổi sẽ được chia lô embedding theo số này.</small>
                                        </div>
                                    </div>
                                    <input type="hidden" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-archive-batch-size">
                                    <input type="hidden" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-archive-without-summary">
                                </div>
                                <div class="acu-section" style="margin-bottom: 0;">
                                    <div class="acu-section-title">Tạo từ khóa</div>
                                    <div class="acu-grid-auto">
                                        <div class="acu-col-sm" style="grid-column: 1 / -1;">
                                            <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-keyword-generation-enabled" style="display: flex; align-items: center; gap: 6px;">
                                                <input type="checkbox" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-keyword-generation-enabled" checked>
                                                Dùng AI bổ sung từ khóa tìm kiếm trước khi gửi
                                            </label>
                                            <small class="notes">Mặc định bật. Khi tắt sẽ không gọi AI từ khóa nữa, chỉ dùng chính nội dung người dùng nhập để truy hồi, tiết kiệm một lượt gọi LLM.</small>
                                        </div>
                                        <div class="acu-col-sm">
                                            <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-keyword-api-preset">Preset API từ khóa</label>
                                            <select id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-keyword-api-preset" class="text_pole" style="width: 100%;">
                                                <option value="">Dùng cấu hình API hiện tại</option>
                                            </select>
                                            <small class="notes">Chỉ dùng cho giai đoạn "tạo từ khóa" trước khi gửi; để trống thì dùng cấu hình API chính hiện tại.</small>
                                        </div>
                                        <div class="acu-col-sm">
                                            <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-keyword-context-pair-count">Số tầng ngữ cảnh đọc cho từ khóa</label>
                                            <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-keyword-context-pair-count" min="1" step="1" placeholder="1">
                                            <small class="notes">Số tầng hội thoại gần nhất được đọc khi tạo từ khóa; 1 tầng = 1 phản hồi AI + 1 tin nhắn người dùng phía trên, không cắt bớt nữa.</small>
                                        </div>
                                        <div class="acu-col-sm">
                                            <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-keyword-generation-max-attempts">Số lần thử tối đa khi tạo từ khóa</label>
                                            <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-keyword-generation-max-attempts" min="1" step="1" placeholder="3">
                                            <small class="notes">Khi tạo từ khóa thất bại sẽ quay về dùng chính nội dung người dùng nhập để truy hồi, không chặn việc gửi gốc.</small>
                                        </div>
                                    </div>
                                </div>
                                <div class="acu-section" style="margin-bottom: 12px;">
                                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                                        <div class="acu-section-title" style="margin-bottom: 0;">Prompt tạo từ khóa</div>
                                        <div style="display: flex; gap: 6px;">
                                            <button id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-keyword-prompt-reset" class="acu-btn-small" style="font-size: 12px;">Đặt lại mặc định</button>
                                            <button id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-keyword-prompt-add" class="acu-btn-small" style="font-size: 12px;">Thêm đoạn</button>
                                        </div>
                                    </div>
                                    <small class="notes" style="margin-bottom: 8px; display: block;">Placeholder khả dụng: $RECENT_CONTEXT (ngữ cảnh gần nhất), $USER_INPUT (nội dung người dùng đang nhập).</small>
                                    <div id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-keyword-prompt-group" style="display: flex; flex-direction: column; gap: 8px;"></div>
                                </div>
                                <div id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-summary-prompt-group" style="display: none;"></div>
                                <div style="margin-top: 12px; display: flex; flex-direction: column; gap: 6px;">
                                    <small class="notes">Trước khi gửi ở chế độ giao hỏa sẽ lần lượt thực hiện: tạo từ khóa (có thể tắt) → gộp nội dung người dùng nhập với từ khóa để embedding → truy hồi hỗn hợp vector "tổng quan + nội dung kỷ yếu" và BM25 → Rerank tùy chọn (xếp hạng lại theo lô trên nội dung kỷ yếu) → ghi đè mục chỉ mục tóm lược gốc theo thứ tự gốc của bảng kỷ yếu.</small>
                                    <small class="notes">IndexedDB chỉ là bộ nhớ đệm có thể bỏ; phân đoạn vector chính thức lưu ở /user/files, lịch sử trò chuyện chỉ lưu manifest, không còn nhét toàn bộ vector vào lịch sử trò chuyện.</small>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- C. 表格工具入口 -->
                    <div class="acu-card">
                        <h3>Công cụ bảng</h3>
                        <div class="button-group" style="margin-top: 0; display: flex; flex-direction: column; gap: 10px;">
                            <button id="${SCRIPT_ID_PREFIX_ACU}-open-new-visualizer" class="primary acu-btn-medium" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 10px;">
                                <i class="fa-solid fa-table-columns"></i> Mở trình chỉnh sửa bảng trực quan
                            </button>
                            <button id="${SCRIPT_ID_PREFIX_ACU}-build-vector-index-now" class="acu-btn-medium" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 10px;">
                                <i class="fa-solid fa-brain"></i> Dựng chỉ mục kỷ yếu giao hỏa ngay
                            </button>
                        </div>
                        <p class="notes" style="text-align: center; margin-top: 10px;">Nhấn nút phía trên để mở giao diện trực quan mới, hỗ trợ sửa dữ liệu trực tiếp, đổi tiêu đề cột và cập nhật tham số.</p>
                        <p class="notes" style="text-align: center; margin-top: 6px;">"Dựng chỉ mục kỷ yếu giao hỏa ngay" sẽ tạo tệp chỉ mục vector ngoài từ bảng kỷ yếu hiện tại; về sau thêm/xóa/sửa kỷ yếu sẽ đồng bộ cập nhật phân đoạn chỉ mục tương ứng.</p>
                    </div>
                </div>`;
}
