/**
 * Bảng lựa chọn — 默认表定义
 */
export const optionsSheet = {
  uid: "sheet_OptionsNew",
  name: "Bảng lựa chọn",
  sourceData: {
    note: "Ghi lại các lựa chọn hành động mà nhân vật chính có thể thực hiện mỗi lượt. Bảng này có đúng một hàng. (Số cột đánh số từ 0, khớp với chỉ số cột trong dữ liệu bảng)\n- Cột 0: Lựa chọn 1 \u2013 Dùng ngôi thứ ba mô tả hành động hợp lý nhân vật chính có thể làm, thiên về chiến lược hoặc đẩy cốt truyện.\n- Cột 1: Lựa chọn 2 \u2013 Dùng ngôi thứ ba mô tả hành động trung lập nhân vật chính có thể làm, không thiên về lập trường nào.\n- Cột 2: Lựa chọn 3 \u2013 Dùng ngôi thứ ba mô tả hành động thiện chí nhân vật chính có thể làm, thể hiện sự giúp đỡ, bảo vệ hoặc xoa dịu.\n- Cột 3: Lựa chọn 4 \u2013 Dùng ngôi thứ ba mô tả hành động liên quan đến NSFW nhân vật chính có thể làm, nhưng phải phù hợp logic cốt truyện, không được nói thay nhân vật chính.\nTất cả lựa chọn phải dùng ngôi thứ ba (như \u201CNhân vật chính thử...\u201D, \u201CNhân vật chính quyết định...\u201D), không được phát ngôn thay nhân vật chính; phải bám sát cốt truyện hiện tại; bốn lựa chọn cần phong cách rõ ràng, không trùng lặp.",
    initNode: "Khi khởi tạo game, tạo bốn lựa chọn ban đầu.",
    deleteNode: "Cấm xóa.",
    updateNode: "Sau mỗi lượt tương tác bắt buộc cập nhật bảng này, dựa trên cốt truyện hiện tại tạo bốn lựa chọn mới để ghi đè nội dung cũ.\nVí dụ SQL: UPDATE options SET option_1 = 'Lựa chọn một mới', option_2 = 'Lựa chọn hai mới', option_3 = 'Lựa chọn ba mới', option_4 = 'Lựa chọn bốn mới' WHERE row_id = 1;",
    insertNode: "Cấm thao tác.",
    ddl: `CREATE TABLE options ( -- Bảng lựa chọn
  row_id INTEGER PRIMARY KEY, -- Số hàng
  option_1 TEXT NOT NULL, -- Lựa chọn 1
  option_2 TEXT NOT NULL, -- Lựa chọn 2
  option_3 TEXT NOT NULL, -- Lựa chọn 3
  option_4 TEXT NOT NULL -- Lựa chọn 4
);`
  },
  content: [
    [
      "row_id",
      "Lựa chọn 1",
      "Lựa chọn 2",
      "Lựa chọn 3",
      "Lựa chọn 4"
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
    entryName: "Bảng lựa chọn",
    entryType: "constant",
    keywords: "",
    preventRecursion: true,
    injectionTemplate: "",
    extraIndexEnabled: false,
    extraIndexEntryName: "Bảng lựa chọn-Chỉ mục",
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
