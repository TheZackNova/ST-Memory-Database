/**
 * fill-mode-copy — 填表模式页文案。
 *
 * 四种模式的完整名称、简介与优缺点集中在此，供下拉菜单与说明面板共用。
 */
import type { FillMode_ACU } from '../../service/fill-mode/fill-mode-preferences';

export interface FillModeIntro {
  label: string;
  summary: string;
  pros: string;
  cons: string;
}

export const FILL_MODE_INTROS: Record<FillMode_ACU, FillModeIntro> = {
  classic: {
    label: 'Chế độ bảng cổ điển',
    summary: 'Dùng lại quy trình điền bảng cổ điển ổn định, giao kỷ yếu cho tổng kết lớn để tóm lược dần, là chế độ mặc định khi cài mới.',
    pros: 'Nhanh và không cảm nhận được, không cần cấu hình thêm, cũng không tăng số lượt yêu cầu.',
    cons: 'Tổng kết lớn có thể nén bớt một số chi tiết.',
  },
  vector: {
    label: 'Chế độ bảng vector',
    summary: 'Dùng embedding và rerank để chọn trực tiếp các kỷ yếu liên quan đến tình tiết hiện tại, rồi cắt các mục kỷ yếu đã chọn thành đèn xanh dương để chèn vào; chỉ mục kỷ yếu giữ nguyên danh mục đầy đủ. Không tạo từ khóa, không truy hồi hỗn hợp, cũng không kích hoạt đẩy cốt truyện.',
    pros: 'Nhanh và không cảm nhận được, không tăng thêm lượt gọi LLM trước khi tạo nội dung chính.',
    cons: 'Cần cấu hình riêng tham số vector; khớp ngữ nghĩa của vector không chính xác bằng khớp logic của truy hồi LLM.',
  },
  llm: {
    label: 'Chế độ truy hồi logic bằng mô hình LLM',
    summary: 'LLM đọc trước tổng quan và danh mục kỷ yếu, rồi đọc kỹ các đoạn kỷ yếu cụ thể theo khoảng trống thông tin.',
    pros: 'Chính xác vô song.',
    cons: 'Cần gọi thêm một lần LLM để phân tích trí nhớ trước mỗi lần tạo nội dung chính.',
  },
  crossfire: {
    label: 'Chế độ giao hỏa',
    summary: 'Quy trình đầy đủ: tạo từ khóa, truy hồi hỗn hợp vector và BM25, rerank sắp xếp tinh, rồi giao cho LLM phân tích logic.',
    pros: 'Kết hợp trọn vẹn ưu điểm của chế độ vector và truy hồi LLM.',
    cons: 'Cần cấu hình tham số vector, và vẫn giữ lượt gọi LLM bổ sung trước khi tạo nội dung chính.',
  },
};

