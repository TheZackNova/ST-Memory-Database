// main-popup-plot.ts
// 核心功能标签页 HTML生成
// 包含：剧情推进、智能续写、外部导入

import { SCRIPT_ID_PREFIX_ACU } from '../../shared/constants';
import { DEFAULT_PRESET_OPTION_VALUE_ACU } from '../components/optimization-ui';
import { generateImportTabHTML } from './main-popup-import';

/**
 * 生成核心功能标签页的 HTML 片段
 * 包含：剧情推进设置、预设管理、提示词设置、匹配替换、智能续写、世界书选择、外部导入
 */
export function generateCoreFuncTabHTML(): string {
    return `
                <div id="acu-tab-corefunc" class="acu-tab-content">
                    <div class="acu-card">
                        <!-- 顶部标题和开关区域 -->
                        <div class="acu-plot-header-row" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid var(--acu-border);">
                            <div>
                                <h3 style="margin: 0; color: var(--acu-text-1);">Cài đặt đẩy cốt truyện</h3>
                                <p class="notes" style="margin: 5px 0 0 0;">Dùng AI tiền xử lý nội dung người dùng nhập để nâng cao chất lượng kể chuyện và tính liền mạch cốt truyện</p>
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <label for="${SCRIPT_ID_PREFIX_ACU}-plot-enabled" style="font-weight: 500; cursor: pointer;">Bật chức năng</label>
                                <label class="toggle-switch">
                                    <input id="${SCRIPT_ID_PREFIX_ACU}-plot-enabled" type="checkbox" />
                                    <span class="slider"></span>
                                </label>
                            </div>
                        </div>

                        <!-- 预设管理区域 -->
                        <div class="settings-section" style="margin-bottom: 25px; padding: 20px; background: var(--acu-bg-2); border-radius: 8px; border: 1px solid var(--acu-border);">
                            <h4 style="margin: 0 0 15px 0; color: var(--acu-text-1); display: flex; align-items: center; gap: 8px;">
                                <i class="fa-solid fa-bookmark"></i> Quản lý preset
                            </h4>
                            <div class="acu-plot-scope-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; align-items: start;">
                                <div style="padding: 16px; background: var(--acu-bg-1); border-radius: 8px; border: 1px solid var(--acu-border); display: flex; flex-direction: column; gap: 12px;">
                                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
                                        <div>
                                            <div style="font-weight: 600; color: var(--acu-text-1);">Đang dùng toàn cục</div>
                                            <small id="${SCRIPT_ID_PREFIX_ACU}-plot-global-scope-status" class="notes">Cuộc trò chuyện mới sẽ mặc định kế thừa cấu hình đẩy cốt truyện ở đây</small>
                                        </div>
                                        <span style="padding: 2px 8px; border-radius: 999px; background: color-mix(in srgb, var(--accent-primary) 12%, transparent); color: var(--accent-primary); font-size: 12px; font-weight: 600;">Toàn cục</span>
                                    </div>
                                    <div class="qrf_settings_block" style="margin-bottom: 0;">
                                        <label for="${SCRIPT_ID_PREFIX_ACU}-plot-global-preset-select" style="font-weight: 500;">Preset toàn cục</label>
                                        <select id="${SCRIPT_ID_PREFIX_ACU}-plot-global-preset-select" class="text_pole" style="width: 100%; margin-top: 5px;">
                                            <option value="${DEFAULT_PRESET_OPTION_VALUE_ACU}">Preset mặc định</option>
                                        </select>
                                    </div>
                                    <div class="qrf_preset_selector_wrapper acu-plot-preset-wrapper" style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                                        <button id="${SCRIPT_ID_PREFIX_ACU}-plot-global-save-preset" class="menu_button" title="Ghi đè lưu vào preset toàn cục" style="padding: 8px 12px;"><i class="fa-solid fa-save"></i></button>
                                        <button id="${SCRIPT_ID_PREFIX_ACU}-plot-global-save-as-new-preset" class="menu_button" title="Lưu thành preset toàn cục mới" style="padding: 8px 12px;"><i class="fa-solid fa-file-export"></i></button>
                                        <button id="${SCRIPT_ID_PREFIX_ACU}-plot-global-import-presets" class="menu_button" title="Nhập vào thư viện preset toàn cục" style="padding: 8px 12px;"><i class="fa-solid fa-upload"></i></button>
                                        <button id="${SCRIPT_ID_PREFIX_ACU}-plot-global-export-presets" class="menu_button" title="Xuất preset toàn cục hiện tại" style="padding: 8px 12px;"><i class="fa-solid fa-download"></i></button>
                                        <button id="${SCRIPT_ID_PREFIX_ACU}-plot-global-reset-defaults" class="menu_button" title="Khôi phục prompt mặc định toàn cục" style="padding: 8px 12px; background-color: var(--acu-warning); color: white;"><i class="fa-solid fa-undo"></i></button>
                                        <button id="${SCRIPT_ID_PREFIX_ACU}-plot-global-delete-preset" class="menu_button" title="Xóa preset toàn cục đang chọn" style="display: none; padding: 8px 12px; background-color: var(--acu-danger);"><i class="fa-solid fa-trash-alt"></i></button>
                                        <input type="file" id="${SCRIPT_ID_PREFIX_ACU}-plot-global-preset-file-input" style="display: none;" accept=".json">
                                    </div>
                                    <small class="notes">Khu preset toàn cục phụ trách nhập, xuất, sửa và lưu; chuyển ở đây chỉ đổi preset đẩy cốt truyện mặc định toàn cục, không trực tiếp thay đổi preset của cuộc trò chuyện hiện tại.</small>
                                </div>
                                <div style="padding: 16px; background: var(--acu-bg-1); border-radius: 8px; border: 1px solid var(--acu-border); display: flex; flex-direction: column; gap: 12px;">
                                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
                                        <div>
                                            <div style="font-weight: 600; color: var(--acu-text-1);">Cuộc trò chuyện hiện tại đang dùng</div>
                                            <small id="${SCRIPT_ID_PREFIX_ACU}-plot-chat-scope-status" class="notes">Khi chưa chỉ định riêng, phần này sẽ theo preset đẩy cốt truyện toàn cục</small>
                                        </div>
                                        <span style="padding: 2px 8px; border-radius: 999px; background: color-mix(in srgb, var(--acu-success) 14%, transparent); color: var(--acu-success); font-size: 12px; font-weight: 600;">Trò chuyện</span>
                                    </div>
                                    <div class="qrf_settings_block" style="margin-bottom: 0;">
                                        <label for="${SCRIPT_ID_PREFIX_ACU}-plot-chat-preset-select" style="font-weight: 500;">Preset cuộc trò chuyện hiện tại</label>
                                        <select id="${SCRIPT_ID_PREFIX_ACU}-plot-chat-preset-select" class="text_pole" style="width: 100%; margin-top: 5px;">
                                            <option value="${DEFAULT_PRESET_OPTION_VALUE_ACU}">Theo toàn cục</option>
                                        </select>
                                    </div>
                                    <small id="${SCRIPT_ID_PREFIX_ACU}-plot-chat-origin-status" class="notes">Preset cuộc trò chuyện hiện tại ở đây chỉ phụ trách chuyển preset đẩy cốt truyện mà cuộc trò chuyện hiện tại dùng; nhập, xuất, lưu và sửa được xử lý thống nhất ở phía preset toàn cục.</small>
                                </div>
                            </div>
                            <div class="qrf_settings_block" style="margin-top: 15px; padding-top: 15px; border-top: 1px dashed var(--acu-border);">
                                <label for="${SCRIPT_ID_PREFIX_ACU}-plot-api-preset-select" style="font-weight: 500;">Preset API đẩy cốt truyện</label>
                                <select id="${SCRIPT_ID_PREFIX_ACU}-plot-api-preset-select" class="text_pole" style="width: 100%; margin-top: 5px;">
                                    <option value="">Dùng cấu hình API hiện tại</option>
                                </select>
                                <small class="notes">Phần này điều khiển cấu hình API dùng khi gọi đẩy cốt truyện; bản thân preset đẩy cốt truyện chia thành hai chuỗi phạm vi: toàn cục và cuộc trò chuyện hiện tại.</small>
                            </div>
                        </div>

                        <!-- 提示词设置区域（独立提示词组） -->
                        <div class="settings-section" style="margin-bottom: 25px; padding: 20px; background: var(--acu-bg-2); border-radius: 8px; border: 1px solid var(--acu-border);">
                            <h4 style="margin: 0 0 15px 0; color: var(--acu-text-1); display: flex; align-items: center; gap: 8px;">
                                <i class="fa-solid fa-edit"></i> Cài đặt prompt
                            </h4>
                            <div style="margin-bottom: 15px; padding: 12px; background: var(--acu-bg-1); border-radius: 6px; border-left: 3px solid var(--acu-text-2);">
                                <small class="notes" style="color: var(--acu-text-2);">
                                    <strong>Giải thích placeholder:</strong><br>
                                    <code>$1</code> - tự động thay bằng nội dung sổ thế giới (mặc định bật)<br>
                                    <code>$6</code> - tự động thay bằng dữ liệu quy hoạch cốt truyện đã lưu ở lượt trước<br>
                                    <code>$5</code> - tự động thay bằng nội dung bảng "总体大纲" (kèm tiêu đề cột)<br>
                                    <code>$7</code> - tự động thay bằng ngữ cảnh phía trước thực tế được đọc lần này (chỉ gồm đầu ra AI trong lịch sử, không có nội dung người dùng nhập)<br>
                                    <code>$8</code> - tự động thay bằng nội dung người dùng nhập ở lượt này (có thể đặt tùy ý)<br>
                                    <code>{{tên thẻ}}</code> - chèn nội dung khối thẻ vào prompt tác vụ cốt truyện và chỉ thị chèn cuối<br>
                                    <code>sulv1-4</code> - cài đặt tốc độ đẩy cốt truyện<br>
                                    <code>zhaohui</code> - số lượng truy hồi ký ức
                                </small>
                            </div>
                            <div class="acu-plot-task-layout" style="display:grid; grid-template-columns: minmax(240px, 280px) minmax(0, 1fr); gap:16px; align-items:start; margin-bottom:15px;">
                                <div style="padding:12px; background:var(--acu-bg-1); border-radius:8px; border:1px solid var(--acu-border);">
                                    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:10px;">
                                        <label style="font-weight:600; margin:0;">Danh sách tác vụ cốt truyện</label>
                                        <button type="button" id="${SCRIPT_ID_PREFIX_ACU}-plot-task-add" class="button" style="padding:4px 10px;">Thêm</button>
                                    </div>
                                    <div id="${SCRIPT_ID_PREFIX_ACU}-plot-task-list"></div>
                                    <div class="button-group" style="justify-content:flex-start; gap:8px; margin-top:10px;">
                                        <button type="button" id="${SCRIPT_ID_PREFIX_ACU}-plot-task-move-up" class="button">Lên</button>
                                        <button type="button" id="${SCRIPT_ID_PREFIX_ACU}-plot-task-move-down" class="button">Xuống</button>
                                        <button type="button" id="${SCRIPT_ID_PREFIX_ACU}-plot-task-delete" class="button" style="background:var(--acu-danger); color:#fff;">Xóa</button>
                                    </div>
                                    <small class="notes" style="display:block; margin-top:10px;">Mỗi tác vụ có prompt riêng, trích thẻ riêng và số lần thử lại riêng; tác vụ chạy theo số giai đoạn: cùng giai đoạn chạy đồng thời, khác giai đoạn chạy tuần tự theo số.</small>
                                </div>
                                <div style="padding:12px; background:var(--acu-bg-1); border-radius:8px; border:1px solid var(--acu-border);">
                                    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap:12px; margin-bottom:15px;">
                                        <div class="qrf_settings_block" style="margin-bottom:0;">
                                            <label for="${SCRIPT_ID_PREFIX_ACU}-plot-task-name" style="font-weight:500;">Tên tác vụ hiện tại</label>
                                            <input id="${SCRIPT_ID_PREFIX_ACU}-plot-task-name" type="text" class="text_pole" placeholder="Ví dụ: Tác vụ truy hồi ký ức" style="width:100%;">
                                        </div>
                                        <div class="qrf_settings_block" style="margin-bottom:0; display:flex; justify-content:space-between; align-items:center; gap:12px;">
                                            <label for="${SCRIPT_ID_PREFIX_ACU}-plot-task-enabled" style="font-weight:500; margin:0;">Bật tác vụ hiện tại</label>
                                            <label class="toggle-switch" style="margin:0;">
                                                <input id="${SCRIPT_ID_PREFIX_ACU}-plot-task-enabled" type="checkbox" />
                                                <span class="slider"></span>
                                            </label>
                                        </div>
                                        <div class="qrf_settings_block" style="margin-bottom:0;">
                                            <label for="${SCRIPT_ID_PREFIX_ACU}-plot-task-stage" style="font-weight:500;">Số giai đoạn tác vụ hiện tại</label>
                                            <input id="${SCRIPT_ID_PREFIX_ACU}-plot-task-stage" type="number" class="text_pole" min="1" step="1" value="1" style="width:100%;">
                                            <small class="notes">Cùng giai đoạn chạy đồng thời, khác giai đoạn chạy tuần tự theo số</small>
                                        </div>
                                        <div class="qrf_settings_block" style="margin-bottom:0;">
                                            <label for="${SCRIPT_ID_PREFIX_ACU}-plot-task-max-retries" style="font-weight:500;">Số lần thử lại tối đa của tác vụ hiện tại</label>
                                            <input id="${SCRIPT_ID_PREFIX_ACU}-plot-task-max-retries" type="number" class="text_pole" min="1" step="1" value="3" style="width:100%;">
                                        </div>
                                    </div>
                                    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:12px; margin-bottom:15px;">
                                        <div class="qrf_settings_block" style="margin-bottom:0;">
                                            <label for="${SCRIPT_ID_PREFIX_ACU}-plot-extract-tags" style="font-weight:500;">Trích thẻ của tác vụ hiện tại</label>
                                            <input id="${SCRIPT_ID_PREFIX_ACU}-plot-extract-tags" type="text" class="text_pole" placeholder="Ví dụ: recall,supplement" style="width:100%;">
                                            <small class="notes">Chỉ áp dụng cho tác vụ cốt truyện đang chọn</small>
                                        </div>
                                        <div class="qrf_settings_block" style="margin-bottom:0;">
                                            <label for="${SCRIPT_ID_PREFIX_ACU}-plot-extract-inject-tags" style="font-weight:500;">Thẻ trích xuất để chèn</label>
                                            <input id="${SCRIPT_ID_PREFIX_ACU}-plot-extract-inject-tags" type="text" class="text_pole" placeholder="Ví dụ: recall,supplement" style="width:100%;">
                                            <small class="notes">Ưu tiên cao hơn trích thẻ; khi không dùng sẽ không tự chèn vào cuối</small>
                                        </div>
                                        <div class="qrf_settings_block" style="margin-bottom:0;">
                                            <label for="${SCRIPT_ID_PREFIX_ACU}-plot-min-length" style="font-weight:500;">Độ dài phản hồi tối thiểu của tác vụ hiện tại</label>
                                            <input id="${SCRIPT_ID_PREFIX_ACU}-plot-min-length" type="number" class="text_pole" min="0" max="2000" step="10" value="0" style="width:100%;">
                                            <small class="notes">Tự động thử lại khi phản hồi của tác vụ hiện tại ngắn hơn độ dài này</small>
                                        </div>
                                    </div>
                                    <div style="margin-bottom:15px;">
                                        <div class="qrf_settings_block" style="margin-bottom:0;">
                                            <label for="${SCRIPT_ID_PREFIX_ACU}-plot-task-api-preset" style="font-weight:500;">Preset API của tác vụ hiện tại</label>
                                            <select id="${SCRIPT_ID_PREFIX_ACU}-plot-task-api-preset" class="text_pole" style="width:100%;">
                                                <option value="">Kế thừa preset API đẩy cốt truyện toàn cục</option>
                                            </select>
                                            <small class="notes">Lưu theo ID tác vụ vào cài đặt toàn cục của plugin; không ghi vào lịch sử trò chuyện hoặc preset đẩy cốt truyện, khi chưa chọn sẽ kế thừa preset API đẩy cốt truyện toàn cục.</small>
                                        </div>
                                    </div>
                                    <div id="${SCRIPT_ID_PREFIX_ACU}-plot-prompt-constructor-area">
                                        <div class="button-group" style="margin-bottom: 10px; justify-content: center;">
                                            <button class="${SCRIPT_ID_PREFIX_ACU}-plot-add-prompt-segment-btn" data-position="top" title="Thêm lượt hội thoại ở trên">+</button>
                                        </div>
                                        <div id="${SCRIPT_ID_PREFIX_ACU}-plot-prompt-segments-container">
                                            <!-- Plot segments will be dynamically inserted here -->
                                        </div>
                                        <div class="button-group" style="margin-top: 10px; justify-content: center;">
                                            <button class="${SCRIPT_ID_PREFIX_ACU}-plot-add-prompt-segment-btn" data-position="bottom" title="Thêm lượt hội thoại ở dưới">+</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="qrf_settings_block" style="margin-top: 15px; margin-bottom: 0;">
                                <label for="${SCRIPT_ID_PREFIX_ACU}-plot-final-directive" style="font-weight: 500;">Chỉ thị chèn cuối</label>
                                <textarea id="${SCRIPT_ID_PREFIX_ACU}-plot-final-directive" class="text_pole" rows="3" placeholder="Nhập chỉ thị chèn cuối" style="resize: vertical;"></textarea>
                                <small class="notes">Nội dung này sẽ không gửi cho "API quy hoạch cốt truyện", chỉ chèn cho AI chính. Bạn có thể dùng <code>$8</code> để tự quyết định có đặt hay không và đặt ở đâu.</small>
                            </div>
                        </div>


                        <!-- 匹配替换设置区域 -->
                        <div class="settings-section" style="margin-bottom: 25px; padding: 20px; background: var(--acu-bg-2); border-radius: 8px; border: 1px solid var(--acu-border);">
                            <h4 style="margin: 0 0 15px 0; color: var(--acu-text-1); display: flex; align-items: center; gap: 8px;">
                                <i class="fa-solid fa-right-left"></i> Khớp và thay thế
                            </h4>
                            <small class="notes" style="display: block; margin-bottom: 15px; color: var(--acu-text-2);">
                                Trước khi gửi, thay các placeholder trong prompt (sulv1-4, zhaohui) bằng giá trị đặt bên dưới
                            </small>
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                                <div class="qrf_settings_block" style="margin-bottom: 0;">
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-plot-rate-main" style="font-weight: 500;">Tốc độ đẩy cốt truyện tuyến chính</label>
                                    <input id="${SCRIPT_ID_PREFIX_ACU}-plot-rate-main" type="number" class="text_pole" step="0.05" value="1.0" style="width: 100%;">
                                    <small class="notes" style="color: var(--acu-text-2);">Placeholder: sulv1</small>
                                </div>
                                <div class="qrf_settings_block" style="margin-bottom: 0;">
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-plot-rate-personal" style="font-weight: 500;">Tốc độ đẩy tuyến cá nhân</label>
                                    <input id="${SCRIPT_ID_PREFIX_ACU}-plot-rate-personal" type="number" class="text_pole" step="0.05" value="1.0" style="width: 100%;">
                                    <small class="notes" style="color: var(--acu-text-2);">Placeholder: sulv2</small>
                                </div>
                                <div class="qrf_settings_block" style="margin-bottom: 0;">
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-plot-rate-erotic" style="font-weight: 500;">Tốc độ đẩy sự kiện người lớn</label>
                                    <input id="${SCRIPT_ID_PREFIX_ACU}-plot-rate-erotic" type="number" class="text_pole" step="0.05" value="0" style="width: 100%;">
                                    <small class="notes" style="color: var(--acu-text-2);">Placeholder: sulv3</small>
                                </div>
                                <div class="qrf_settings_block" style="margin-bottom: 0;">
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-plot-rate-cuckold" style="font-weight: 500;">Tốc độ đẩy tuyến cắm sừng</label>
                                    <input id="${SCRIPT_ID_PREFIX_ACU}-plot-rate-cuckold" type="number" class="text_pole" step="0.05" value="1.0" style="width: 100%;">
                                    <small class="notes" style="color: var(--acu-text-2);">Placeholder: sulv4</small>
                                </div>
                                <div class="qrf_settings_block" style="margin-bottom: 0;">
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-plot-recall-count" style="font-weight: 500;">Số lượng truy hồi ký ức</label>
                                    <input id="${SCRIPT_ID_PREFIX_ACU}-plot-recall-count" type="number" class="text_pole" step="1" min="1" value="20" style="width: 100%;">
                                    <small class="notes" style="color: var(--acu-text-2);">Placeholder: zhaohui</small>
                                </div>
                            </div>
                        </div>


                        <!-- 外部导入区块（原独立tab，现作为核心功能区子模块） -->
                        <div class="settings-section" style="padding: 20px; background: var(--acu-bg-2); border-radius: 8px; border: 1px solid var(--acu-border);">
                            ${generateImportTabHTML().replace(/id="acu-tab-import" class="acu-tab-content"/, 'id="acu-tab-import-embedded" class="acu-import-embedded"').replace(/<div class="acu-card">/, '<div class="acu-card" style="border: none; box-shadow: none; padding: 0; margin: 0;">').replace('<h3>Nhập từ tệp TXT</h3>', '<h3 style="margin: 0 0 15px 0; padding: 0 0 10px 0; border-bottom: 1px solid var(--acu-border);">Nhập từ bên ngoài</h3>').replace('<p class="notes">Nhập nội dung từ tệp TXT bên ngoài', '<p class="notes" style="margin-bottom: 12px;">Nhập nội dung từ tệp TXT bên ngoài')}
                        </div>
                    </div>
                </div>`;
}