export const tableCopy = {
  panels: {
    templatePreset: {
      title: "Preset mẫu bảng",
      description:
        "Chọn mẫu bảng đang dùng ở danh sách thả xuống; dấu sao đặt làm mặc định toàn cục. Có thể xuất trực tiếp mẫu đang có hiệu lực; nếu nó đã được sửa trong trình chỉnh sửa trực quan nhưng chưa lưu vào thư viện preset, bảng sẽ báo khác với nội dung thư viện và khi xuất sẽ lấy mẫu đang có hiệu lực làm chuẩn. Bấm nút để nhập preset mới hoặc quản lý tất cả preset. Preset mặc định tích hợp không thể sửa, hãy dùng \"Tạo mới từ mặc định\".",
    },
    injectionTarget: {
      title: "Sổ thế giới đích để ghi",
      description:
        "Sổ thế giới nơi dữ liệu bảng được ghi vào. Mặc định dùng sổ thế giới chính của thẻ nhân vật, có thể chỉ định sổ khác. Nếu thẻ nhân vật chưa có sổ thế giới, cần tạo mới và gắn vào thẻ.",
    },
    entries: {
      title: "Mục sổ thế giới bổ sung",
      description:
        "Các mục sổ thế giới được đính kèm cho AI tham khảo khi điền bảng. Mặc định theo thẻ nhân vật, cũng có thể chỉ định thủ công và bật/tắt từng mục. Không ảnh hưởng đến sổ thế giới đích để ghi.",
    },
  },
  worldbook: {
    emptyDefault: "Sổ thế giới đã chọn không có mục nào để hiển thị.",
    emptyCharacter:
      "Chưa xác định được sổ thế giới của thẻ nhân vật. Các mục sẽ hiện sau khi mở cuộc trò chuyện; bạn cũng có thể chọn thủ công một sổ.",
    emptyManual: "Hãy chọn một sổ thế giới trước.",
  },
};