export const fillModeCopy = {
  pageTitle: 'Chế độ điền bảng',
  nav: {
    mode: 'Chế độ điền bảng',
    plot: 'Đẩy cốt truyện',
  },
  reject: {
    title: 'Không thể chuyển chế độ điền bảng',
    message(reason: string, currentLabel: string, error?: string): string {
      if (reason === 'classic_locked') {
        return `Hội thoại hiện tại đang dùng「${currentLabel}」, bảng kỷ yếu sẽ tiếp tục tích lũy, chuyển về chế độ bảng cổ điển sẽ vượt quá cửa sổ kỷ yếu của chế độ cổ điển nên không thể chuyển về. Khi cần chế độ bảng cổ điển, hãy mở hội thoại mới, có thể bấm ngôi sao trước để đặt chế độ bảng cổ điển làm chế độ ưu tiên cho hội thoại mới.`;
      }
      if (reason === 'record_invalid') {
        return 'Không nhận diện được bản ghi chế độ điền bảng của hội thoại hiện tại; để tránh bảng kỷ yếu vượt quá cửa sổ kỷ yếu của chế độ cổ điển, đã từ chối chuyển về chế độ bảng cổ điển.';
      }
      if (reason === 'no_active_chat') {
        return 'Hiện không có hội thoại nào đang mở nên không thể chuyển chế độ điền bảng. Bấm ngôi sao để đặt chế độ ưu tiên cho hội thoại mới.';
      }
      if (reason === 'classic_enable_failed') {
        return `Không thể bật chế độ bảng cổ điển, hội thoại hiện tại vẫn dùng「${currentLabel}」.${error ? ` Nguyên nhân: ${error}` : ''}`;
      }
      if (reason === 'classic_disable_failed') {
        return `Không thể thoát chế độ bảng cổ điển, hội thoại hiện tại vẫn dùng chế độ bảng cổ điển.${error ? ` Nguyên nhân: ${error}` : ''}`;
      }
      return `Lưu chế độ điền bảng thất bại, hội thoại hiện tại vẫn dùng「${currentLabel}」.${error ? ` Nguyên nhân: ${error}` : ''}`;
    },
  },
  leaveClassic: {
    title: 'Thoát chế độ bảng cổ điển',
    confirmLabel: 'Xác nhận chuyển',
    message(targetLabel: string): string {
      return `Sắp chuyển hội thoại hiện tại sang「${targetLabel}」. Sau khi chuyển sẽ xóa bảng tổng kết lớn, các kỷ yếu đã được tổng kết lớn tóm lược sẽ hiển thị lại, bảng kỷ yếu khôi phục cách xuất ban đầu. Sau khi chuyển, hội thoại hiện tại không thể chuyển lại chế độ bảng cổ điển.`;
    },
  },
  templateChanged: {
    title: 'Mẫu bảng đã bị sửa',
    confirmLabel: 'Khôi phục mẫu và chuyển',
    message: 'Sau khi bật chế độ bảng cổ điển, mẫu bảng của hội thoại hiện tại đã bị sửa. Tiếp tục chuyển sẽ khôi phục về mẫu trước khi bật chế độ bảng cổ điển, ghi đè các thay đổi này.',
  },
  panels: {
    mode: {
      title: 'Chế độ điền bảng',
      description: 'Chọn cách hội thoại hiện tại truy hồi trí nhớ để tạo nội dung chính. Chế độ được ghi theo hội thoại; tham số của mỗi chế độ được lưu độc lập, chuyển chế độ không ghi đè chế độ khác, cũng không đổi cấp độ chức năng.',
      selectHint: 'Ngôi sao đặt làm chế độ ưu tiên cho hội thoại mới. Chế độ bảng cổ điển có thể chuyển sang chế độ khác, các chế độ khác không thể chuyển về cổ điển.',
      preferActiveTitle: 'Chế độ ưu tiên cho hội thoại mới',
      preferInactiveTitle: 'Đặt làm chế độ ưu tiên cho hội thoại mới',
      nativeToolLabel: 'Điền bảng bằng gọi công cụ',
      nativeToolHint:
        'Mặc định tắt, dùng chung cho cả bốn chế độ. Khi bật, điền bảng sẽ gửi qua công cụ gốc table_edit / table_sql, prompt mặc định cũng chuyển theo; một số kênh không hỗ trợ gọi công cụ, nhận trường tools sẽ báo lỗi ngay.',
    },
    plot: {
      title: 'Đẩy cốt truyện',
      description: 'Chế độ truy hồi logic bằng mô hình LLM và chế độ giao hỏa dựa vào đẩy cốt truyện để phân tích trí nhớ trước khi tạo nội dung chính. Khi tắt, hai chế độ này chỉ giữ truy hồi bảng, không lập kế hoạch cốt truyện nữa.',
      enableLabel: 'Bật đẩy cốt truyện',
      enableHint: 'Khi tắt sẽ không gọi thêm LLM trước khi tạo nội dung chính; các hành vi truy hồi khác của chế độ hiện tại không đổi.',
      disguiseDisabledLabel: 'Bỏ ngụy trang khi gửi',
      disguiseDisabledHint: 'Mặc định tắt. Khi bật, văn bản gốc ở lại trong ô nhập chờ AI cốt truyện trả về, không hiển thị tầng tạm hay giao diện đang tạo; sau khi thành công sẽ ghi vào prompt cuối cùng và SillyTavern tiếp tục lần gửi này.',
    },
    worldbook: {
      title: 'Sổ thế giới đẩy cốt truyện',
      description: 'Chọn các mục sổ thế giới được đọc khi đẩy cốt truyện phân tích.',
    },
  },
};
