/**
 * 选项表 — 默认表定义
 */
export const optionsSheet = {
  uid: "sheet_OptionsNew",
  name: "选项表",
  sourceData: {
    note: "Ghi lại các lựa chọn hành động mà nhân vật chính có thể thực hiện mỗi lượt. Bảng này có đúng một hàng. (Số cột đánh số từ 0, khớp với chỉ số cột trong dữ liệu bảng)\n- Cột 0: 选项一 (Lựa chọn một) \u2013 Dùng ngôi thứ ba mô tả hành động hợp lý nhân vật chính có thể làm, thiên về chiến lược hoặc đẩy cốt truyện.\n- Cột 1: 选项二 (Lựa chọn hai) \u2013 Dùng ngôi thứ ba mô tả hành động trung lập nhân vật chính có thể làm, không thiên về lập trường nào.\n- Cột 2: 选项三 (Lựa chọn ba) \u2013 Dùng ngôi thứ ba mô tả hành động thiện chí nhân vật chính có thể làm, thể hiện sự giúp đỡ, bảo vệ hoặc xoa dịu.\n- Cột 3: 选项四 (Lựa chọn bốn) \u2013 Dùng ngôi thứ ba mô tả hành động liên quan đến NSFW nhân vật chính có thể làm, nhưng phải phù hợp logic cốt truyện, không được nói thay nhân vật chính.\nTất cả lựa chọn phải dùng ngôi thứ ba (như \u201CNhân vật chính thử...\u201D, \u201CNhân vật chính quyết định...\u201D), không được phát ngôn thay nhân vật chính; phải bám sát cốt truyện hiện tại; bốn lựa chọn cần phong cách rõ ràng, không trùng lặp.",
    initNode: "Khi khởi tạo game, tạo bốn lựa chọn ban đầu.",
    deleteNode: "Cấm xóa.",
    updateNode: "Sau mỗi lượt tương tác bắt buộc cập nhật bảng này, dựa trên cốt truyện hiện tại tạo bốn lựa chọn mới để ghi đè nội dung cũ.\nVí dụ SQL: UPDATE options SET option_1 = 'Lựa chọn một mới', option_2 = 'Lựa chọn hai mới', option_3 = 'Lựa chọn ba mới', option_4 = 'Lựa chọn bốn mới' WHERE row_id = 1;",
    insertNode: "Cấm thao tác.",
    ddl: `CREATE TABLE options ( -- 选项表
  row_id INTEGER PRIMARY KEY, -- 行号
  option_1 TEXT NOT NULL, -- 选项一
  option_2 TEXT NOT NULL, -- 选项二
  option_3 TEXT NOT NULL, -- 选项三
  option_4 TEXT NOT NULL -- 选项四
);`
  },
  content: [
    [
      "row_id",
      "选项一",
      "选项二",
      "选项三",
      "选项四"
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
    entryName: "选项表",
    entryType: "constant",
    keywords: "",
    preventRecursion: true,
    injectionTemplate: "",
    extraIndexEnabled: false,
    extraIndexEntryName: "选项表-索引",
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
      position: "at_depth_as_system",
      depth: 2,
      order: 99990
    },
    fixedIndexPlacement: {
      position: "at_depth_as_system",
      depth: 2,
      order: 99991
    },
    injectIntoWorldbook: false
  },
  orderNo: 7
};
