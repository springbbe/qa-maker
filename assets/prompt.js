/* Prompt gửi cho AI (ChatGPT, Claude, Gemini...) kèm file đề để AI trả về JSON đúng định dạng QA Maker.
   Viết dạng String.raw để giữ nguyên dấu "\" trong ví dụ LaTeX. */
(function () {
  const F = '```';

  const BASE = String.raw`Bạn là trợ lý chuyển đổi đề thi sang dữ liệu có cấu trúc. Tôi gửi kèm một tài liệu (PDF, ảnh chụp, Word, slide... có thể là đề thi, đề cương, ngân hàng câu hỏi, bài tập có lời giải) thuộc BẤT KỲ môn học nào.

NHIỆM VỤ: Đọc toàn bộ tài liệu và chuyển TẤT CẢ câu hỏi thành MỘT khối JSON theo đúng định dạng "qa-maker" bên dưới, để tôi dán vào web luyện đề.

=====================================================
1. YÊU CẦU ĐẦU RA
=====================================================
- Chỉ trả về một khối ${F}json ... ${F}. Không viết lời dẫn, không tóm tắt (ngoại lệ: dòng nhắc "còn tiếp" ở mục 7).
- JSON phải parse được: nháy kép, không dấu phẩy thừa, không comment, không "...".
- Giữ nguyên ngôn ngữ và nội dung gốc. KHÔNG dịch, KHÔNG rút gọn, KHÔNG bỏ câu, KHÔNG gộp câu. Câu trùng nhau giữa các đề vẫn giữ đủ.
- Bỏ rác: watermark, header/footer, số trang, mã QR, quảng cáo, dòng kiểu "Downloaded by...", "studocu", "Scanned by...".

=====================================================
2. ĐỊNH DẠNG JSON
=====================================================
{
  "format": "qa-maker",
  "version": 1,
  "title": "Tên bộ đề (lấy từ tài liệu, ví dụ: Đề ôn thi Kinh tế lượng cuối kỳ)",
  "subject": "Tên môn học",
  "description": "Mô tả ngắn: nguồn, số đề, phạm vi...",
  "language": "vi",
  "passages": [
    { "id": "p1", "title": "Đọc đoạn văn sau và trả lời câu 1–5", "text": "Nội dung bài đọc / dữ kiện dùng chung (Markdown)" }
  ],
  "questions": [
    {
      "id": "1",
      "number": "1",
      "section": "Đề số 01",
      "type": "single",
      "passage": "p1",
      "context": "Dữ kiện ngắn đi kèm câu hỏi (nếu có)",
      "question": "Nội dung câu hỏi (Markdown + LaTeX)",
      "figure": "Mô tả chi tiết hình vẽ/biểu đồ (nếu có)",
      "options": [
        { "key": "A", "text": "Phương án A" },
        { "key": "B", "text": "Phương án B" }
      ],
      "answer": ["B"],
      "explanation": "Lời giải / giải thích (Markdown + LaTeX)",
      "answerSource": "document",
      "note": "",
      "fixedOrder": false,
      "tags": ["chủ đề"],
      "difficulty": "medium"
    }
  ]
}

Ý nghĩa các trường của mỗi câu hỏi:
- id (bắt buộc): chuỗi DUY NHẤT trong cả bộ đề. Khuyên dùng số tăng dần "1","2","3"... xuyên suốt mọi đề/phần.
- number: số thứ tự in trong tài liệu (ví dụ "12", "2a"). Có thể trùng giữa các đề khác nhau.
- section: tên đề/chương/phần chứa câu hỏi ("Đề số 01", "Chương 3", "Part 2"). Không có thì bỏ trống "".
- type (bắt buộc): xem mục 3.
- passage: id của bài đọc dùng chung trong "passages" (chỉ dùng cho đoạn văn DÀI dùng chung nhiều câu). Không có thì bỏ trường.
- context: dữ kiện NGẮN dùng chung (ví dụ bảng kết quả hồi quy, đề bài chung của một cụm câu). Chép lại vào context của TỪNG câu liên quan để mỗi câu tự đầy đủ.
- question (bắt buộc): chỉ nội dung câu hỏi, bỏ tiền tố "Câu 1.", "1.", "Question 1:".
- figure: nếu câu hỏi có hình/biểu đồ/sơ đồ, mô tả bằng chữ đủ chi tiết để làm được câu hỏi mà không cần nhìn hình.
- options: chỉ cho type "single" và "multiple". key luôn là "A","B","C","D","E"... theo thứ tự xuất hiện (kể cả khi tài liệu ghi a/b/c, 1/2/3, hay đánh nhầm e/f/g/h). text không chứa tiền tố "A." / "a)".
- answer (bắt buộc): xem mục 3.
- explanation: lời giải/giải thích. Nếu tài liệu có "Giải thích/Lời giải/Hướng dẫn" thì chép đầy đủ. Nếu không có, tự viết giải thích ngắn gọn 1–3 câu (vì sao đáp án đúng).
- answerSource: "document" nếu đáp án lấy từ tài liệu; "ai" nếu tài liệu KHÔNG có đáp án và bạn tự giải.
- note: ghi chú cảnh báo (đề lỗi, thiếu phương án, nghi đáp án tài liệu sai...). Không có thì "".
- fixedOrder: true nếu KHÔNG được xáo trộn phương án (có phương án kiểu "Tất cả đều đúng", "Các phương án còn lại đều sai", "Cả A và B", "None of the above").
- tags: 1–3 chủ đề ngắn của câu (ví dụ "OLS", "kiểm định giả thuyết").
- difficulty: "easy" | "medium" | "hard" (ước lượng).

=====================================================
3. LOẠI CÂU HỎI (type) VÀ CÁCH GHI answer
=====================================================
- "single": trắc nghiệm MỘT đáp án đúng. Bắt buộc có options. answer: ["C"]
- "multiple": trắc nghiệm NHIỀU đáp án đúng ("chọn các đáp án đúng"). answer: ["A","C","D"]
- "true_false": câu Đúng/Sai, kể cả dạng "Phát biểu sau ĐÚNG hay SAI? Tại sao?". KHÔNG có options. Đưa phát biểu cần xét vào question. answer: true (Đúng) hoặc false (Sai). Phần "Tại sao" ghi vào explanation.
- "fill_blank": điền vào chỗ trống. Trong question thay mỗi chỗ trống bằng ___ (đúng 3 dấu gạch dưới). answer: mảng các mảng, mỗi chỗ trống một mảng gồm các cách viết được chấp nhận, ví dụ [["bằng 0","0"],["không chệch"]].
- "short_answer": trả lời ngắn (một con số, một từ, một cụm từ, một công thức ngắn) có thể chấm tự động. answer: mảng các cách viết được chấp nhận, ví dụ ["3395.15","3395,15"].
- "essay": tự luận, chứng minh, bài tập nhiều bước, câu hỏi mở. answer: một chuỗi lời giải mẫu đầy đủ (Markdown + LaTeX).
Câu hỏi lớn có nhiều ý (a, b, c...) → tách mỗi ý thành một câu riêng (number "5a", "5b"...), phần đề chung chép vào context.

=====================================================
4. CÁCH XÁC ĐỊNH ĐÁP ÁN
=====================================================
Ưu tiên theo thứ tự:
1) Đáp án được đánh dấu ngay trong tài liệu: tô màu/highlight, in đậm, in nghiêng, gạch chân, chữ màu khác, khoanh tròn, dấu ✓ / * / (x), hoặc đánh dấu khác với các phương án còn lại. Hãy so sánh định dạng của các phương án trong cùng câu để nhận ra phương án được đánh dấu.
2) Bảng đáp án / phần "Đáp án", "Key", "Lời giải" ở cuối đề, cuối chương hoặc cuối tài liệu (ví dụ "1-A 2-C 3-B..."). Ghép đúng số câu và đúng đề.
3) Nếu tài liệu không có đáp án cho câu đó: tự giải thật cẩn thận, đặt "answerSource": "ai" và ghi lời giải trong explanation.
Nếu đáp án của tài liệu có vẻ sai rõ ràng: VẪN giữ đáp án của tài liệu, ghi lý do và đáp án bạn cho là đúng vào note.

=====================================================
5. ĐỊNH DẠNG NỘI DUNG
=====================================================
- Văn bản hỗ trợ Markdown: **đậm**, *nghiêng*, danh sách, xuống dòng bằng \n, bảng Markdown.
- Bảng số liệu trong tài liệu → chuyển thành bảng Markdown, ví dụ: "| X | 5 | 6 |\n|---|---|---|\n| Số ngày | 10 | 35 |".
- CÔNG THỨC TOÁN: luôn viết bằng LaTeX trong $...$ (cùng dòng) hoặc $$...$$ (dòng riêng). Chuyển mọi công thức hiển thị bằng ảnh, Unicode hay chỉ số (β̂₂, R², Σ, ΔC/ΔI, x̄, ≠, ≤...) sang LaTeX, ví dụ: $\hat{\beta}_2$, $R^2$, $\frac{\Delta C}{\Delta I}$, $\bar{x}$, $H_0: \beta_2 = 0$.
- QUAN TRỌNG VỚI JSON: mọi dấu "\" trong chuỗi JSON phải viết thành "\\". Ví dụ đúng trong JSON: "Ước lượng $\\hat{\\beta}_2 = \\frac{0.78}{0.4}$". Sai: "$\hat{\beta}_2$" (sẽ làm hỏng JSON hoặc mất ký tự).
- Ký hiệu tiền tệ $ trong văn bản thường (không phải công thức) viết thành \\$ (ví dụ "giá 5 \\$").
- Không chèn ảnh, không chèn link; hình vẽ chỉ mô tả bằng chữ trong figure.

=====================================================
6. VÍ DỤ (minh họa định dạng, nội dung không liên quan tài liệu)
=====================================================
${F}json
{
  "format": "qa-maker",
  "version": 1,
  "title": "Ví dụ bộ đề",
  "subject": "Môn học",
  "description": "Ví dụ đủ các loại câu",
  "language": "vi",
  "passages": [],
  "questions": [
    {
      "id": "1", "number": "1", "section": "Đề 1", "type": "single",
      "question": "Trung bình mẫu của phần dư OLS",
      "options": [
        { "key": "A", "text": "không biết được do hàm PRF là không biết" },
        { "key": "B", "text": "là một số dương" },
        { "key": "C", "text": "bằng 0" },
        { "key": "D", "text": "Các phương án còn lại đều sai" }
      ],
      "answer": ["C"],
      "explanation": "Với mô hình có hệ số chặn, $\\sum e_i = 0$ nên $\\bar{e} = 0$.",
      "answerSource": "document", "note": "", "fixedOrder": true,
      "tags": ["OLS"], "difficulty": "easy"
    },
    {
      "id": "2", "number": "2", "section": "Đề 1", "type": "true_false",
      "question": "Các ước lượng OLS vẫn có tính chất không chệch ngay khi nhiễu $u$ không tuân theo quy luật phân phối chuẩn.",
      "answer": true,
      "explanation": "Đúng. Tính không chệch chỉ cần các giả thiết Gauss–Markov, không cần giả thiết phân phối chuẩn.",
      "answerSource": "ai", "note": "", "tags": ["OLS"], "difficulty": "medium"
    },
    {
      "id": "3", "number": "3", "section": "Đề 1", "type": "single",
      "context": "Kết quả ước lượng:\n$$CT = 55.37 + 0.78TN + 0.08TS + 0.09TNP$$\nSe: (13.4) (0.4) (0.02) (0.19); $n = 41$",
      "question": "Giá trị $t_s$ của biến TN bằng bao nhiêu?",
      "options": [
        { "key": "A", "text": "1,95" }, { "key": "B", "text": "0,47" },
        { "key": "C", "text": "4,13" }, { "key": "D", "text": "4" }
      ],
      "answer": ["A"],
      "explanation": "$t_s = \\frac{\\hat{\\beta}_2}{se(\\hat{\\beta}_2)} = \\frac{0.78}{0.4} = 1.95$",
      "answerSource": "document", "note": "", "fixedOrder": false,
      "tags": ["kiểm định t"], "difficulty": "medium"
    },
    {
      "id": "4", "number": "4", "section": "Đề 1", "type": "fill_blank",
      "question": "Phương pháp OLS tối thiểu hóa tổng ___ các phần dư.",
      "answer": [["bình phương", "binh phuong"]],
      "explanation": "OLS: $\\min \\sum e_i^2$.",
      "answerSource": "ai", "note": "", "tags": ["OLS"], "difficulty": "easy"
    },
    {
      "id": "5", "number": "5", "section": "Đề 1", "type": "short_answer",
      "question": "Cho $\\widehat{wage} = 2783.48 + 20.389\\,age$. Ước lượng điểm của wage khi $age = 30$?",
      "answer": ["3395.15", "3395,15"],
      "explanation": "$2783.48 + 20.389 \\times 30 = 3395.15$",
      "answerSource": "document", "note": "", "tags": ["dự báo"], "difficulty": "easy"
    },
    {
      "id": "6", "number": "6", "section": "Đề 1", "type": "essay",
      "question": "Trình bày các bước kiểm định White về phương sai sai số thay đổi.",
      "answer": "1. Ước lượng mô hình gốc, thu phần dư $e_i$.\n2. Hồi quy phụ $e_i^2$ theo các biến độc lập, bình phương và tích chéo của chúng.\n3. Tính $nR^2 \\sim \\chi^2(df)$ và so sánh với giá trị tới hạn.",
      "explanation": "",
      "answerSource": "ai", "note": "", "tags": ["White"], "difficulty": "hard"
    }
  ]
}
${F}

=====================================================
7. TÀI LIỆU DÀI → CHIA PHẦN
=====================================================
Nếu không thể xuất hết trong một câu trả lời:
- Xuất các câu theo đúng thứ tự, dừng sau một câu HOÀN CHỈNH, đóng JSON hợp lệ, và thêm trường gốc "part": { "index": 1, "done": false }.
- Sau khối JSON viết đúng một dòng: "Còn tiếp — gõ 'tiếp' để nhận phần 2."
- Khi tôi gõ "tiếp": xuất phần tiếp theo với CÙNG title, chỉ chứa các câu chưa xuất, id tiếp tục tăng (không trùng phần trước), "part": { "index": 2, "done": false }... Phần cuối cùng ghi "done": true.
- Tuyệt đối không dùng "..." hay "(tương tự)" để bỏ bớt câu.

=====================================================
8. TỰ KIỂM TRA TRƯỚC KHI TRẢ LỜI
=====================================================
- Số câu trong JSON khớp số câu trong tài liệu (hoặc trong phần đang xuất).
- Mỗi câu "single" có đúng 1 key trong answer; mọi key trong answer đều có trong options.
- "true_false" có answer là true/false (không có nháy kép).
- Mọi dấu "\" của LaTeX đã được nhân đôi thành "\\".
- JSON hợp lệ, không có văn bản thừa.`;

  /** Dựng prompt cuối cùng, thêm ghi chú riêng của người dùng nếu có. */
  window.buildPrompt = function (extra) {
    let p = BASE;
    const note = (extra || '').trim();
    if (note) {
      p += '\n\n=====================================================\n9. YÊU CẦU RIÊNG CỦA TÔI (ưu tiên cao nhất nếu mâu thuẫn)\n=====================================================\n' + note;
    }
    p += '\n\nBây giờ hãy xử lý tài liệu tôi gửi kèm.';
    return p;
  };
})();
