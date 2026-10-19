/* QA Maker – web luyện đề từ JSON do AI tạo. Không cần build, dữ liệu lưu trong localStorage. */
(function () {
  'use strict';

  // ======================================================================
  // Tiện ích chung
  // ======================================================================
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const app = $('#app');

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  function toast(msg, ms = 2200) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), ms);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      ta.remove();
      return ok;
    }
  }

  function download(filename, text) {
    const blob = new Blob([text], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function fmtTime(sec) {
    sec = Math.max(0, Math.round(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + String(s).padStart(2, '0');
  }
  function fmtDate(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    return d.toLocaleDateString('vi-VN') + ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  }
  function fmtInterval(days) {
    if (days < 1 / 24) return Math.max(1, Math.round(days * 1440)) + ' phút';
    if (days < 1) return Math.round(days * 24) + ' giờ';
    if (days < 30) return Math.round(days) + ' ngày';
    return Math.round(days / 30) + ' tháng';
  }

  // Dọn dẹp timer / phím tắt khi chuyển trang
  let cleanups = [];
  function onCleanup(fn) { cleanups.push(fn); }
  function runCleanups() { cleanups.forEach((f) => { try { f(); } catch (e) { /* bỏ qua */ } }); cleanups = []; }
  function onKey(handler) {
    const h = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target && e.target.tagName) || '';
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      handler(e, typing);
    };
    document.addEventListener('keydown', h);
    onCleanup(() => document.removeEventListener('keydown', h));
  }
  function every(ms, fn) { const id = setInterval(fn, ms); onCleanup(() => clearInterval(id)); return id; }

  // ======================================================================
  // Lưu trữ (localStorage, có dự phòng bộ nhớ tạm)
  // ======================================================================
  const mem = {};
  const store = {
    get(key, def) {
      try {
        const v = localStorage.getItem(key);
        return v == null ? (key in mem ? mem[key] : def) : JSON.parse(v);
      } catch (e) { return key in mem ? mem[key] : def; }
    },
    set(key, val) {
      mem[key] = val;
      try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) {
        toast('⚠️ Không lưu được vào localStorage (đầy hoặc bị chặn). Dữ liệu chỉ giữ tạm trong phiên này.', 4000);
        return false;
      }
    },
    del(key) { delete mem[key]; try { localStorage.removeItem(key); } catch (e) { /* bỏ qua */ } },
  };

  const K = {
    index: 'qam:index',
    settings: 'qam:settings',
    deck: (id) => 'qam:deck:' + id,
    prog: (id) => 'qam:prog:' + id,
    meta: (id) => 'qam:meta:' + id,
    exam: (id) => 'qam:exam:' + id,
  };

  const settings = Object.assign({ theme: 'auto', scopes: {} }, store.get(K.settings, {}));
  const saveSettings = () => store.set(K.settings, settings);

  const getIndex = () => store.get(K.index, []);
  const setIndex = (idx) => store.set(K.index, idx);
  const loadDeck = (id) => store.get(K.deck(id), null);
  const getProg = (id) => store.get(K.prog(id), {});
  const setProg = (id, p) => store.set(K.prog(id), p);
  const getMeta = (id) => store.get(K.meta(id), {});
  const setMeta = (id, m) => store.set(K.meta(id), m);

  function saveDeck(deck) {
    deck.updatedAt = Date.now();
    store.set(K.deck(deck.id), deck);
    const idx = getIndex().filter((d) => d.id !== deck.id);
    idx.unshift({ id: deck.id, title: deck.title, subject: deck.subject, count: deck.questions.length, createdAt: deck.createdAt, updatedAt: deck.updatedAt });
    setIndex(idx);
  }
  function deleteDeck(id) {
    setIndex(getIndex().filter((d) => d.id !== id));
    [K.deck(id), K.prog(id), K.meta(id), K.exam(id)].forEach(store.del);
    delete settings.scopes[id]; saveSettings();
  }
  function touchDeck(id) {
    const m = getMeta(id); m.lastStudied = Date.now(); setMeta(id, m);
  }

  // Ghi nhận kết quả 1 câu
  function record(deckId, qid, correct) {
    const P = getProg(deckId);
    const p = P[qid] || (P[qid] = {});
    p.a = (p.a || 0) + 1;
    if (correct) p.c = (p.c || 0) + 1; else p.w = (p.w || 0) + 1;
    p.last = correct ? 1 : 0;
    p.t = Date.now();
    setProg(deckId, P);
    touchDeck(deckId);
  }
  function setQProp(deckId, qid, key, val) {
    const P = getProg(deckId);
    const p = P[qid] || (P[qid] = {});
    if (val === undefined) delete p[key]; else p[key] = val;
    setProg(deckId, P);
  }
  function toggleStar(deckId, qid) {
    const P = getProg(deckId);
    const on = !(P[qid] && P[qid].star);
    setQProp(deckId, qid, 'star', on || undefined);
    return on;
  }

  // ======================================================================
  // Đọc & chuẩn hóa JSON do AI tạo
  // ======================================================================
  const TYPE_ALIASES = {
    single: 'single', mcq: 'single', single_choice: 'single', multiple_choice: 'single', choice: 'single', radio: 'single', 'trac_nghiem': 'single',
    multiple: 'multiple', multi: 'multiple', multiple_answer: 'multiple', multiple_answers: 'multiple', multi_select: 'multiple', checkbox: 'multiple', multiple_select: 'multiple',
    true_false: 'true_false', truefalse: 'true_false', 'true-false': 'true_false', tf: 'true_false', boolean: 'true_false', dung_sai: 'true_false',
    fill_blank: 'fill_blank', fill: 'fill_blank', cloze: 'fill_blank', blank: 'fill_blank', fill_in_the_blank: 'fill_blank', fill_in_blank: 'fill_blank',
    short_answer: 'short_answer', short: 'short_answer', text: 'short_answer', numeric: 'short_answer', number: 'short_answer',
    essay: 'essay', open: 'essay', long: 'essay', long_answer: 'essay', free: 'essay', tu_luan: 'essay',
  };
  const TYPE_LABEL = { single: 'Trắc nghiệm', multiple: 'Nhiều đáp án', true_false: 'Đúng/Sai', fill_blank: 'Điền khuyết', short_answer: 'Trả lời ngắn', essay: 'Tự luận' };
  const GENERIC_OPT = /(còn lại|ở trên|nêu trên|trên đều|tất cả|cả hai|cả [a-e] và [a-e]|không có (phương án|đáp án|câu) nào|all of the above|none of the above|both [a-e] and|neither)/i;

  /** Lấy các khối JSON từ văn bản dán vào (hỗ trợ ```json ...```, lời dẫn thừa, nhiều phần một lúc). */
  function extractJsonBlocks(raw) {
    const text = String(raw || '').replace(/^﻿/, '').trim();
    if (!text) return [];
    const fenced = [];
    const re = /```(?:json|JSON)?\s*\n?([\s\S]*?)```/g;
    let m;
    while ((m = re.exec(text))) if (/[{[]/.test(m[1])) fenced.push(m[1].trim());
    if (fenced.length) return fenced;
    // Không có rào ``` → tách các khối { } cấp cao nhất
    const blocks = [];
    let depth = 0, start = -1, inStr = false, escNext = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inStr) {
        if (escNext) escNext = false;
        else if (c === '\\') escNext = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') { inStr = true; continue; }
      if (c === '{' || c === '[') {
        if (depth === 0) { if (c === '[' && !/^\[\s*\{/.test(text.slice(i, i + 200))) continue; start = i; }
        depth++;
      }
      else if ((c === '}' || c === ']') && depth > 0) { depth--; if (depth === 0 && start >= 0) { blocks.push(text.slice(start, i + 1)); start = -1; } if (depth < 0) depth = 0; }
    }
    if (start >= 0) blocks.push(text.slice(start)); // khối bị cắt cụt → để parser báo lỗi rõ ràng
    return blocks.length ? blocks : [text];
  }

  /** Sửa các lỗi JSON hay gặp từ AI: \ chưa nhân đôi, xuống dòng trong chuỗi, dấu phẩy thừa, nháy cong. */
  function repairJson(s) {
    let out = '';
    let inStr = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (!inStr) {
        if (c === '"' || c === '“' || c === '”') { inStr = true; out += '"'; continue; }
        out += c;
        continue;
      }
      if (c === '\\') {
        const n = s[i + 1];
        if (n === 'u' && /^[0-9a-fA-F]{4}$/.test(s.substr(i + 2, 4))) { out += s.substr(i, 6); i += 5; continue; }
        if (n !== undefined && '"\\/bfnrt'.includes(n)) { out += c + n; i++; continue; }
        out += '\\\\';
        continue;
      }
      if (c === '"') { inStr = false; out += c; continue; }
      if (c === '\n') { out += '\\n'; continue; }
      if (c === '\r') continue;
      if (c === '\t') { out += '\\t'; continue; }
      out += c;
    }
    return out.replace(/,\s*([}\]])/g, '$1');
  }

  function parseJsonLoose(text) {
    try { return { value: JSON.parse(text), repaired: false }; } catch (e1) {
      try { return { value: JSON.parse(repairJson(text)), repaired: true }; } catch (e2) {
        throw new Error(e1.message);
      }
    }
  }

  /** Khôi phục LaTeX bị JSON "ăn" mất dấu \ (\beta → backspace+eta, \frac → formfeed+rac, \times → tab+imes...). */
  function fixLatexStr(s) {
    if (typeof s !== 'string') return s;
    s = s.replace(/\u0008/g, '\\b').replace(/\u000c/g, '\\f').replace(/\t(?=[a-zA-Z])/g, '\\t');
    return s.replace(/(\$\$?)([\s\S]*?)\1/g, (m, d, body) => d + body
      .replace(/\r(?=[a-zA-Z])/g, '\\r')
      .replace(/\n(?=(?:eq|eqq|eg|abla|ot|u|i|e|leq|geq|mid|subseteq|subset|parallel|cong|sim|exists|ewline|atural|ormalsize|less|gtr)(?![a-zA-Z]))/g, '\\n') + d);
  }
  function deepFix(v) {
    if (typeof v === 'string') return fixLatexStr(v);
    if (Array.isArray(v)) return v.map(deepFix);
    if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = deepFix(v[k]); return o; }
    return v;
  }

  const str = (v) => (v == null ? '' : typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : Array.isArray(v) ? v.map(str).join('\n') : '');

  function toBool(v) {
    if (typeof v === 'boolean') return v;
    if (Array.isArray(v)) return toBool(v[0]);
    const s = String(v == null ? '' : v).trim().toLowerCase();
    if (['true', 'đúng', 'dung', 'đ', 't', 'yes', 'y', '1', 'right', 'correct', 'a'].includes(s)) return true;
    if (['false', 'sai', 's', 'f', 'no', 'n', '0', 'wrong', 'incorrect', 'b'].includes(s)) return false;
    return null;
  }

  /** Chuẩn hóa 1 câu hỏi; trả về null nếu không dùng được. */
  function normalizeQuestion(raw, i, warn) {
    if (raw == null || typeof raw !== 'object') { warn(`Mục #${i + 1} không phải đối tượng câu hỏi – bỏ qua.`); return null; }
    const q = {};
    q.question = str(raw.question ?? raw.text ?? raw.prompt ?? raw.stem ?? raw.content ?? raw.q).trim();
    q.number = str(raw.number ?? raw.no ?? raw.num ?? raw.id ?? i + 1).trim() || String(i + 1);
    q.id = str(raw.id ?? '').trim();
    const label = `Câu ${q.number}`;
    if (!q.question) { warn(`${label}: thiếu nội dung câu hỏi – bỏ qua.`); return null; }
    q.question = q.question.replace(/^\s*(câu|cau|question|q)\s*\d+[a-z]?\s*[.:)]\s*/i, '');

    // Phương án
    let rawOpts = raw.options ?? raw.choices ?? raw.answers_options ?? null;
    let opts = [];
    const keyMap = {}; // key gốc (viết thường) -> key mới
    if (rawOpts && !Array.isArray(rawOpts) && typeof rawOpts === 'object') rawOpts = Object.keys(rawOpts).map((k) => ({ key: k, text: rawOpts[k] }));
    if (Array.isArray(rawOpts)) {
      rawOpts.forEach((o, j) => {
        let key = '', text = '';
        if (o && typeof o === 'object') { key = str(o.key ?? o.label ?? o.id ?? '').trim(); text = str(o.text ?? o.content ?? o.value ?? o.option ?? ''); }
        else text = str(o);
        if (!key) {
          const m = text.match(/^\s*([A-Za-z]|\d{1,2})\s*[.)]\s+/);
          if (m) { key = m[1]; text = text.slice(m[0].length); }
        } else {
          text = text.replace(new RegExp('^\\s*' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*[.)]\\s+'), '');
        }
        const nk = KEYS[j];
        if (key) keyMap[key.toLowerCase()] = nk;
        keyMap[nk.toLowerCase()] = keyMap[nk.toLowerCase()] || nk;
        opts.push({ key: nk, text: text.trim() });
      });
    }

    // Loại câu
    let type = TYPE_ALIASES[str(raw.type).trim().toLowerCase().replace(/[\s-]+/g, '_')] || '';
    let ans = raw.answer ?? raw.answers ?? raw.correct ?? raw.correctAnswer ?? raw.correct_answer ?? raw.key;
    if (!type) {
      if (opts.length) type = Array.isArray(ans) && ans.length > 1 ? 'multiple' : 'single';
      else if (typeof ans === 'boolean' || toBool(ans) !== null && /đúng hay sai|true or false|đúng\/sai/i.test(q.question)) type = 'true_false';
      else if (/_{3,}/.test(q.question)) type = 'fill_blank';
      else if (ans != null && str(ans).length <= 60) type = 'short_answer';
      else type = 'essay';
      warn(`${label}: không rõ loại câu, tự nhận là "${TYPE_LABEL[type]}".`);
    }
    if ((type === 'single' || type === 'multiple') && opts.length < 2) {
      if (type === 'single' && opts.length === 0 && toBool(ans) !== null) type = 'true_false';
      else { warn(`${label}: trắc nghiệm nhưng không đủ phương án → chuyển sang tự luận.`); type = 'essay'; }
    }
    // Đúng/Sai được viết thành trắc nghiệm 2 phương án "Đúng"/"Sai"
    if (type === 'single' && opts.length === 2 && /^(đúng|true)\.?$/i.test(opts[0].text.trim()) && /^(sai|false)\.?$/i.test(opts[1].text.trim())) {
      const a = Array.isArray(ans) ? ans[0] : ans;
      const k = keyMap[str(a).trim().toLowerCase()];
      ans = k ? k === 'A' : toBool(a);
      type = 'true_false'; opts = [];
    }

    // Đáp án
    let answer;
    if (type === 'single' || type === 'multiple') {
      const list = (Array.isArray(ans) ? ans : ans == null || ans === '' ? [] : String(ans).split(/[,;\s]+(?=[A-Za-z0-9](?:$|[,;\s]))/)).map((a) => {
        if (typeof a === 'number') return keyMap[String(a).toLowerCase()] || (a >= 1 && a <= opts.length ? KEYS[a - 1] : a === 0 ? 'A' : null);
        const s = str(a).trim().replace(/[.)]$/, '');
        if (keyMap[s.toLowerCase()]) return keyMap[s.toLowerCase()];
        const m = s.match(/^([A-Za-z])\s*[.)]/);
        if (m && keyMap[m[1].toLowerCase()]) return keyMap[m[1].toLowerCase()];
        const byText = opts.find((o) => o.text.trim().toLowerCase() === s.toLowerCase());
        return byText ? byText.key : null;
      });
      answer = Array.from(new Set(list.filter(Boolean)));
      if (list.some((x) => !x)) warn(`${label}: có đáp án không khớp phương án nào – đã bỏ phần không khớp.`);
      if (!answer.length) warn(`${label}: chưa có đáp án – khi ôn bạn sẽ tự chấm.`);
      if (type === 'single' && answer.length > 1) { type = 'multiple'; warn(`${label}: có ${answer.length} đáp án → chuyển sang dạng nhiều đáp án.`); }
    } else if (type === 'true_false') {
      answer = toBool(ans);
      if (answer === null) warn(`${label}: đáp án Đúng/Sai không hợp lệ – khi ôn bạn sẽ tự chấm.`);
    } else if (type === 'fill_blank') {
      let arr = Array.isArray(ans) ? ans : ans == null ? [] : [ans];
      answer = arr.map((a) => (Array.isArray(a) ? a.map(str) : str(a).split('|')).map((x) => x.trim()).filter(Boolean)).filter((a) => a.length);
      const blanks = (q.question.match(/_{3,}/g) || []).length;
      if (!blanks) { q.question += ' ___'.repeat(Math.max(1, answer.length)); }
      else if (answer.length && blanks !== answer.length) warn(`${label}: số chỗ trống (${blanks}) khác số đáp án (${answer.length}).`);
      if (!answer.length) warn(`${label}: chưa có đáp án – khi ôn bạn sẽ tự chấm.`);
    } else if (type === 'short_answer') {
      answer = (Array.isArray(ans) ? ans : ans == null ? [] : [ans]).map(str).map((x) => x.trim()).filter(Boolean);
      if (!answer.length) warn(`${label}: chưa có đáp án – khi ôn bạn sẽ tự chấm.`);
    } else {
      answer = str(ans).trim();
    }

    q.type = type;
    q.options = type === 'single' || type === 'multiple' ? opts : [];
    q.answer = answer;
    q.section = str(raw.section ?? raw.part ?? raw.chapter ?? raw.group ?? '').trim();
    q.context = str(raw.context ?? raw.stem_context ?? '').trim();
    q.passage = str(raw.passage ?? raw.passageId ?? raw.passage_id ?? '').trim();
    q.figure = str(raw.figure ?? raw.image ?? raw.imageDescription ?? raw.image_description ?? '').trim();
    q.explanation = str(raw.explanation ?? raw.explain ?? raw.solution ?? raw.rationale ?? '').trim();
    q.note = str(raw.note ?? raw.notes ?? raw.warning ?? '').trim();
    const src = str(raw.answerSource ?? raw.answer_source ?? raw.source ?? '').toLowerCase();
    q.answerSource = src.includes('ai') || src.includes('model') || src.includes('gen') ? 'ai' : src ? 'document' : '';
    q.fixedOrder = raw.fixedOrder === true || raw.fixed_order === true || q.options.some((o) => GENERIC_OPT.test(o.text));
    q.tags = (Array.isArray(raw.tags) ? raw.tags : raw.tags ? String(raw.tags).split(',') : []).map(str).map((t) => t.trim()).filter(Boolean).slice(0, 6);
    const diff = str(raw.difficulty).toLowerCase();
    q.difficulty = ['easy', 'medium', 'hard'].includes(diff) ? diff : '';
    return q;
  }

  /** Đọc văn bản dán vào → { deck, warnings, errors, parts } */
  function parseImport(raw) {
    const warnings = [], errors = [];
    const blocks = extractJsonBlocks(raw);
    if (!blocks.length) return { errors: ['Chưa có nội dung.'], warnings };
    const objs = [];
    let repaired = false;
    blocks.forEach((b, bi) => {
      try {
        const r = parseJsonLoose(b);
        repaired = repaired || r.repaired;
        objs.push(r.value);
      } catch (e) {
        errors.push(`Khối JSON ${blocks.length > 1 ? '#' + (bi + 1) + ' ' : ''}không hợp lệ: ${e.message}. Có thể AI trả lời bị cắt giữa chừng – hãy yêu cầu AI "xuất lại đầy đủ JSON" hoặc chia phần.`);
      }
    });
    if (!objs.length) return { errors, warnings };
    if (repaired) warnings.push('Đã tự sửa một số lỗi định dạng JSON (dấu \\ chưa nhân đôi, dấu phẩy thừa, xuống dòng trong chuỗi).');

    const deck = { title: '', subject: '', description: '', language: '', passages: {}, questions: [] };
    const parts = [];
    objs.forEach((o0) => {
      const o = deepFix(o0);
      let qs;
      if (Array.isArray(o)) qs = o;
      else {
        qs = o.questions || (o.data && o.data.questions) || o.items || [];
        deck.title = deck.title || str(o.title || o.name).trim();
        deck.subject = deck.subject || str(o.subject).trim();
        deck.description = deck.description || str(o.description).trim();
        deck.language = deck.language || str(o.language).trim();
        if (o.part) parts.push(o.part);
        const ps = Array.isArray(o.passages) ? o.passages : o.passages && typeof o.passages === 'object' ? Object.keys(o.passages).map((k) => Object.assign({ id: k }, typeof o.passages[k] === 'string' ? { text: o.passages[k] } : o.passages[k])) : [];
        ps.forEach((p, j) => { const id = str(p.id || 'p' + (j + 1)); deck.passages[id] = { id, title: str(p.title).trim(), text: str(p.text ?? p.content).trim() }; });
      }
      if (!Array.isArray(qs)) { errors.push('Không tìm thấy mảng "questions".'); return; }
      const base = deck.questions.length;
      qs.forEach((rq, i) => {
        const q = normalizeQuestion(rq, base + i, (m) => warnings.push(m));
        if (q) deck.questions.push(q);
      });
    });
    // id duy nhất
    const seen = new Set();
    deck.questions.forEach((q, i) => {
      let id = q.id || String(i + 1);
      if (seen.has(id)) { let n = 2; while (seen.has(id + '-' + n)) n++; id = id + '-' + n; }
      seen.add(id); q.id = id;
      if (q.passage && !deck.passages[q.passage]) { warnings.push(`Câu ${q.number}: không tìm thấy bài đọc "${q.passage}".`); q.passage = ''; }
    });
    if (!deck.questions.length && !errors.length) errors.push('Không có câu hỏi hợp lệ nào.');
    return { deck, warnings, errors, parts };
  }

  /** Gộp câu hỏi mới vào bộ đề có sẵn (dùng khi AI chia nhiều phần). */
  function mergeInto(target, add) {
    const ids = new Set(target.questions.map((q) => q.id));
    const pmap = {};
    Object.keys(add.passages || {}).forEach((pid) => {
      let nid = pid;
      if (target.passages[nid] && target.passages[nid].text !== add.passages[pid].text) { let n = 2; while (target.passages[pid + '-' + n]) n++; nid = pid + '-' + n; }
      pmap[pid] = nid;
      target.passages[nid] = Object.assign({}, add.passages[pid], { id: nid });
    });
    let renamed = 0;
    add.questions.forEach((q) => {
      const nq = Object.assign({}, q);
      if (ids.has(nq.id)) { let n = 2; while (ids.has(q.id + '-' + n)) n++; nq.id = q.id + '-' + n; renamed++; }
      if (nq.passage) nq.passage = pmap[nq.passage] || nq.passage;
      ids.add(nq.id);
      target.questions.push(nq);
    });
    return renamed;
  }

  // ======================================================================
  // Hiển thị nội dung (Markdown + LaTeX)
  // ======================================================================
  const hasMd = () => typeof window.marked !== 'undefined' && typeof window.DOMPurify !== 'undefined';
  function renderMath(tex, display) {
    if (window.katex) {
      try { return window.katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: 'ignore', output: 'html' }); } catch (e) { /* rơi xuống dưới */ }
    }
    return '<code>' + esc(display ? '$$' + tex + '$$' : '$' + tex + '$') + '</code>';
  }
  /** Chuyển văn bản Markdown + $LaTeX$ thành HTML an toàn. inline=true: không bọc <p>. */
  function rich(text, inline) {
    if (text == null || text === '') return '';
    const maths = [];
    const ph = (tex, display) => { maths.push([tex, display]); return '@@M' + (maths.length - 1) + '@@'; };
    let s = String(text).replace(/\\\$/g, '@@DOLLAR@@');
    s = s.replace(/\$\$([\s\S]+?)\$\$/g, (m, t) => ph(t.trim(), true))
      .replace(/\\\[([\s\S]+?)\\\]/g, (m, t) => ph(t.trim(), true))
      .replace(/\\\(([\s\S]+?)\\\)/g, (m, t) => ph(t.trim(), false))
      .replace(/\$([^$\n]+?)\$/g, (m, t) => ph(t, false));
    s = s.replace(/_{3,}/g, '\\_\\_\\_\\_\\_');
    let html;
    if (hasMd()) {
      html = inline ? window.marked.parseInline(s, { breaks: true, gfm: true }) : window.marked.parse(s, { breaks: true, gfm: true });
      html = window.DOMPurify.sanitize(html);
    } else {
      html = esc(s.replace(/\\_/g, '_')).replace(/\n/g, '<br>');
    }
    return html.replace(/@@M(\d+)@@/g, (m, i) => renderMath(maths[+i][0], maths[+i][1])).replace(/@@DOLLAR@@/g, '$');
  }
  /** Văn bản thuần (bỏ LaTeX/Markdown) để tìm kiếm & so sánh. */
  const plain = (s) => String(s || '').replace(/\$+/g, '').replace(/\\[a-zA-Z]+/g, ' ').replace(/[{}*_#>|`]/g, ' ').replace(/\s+/g, ' ').trim();

  // Đánh số chỗ trống (1), (2)... khi hiển thị câu điền khuyết
  function numberBlanks(text) { let n = 0; return text.replace(/_{3,}/g, () => '**(' + (++n) + ')** ___'); }

  function questionHtml(q, deck, opts = {}) {
    const P = opts.prog || {};
    const star = P[q.id] && P[q.id].star;
    const chips = [];
    if (q.section) chips.push(`<span class="chip">${esc(q.section)}</span>`);
    chips.push(`<span class="chip">Câu ${esc(q.number)}</span>`);
    chips.push(`<span class="chip accent">${TYPE_LABEL[q.type]}</span>`);
    if (q.answerSource === 'ai') chips.push('<span class="chip warn" title="Tài liệu không có đáp án, AI tự giải – nên kiểm tra lại">🤖 Đáp án do AI giải</span>');
    const passage = q.passage && deck.passages && deck.passages[q.passage];
    let html = `<div class="q-meta">${chips.join('')}<span class="spacer"></span>`;
    if (!opts.noStar) html += `<button class="iconbtn star-btn ${star ? 'on' : ''}" data-qid="${esc(q.id)}" title="Đánh dấu câu này">${star ? '★' : '☆'}</button>`;
    html += '</div>';
    if (passage) html += `<details class="passage" ${opts.passageOpen === false ? '' : 'open'}><summary>${esc(passage.title || 'Bài đọc')}</summary><div class="rich">${rich(passage.text)}</div></details>`;
    if (q.context) html += `<div class="context rich">${rich(q.context)}</div>`;
    html += `<div class="q-text rich">${rich(q.type === 'fill_blank' ? numberBlanks(q.question) : q.question)}</div>`;
    if (q.figure) html += `<div class="figure rich">${rich(q.figure, true)}</div>`;
    return html;
  }

  function hasAnswer(q) {
    if (q.type === 'true_false') return q.answer === true || q.answer === false;
    if (q.type === 'essay') return !!q.answer;
    return Array.isArray(q.answer) && q.answer.length > 0;
  }

  /** HTML đáp án đúng. */
  function answerHtml(q) {
    if (!hasAnswer(q)) return '<span class="muted">Tài liệu chưa có đáp án.</span>';
    switch (q.type) {
      case 'single': case 'multiple':
        return q.answer.map((k) => { const o = q.options.find((x) => x.key === k); return `<div class="answer-line"><b>${k}.</b> ${o ? rich(o.text, true) : ''}</div>`; }).join('');
      case 'true_false': return `<b>${q.answer ? 'ĐÚNG' : 'SAI'}</b>`;
      case 'fill_blank': return q.answer.map((a, i) => `<div class="answer-line"><b>(${i + 1})</b> ${a.map((x) => rich(x, true)).join(' <span class="muted">/</span> ')}</div>`).join('');
      case 'short_answer': return q.answer.map((x) => rich(x, true)).join(' <span class="muted">hoặc</span> ');
      default: return `<div class="rich">${rich(q.answer)}</div>`;
    }
  }
  function explainHtml(q) {
    let h = '';
    if (q.explanation) h += `<div class="explain rich"><b>Giải thích:</b> ${rich(q.explanation)}</div>`;
    if (q.note) h += `<div class="note">⚠️ ${rich(q.note, true)}</div>`;
    return h;
  }
  /** Chữ ngắn gọn của đáp án đúng (dùng cho thẻ/ghép cặp/đúng-sai nhanh). */
  function answerText(q) {
    if (q.type === 'single' || q.type === 'multiple') return q.answer.map((k) => (q.options.find((o) => o.key === k) || {}).text || k).join('; ');
    if (q.type === 'true_false') return q.answer ? 'Đúng' : 'Sai';
    if (q.type === 'fill_blank') return q.answer.map((a) => a[0]).join('; ');
    if (q.type === 'short_answer') return q.answer[0] || '';
    return q.answer || '';
  }

  // ======================================================================
  // Chấm điểm
  // ======================================================================
  const normText = (s) => String(s == null ? '' : s).normalize('NFC').toLowerCase().replace(/\$/g, '').replace(/\s+/g, ' ').trim().replace(/[.;:!?]+$/, '').trim();
  const looseText = (s) => normText(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9.,%+\-*/=<>()]/g, '');
  function toNum(s) {
    let t = String(s == null ? '' : s).replace(/\s/g, '').replace(/%$/, '');
    if (!t) return NaN;
    if (/^[-+]?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
    else if (/^[-+]?\d+,\d+$/.test(t)) t = t.replace(',', '.');
    return /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t) ? Number(t) : NaN;
  }
  function matchText(given, accepted) {
    const g = normText(given);
    if (!g) return false;
    return accepted.some((a) => {
      if (normText(a) === g || looseText(a) === looseText(given)) return true;
      const x = toNum(given), y = toNum(a);
      if (isNaN(x) || isNaN(y)) return false;
      const dec = (String(a).replace(/\s/g, '').match(/[.,](\d+)%?$/) || ['', ''])[1].length;
      return Math.abs(x - y) <= 0.5 * Math.pow(10, -dec) + 1e-9;
    });
  }
  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length; if (!b.length) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  }
  function similarity(a, b) {
    const x = looseText(plain(a)), y = looseText(plain(b));
    if (!x && !y) return 1;
    return 1 - levenshtein(x, y) / Math.max(x.length, y.length);
  }

  function isEmptyResp(q, r) {
    if (r == null) return true;
    if (q.type === 'multiple') return !r.length;
    if (q.type === 'fill_blank') return !r.some((x) => x && x.trim());
    if (typeof r === 'string') return !r.trim();
    return false;
  }
  /** true/false; null = cần tự chấm (tự luận hoặc chưa có đáp án). */
  function grade(q, r) {
    if (!hasAnswer(q) || q.type === 'essay') return null;
    switch (q.type) {
      case 'single': return q.answer.includes(r);
      case 'multiple': return r.length === q.answer.length && r.every((k) => q.answer.includes(k));
      case 'true_false': return r === q.answer;
      case 'fill_blank': return q.answer.every((acc, i) => matchText((r || [])[i], acc));
      case 'short_answer': return matchText(r, q.answer);
      default: return null;
    }
  }

  // ======================================================================
  // Ô nhập câu trả lời (dùng chung cho Luyện tập / Thi thử)
  // ======================================================================
  function optionOrder(q, doShuffle) {
    const keys = q.options.map((o) => o.key);
    return doShuffle && !q.fixedOrder ? shuffle(keys) : keys;
  }
  /**
   * Tạo khối nhập đáp án cho câu q.
   * opts: { order, initial, onChange, labelByPosition }
   * Trả về { el, get(), reveal(), lock(), pick(i), focus() }
   */
  function makeInput(q, opts = {}) {
    const el = document.createElement('div');
    let resp = opts.initial !== undefined ? opts.initial : q.type === 'multiple' ? [] : q.type === 'fill_blank' ? [] : null;
    let locked = false;
    const changed = () => opts.onChange && opts.onChange(resp);

    if (q.type === 'single' || q.type === 'multiple') {
      const order = opts.order || q.options.map((o) => o.key);
      el.className = 'options';
      el.innerHTML = order.map((k, i) => {
        const o = q.options.find((x) => x.key === k);
        return `<button type="button" class="opt ${q.type === 'multiple' ? 'multi' : ''}" data-key="${k}"><span class="opt-key">${KEYS[i]}</span><span class="opt-text rich">${rich(o.text, true)}</span></button>`;
      }).join('');
      const paint = () => $$('.opt', el).forEach((b) => b.classList.toggle('sel', q.type === 'multiple' ? resp.includes(b.dataset.key) : resp === b.dataset.key));
      const choose = (k) => {
        if (locked) return;
        if (q.type === 'multiple') resp = resp.includes(k) ? resp.filter((x) => x !== k) : resp.concat(k);
        else resp = k;
        paint(); changed();
      };
      el.addEventListener('click', (e) => { const b = e.target.closest('.opt'); if (b) choose(b.dataset.key); });
      paint();
      return {
        el, get: () => resp,
        pick: (i) => { const b = $$('.opt', el)[i]; if (b) choose(b.dataset.key); },
        lock: () => { locked = true; $$('.opt', el).forEach((b) => (b.disabled = true)); },
        reveal: () => {
          $$('.opt', el).forEach((b) => {
            const k = b.dataset.key;
            const sel = q.type === 'multiple' ? resp.includes(k) : resp === k;
            b.classList.remove('sel');
            if (q.answer.includes(k)) b.classList.add('correct');
            else if (sel) b.classList.add('wrong');
          });
        },
        focus: () => {},
      };
    }
    if (q.type === 'true_false') {
      el.className = 'options tf';
      el.innerHTML = '<button type="button" class="opt" data-v="1"><span class="opt-key">Đ</span><span class="opt-text">Đúng</span></button><button type="button" class="opt" data-v="0"><span class="opt-key">S</span><span class="opt-text">Sai</span></button>';
      const paint = () => $$('.opt', el).forEach((b) => b.classList.toggle('sel', resp !== null && (b.dataset.v === '1') === resp));
      const choose = (v) => { if (locked) return; resp = v; paint(); changed(); };
      el.addEventListener('click', (e) => { const b = e.target.closest('.opt'); if (b) choose(b.dataset.v === '1'); });
      paint();
      return {
        el, get: () => resp,
        pick: (i) => { if (i === 0 || i === 1) choose(i === 0); },
        lock: () => { locked = true; $$('.opt', el).forEach((b) => (b.disabled = true)); },
        reveal: () => $$('.opt', el).forEach((b) => {
          const v = b.dataset.v === '1';
          b.classList.remove('sel');
          if (q.answer === v) b.classList.add('correct'); else if (resp === v) b.classList.add('wrong');
        }),
        focus: () => {},
      };
    }
    if (q.type === 'fill_blank') {
      const n = Math.max((q.question.match(/_{3,}/g) || []).length, Array.isArray(q.answer) ? q.answer.length : 0, 1);
      if (!Array.isArray(resp)) resp = [];
      el.className = 'blank-inputs';
      el.innerHTML = Array.from({ length: n }, (_, i) => `<label><b>(${i + 1})</b><input type="text" data-i="${i}" autocomplete="off" placeholder="Điền chỗ trống ${i + 1}" value="${esc(resp[i] || '')}"></label>`).join('');
      el.addEventListener('input', (e) => { const inp = e.target.closest('input'); if (inp) { resp = resp.slice(); resp[+inp.dataset.i] = inp.value; changed(); } });
      return {
        el, get: () => resp, pick: () => {},
        lock: () => { locked = true; $$('input', el).forEach((x) => (x.disabled = true)); },
        reveal: () => { if (!hasAnswer(q)) return; $$('input', el).forEach((x, i) => x.classList.add(q.answer[i] && matchText(x.value, q.answer[i]) ? 'is-ok' : 'is-bad')); },
        focus: () => { const x = $('input', el); if (x) x.focus(); },
      };
    }
    if (q.type === 'short_answer') {
      el.className = 'blank-inputs';
      el.innerHTML = `<input type="text" autocomplete="off" placeholder="Nhập câu trả lời…" value="${esc(resp || '')}">`;
      const inp = $('input', el);
      inp.addEventListener('input', () => { resp = inp.value; changed(); });
      return {
        el, get: () => resp, pick: () => {},
        lock: () => { locked = true; inp.disabled = true; },
        reveal: () => { if (hasAnswer(q)) inp.classList.add(matchText(inp.value, q.answer) ? 'is-ok' : 'is-bad'); },
        focus: () => inp.focus(),
      };
    }
    // essay
    el.className = 'blank-inputs';
    el.innerHTML = `<textarea placeholder="Viết câu trả lời của bạn (không bắt buộc), rồi bấm “Xem đáp án” để tự chấm…">${esc(resp || '')}</textarea>`;
    const ta = $('textarea', el);
    ta.addEventListener('input', () => { resp = ta.value; changed(); });
    return { el, get: () => resp, pick: () => {}, lock: () => { locked = true; ta.disabled = true; }, reveal: () => {}, focus: () => ta.focus() };
  }

  function respText(q, r) {
    if (isEmptyResp(q, r)) return '<span class="muted">(bỏ trống)</span>';
    if (q.type === 'single') return esc(r);
    if (q.type === 'multiple') return esc(r.slice().sort().join(', '));
    if (q.type === 'true_false') return r ? 'Đúng' : 'Sai';
    if (q.type === 'fill_blank') return r.map((x, i) => `(${i + 1}) ${esc(x || '—')}`).join('; ');
    return esc(r).replace(/\n/g, '<br>');
  }

  // Bấm ☆ ở bất kỳ đâu
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.star-btn');
    if (!b || !current.deck) return;
    const on = toggleStar(current.deck.id, b.dataset.qid);
    b.classList.toggle('on', on); b.textContent = on ? '★' : '☆';
    toast(on ? 'Đã đánh dấu ★' : 'Đã bỏ đánh dấu');
  });

  // ======================================================================
  // Phạm vi ôn tập (lọc câu hỏi)
  // ======================================================================
  const DEFAULT_SCOPE = { section: '', type: '', status: '', order: 'seq', limit: '', shuffleOpts: false };
  const getScope = (deckId) => Object.assign({}, DEFAULT_SCOPE, settings.scopes[deckId] || {});
  const STATUS_LABEL = { '': 'Tất cả', wrong: 'Đang làm sai', star: 'Đã đánh dấu ★', new: 'Chưa làm', unknown: 'Chưa thuộc (flashcard)', ai: 'Đáp án do AI giải' };

  function filterQs(deck, scope, eligible) {
    const P = getProg(deck.id);
    let qs = deck.questions.filter((q) => (eligible ? eligible(q) : true));
    if (scope.section) qs = qs.filter((q) => q.section === scope.section);
    if (scope.type) qs = qs.filter((q) => q.type === scope.type);
    const st = scope.status;
    if (st === 'wrong') qs = qs.filter((q) => P[q.id] && P[q.id].last === 0);
    else if (st === 'star') qs = qs.filter((q) => P[q.id] && P[q.id].star);
    else if (st === 'new') qs = qs.filter((q) => !(P[q.id] && P[q.id].a));
    else if (st === 'unknown') qs = qs.filter((q) => !(P[q.id] && P[q.id].known));
    else if (st === 'ai') qs = qs.filter((q) => q.answerSource === 'ai');
    if (scope.order === 'random') qs = shuffle(qs);
    const lim = parseInt(scope.limit, 10);
    if (lim > 0) qs = qs.slice(0, lim);
    return qs;
  }

  // ======================================================================
  // Các chế độ ôn tập
  // ======================================================================
  const autoGradable = (q) => q.type !== 'essay' && hasAnswer(q);
  const writeEligible = (q) => hasAnswer(q) && (q.type === 'fill_blank' || q.type === 'short_answer' || (q.type === 'single' && !GENERIC_OPT.test(answerText(q)) && plain(answerText(q)).length >= 2));
  const lightningEligible = (q) => hasAnswer(q) && (q.type === 'true_false' || q.type === 'single' || q.type === 'multiple');
  const matchEligible = (q) => q.type === 'single' && hasAnswer(q) && !q.passage && !q.figure && !GENERIC_OPT.test(answerText(q)) && plain(answerText(q)).length <= 140 && plain(q.question).length <= 260 && plain(q.question).length >= 8 && !/^(câu|đáp án|phương án)/i.test(answerText(q));

  const MODES = {
    flashcard: { icon: '🃏', name: 'Flashcard', desc: 'Lật thẻ hỏi – đáp, đánh dấu thuộc / chưa thuộc', run: runFlashcard },
    practice: { icon: '✍️', name: 'Luyện tập', desc: 'Làm từng câu, chấm và giải thích ngay', run: (d) => runPractice(d) },
    exam: { icon: '⏱️', name: 'Thi thử', desc: 'Làm cả đề có giờ, nộp bài chấm điểm thang 10', run: runExam },
    srs: { icon: '🧠', name: 'Ôn ngắt quãng', desc: 'Lặp lại ngắt quãng (SRS): ôn đúng lúc sắp quên', run: runSrs },
    write: { icon: '⌨️', name: 'Gõ đáp án', desc: 'Không có phương án gợi ý – tự nhớ và gõ lại', run: runWrite, eligible: writeEligible },
    lightning: { icon: '⚡', name: 'Đúng / Sai nhanh', desc: '60 giây: đáp án đưa ra đúng hay sai?', run: runLightning, eligible: lightningEligible },
    match: { icon: '🧩', name: 'Ghép cặp', desc: 'Ghép câu hỏi với đáp án nhanh nhất có thể', run: runMatch, eligible: matchEligible },
    wrong: { icon: '🎯', name: 'Ôn câu sai', desc: 'Luyện lại những câu đang làm sai', run: (d) => runPractice(d, { status: 'wrong' }) },
    browse: { icon: '📖', name: 'Xem toàn bộ đề', desc: 'Đọc đề kèm đáp án, tìm kiếm, ẩn/hiện đáp án, in', run: runBrowse, noScope: true },
    stats: { icon: '📊', name: 'Thống kê', desc: 'Tiến độ, tỉ lệ đúng theo phần, câu hay sai', run: runStats, noScope: true },
  };

  const current = { deck: null };

  function backLink(deck, label) {
    return `<div class="row no-print" style="margin-bottom:12px"><a class="btn sm ghost" href="#/deck/${deck.id}">← ${esc(label || deck.title)}</a></div>`;
  }
  function emptyState(deck, msg) {
    app.innerHTML = backLink(deck) + `<div class="card empty"><p style="font-size:2rem;margin:0">🤷</p><p>${msg}</p><p class="small">Hãy đổi <b>phạm vi ôn tập</b> ở trang bộ đề (phần, loại câu, trạng thái...).</p><a class="btn primary" href="#/deck/${deck.id}">Về trang bộ đề</a></div>`;
  }

  // ---------------------------------------------------------------- Flashcard
  function runFlashcard(deck) {
    const scope = getScope(deck.id);
    let cards = filterQs(deck, scope);
    if (!cards.length) return emptyState(deck, 'Không có thẻ nào trong phạm vi đã chọn.');
    let i = 0, back = false, showOpts = settings.flashOpts !== false;
    const known = {}, unknown = {};

    function render() {
      if (i >= cards.length) return summary();
      const q = cards[i];
      const P = getProg(deck.id);
      const nKnown = Object.keys(known).length;
      let body;
      if (!back) {
        body = questionHtml(q, deck, { prog: P });
        if (showOpts && q.options.length) body += `<div class="options">${q.options.map((o) => `<div class="opt"><span class="opt-key">${o.key}</span><span class="opt-text rich">${rich(o.text, true)}</span></div>`).join('')}</div>`;
      } else {
        body = `<div class="q-meta"><span class="chip ok">Đáp án</span><span class="chip">Câu ${esc(q.number)}</span></div><div class="big-answer rich">${answerHtml(q)}</div>${explainHtml(q)}`;
      }
      app.innerHTML = backLink(deck) + `
        <div class="narrow">
          <div class="session-head">
            <b>🃏 Flashcard</b><span class="muted small">${i + 1}/${cards.length}</span>
            <div class="bar ok"><i style="width:${pct(nKnown, cards.length)}%"></i></div>
            <span class="chip ok">Đã thuộc ${nKnown}</span>
          </div>
          <div class="card flash ${back ? 'back' : ''}" id="flash" tabindex="0">
            <span class="face-label">${back ? 'Mặt sau' : 'Mặt trước'} · bấm để lật</span>${body}
          </div>
          <div class="actions" style="justify-content:space-between">
            <button class="btn" id="prev" ${i === 0 ? 'disabled' : ''}>← Trước</button>
            <button class="btn" id="flip">🔄 Lật thẻ</button>
            <button class="btn" id="next">Sau →</button>
          </div>
          <div class="actions" style="justify-content:center">
            <button class="btn bad" id="no">✗ Chưa thuộc</button>
            <button class="btn ok" id="yes">✓ Đã thuộc</button>
          </div>
          <div class="row" style="justify-content:center;margin-top:12px">
            <label class="check small"><input type="checkbox" id="optsT" ${showOpts ? 'checked' : ''}> Hiện phương án ở mặt trước</label>
            <button class="btn sm ghost" id="shuf">🔀 Xáo thẻ</button>
          </div>
          <p class="hint"><span class="kbd">Space</span> lật · <span class="kbd">←</span><span class="kbd">→</span> chuyển · <span class="kbd">1</span> chưa thuộc · <span class="kbd">2</span> đã thuộc</p>
        </div>`;
      $('#flash').onclick = (e) => { if (!e.target.closest('.star-btn') && !e.target.closest('summary')) flip(); };
      $('#flip').onclick = flip;
      $('#prev').onclick = () => go(-1);
      $('#next').onclick = () => go(1);
      $('#yes').onclick = () => mark(true);
      $('#no').onclick = () => mark(false);
      $('#optsT').onchange = (e) => { showOpts = e.target.checked; settings.flashOpts = showOpts; saveSettings(); render(); };
      $('#shuf').onclick = () => { cards = shuffle(cards); i = 0; back = false; render(); toast('Đã xáo thẻ'); };
    }
    function flip() {
      const el = $('#flash');
      el.classList.add('turning');
      setTimeout(() => { back = !back; render(); }, 170);
    }
    function go(d) { i = Math.max(0, Math.min(cards.length, i + d)); back = false; render(); }
    function mark(ok) {
      const q = cards[i];
      if (ok) { known[q.id] = 1; delete unknown[q.id]; } else { unknown[q.id] = 1; delete known[q.id]; }
      setQProp(deck.id, q.id, 'known', ok || undefined);
      touchDeck(deck.id);
      go(1);
    }
    function summary() {
      const nk = Object.keys(known).length, nu = Object.keys(unknown).length;
      app.innerHTML = backLink(deck) + `<div class="card narrow empty">
        <p style="font-size:2.4rem;margin:0">🎉</p><h2>Hết thẻ!</h2>
        <p>Đã thuộc <b class="chip ok">${nk}</b> · Chưa thuộc <b class="chip bad">${nu}</b> · Bỏ qua ${cards.length - nk - nu}</p>
        <div class="actions" style="justify-content:center">
          ${nu ? '<button class="btn primary" id="again">Học lại thẻ chưa thuộc</button>' : ''}
          <button class="btn" id="restart">Học lại từ đầu</button>
          <a class="btn" href="#/deck/${deck.id}">Về bộ đề</a>
        </div></div>`;
      if (nu) $('#again').onclick = () => { cards = cards.filter((q) => unknown[q.id]); Object.keys(unknown).forEach((k) => delete unknown[k]); i = 0; back = false; render(); };
      $('#restart').onclick = () => { i = 0; back = false; render(); };
    }
    onKey((e, typing) => {
      if (typing || i >= cards.length) return;
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); }
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === '1') mark(false);
      else if (e.key === '2') mark(true);
    });
    render();
  }

  // ---------------------------------------------------------------- Luyện tập / Ôn câu sai
  function runPractice(deck, override) {
    const scope = Object.assign(getScope(deck.id), override || {});
    let qs = filterQs(deck, scope);
    const isWrongMode = override && override.status === 'wrong';
    if (!qs.length) return emptyState(deck, isWrongMode ? '🎉 Không có câu nào đang làm sai trong phạm vi này!' : 'Không có câu hỏi nào trong phạm vi đã chọn.');
    let i = 0, results = [];
    let widget, checked, q;

    function render() {
      if (i >= qs.length) return summary();
      q = qs[i]; checked = false;
      const P = getProg(deck.id);
      const nOk = results.filter((r) => r.ok).length;
      app.innerHTML = backLink(deck) + `
        <div class="narrow">
          <div class="session-head">
            <b>${isWrongMode ? '🎯 Ôn câu sai' : '✍️ Luyện tập'}</b><span class="muted small">${i + 1}/${qs.length}</span>
            <div class="bar"><i style="width:${pct(i, qs.length)}%"></i></div>
            <span class="chip ok">✓ ${nOk}</span><span class="chip bad">✗ ${results.length - nOk}</span>
          </div>
          <div class="card" id="qcard">${questionHtml(q, deck, { prog: P })}<div id="inp"></div><div id="fb"></div>
            <div class="actions" id="acts">
              <button class="btn ghost" id="skip">Bỏ qua</button>
              <button class="btn primary" id="check">${q.type === 'essay' || !hasAnswer(q) ? 'Xem đáp án' : 'Kiểm tra'}</button>
            </div>
          </div>
          <p class="hint"><span class="kbd">1</span>–<span class="kbd">9</span> chọn phương án · <span class="kbd">Enter</span> kiểm tra / câu tiếp</p>
        </div>`;
      widget = makeInput(q, { order: q.options.length ? optionOrder(q, scope.shuffleOpts) : null });
      $('#inp').appendChild(widget.el);
      widget.focus();
      $('#skip').onclick = () => { i++; render(); };
      $('#check').onclick = check;
    }
    function check() {
      if (checked) return next();
      const r = widget.get();
      const g = grade(q, r);
      if (g !== null && isEmptyResp(q, r)) { toast('Hãy chọn hoặc nhập câu trả lời trước nhé'); return; }
      checked = true;
      widget.lock(); widget.reveal();
      const fb = $('#fb');
      if (g === null) {
        fb.innerHTML = `<div class="feedback"><div class="verdict">Đáp án tham khảo</div>${answerHtml(q)}${explainHtml(q)}
          <div class="actions" style="justify-content:flex-start"><span class="muted small">Tự chấm:</span><button class="btn sm ok" id="selfOk">✓ Tôi làm đúng</button><button class="btn sm bad" id="selfBad">✗ Tôi làm sai</button></div></div>`;
        $('#acts').classList.add('hidden');
        $('#selfOk').onclick = () => { finish(true); };
        $('#selfBad').onclick = () => { finish(false); };
      } else {
        fb.innerHTML = `<div class="feedback ${g ? 'ok' : 'bad'}"><div class="verdict">${g ? '✓ Chính xác!' : '✗ Chưa đúng'}</div>${g && q.type !== 'fill_blank' && q.type !== 'short_answer' ? '' : '<div><b>Đáp án đúng:</b> ' + answerHtml(q) + '</div>'}${explainHtml(q)}</div>`;
        record(deck.id, q.id, g);
        results.push({ q, ok: g, r });
        $('#check').textContent = i + 1 < qs.length ? 'Câu tiếp →' : 'Xem kết quả';
        $('#skip').classList.add('hidden');
      }
    }
    function finish(ok) {
      record(deck.id, q.id, ok);
      results.push({ q, ok, r: widget.get() });
      next();
    }
    function next() { i++; render(); }
    function summary() {
      const ok = results.filter((r) => r.ok).length;
      const wrong = results.filter((r) => !r.ok);
      app.innerHTML = backLink(deck) + `<div class="narrow stack">
        <div class="card empty"><p style="font-size:2.4rem;margin:0">${pct(ok, results.length) >= 80 ? '🏆' : pct(ok, results.length) >= 50 ? '👍' : '💪'}</p>
          <h2>Đúng ${ok}/${results.length} câu (${pct(ok, results.length)}%)</h2>
          <p class="muted">Bỏ qua ${qs.length - results.length} câu</p>
          <div class="actions" style="justify-content:center">
            ${wrong.length ? '<button class="btn primary" id="redo">Làm lại ' + wrong.length + ' câu sai</button>' : ''}
            <button class="btn" id="restart">Làm lại từ đầu</button>
            <a class="btn" href="#/deck/${deck.id}">Về bộ đề</a>
          </div></div>
        ${wrong.length ? '<h3>Các câu làm sai</h3>' + wrong.map((x) => `<div class="card">${questionHtml(x.q, deck, { noStar: true })}<div class="feedback bad"><div><b>Bạn trả lời:</b> ${respText(x.q, x.r)}</div><div><b>Đáp án đúng:</b> ${answerHtml(x.q)}</div>${explainHtml(x.q)}</div></div>`).join('') : ''}
      </div>`;
      if (wrong.length) $('#redo').onclick = () => { qs = wrong.map((x) => x.q); i = 0; results = []; render(); };
      $('#restart').onclick = () => { i = 0; results = []; if (scope.order === 'random') qs = shuffle(qs); render(); };
    }
    onKey((e, typing) => {
      if (i >= qs.length || !widget) return;
      if (e.key === 'Enter' && !(typing && e.target.tagName === 'TEXTAREA')) { e.preventDefault(); if ($('#acts') && !$('#acts').classList.contains('hidden')) check(); return; }
      if (typing || checked) return;
      if (/^[1-9]$/.test(e.key)) widget.pick(+e.key - 1);
      else if (q.type === 'true_false' && /^[đdts]$/i.test(e.key)) widget.pick(/[đdt]/i.test(e.key) ? 0 : 1);
    });
    render();
  }

  // ---------------------------------------------------------------- Thi thử
  function runExam(deck) {
    const saved = store.get(K.exam(deck.id), null);
    if (saved && !saved.submitted && saved.ids.every((id) => deck.questions.some((q) => q.id === id))) return examRun(deck, saved);
    examSetup(deck);
  }
  function examSetup(deck) {
    const scope = getScope(deck.id);
    const pool = filterQs(deck, Object.assign({}, scope, { order: 'seq', limit: '' }));
    if (!pool.length) return emptyState(deck, 'Không có câu hỏi nào trong phạm vi đã chọn.');
    const nAuto = pool.filter(autoGradable).length;
    const defN = Math.min(pool.length, 40);
    app.innerHTML = backLink(deck) + `<div class="card narrow stack">
      <h2>⏱️ Thi thử</h2>
      <p class="muted">Phạm vi hiện tại có <b>${pool.length}</b> câu (${nAuto} câu chấm tự động${pool.length - nAuto ? ', ' + (pool.length - nAuto) + ' câu tự luận/chưa có đáp án sẽ tự chấm sau khi nộp' : ''}).</p>
      <div class="fields">
        <label class="field"><span>Số câu</span><input type="number" id="n" min="1" max="${pool.length}" value="${defN}"></label>
        <label class="field"><span>Thời gian (phút, 0 = không giới hạn)</span><input type="number" id="t" min="0" value="${Math.max(5, Math.round(defN * 1.2))}"></label>
      </div>
      <label class="check"><input type="checkbox" id="rq" checked> Xáo trộn thứ tự câu hỏi</label>
      <label class="check"><input type="checkbox" id="ro" ${scope.shuffleOpts ? 'checked' : ''}> Xáo trộn phương án (trừ câu có "các phương án còn lại...")</label>
      <div class="actions"><button class="btn primary lg" id="go">Bắt đầu làm bài</button></div>
    </div>`;
    $('#n').oninput = () => { $('#t').value = Math.max(5, Math.round((+$('#n').value || 0) * 1.2)); };
    $('#go').onclick = () => {
      const n = Math.max(1, Math.min(pool.length, parseInt($('#n').value, 10) || pool.length));
      let qs = $('#rq').checked ? shuffle(pool).slice(0, n) : pool.slice(0, n);
      const so = $('#ro').checked;
      const st = { ids: qs.map((q) => q.id), orders: {}, resp: {}, flags: {}, startedAt: Date.now(), duration: Math.max(0, +$('#t').value || 0) * 60, submitted: false };
      qs.forEach((q) => { if (q.options.length) st.orders[q.id] = optionOrder(q, so); });
      store.set(K.exam(deck.id), st);
      examRun(deck, st);
    };
  }
  function examRun(deck, st) {
    const byId = Object.fromEntries(deck.questions.map((q) => [q.id, q]));
    const qs = st.ids.map((id) => byId[id]);
    const save = () => store.set(K.exam(deck.id), st);
    app.innerHTML = backLink(deck) + `
      <div class="exam-bar">
        <b>⏱️ Thi thử</b>
        <span class="timer" id="timer">--:--</span>
        <span class="muted small" id="done"></span>
        <span class="spacer"></span>
        <button class="btn sm" id="navT">☰ Danh sách câu</button>
        <button class="btn sm danger" id="quit">Huỷ bài</button>
        <button class="btn primary sm" id="submit">Nộp bài</button>
        <div class="navgrid hidden" id="nav" style="flex-basis:100%"></div>
      </div>
      <div class="narrow stack" id="list"></div>`;
    const list = $('#list');
    qs.forEach((q, idx) => {
      const card = document.createElement('div');
      card.className = 'card exam-q'; card.id = 'eq-' + idx;
      card.innerHTML = `<div class="row" style="margin-bottom:6px"><b>Câu ${idx + 1}</b><span class="spacer"></span><button class="btn sm ghost flag-btn">${st.flags[q.id] ? '🚩 Đã gắn cờ' : '🏳️ Gắn cờ xem lại'}</button></div>` + questionHtml(q, deck, { noStar: true });
      const w = makeInput(q, { order: st.orders[q.id], initial: st.resp[q.id], onChange: (r) => { st.resp[q.id] = r; save(); paintNav(); } });
      card.appendChild(w.el);
      $('.flag-btn', card).onclick = (e) => { st.flags[q.id] = !st.flags[q.id]; e.target.textContent = st.flags[q.id] ? '🚩 Đã gắn cờ' : '🏳️ Gắn cờ xem lại'; save(); paintNav(); };
      list.appendChild(card);
    });
    function paintNav() {
      const answered = qs.filter((q) => !isEmptyResp(q, st.resp[q.id])).length;
      $('#done').textContent = `Đã làm ${answered}/${qs.length}`;
      $('#nav').innerHTML = qs.map((q, idx) => `<button class="${isEmptyResp(q, st.resp[q.id]) ? '' : 'done'} ${st.flags[q.id] ? 'flag' : ''}" data-i="${idx}">${idx + 1}</button>`).join('');
    }
    $('#nav').onclick = (e) => { const b = e.target.closest('button'); if (b) $('#eq-' + b.dataset.i).scrollIntoView({ behavior: 'smooth' }); };
    $('#navT').onclick = () => $('#nav').classList.toggle('hidden');
    $('#quit').onclick = () => { if (confirm('Huỷ bài thi này? Các câu đã làm sẽ không được lưu.')) { store.del(K.exam(deck.id)); examSetup(deck); } };
    $('#submit').onclick = () => {
      const left = qs.filter((q) => isEmptyResp(q, st.resp[q.id])).length;
      if (confirm(left ? `Còn ${left} câu chưa làm. Vẫn nộp bài?` : 'Nộp bài?')) submit();
    };
    function tick() {
      const el = $('#timer'); if (!el) return;
      const used = (Date.now() - st.startedAt) / 1000;
      if (st.duration) {
        const left = st.duration - used;
        el.textContent = '⏳ ' + fmtTime(left);
        el.classList.toggle('low', left < 60);
        if (left <= 0) { toast('Hết giờ! Bài đã được nộp tự động.', 3000); submit(); }
      } else el.textContent = '⏱ ' + fmtTime(used);
    }
    function submit() {
      if (st.submitted) return;
      st.submitted = true; st.finishedAt = Date.now();
      qs.forEach((q) => { const g = grade(q, st.resp[q.id]); if (g !== null) record(deck.id, q.id, g); });
      store.del(K.exam(deck.id));
      runCleanups();
      examResult(deck, qs, st);
    }
    paintNav(); tick();
    every(1000, tick);
  }
  function examResult(deck, qs, st) {
    const self = {}; // tự chấm câu tự luận
    let onlyWrong = false;
    function score() {
      let ok = 0;
      qs.forEach((q) => { const g = grade(q, st.resp[q.id]); if (g === true || (g === null && self[q.id] === true)) ok++; });
      return ok;
    }
    function render() {
      const ok = score();
      const pending = qs.filter((q) => grade(q, st.resp[q.id]) === null && self[q.id] === undefined).length;
      const used = (st.finishedAt - st.startedAt) / 1000;
      const ten = Math.round((ok / qs.length) * 100) / 10;
      app.innerHTML = backLink(deck) + `<div class="narrow stack">
        <div class="card empty">
          <div class="score-big">${ten.toLocaleString('vi-VN')}<span class="muted" style="font-size:1.2rem">/10</span></div>
          <p>Đúng <b>${ok}/${qs.length}</b> câu · Thời gian ${fmtTime(used)}</p>
          ${pending ? `<p class="chip warn">Còn ${pending} câu tự luận / chưa có đáp án cần bạn tự chấm bên dưới</p>` : ''}
          <div class="navgrid" style="justify-content:center">${qs.map((q, i) => { const g = grade(q, st.resp[q.id]); const v = g === null ? self[q.id] : g; return `<button class="${v === true ? 'ok' : v === false ? 'bad' : ''}" data-i="${i}">${i + 1}</button>`; }).join('')}</div>
          <div class="actions" style="justify-content:center">
            <button class="btn" id="ow">${onlyWrong ? 'Hiện tất cả câu' : 'Chỉ xem câu sai'}</button>
            <button class="btn primary" id="again">Làm đề mới</button>
            <a class="btn" href="#/deck/${deck.id}">Về bộ đề</a>
          </div>
        </div>
        ${qs.map((q, i) => {
          const g = grade(q, st.resp[q.id]);
          const v = g === null ? self[q.id] : g;
          if (onlyWrong && v === true) return '';
          const opts = q.options.length ? `<div class="options">${(st.orders[q.id] || q.options.map((o) => o.key)).map((k, j) => { const o = q.options.find((x) => x.key === k); const sel = q.type === 'multiple' ? (st.resp[q.id] || []).includes(k) : st.resp[q.id] === k; return `<div class="opt ${q.answer.includes(k) ? 'correct' : sel ? 'wrong' : ''}"><span class="opt-key">${KEYS[j]}</span><span class="opt-text rich">${rich(o.text, true)}</span></div>`; }).join('')}</div>` : '';
          return `<div class="card" id="er-${i}"><div class="row" style="margin-bottom:6px"><b>Câu ${i + 1}</b> ${v === true ? '<span class="chip ok">✓ Đúng</span>' : v === false ? '<span class="chip bad">✗ Sai</span>' : '<span class="chip warn">Chờ tự chấm</span>'}</div>
            ${questionHtml(q, deck, { prog: getProg(deck.id) })}${opts}
            <div class="feedback ${v === true ? 'ok' : v === false ? 'bad' : ''}">
              ${q.options.length ? '' : `<div><b>Bạn trả lời:</b> ${respText(q, st.resp[q.id])}</div>`}
              <div><b>Đáp án đúng:</b> ${answerHtml(q)}</div>${explainHtml(q)}
              ${g === null ? `<div class="actions" style="justify-content:flex-start"><span class="muted small">Tự chấm:</span><button class="btn sm ${self[q.id] === true ? 'ok' : ''}" data-self="1" data-q="${esc(q.id)}">✓ Đúng</button><button class="btn sm ${self[q.id] === false ? 'bad' : ''}" data-self="0" data-q="${esc(q.id)}">✗ Sai</button></div>` : ''}
            </div></div>`;
        }).join('')}
      </div>`;
      $('#ow').onclick = () => { onlyWrong = !onlyWrong; render(); };
      $('#again').onclick = () => examSetup(deck);
      $$('[data-self]').forEach((b) => (b.onclick = () => {
        const id = b.dataset.q, v = b.dataset.self === '1';
        if (self[id] === undefined) record(deck.id, id, v);
        self[id] = v; const y = window.scrollY; render(); window.scrollTo(0, y);
      }));
      $$('.navgrid button[data-i]').forEach((b) => (b.onclick = () => { const el = $('#er-' + b.dataset.i); if (el) el.scrollIntoView({ behavior: 'smooth' }); else toast('Câu này đúng – đang ẩn'); }));
    }
    render();
    window.scrollTo(0, 0);
  }

  // ---------------------------------------------------------------- Ôn ngắt quãng (SRS)
  const DAY = 86400000;
  function srsNext(s, g) { // g: 0 lại, 1 khó, 2 được, 3 dễ
    s = Object.assign({ reps: 0, int: 0, ef: 2.5 }, s || {});
    if (g === 0) { s.reps = 0; s.int = 0; s.ef = Math.max(1.3, s.ef - 0.2); s.due = Date.now() + 60000; return s; }
    if (s.reps === 0) s.int = g === 1 ? 0.5 : g === 2 ? 1 : 3;
    else if (s.reps === 1) s.int = g === 1 ? 2 : g === 2 ? 3 : 6;
    else s.int = Math.round(s.int * (g === 1 ? 1.2 : g === 2 ? s.ef : s.ef * 1.3) * 10) / 10;
    s.ef = Math.max(1.3, s.ef + (g === 1 ? -0.15 : g === 3 ? 0.15 : 0));
    s.reps++;
    s.due = Date.now() + s.int * DAY;
    return s;
  }
  function runSrs(deck) {
    const scope = getScope(deck.id);
    const pool = filterQs(deck, Object.assign({}, scope, { limit: '' }));
    if (!pool.length) return emptyState(deck, 'Không có câu hỏi nào trong phạm vi đã chọn.');
    const P = getProg(deck.id);
    const now = Date.now();
    const due = pool.filter((q) => P[q.id] && P[q.id].srs && P[q.id].srs.due <= now).sort((a, b) => P[a.id].srs.due - P[b.id].srs.due);
    const fresh = pool.filter((q) => !(P[q.id] && P[q.id].srs));
    const newLimit = parseInt(scope.limit, 10) > 0 ? parseInt(scope.limit, 10) : 20;
    let queue = due.concat((scope.order === 'random' ? shuffle(fresh) : fresh).slice(0, newLimit));
    let showBack = false, doneCount = 0;
    const startTotal = queue.length;

    function render() {
      if (!queue.length) {
        const P2 = getProg(deck.id);
        const nextDue = pool.map((q) => P2[q.id] && P2[q.id].srs && P2[q.id].srs.due).filter(Boolean).sort((a, b) => a - b)[0];
        app.innerHTML = backLink(deck) + `<div class="card narrow empty"><p style="font-size:2.4rem;margin:0">🧠</p><h2>Xong lượt ôn!</h2>
          <p>Đã ôn ${doneCount} lượt thẻ. ${fresh.length > newLimit ? 'Còn ' + (fresh.length - Math.min(fresh.length, newLimit)) + ' thẻ mới chưa học.' : ''}</p>
          <p class="muted">${nextDue ? 'Thẻ tiếp theo đến hạn: ' + fmtDate(nextDue) : ''}</p>
          <div class="actions" style="justify-content:center">${fresh.length > newLimit ? '<button class="btn primary" id="more">Học thêm thẻ mới</button>' : ''}<a class="btn" href="#/deck/${deck.id}">Về bộ đề</a></div></div>`;
        if ($('#more')) $('#more').onclick = () => runSrs(deck);
        return;
      }
      const q = queue[0];
      const s = (getProg(deck.id)[q.id] || {}).srs;
      const labels = [0, 1, 2, 3].map((g) => (g === 0 ? '1 phút' : fmtInterval(srsNext(s, g).int)));
      const front = questionHtml(q, deck, { prog: getProg(deck.id) }) + (q.options.length ? `<div class="options">${q.options.map((o) => `<div class="opt ${showBack && q.answer.includes(o.key) ? 'correct' : ''}"><span class="opt-key">${o.key}</span><span class="opt-text rich">${rich(o.text, true)}</span></div>`).join('')}</div>` : '');
      app.innerHTML = backLink(deck) + `<div class="narrow">
        <div class="session-head"><b>🧠 Ôn ngắt quãng</b><span class="muted small">Còn ${queue.length} thẻ</span><div class="bar ok"><i style="width:${pct(Math.min(doneCount, startTotal), startTotal)}%"></i></div>
          <span class="chip">${s ? 'Ôn lại' : 'Thẻ mới'}</span></div>
        <div class="card">${front}
          ${showBack ? `<div class="feedback"><div class="verdict">Đáp án</div>${answerHtml(q)}${explainHtml(q)}</div>
            <p class="muted small" style="margin-top:14px">Bạn nhớ câu này thế nào?</p>
            <div class="srs-btns">
              <button class="btn bad" data-g="0">Quên<small>${labels[0]}</small></button>
              <button class="btn" data-g="1">Khó<small>${labels[1]}</small></button>
              <button class="btn ok" data-g="2">Nhớ<small>${labels[2]}</small></button>
              <button class="btn primary" data-g="3">Dễ<small>${labels[3]}</small></button>
            </div>` : '<div class="actions"><button class="btn primary lg" id="show">Hiện đáp án</button></div>'}
        </div>
        <p class="hint"><span class="kbd">Space</span> hiện đáp án · <span class="kbd">1</span>–<span class="kbd">4</span> chấm mức nhớ</p></div>`;
      if (!showBack) $('#show').onclick = () => { showBack = true; render(); };
      $$('[data-g]').forEach((b) => (b.onclick = () => rate(+b.dataset.g)));
    }
    function rate(g) {
      const q = queue.shift();
      const s = srsNext((getProg(deck.id)[q.id] || {}).srs, g);
      setQProp(deck.id, q.id, 'srs', s);
      record(deck.id, q.id, g >= 2);
      doneCount++;
      if (g === 0) queue.splice(Math.min(3, queue.length), 0, q);
      showBack = false; render();
    }
    onKey((e, typing) => {
      if (typing || !queue.length) return;
      if (!showBack && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); showBack = true; render(); }
      else if (showBack && /^[1-4]$/.test(e.key)) rate(+e.key - 1);
    });
    render();
  }

  // ---------------------------------------------------------------- Gõ đáp án
  function runWrite(deck) {
    const scope = getScope(deck.id);
    let qs = filterQs(deck, scope, writeEligible);
    if (!qs.length) return emptyState(deck, 'Không có câu phù hợp để gõ đáp án (cần câu trắc nghiệm 1 đáp án có nội dung cụ thể, câu điền khuyết hoặc trả lời ngắn).');
    let i = 0, ok = 0, done = 0, state = 'ask', q;

    function expected(q) { return q.type === 'single' ? [answerText(q)] : q.type === 'short_answer' ? q.answer : null; }
    function render() {
      if (i >= qs.length) {
        app.innerHTML = backLink(deck) + `<div class="card narrow empty"><p style="font-size:2.4rem;margin:0">⌨️</p><h2>Đúng ${ok}/${done} câu</h2>
          <div class="actions" style="justify-content:center"><button class="btn primary" id="restart">Làm lại (xáo trộn)</button><a class="btn" href="#/deck/${deck.id}">Về bộ đề</a></div></div>`;
        $('#restart').onclick = () => { qs = shuffle(qs); i = ok = done = 0; state = 'ask'; render(); };
        return;
      }
      q = qs[i];
      const isBlank = q.type === 'fill_blank';
      app.innerHTML = backLink(deck) + `<div class="narrow">
        <div class="session-head"><b>⌨️ Gõ đáp án</b><span class="muted small">${i + 1}/${qs.length}</span><div class="bar"><i style="width:${pct(i, qs.length)}%"></i></div><span class="chip ok">✓ ${ok}</span></div>
        <div class="card">${questionHtml(q, deck, { prog: getProg(deck.id) })}
          <p class="muted small">${q.type === 'single' ? 'Câu trắc nghiệm đã ẩn phương án – hãy gõ lại nội dung đáp án đúng (không cần chính xác từng chữ).' : ''}</p>
          <div id="inp"></div><div id="fb"></div>
          <div class="actions"><button class="btn ghost" id="skip">Không nhớ</button><button class="btn primary" id="check">Kiểm tra</button></div>
        </div><p class="hint"><span class="kbd">Enter</span> kiểm tra / câu tiếp</p></div>`;
      let w = null;
      if (isBlank) { w = makeInput(q); $('#inp').appendChild(w.el); }
      else { $('#inp').innerHTML = '<div class="blank-inputs"><input type="text" id="ans" autocomplete="off" placeholder="Gõ đáp án…"></div>'; }
      const getVal = () => (isBlank ? w.get() : $('#ans').value);
      (isBlank ? w.focus : () => $('#ans').focus())();
      state = 'ask';
      $('#skip').onclick = () => judge(getVal(), true);
      $('#check').onclick = () => (state === 'ask' ? judge(getVal()) : next());
      render.judgeCurrent = () => judge(getVal());
      render.widget = w;
    }
    let pending = false; // "gần đúng" đang chờ người dùng quyết định
    function judge(val, gaveUp) {
      if (state !== 'ask') return next();
      if (!gaveUp && isEmptyResp(q, val)) { toast('Hãy gõ câu trả lời (hoặc bấm “Không nhớ”)'); return; }
      state = 'judged';
      let g, sim = null;
      if (gaveUp) g = false;
      else if (q.type === 'fill_blank') g = grade(q, val);
      else if (q.type === 'short_answer') g = matchText(val, q.answer);
      else { sim = Math.max(...expected(q).map((x) => similarity(val, x))); g = sim >= 0.8 ? true : sim >= 0.55 ? 'close' : false; }
      if (render.widget) { render.widget.lock(); render.widget.reveal(); }
      if ($('#ans')) $('#ans').disabled = true;
      const simTxt = sim != null ? ' (giống ' + Math.round(sim * 100) + '%)' : '';
      const cls = g === true ? 'ok' : g === 'close' ? '' : 'bad';
      $('#fb').innerHTML = `<div class="feedback ${cls}"><div class="verdict">${g === true ? '✓ Chính xác!' : g === 'close' ? '≈ Gần đúng' + simTxt : gaveUp ? 'Đáp án là:' : '✗ Chưa đúng' + simTxt}</div>
        <div><b>Đáp án đúng:</b> ${answerHtml(q)}</div>${explainHtml(q)}
        ${g === true || gaveUp ? '' : `<div class="actions" style="justify-content:flex-start"><button class="btn sm ok" id="ovOk">${g === 'close' ? '✓ Tính là đúng' : 'Thật ra tôi trả lời đúng'}</button>${g === 'close' ? '<button class="btn sm bad" id="ovBad">✗ Tính là sai</button>' : ''}</div>`}</div>`;
      if (g === 'close') pending = true; else commit(g);
      if ($('#ovOk')) $('#ovOk').onclick = () => { if (pending) commit(true); else flipToCorrect(); next(); };
      if ($('#ovBad')) $('#ovBad').onclick = () => { commit(false); next(); };
      $('#check').textContent = 'Câu tiếp →';
      $('#skip').classList.add('hidden');
    }
    function commit(v) { pending = false; record(deck.id, q.id, v); done++; if (v) ok++; }
    function flipToCorrect() {
      const P = getProg(deck.id); const p = P[q.id];
      if (p) { p.w = Math.max(0, (p.w || 1) - 1); p.c = (p.c || 0) + 1; p.last = 1; setProg(deck.id, P); }
      ok++;
    }
    function next() { if (pending) commit(false); i++; render(); }
    onKey((e, typing) => {
      if (e.key !== 'Enter' || i >= qs.length) return;
      e.preventDefault();
      if (state === 'ask') render.judgeCurrent(); else next();
    });
    render();
  }

  // ---------------------------------------------------------------- Đúng / Sai nhanh
  function runLightning(deck) {
    const scope = getScope(deck.id);
    const pool = filterQs(deck, Object.assign({}, scope, { limit: '' }), lightningEligible);
    if (!pool.length) return emptyState(deck, 'Cần câu trắc nghiệm hoặc câu Đúng/Sai có đáp án để chơi chế độ này.');
    const DURATION = 60;
    let score = 0, streak = 0, best = getMeta(deck.id).lightningBest || 0, mistakes = [], cur, endAt, running = false;

    function makeItem() {
      const q = pool[Math.floor(Math.random() * pool.length)];
      if (q.type === 'true_false') return { q, claim: null, truth: q.answer };
      const wantTrue = Math.random() < 0.5;
      const wrongOpts = q.options.filter((o) => !q.answer.includes(o.key));
      if (q.type === 'single') {
        const o = wantTrue || !wrongOpts.length ? q.options.find((x) => x.key === q.answer[0]) : wrongOpts[Math.floor(Math.random() * wrongOpts.length)];
        return { q, claim: o.text, truth: q.answer.includes(o.key) };
      }
      const o = q.options[Math.floor(Math.random() * q.options.length)];
      return { q, claim: o.text, truth: q.answer.includes(o.key), multi: true };
    }
    function intro() {
      app.innerHTML = backLink(deck) + `<div class="card narrow empty"><p style="font-size:2.4rem;margin:0">⚡</p><h2>Đúng / Sai nhanh</h2>
        <p>Trong ${DURATION} giây, mỗi lượt hiện một câu hỏi kèm <b>một đáp án đề xuất</b>. Bấm <b>Đúng</b> nếu đó là đáp án đúng, <b>Sai</b> nếu không.</p>
        <p class="muted">Kỷ lục của bạn: <b>${best}</b> điểm · Có ${pool.length} câu trong phạm vi</p>
        <div class="actions" style="justify-content:center"><button class="btn primary lg" id="go">Bắt đầu ▶</button></div>
        <p class="hint"><span class="kbd">←</span> Sai · <span class="kbd">→</span> Đúng</p></div>`;
      $('#go').onclick = start;
    }
    function start() { score = 0; streak = 0; mistakes = []; running = true; endAt = Date.now() + DURATION * 1000; nextItem(); every(200, tick); }
    function nextItem() { if (!running) return; cur = makeItem(); render(); }
    function render() {
      const q = cur.q;
      app.innerHTML = backLink(deck) + `<div class="narrow">
        <div class="session-head"><b>⚡ Đúng / Sai nhanh</b><span class="timer" id="lt">${Math.ceil((endAt - Date.now()) / 1000)}s</span><div class="bar"><i id="lbar" style="width:${pct(endAt - Date.now(), DURATION * 1000)}%"></i></div><span class="chip ok">Điểm ${score}</span><span class="chip warn">🔥 ${streak}</span></div>
        <div class="card" id="lc">${questionHtml(q, deck, { noStar: true, passageOpen: false })}
          ${cur.claim != null ? `<div class="claim"><b class="lbl">${cur.multi ? 'Đây có phải MỘT TRONG CÁC đáp án đúng?' : 'Đáp án đề xuất'}</b><div class="rich">${rich(cur.claim, true)}</div></div>` : '<div class="claim"><b class="lbl">Phát biểu trên đúng hay sai?</b></div>'}
          <div class="tf-big"><button class="btn bad" id="no">✗ Sai</button><button class="btn ok" id="yes">✓ Đúng</button></div>
        </div></div>`;
      $('#yes').onclick = () => answer(true);
      $('#no').onclick = () => answer(false);
    }
    function answer(v) {
      if (!running || Date.now() > endAt) return;
      const right = v === cur.truth;
      if (right) { streak++; score += 1 + Math.floor(streak / 5); } else { streak = 0; mistakes.push(cur); toast('Sai rồi! Đáp án đúng: ' + plain(answerText(cur.q)).slice(0, 120), 1800); }
      const lc = $('#lc'); lc.classList.add(right ? 'flash-ok' : 'flash-bad');
      setTimeout(nextItem, right ? 180 : 450);
    }
    function tick() {
      const left = endAt - Date.now();
      if (left <= 0) return finish();
      if ($('#lt')) { $('#lt').textContent = Math.ceil(left / 1000) + 's'; $('#lt').classList.toggle('low', left < 10000); $('#lbar').style.width = pct(left, DURATION * 1000) + '%'; }
    }
    function finish() {
      running = false;
      runCleanups();
      const rec = score > best;
      if (rec) { best = score; const m = getMeta(deck.id); m.lightningBest = score; setMeta(deck.id, m); }
      touchDeck(deck.id);
      app.innerHTML = backLink(deck) + `<div class="narrow stack"><div class="card empty"><p style="font-size:2.4rem;margin:0">${rec ? '🏆' : '⚡'}</p>
        <h2>${score} điểm ${rec ? '– Kỷ lục mới!' : ''}</h2><p class="muted">Kỷ lục: ${best} · Sai ${mistakes.length} lượt</p>
        <div class="actions" style="justify-content:center"><button class="btn primary" id="again">Chơi lại</button><a class="btn" href="#/deck/${deck.id}">Về bộ đề</a></div></div>
        ${mistakes.length ? '<h3>Các lượt trả lời sai</h3>' + mistakes.map((m) => `<div class="card">${questionHtml(m.q, deck, { noStar: true, passageOpen: false })}${m.claim != null ? `<p><b>Đáp án đề xuất:</b> ${rich(m.claim, true)} → <b>${m.truth ? 'ĐÚNG' : 'SAI'}</b></p>` : ''}<div class="feedback"><b>Đáp án đúng:</b> ${answerHtml(m.q)}${explainHtml(m.q)}</div></div>`).join('') : ''}</div>`;
      $('#again').onclick = () => { onKey(keyH); start(); };
    }
    const keyH = (e, typing) => { if (typing || !running || Date.now() > endAt) return; if (e.key === 'ArrowRight') answer(true); else if (e.key === 'ArrowLeft') answer(false); };
    onKey(keyH);
    intro();
  }

  // ---------------------------------------------------------------- Ghép cặp
  function runMatch(deck) {
    const scope = getScope(deck.id);
    const pool = filterQs(deck, Object.assign({}, scope, { limit: '' }), matchEligible);
    // đáp án không trùng nhau
    const seenA = new Set();
    const uniq = pool.filter((q) => { const a = looseText(plain(answerText(q))); if (seenA.has(a)) return false; seenA.add(a); return true; });
    if (uniq.length < 3) return emptyState(deck, 'Cần ít nhất 3 câu trắc nghiệm có đáp án ngắn, cụ thể (không phải “các phương án còn lại...”) để chơi ghép cặp.');
    const PAIRS = Math.min(6, uniq.length);
    let best = getMeta(deck.id).matchBest || 0;
    let tiles, sel, left, startAt, penalty, busy;

    function start() {
      const qs = shuffle(uniq).slice(0, PAIRS);
      tiles = shuffle(qs.flatMap((q) => [{ id: q.id, kind: 'q', html: rich(q.context ? plain(q.context).slice(0, 80) + '… ' + q.question : q.question, true) }, { id: q.id, kind: 'a', html: rich(answerText(q), true) }]));
      sel = null; left = PAIRS; startAt = Date.now(); penalty = 0; busy = false;
      render(); every(250, tick);
    }
    function render() {
      app.innerHTML = backLink(deck) + `<div class="session-head"><b>🧩 Ghép cặp</b><span class="timer" id="mt">0.0s</span><span class="muted small">Còn ${left} cặp · Kỷ lục ${best ? (best / 1000).toFixed(1) + 's' : '—'}</span><span class="spacer"></span><button class="btn sm" id="re">🔀 Ván mới</button></div>
        <p class="muted small">Chọn một <b style="color:var(--accent)">câu hỏi</b> rồi chọn <b style="color:var(--ok)">đáp án</b> tương ứng (hoặc ngược lại). Ghép sai bị cộng 2 giây.</p>
        <div class="match-grid">${tiles.map((t, i) => `<button class="tile ${t.kind} ${t.gone ? 'gone' : ''}" data-i="${i}">${t.html}</button>`).join('')}</div>`;
      $('#re').onclick = () => { runCleanups(); start(); };
      $$('.tile').forEach((b) => (b.onclick = () => pick(+b.dataset.i, b)));
    }
    function pick(i, el) {
      if (busy || tiles[i].gone) return;
      if (sel === null) { sel = i; el.classList.add('sel'); return; }
      if (sel === i) { sel = null; el.classList.remove('sel'); return; }
      const a = tiles[sel], b = tiles[i];
      const elA = $(`.tile[data-i="${sel}"]`);
      if (a.kind === b.kind) { elA.classList.remove('sel'); sel = i; el.classList.add('sel'); return; }
      if (a.id === b.id) {
        a.gone = b.gone = true; elA.classList.add('gone'); el.classList.add('gone'); sel = null; left--;
        if (!left) finish();
        else { const t = $('.muted.small', app); if (t) t.textContent = `Còn ${left} cặp · Kỷ lục ${best ? (best / 1000).toFixed(1) + 's' : '—'}`; }
      } else {
        penalty += 2000; busy = true;
        elA.classList.add('bad'); el.classList.add('bad');
        setTimeout(() => { elA.classList.remove('bad', 'sel'); el.classList.remove('bad'); sel = null; busy = false; }, 450);
      }
    }
    function tick() { const el = $('#mt'); if (el) el.textContent = ((Date.now() - startAt + penalty) / 1000).toFixed(1) + 's'; }
    function finish() {
      runCleanups();
      const t = Date.now() - startAt + penalty;
      const rec = !best || t < best;
      if (rec) { best = t; const m = getMeta(deck.id); m.matchBest = t; setMeta(deck.id, m); }
      touchDeck(deck.id);
      setTimeout(() => {
        app.innerHTML = backLink(deck) + `<div class="card narrow empty"><p style="font-size:2.4rem;margin:0">${rec ? '🏆' : '🧩'}</p><h2>${(t / 1000).toFixed(1)} giây ${rec ? '– Kỷ lục mới!' : ''}</h2>
          <p class="muted">Kỷ lục: ${(best / 1000).toFixed(1)}s · Phạt ${penalty / 1000}s</p>
          <div class="actions" style="justify-content:center"><button class="btn primary" id="again">Ván mới</button><a class="btn" href="#/deck/${deck.id}">Về bộ đề</a></div></div>`;
        $('#again').onclick = start;
      }, 300);
    }
    start();
  }

  // ---------------------------------------------------------------- Xem toàn bộ đề
  function runBrowse(deck) {
    const P = getProg(deck.id);
    const sections = Array.from(new Set(deck.questions.map((q) => q.section)));
    let hide = !!settings.browseHide, kw = '', sec = '', onlyStar = false;
    app.innerHTML = backLink(deck) + `
      <div class="card no-print" style="margin-bottom:16px">
        <div class="row">
          <input type="search" id="kw" placeholder="🔍 Tìm trong câu hỏi, phương án, giải thích…" style="flex:1;min-width:200px">
          ${sections.length > 1 ? `<select id="sec" style="width:auto"><option value="">Tất cả phần</option>${sections.map((s) => `<option value="${esc(s)}">${esc(s || '(không tên)')}</option>`).join('')}</select>` : ''}
        </div>
        <div class="row" style="margin-top:10px">
          <label class="check"><input type="checkbox" id="hide" ${hide ? 'checked' : ''}> Ẩn đáp án (tự kiểm tra)</label>
          <label class="check"><input type="checkbox" id="star"> Chỉ câu ★</label>
          <span class="spacer"></span><span class="muted small" id="cnt"></span>
          <button class="btn sm" id="print">🖨 In / PDF</button>
        </div>
      </div>
      <div id="list" class="stack ${hide ? 'hide-answers' : ''}"></div>`;
    const list = $('#list');
    const html = deck.questions.map((q) => {
      const opts = q.options.length ? `<div class="options">${q.options.map((o) => `<div class="opt ${q.answer.includes(o.key) ? 'correct' : ''}"><span class="opt-key">${o.key}</span><span class="opt-text rich">${rich(o.text, true)}</span></div>`).join('')}</div>` : '';
      const p = P[q.id] || {};
      const stat = p.a ? `<span class="chip ${p.last ? 'ok' : 'bad'}">Đã làm ${p.a} lần · đúng ${p.c || 0}</span>` : '';
      return `<div class="card browse-item" data-id="${esc(q.id)}">${questionHtml(q, deck, { prog: P })}${opts}
        <div class="row" style="margin-top:10px">${stat}<span class="spacer"></span><button class="btn sm reveal-btn">👁 Hiện đáp án</button></div>
        <div class="reveal-box">${q.options.length ? '' : `<div class="feedback"><b>Đáp án:</b> ${answerHtml(q)}</div>`}${q.explanation || q.note ? `<div class="feedback" style="margin-top:8px">${explainHtml(q)}</div>` : ''}</div></div>`;
    });
    list.innerHTML = html.join('');
    const searchText = deck.questions.map((q) => looseText(plain([q.section, q.number, q.context, q.question, q.figure, q.options.map((o) => o.text).join(' '), answerText(q), q.explanation, q.tags.join(' ')].join(' '))));
    const items = $$('.browse-item', list);
    function apply() {
      const k = looseText(plain(kw));
      const Pn = getProg(deck.id);
      let n = 0;
      items.forEach((el, i) => {
        const q = deck.questions[i];
        const show = (!k || searchText[i].includes(k)) && (!sec || q.section === sec) && (!onlyStar || (Pn[q.id] && Pn[q.id].star));
        el.classList.toggle('hidden', !show); if (show) n++;
      });
      $('#cnt').textContent = `${n}/${deck.questions.length} câu`;
    }
    let tmr;
    $('#kw').oninput = (e) => { kw = e.target.value; clearTimeout(tmr); tmr = setTimeout(apply, 150); };
    if ($('#sec')) $('#sec').onchange = (e) => { sec = e.target.value; apply(); };
    $('#star').onchange = (e) => { onlyStar = e.target.checked; apply(); };
    $('#hide').onchange = (e) => { hide = e.target.checked; settings.browseHide = hide; saveSettings(); list.classList.toggle('hide-answers', hide); items.forEach((x) => x.classList.remove('shown')); };
    $('#print').onclick = () => window.print();
    list.addEventListener('click', (e) => { const b = e.target.closest('.reveal-btn'); if (b) { const it = b.closest('.browse-item'); it.classList.toggle('shown'); b.textContent = it.classList.contains('shown') ? '🙈 Ẩn đáp án' : '👁 Hiện đáp án'; } });
    apply();
  }

  // ---------------------------------------------------------------- Thống kê
  function deckStats(deck) {
    const P = getProg(deck.id);
    const s = { total: deck.questions.length, done: 0, att: 0, ok: 0, wrong: 0, known: 0, star: 0, due: 0, ai: 0, noAns: 0 };
    const now = Date.now();
    deck.questions.forEach((q) => {
      const p = P[q.id] || {};
      if (p.a) { s.done++; s.att += p.a; s.ok += p.c || 0; }
      if (p.last === 0) s.wrong++;
      if (p.known) s.known++;
      if (p.star) s.star++;
      if (p.srs && p.srs.due <= now) s.due++;
      if (q.answerSource === 'ai') s.ai++;
      if (!hasAnswer(q)) s.noAns++;
    });
    return s;
  }
  function runStats(deck) {
    const P = getProg(deck.id);
    const s = deckStats(deck);
    const meta = getMeta(deck.id);
    const secs = {};
    deck.questions.forEach((q) => {
      const k = q.section || '(không phân phần)';
      const x = secs[k] || (secs[k] = { n: 0, done: 0, att: 0, ok: 0 });
      const p = P[q.id] || {};
      x.n++; if (p.a) { x.done++; x.att += p.a; x.ok += p.c || 0; }
    });
    const hard = deck.questions.filter((q) => P[q.id] && P[q.id].w).sort((a, b) => (P[b.id].w - (P[b.id].c || 0)) - (P[a.id].w - (P[a.id].c || 0)) || P[b.id].w - P[a.id].w).slice(0, 10);
    const types = {};
    deck.questions.forEach((q) => (types[q.type] = (types[q.type] || 0) + 1));
    app.innerHTML = backLink(deck) + `<div class="stack">
      <div class="card"><h2>📊 Thống kê</h2>
        <div class="row">
          <div class="stat"><b>${s.done}/${s.total}</b><span>Câu đã làm</span></div>
          <div class="stat"><b>${pct(s.ok, s.att)}%</b><span>Tỉ lệ đúng (${s.ok}/${s.att} lượt)</span></div>
          <div class="stat"><b>${s.wrong}</b><span>Câu đang sai</span></div>
          <div class="stat"><b>${s.known}</b><span>Thẻ đã thuộc</span></div>
          <div class="stat"><b>${s.due}</b><span>Thẻ SRS đến hạn</span></div>
          <div class="stat"><b>${s.star}</b><span>Câu đánh dấu ★</span></div>
        </div>
        <p class="muted small" style="margin-top:12px">Kỷ lục Đúng/Sai nhanh: <b>${meta.lightningBest || 0}</b> điểm · Ghép cặp: <b>${meta.matchBest ? (meta.matchBest / 1000).toFixed(1) + 's' : '—'}</b> · Ôn lần cuối: ${fmtDate(meta.lastStudied)}</p>
        <div class="chips">${Object.keys(types).map((t) => `<span class="chip accent">${TYPE_LABEL[t]}: ${types[t]}</span>`).join('')}${s.ai ? `<span class="chip warn">🤖 ${s.ai} câu đáp án do AI giải</span>` : ''}${s.noAns ? `<span class="chip bad">${s.noAns} câu chưa có đáp án</span>` : ''}</div>
      </div>
      <div class="card"><h3>Theo phần / đề</h3><div class="table-wrap"><table class="data"><thead><tr><th>Phần</th><th>Số câu</th><th>Đã làm</th><th style="min-width:140px">Tỉ lệ đúng</th></tr></thead><tbody>
        ${Object.keys(secs).map((k) => { const x = secs[k]; return `<tr><td>${esc(k)}</td><td>${x.n}</td><td>${x.done}</td><td><div class="row" style="flex-wrap:nowrap"><div class="bar ok" style="flex:1"><i style="width:${pct(x.ok, x.att)}%"></i></div><span class="small">${x.att ? pct(x.ok, x.att) + '%' : '—'}</span></div></td></tr>`; }).join('')}
      </tbody></table></div></div>
      <div class="card"><h3>Câu hay sai nhất</h3>${hard.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Câu</th><th>Nội dung</th><th>Sai</th><th>Đúng</th></tr></thead><tbody>${hard.map((q) => `<tr><td>${esc((q.section ? q.section + ' · ' : '') + q.number)}</td><td class="rich">${rich(plain(q.question).slice(0, 140), true)}</td><td><span class="chip bad">${P[q.id].w}</span></td><td><span class="chip ok">${P[q.id].c || 0}</span></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Chưa có câu nào làm sai. Tuyệt!</p>'}</div>
      <div class="card"><h3>Đặt lại</h3><p class="muted small">Xoá lịch sử làm bài, thẻ đã thuộc, lịch SRS, đánh dấu và kỷ lục của bộ đề này. Câu hỏi vẫn giữ nguyên.</p>
        <button class="btn danger" id="reset">Xoá toàn bộ tiến độ</button></div>
    </div>`;
    $('#reset').onclick = () => { if (confirm('Xoá toàn bộ tiến độ của bộ đề này?')) { store.del(K.prog(deck.id)); store.del(K.meta(deck.id)); toast('Đã xoá tiến độ'); runStats(deck); } };
  }

  // ======================================================================
  // Trang: Thư viện
  // ======================================================================
  function viewHome() {
    current.deck = null;
    const idx = getIndex();
    app.innerHTML = `<div class="stack">
      <section class="card hero">
        <h1>Luyện đề từ file PDF bằng AI</h1>
        <p class="muted">Biến mọi file đề thi (PDF, ảnh, Word…) thành flashcard, bài luyện tập, thi thử, trò chơi ôn tập. Dữ liệu chỉ lưu trên trình duyệt của bạn.</p>
        <ol class="steps">
          <li><b>Copy prompt</b> bên dưới.</li>
          <li>Mở ChatGPT / Claude / Gemini, <b>đính kèm file PDF</b> và dán prompt.</li>
          <li><b>Dán JSON</b> AI trả về vào trang “Nhập đề” → bắt đầu ôn!</li>
        </ol>
        <div class="row">
          <button class="btn primary lg" id="copyP">📋 Copy prompt</button>
          <a class="btn lg" href="#/import">➕ Nhập JSON</a>
          <button class="btn lg ghost" id="demo">✨ Dùng thử đề mẫu</button>
        </div>
      </section>
      <section>
        <div class="row" style="margin-bottom:10px"><h2 style="margin:0">Bộ đề của bạn</h2><span class="spacer"></span>
          ${idx.length ? '<button class="btn sm" id="backup">💾 Sao lưu tất cả</button>' : ''}
          <label class="btn sm">📂 Khôi phục<input type="file" id="restore" accept=".json,application/json" hidden></label>
        </div>
        ${idx.length ? `<div class="grid">${idx.map((d) => {
          const deck = loadDeck(d.id);
          if (!deck) return '';
          const s = deckStats(deck);
          const m = getMeta(d.id);
          return `<a class="card deck-card" href="#/deck/${d.id}">
            <h3>${esc(d.title)}</h3>
            <div class="chips">${d.subject ? `<span class="chip accent">${esc(d.subject)}</span>` : ''}<span class="chip">${s.total} câu</span>${s.wrong ? `<span class="chip bad">${s.wrong} câu sai</span>` : ''}${s.due ? `<span class="chip warn">${s.due} thẻ đến hạn</span>` : ''}</div>
            <div class="bar"><i style="width:${pct(s.done, s.total)}%"></i></div>
            <span class="muted small">Đã làm ${pct(s.done, s.total)}% · Đúng ${pct(s.ok, s.att)}% · ${m.lastStudied ? 'Ôn lần cuối ' + fmtDate(m.lastStudied) : 'Chưa ôn'}</span>
          </a>`;
        }).join('')}</div>` : '<div class="card empty"><p style="font-size:2rem;margin:0">📭</p><p>Chưa có bộ đề nào. Hãy nhập JSON từ AI hoặc bấm <b>Dùng thử đề mẫu</b>.</p></div>'}
      </section>
    </div>`;
    $('#copyP').onclick = async () => toast((await copyText(window.buildPrompt(''))) ? '✅ Đã copy prompt! Giờ gửi kèm file PDF cho AI.' : 'Không copy được – hãy vào trang Nhập đề để copy thủ công.');
    $('#demo').onclick = () => {
      const r = parseImport(window.SAMPLE_DECK_JSON);
      if (r.errors && r.errors.length) { toast('Lỗi đề mẫu: ' + r.errors[0]); return; }
      const deck = Object.assign(r.deck, { id: uid(), createdAt: Date.now() });
      saveDeck(deck);
      location.hash = '#/deck/' + deck.id;
    };
    if ($('#backup')) $('#backup').onclick = () => {
      const all = { format: 'qa-maker-backup', version: 1, exportedAt: new Date().toISOString(), decks: getIndex().map((d) => ({ deck: loadDeck(d.id), progress: getProg(d.id), meta: getMeta(d.id) })).filter((x) => x.deck) };
      download('qa-maker-backup-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(all));
    };
    $('#restore').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        if (data.format === 'qa-maker-backup') {
          let n = 0;
          data.decks.forEach((x) => { if (x.deck && x.deck.id && Array.isArray(x.deck.questions)) { saveDeck(x.deck); if (x.progress) setProg(x.deck.id, x.progress); if (x.meta) setMeta(x.deck.id, x.meta); n++; } });
          toast(`Đã khôi phục ${n} bộ đề`); viewHome();
        } else {
          sessionStorage.setItem('qam:pending', await f.text());
          location.hash = '#/import';
        }
      } catch (err) { toast('File không hợp lệ: ' + err.message, 3500); }
    };
  }

  // ======================================================================
  // Trang: Nhập đề
  // ======================================================================
  function viewImport(targetId) {
    current.deck = null;
    const idx = getIndex();
    const pending = sessionStorage.getItem('qam:pending') || '';
    sessionStorage.removeItem('qam:pending');
    app.innerHTML = `<div class="narrow stack">
      <section class="card stack">
        <h2>① Copy prompt và gửi cho AI</h2>
        <p class="muted">Prompt dùng được cho mọi loại đề (trắc nghiệm, đúng/sai, điền khuyết, tự luận, có công thức, bảng, hình…) ở mọi môn. Đính kèm file PDF/ảnh vào ChatGPT, Claude hoặc Gemini rồi dán prompt.</p>
        <label class="field"><span>Ghi chú thêm cho AI (không bắt buộc)</span>
          <textarea id="extra" style="min-height:70px" placeholder="Ví dụ: Chỉ lấy Đề số 01 và 02 · Đáp án là phương án được tô vàng · File tiếng Anh, giữ nguyên tiếng Anh · Bỏ qua phần lý thuyết ở đầu file…">${esc(settings.lastExtra || '')}</textarea></label>
        <div class="row"><button class="btn primary" id="copyP">📋 Copy prompt</button><span class="muted small">Mẹo: file dài thì AI sẽ chia phần, bạn gõ “tiếp” để lấy phần sau rồi dán gộp vào cùng bộ đề.</span></div>
        <details class="panel"><summary>Xem toàn bộ prompt</summary><pre class="prompt-pre" id="promptPre"></pre></details>
      </section>
      <section class="card stack dropzone" id="dz">
        <h2>② Dán JSON AI trả về</h2>
        <textarea class="code" id="json" placeholder='Dán nguyên câu trả lời của AI vào đây (có thể kèm \`\`\`json … \`\`\`, nhiều phần cùng lúc cũng được). Hoặc kéo-thả / chọn file .json.'>${esc(pending)}</textarea>
        <div class="row"><label class="btn sm">📂 Chọn file .json<input type="file" id="file" accept=".json,.txt,application/json" hidden></label><button class="btn sm ghost" id="clear">Xoá</button><span class="spacer"></span><span class="muted small" id="size"></span></div>
        <div id="result"></div>
        <div id="saveBox" class="hidden stack">
          <div class="fields">
            <label class="field"><span>Lưu vào</span><select id="target"><option value="">➕ Tạo bộ đề mới</option>${idx.map((d) => `<option value="${d.id}">Gộp vào: ${esc(d.title)} (${d.count} câu)</option>`).join('')}</select></label>
            <label class="field" id="titleF"><span>Tên bộ đề</span><input type="text" id="title"></label>
          </div>
          <div class="actions"><button class="btn primary lg" id="save">💾 Lưu & bắt đầu ôn</button></div>
        </div>
      </section>
    </div>`;
    const extra = $('#extra');
    const refreshPrompt = () => { $('#promptPre').textContent = window.buildPrompt(extra.value); };
    refreshPrompt();
    extra.oninput = () => { settings.lastExtra = extra.value; saveSettings(); refreshPrompt(); };
    $('#copyP').onclick = async () => toast((await copyText(window.buildPrompt(extra.value))) ? '✅ Đã copy prompt! Gửi kèm file đề cho AI nhé.' : 'Trình duyệt chặn copy – hãy mở “Xem toàn bộ prompt” và copy thủ công.');

    const ta = $('#json');
    let parsed = null, tmr;
    function check() {
      const v = ta.value;
      $('#size').textContent = v ? (v.length / 1024).toFixed(1) + ' KB' : '';
      const box = $('#result');
      if (!v.trim()) { box.innerHTML = ''; $('#saveBox').classList.add('hidden'); parsed = null; return; }
      const r = parseImport(v);
      parsed = r.errors && r.errors.length && !(r.deck && r.deck.questions.length) ? null : r;
      let h = '';
      if (r.errors && r.errors.length) h += `<div class="msg bad"><b>Lỗi:</b><ul>${r.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>`;
      if (parsed) {
        const d = r.deck;
        const types = {};
        d.questions.forEach((q) => (types[q.type] = (types[q.type] || 0) + 1));
        const secs = Array.from(new Set(d.questions.map((q) => q.section).filter(Boolean)));
        const ai = d.questions.filter((q) => q.answerSource === 'ai').length;
        const part = r.parts[r.parts.length - 1];
        h += `<div class="msg ok"><b>✓ Đọc được ${d.questions.length} câu hỏi</b>${d.title ? ' – “' + esc(d.title) + '”' : ''}
          <div class="chips" style="margin-top:6px">${Object.keys(types).map((t) => `<span class="chip accent">${TYPE_LABEL[t]}: ${types[t]}</span>`).join('')}${secs.length ? `<span class="chip">${secs.length} phần: ${esc(secs.slice(0, 4).join(', '))}${secs.length > 4 ? '…' : ''}</span>` : ''}${ai ? `<span class="chip warn">🤖 ${ai} câu AI tự giải</span>` : ''}</div></div>`;
        if (part && part.done === false) h += `<div class="msg warn">📦 Đây là <b>phần ${esc(part.index || '?')}</b> và AI báo <b>còn tiếp</b>. Lưu phần này, rồi gõ “tiếp” với AI và dán phần sau, chọn <b>Gộp vào</b> bộ đề này.</div>`;
        if (r.warnings.length) h += `<details class="msg warn"><summary>⚠️ ${r.warnings.length} lưu ý (bấm để xem)</summary><ul>${r.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></details>`;
        // gợi ý gộp nếu trùng tên
        const sel = $('#target');
        const same = idx.find((x) => x.title === d.title);
        if (!sel.dataset.touched) sel.value = targetId && idx.some((x) => x.id === targetId) ? targetId : same && part && part.index > 1 ? same.id : '';
        if (!$('#title').dataset.touched) $('#title').value = d.title || 'Bộ đề ' + new Date().toLocaleDateString('vi-VN');
        $('#titleF').classList.toggle('hidden', !!sel.value);
        $('#saveBox').classList.remove('hidden');
      } else $('#saveBox').classList.add('hidden');
      box.innerHTML = h;
    }
    ta.oninput = () => { clearTimeout(tmr); tmr = setTimeout(check, 250); };
    $('#clear').onclick = () => { ta.value = ''; check(); ta.focus(); };
    $('#target').onchange = (e) => { e.target.dataset.touched = 1; $('#titleF').classList.toggle('hidden', !!e.target.value); };
    $('#title').oninput = (e) => (e.target.dataset.touched = 1);
    const loadFile = async (f) => { if (f) { ta.value = await f.text(); check(); } };
    $('#file').onchange = (e) => loadFile(e.target.files[0]);
    const dz = $('#dz');
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
    dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('drag'); loadFile(e.dataTransfer.files[0]); });
    $('#save').onclick = () => {
      if (!parsed) return;
      const tid = $('#target').value;
      let deck;
      if (tid) {
        deck = loadDeck(tid);
        if (!deck) { toast('Không tìm thấy bộ đề đích'); return; }
        const before = deck.questions.length;
        const renamed = mergeInto(deck, parsed.deck);
        if (!deck.description && parsed.deck.description) deck.description = parsed.deck.description;
        saveDeck(deck);
        toast(`Đã gộp thêm ${deck.questions.length - before} câu${renamed ? ' (' + renamed + ' câu được đổi id do trùng)' : ''}`, 3000);
      } else {
        deck = Object.assign(parsed.deck, { id: uid(), createdAt: Date.now() });
        deck.title = $('#title').value.trim() || deck.title || 'Bộ đề không tên';
        saveDeck(deck);
        toast(`Đã lưu ${deck.questions.length} câu`);
      }
      location.hash = '#/deck/' + deck.id;
    };
    if (pending) check();
  }

  // ======================================================================
  // Trang: Bộ đề
  // ======================================================================
  function viewDeck(deck) {
    const s = deckStats(deck);
    const scope = getScope(deck.id);
    const sections = Array.from(new Set(deck.questions.map((q) => q.section)));
    const types = Array.from(new Set(deck.questions.map((q) => q.type)));
    const savedExam = store.get(K.exam(deck.id), null);
    app.innerHTML = `<div class="stack">
      <div class="row no-print"><a class="btn sm ghost" href="#/">← Thư viện</a></div>
      <section class="card">
        <div class="row" style="align-items:flex-start"><div style="flex:1;min-width:220px">
          <h1 style="margin-bottom:4px">${esc(deck.title)}</h1>
          <div class="chips">${deck.subject ? `<span class="chip accent">${esc(deck.subject)}</span>` : ''}<span class="chip">${s.total} câu</span>${sections.filter(Boolean).length ? `<span class="chip">${sections.filter(Boolean).length} phần</span>` : ''}${s.ai ? `<span class="chip warn">🤖 ${s.ai} câu AI giải</span>` : ''}</div>
          ${deck.description ? `<p class="muted small">${esc(deck.description)}</p>` : ''}
        </div></div>
        <div class="row" style="margin-top:14px">
          <div class="stat"><b>${pct(s.done, s.total)}%</b><span>Đã làm (${s.done}/${s.total})</span></div>
          <div class="stat"><b>${pct(s.ok, s.att)}%</b><span>Tỉ lệ đúng</span></div>
          <div class="stat"><b>${s.wrong}</b><span>Câu đang sai</span></div>
          <div class="stat"><b>${s.due}</b><span>Thẻ SRS đến hạn</span></div>
        </div>
      </section>

      <details class="card panel" id="scopeP" ${settings.scopeOpen ? 'open' : ''}>
        <summary>🎚 Phạm vi ôn tập <span class="muted small" id="scopeSum" style="font-weight:400"></span></summary>
        <div class="fields" style="margin-top:14px">
          ${sections.length > 1 ? `<label class="field"><span>Phần / đề</span><select data-k="section"><option value="">Tất cả</option>${sections.map((x) => `<option value="${esc(x)}">${esc(x || '(không tên)')}</option>`).join('')}</select></label>` : ''}
          ${types.length > 1 ? `<label class="field"><span>Loại câu</span><select data-k="type"><option value="">Tất cả</option>${types.map((t) => `<option value="${t}">${TYPE_LABEL[t]}</option>`).join('')}</select></label>` : ''}
          <label class="field"><span>Trạng thái</span><select data-k="status">${Object.keys(STATUS_LABEL).map((k) => `<option value="${k}">${STATUS_LABEL[k]}</option>`).join('')}</select></label>
          <label class="field"><span>Thứ tự</span><select data-k="order"><option value="seq">Theo thứ tự trong đề</option><option value="random">Ngẫu nhiên</option></select></label>
          <label class="field"><span>Số câu tối đa</span><input type="number" min="0" data-k="limit" placeholder="Tất cả"></label>
        </div>
        <label class="check" style="margin-top:12px"><input type="checkbox" data-k="shuffleOpts"> Xáo trộn thứ tự phương án (trừ câu có “các phương án còn lại…”)</label>
      </details>

      ${savedExam && !savedExam.submitted ? `<div class="msg warn row"><span>⏱️ Bạn có một bài thi thử đang làm dở.</span><span class="spacer"></span><a class="btn sm primary" href="#/deck/${deck.id}/exam">Làm tiếp</a></div>` : ''}

      <section><div class="grid" id="modes"></div></section>

      <section class="card">
        <h3>Quản lý bộ đề</h3>
        <div class="row">
          <a class="btn sm" href="#/import?deck=${deck.id}">➕ Thêm câu / phần tiếp theo</a>
          <button class="btn sm" id="exp">⬇️ Xuất JSON</button>
          <button class="btn sm" id="copyJ">📋 Copy JSON</button>
          <button class="btn sm" id="ren">✏️ Đổi tên</button>
          <button class="btn sm danger" id="del">🗑 Xoá bộ đề</button>
        </div>
      </section>
    </div>`;

    $$('[data-k]').forEach((el) => {
      const k = el.dataset.k;
      if (el.type === 'checkbox') el.checked = !!scope[k]; else el.value = scope[k] == null ? '' : scope[k];
      el.onchange = el.oninput = () => {
        scope[k] = el.type === 'checkbox' ? el.checked : el.value;
        settings.scopes[deck.id] = scope; saveSettings();
        paintModes();
      };
    });
    $('#scopeP').ontoggle = (e) => { settings.scopeOpen = e.target.open; saveSettings(); };

    function paintModes() {
      const base = filterQs(deck, Object.assign({}, scope, { order: 'seq' }));
      const parts = [];
      if (scope.section) parts.push(scope.section || '(không tên)');
      if (scope.type) parts.push(TYPE_LABEL[scope.type]);
      if (scope.status) parts.push(STATUS_LABEL[scope.status]);
      if (scope.order === 'random') parts.push('ngẫu nhiên');
      if (scope.shuffleOpts) parts.push('xáo phương án');
      $('#scopeSum').textContent = `— ${base.length} câu${parts.length ? ' · ' + parts.join(' · ') : ' · tất cả'}`;
      const P = getProg(deck.id);
      $('#modes').innerHTML = Object.keys(MODES).map((key) => {
        const m = MODES[key];
        let n = '';
        if (!m.noScope) {
          const cnt = key === 'wrong' ? filterQs(deck, Object.assign({}, scope, { status: 'wrong', order: 'seq' })).length : base.filter(m.eligible || (() => true)).length;
          n = key === 'srs' ? `${base.filter((q) => P[q.id] && P[q.id].srs && P[q.id].srs.due <= Date.now()).length} đến hạn · ${base.filter((q) => !(P[q.id] && P[q.id].srs)).length} mới` : cnt + ' câu';
          if (!cnt && key !== 'srs') n = '<span class="chip bad">0 câu</span>';
          else n = `<span class="chip">${n}</span>`;
        }
        return `<a class="mode-card" href="#/deck/${deck.id}/${key}"><span class="mode-icon">${m.icon}</span><span><b>${m.name}</b><span class="small">${m.desc}</span><br>${n}</span></a>`;
      }).join('');
    }
    paintModes();

    const exportJson = () => JSON.stringify({ format: 'qa-maker', version: 1, title: deck.title, subject: deck.subject, description: deck.description, language: deck.language, passages: Object.values(deck.passages || {}), questions: deck.questions }, null, 2);
    $('#exp').onclick = () => download(deck.title.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80) + '.json', exportJson());
    $('#copyJ').onclick = async () => toast((await copyText(exportJson())) ? 'Đã copy JSON bộ đề' : 'Không copy được');
    $('#ren').onclick = () => { const t = prompt('Tên mới cho bộ đề:', deck.title); if (t && t.trim()) { deck.title = t.trim(); saveDeck(deck); viewDeck(deck); } };
    $('#del').onclick = () => { if (confirm(`Xoá bộ đề “${deck.title}” và toàn bộ tiến độ? Không thể hoàn tác.`)) { deleteDeck(deck.id); toast('Đã xoá bộ đề'); location.hash = '#/'; } };
  }

  // ======================================================================
  // Điều hướng
  // ======================================================================
  function route() {
    runCleanups();
    $('#toast').classList.remove('show');
    const [path, qs] = location.hash.replace(/^#\/?/, '').split('?');
    const parts = (path || '').split('/').filter(Boolean).map(decodeURIComponent);
    const query = new URLSearchParams(qs || '');
    window.scrollTo(0, 0);
    if (!parts.length) return viewHome();
    if (parts[0] === 'import') return viewImport(query.get('deck'));
    if (parts[0] === 'deck') {
      const deck = loadDeck(parts[1]);
      if (!deck) { app.innerHTML = '<div class="card empty"><p>Không tìm thấy bộ đề này (có thể đã bị xoá hoặc ở trình duyệt khác).</p><a class="btn primary" href="#/">Về thư viện</a></div>'; return; }
      deck.passages = deck.passages || {};
      current.deck = deck;
      const mode = parts[2] && MODES[parts[2]];
      if (mode) { document.title = mode.name + ' · ' + deck.title; return mode.run(deck); }
      document.title = deck.title + ' – QA Maker';
      return viewDeck(deck);
    }
    location.hash = '#/';
  }

  function applyTheme() {
    if (settings.theme === 'light' || settings.theme === 'dark') document.documentElement.dataset.theme = settings.theme;
    else delete document.documentElement.dataset.theme;
  }
  $('#themeBtn').onclick = () => {
    const order = ['auto', 'light', 'dark'];
    settings.theme = order[(order.indexOf(settings.theme) + 1) % 3];
    saveSettings(); applyTheme();
    toast('Giao diện: ' + { auto: 'Theo hệ thống', light: 'Sáng', dark: 'Tối' }[settings.theme]);
  };

  applyTheme();
  window.addEventListener('hashchange', () => { document.title = 'QA Maker – Luyện đề'; route(); });
  route();

  // Cho phép kiểm thử từ console
  window.QAM = { parseImport, normalizeQuestion, grade, matchText, rich, repairJson, similarity };
})();
