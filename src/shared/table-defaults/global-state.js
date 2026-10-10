/**
 * 全局数据表 — 默认表定义
 */
export const globalStateSheet = {
  uid: "sheet_dCudvUnH",
  name: "全局数据表",
  sourceData: {
    note: "Ghi lại địa điểm hiện tại của nhân vật chính và các tham số liên quan đến thời gian. Bảng này có đúng một hàng. (Số cột đánh số từ 0, khớp với chỉ số cột trong dữ liệu bảng)\n- Cột 0: 主角当前所在地点 (Địa điểm hiện tại của nhân vật chính) - Tên cảnh cụ thể nơi nhân vật chính đang ở.\n- Cột 1: 当前时间 (Thời gian hiện tại) - Thời gian hiện tại trong thế giới game. Định dạng: \u201CYYYY-MM-DD HH:MM\u201D, khi khởi tạo nếu cốt truyện không nêu rõ ngày giờ cụ thể thì phải tự đặt một ngày giờ rõ ràng dựa trên thế giới quan và thiết lập.\n- Cột 2: 上轮场景时间 (Thời gian cảnh lượt trước) - Thời gian khi lượt tương tác trước kết thúc.\n- Cột 3: 经过的时间 (Thời gian đã trôi qua) - Mô tả bằng văn bản được tính từ thời gian hiện tại và thời gian lượt trước (ví dụ: \u201Cvài phút\u201D).",
    initNode: "Chèn một bản ghi về trạng thái thế giới hiện tại.",
    deleteNode: "Cấm xóa.",
    updateNode: "Khi nhân vật chính rời khỏi khu vực hiện tại thì cập nhật địa điểm. Mỗi lượt bắt buộc cập nhật thời gian.\nVí dụ SQL: UPDATE global_state SET current_location = 'Địa điểm mới', prev_scene_time = cur_time, cur_time = '2024-03-15 16:00', elapsed_time = 'khoảng 1 giờ' WHERE row_id = 1;",
    insertNode: "Cấm thao tác.",
    ddl: `CREATE TABLE global_state ( -- 全局数据表
  row_id INTEGER PRIMARY KEY, -- 行号
  current_location TEXT NOT NULL, -- 主角当前所在地点
  cur_time TEXT NOT NULL CHECK(cur_time GLOB '????-??-?? ??:??'), -- 当前时间
  prev_scene_time TEXT CHECK(prev_scene_time IS NULL OR prev_scene_time GLOB '????-??-?? ??:??'), -- 上轮场景时间
  elapsed_time TEXT -- 经过的时间
);`
  },
  content: [
    [
      "row_id",
      "主角当前所在地点",
      "当前时间",
      "上轮场景时间",
      "经过的时间"
    ]
  ],
  updateConfig: {
    uiSentinel: -1,
    contextDepth: -1,
    updateFrequency: -1,
    batchSize: -1,
    skipFloors: -1
  },
  exportConfig: {
    enabled: false,
    splitByRow: false,
    entryName: "全局数据表",
    entryType: "constant",
    keywords: "",
    preventRecursion: true,
    injectionTemplate: "",
    extraIndexEnabled: false,
    extraIndexEntryName: "全局数据表-索引",
    extraIndexColumns: [],
    extraIndexColumnModes: {},
    extraIndexInjectionTemplate: "",
    entryPlacement: {
      position: "at_depth_as_system",
      depth: 2,
      order: 10000
    },
    extraIndexPlacement: {
      position: "at_depth_as_system",
      depth: 2,
      order: 10010
    },
    fixedEntryPlacement: {
      position: "before_char",
      depth: 2,
      order: 99981
    },
    fixedIndexPlacement: {
      position: "before_char",
      depth: 2,
      order: 99980
    }
  },
  orderNo: 0
};
