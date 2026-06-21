'use strict';

/* =========================================================
   日本史 一問一答チャレンジ
   - data/manifest.json で時代一覧を読み込む
   - 各時代の問題は data/<file>.json から遅延読み込み
   ========================================================= */

const COUNT_OPTIONS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];

const state = {
  eras: [],            // manifest の時代一覧
  selectedEras: new Set(),
  count: 10,
  pool: [],            // 出題候補（読み込んだ問題）
  quiz: [],            // 実際の出題リスト
  current: 0,
  firstTryWrong: [],   // 最初の解答で間違えた問題
  answeredFirstTry: false,
};

/* ---------- 画面切り替え ---------- */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- 配列シャッフル ---------- */
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* =========================================================
   スタート画面の構築
   ========================================================= */
async function init() {
  try {
    const res = await fetch('data/manifest.json');
    if (!res.ok) throw new Error('manifest 読み込み失敗');
    const manifest = await res.json();
    state.eras = manifest.eras;
  } catch (e) {
    document.getElementById('era-list').innerHTML =
      '<p style="color:var(--wrong)">問題データの読み込みに失敗しました。インターネット接続を確認してください。</p>';
    console.error(e);
    return;
  }

  renderEras();
  renderCounts();
  bindStartEvents();
  updateStartSummary();
}

function renderEras() {
  const wrap = document.getElementById('era-list');
  wrap.innerHTML = '';
  state.eras.forEach(era => {
    const label = document.createElement('label');
    label.className = 'era-item';
    label.innerHTML = `
      <input type="checkbox" value="${era.id}">
      <span>
        <span class="era-name">${era.name}</span>
        <span class="era-meta">${era.range || ''}（${era.total}問）</span>
      </span>`;
    const input = label.querySelector('input');
    input.addEventListener('change', () => {
      if (input.checked) { state.selectedEras.add(era.id); label.classList.add('checked'); }
      else { state.selectedEras.delete(era.id); label.classList.remove('checked'); }
      updateStartSummary();
    });
    wrap.appendChild(label);
  });
}

function renderCounts() {
  const wrap = document.getElementById('count-list');
  wrap.innerHTML = '';
  COUNT_OPTIONS.forEach(n => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'count-btn' + (n === state.count ? ' selected' : '');
    btn.textContent = n;
    btn.addEventListener('click', () => {
      state.count = n;
      wrap.querySelectorAll('.count-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      updateStartSummary();
    });
    wrap.appendChild(btn);
  });
}

function bindStartEvents() {
  document.getElementById('btn-select-all').addEventListener('click', () => {
    document.querySelectorAll('#era-list input').forEach(i => {
      if (!i.checked) { i.checked = true; i.dispatchEvent(new Event('change')); }
    });
  });
  document.getElementById('btn-clear-all').addEventListener('click', () => {
    document.querySelectorAll('#era-list input').forEach(i => {
      if (i.checked) { i.checked = false; i.dispatchEvent(new Event('change')); }
    });
  });
  document.getElementById('btn-start').addEventListener('click', startQuiz);
}

function availableTotal() {
  return state.eras
    .filter(e => state.selectedEras.has(e.id))
    .reduce((sum, e) => sum + (e.total || 0), 0);
}

function updateStartSummary() {
  const total = availableTotal();
  const summary = document.getElementById('start-summary');
  const startBtn = document.getElementById('btn-start');

  if (state.selectedEras.size === 0) {
    summary.textContent = '時代をえらんでください';
    startBtn.disabled = true;
    return;
  }
  const ask = Math.min(state.count, total);
  summary.textContent = `えらんだ時代から ${ask}問 出題します（候補 ${total}問）`;
  startBtn.disabled = total === 0;
}

/* =========================================================
   クイズ開始
   ========================================================= */
async function startQuiz() {
  const startBtn = document.getElementById('btn-start');
  startBtn.disabled = true;
  startBtn.textContent = '読み込み中…';

  // 選択した時代の問題ファイルをまとめて読み込む
  const targets = state.eras.filter(e => state.selectedEras.has(e.id));
  try {
    const lists = await Promise.all(targets.map(async era => {
      const res = await fetch(`data/${era.file}`);
      if (!res.ok) throw new Error(`${era.file} 読み込み失敗`);
      const data = await res.json();
      return data.questions.map(q => ({ ...q, eraName: era.name }));
    }));
    state.pool = lists.flat();
  } catch (e) {
    alert('問題データの読み込みに失敗しました。時間をおいて再度お試しください。');
    console.error(e);
    startBtn.disabled = false;
    startBtn.textContent = 'スタート！';
    return;
  }

  const n = Math.min(state.count, state.pool.length);
  state.quiz = shuffle(state.pool).slice(0, n);
  state.current = 0;
  state.firstTryWrong = [];

  startBtn.disabled = false;
  startBtn.textContent = 'スタート！';

  showScreen('screen-quiz');
  renderQuestion();
}

/* =========================================================
   1問の描画
   ========================================================= */
function renderQuestion() {
  const q = state.quiz[state.current];
  state.answeredFirstTry = false;

  // 進捗
  document.getElementById('quiz-progress').textContent =
    `第${state.current + 1}問 / 全${state.quiz.length}問`;
  document.getElementById('quiz-era').textContent = q.eraName;
  document.getElementById('progress-fill').style.width =
    `${(state.current / state.quiz.length) * 100}%`;

  // 画像
  const imgWrap = document.getElementById('quiz-image-wrap');
  const img = document.getElementById('quiz-image');
  const cap = document.getElementById('quiz-image-caption');
  if (q.image) {
    img.src = q.image;
    img.alt = q.imageCaption || '';
    cap.textContent = q.imageCaption || '';
    imgWrap.hidden = false;
    img.onerror = () => { imgWrap.hidden = true; }; // 画像切れでも進行可能
  } else {
    imgWrap.hidden = true;
  }

  // 問題文
  document.getElementById('quiz-question').textContent = q.question;

  // 選択肢（順番もシャッフルし、正解インデックスを追跡）
  const optionsWrap = document.getElementById('quiz-options');
  optionsWrap.innerHTML = '';
  const marks = ['ア', 'イ', 'ウ', 'エ'];
  const indexed = q.options.map((text, i) => ({ text, correct: i === q.answer }));
  const shuffled = shuffle(indexed);

  shuffled.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'option-btn';
    btn.innerHTML = `<span class="mark">${marks[i]}</span><span>${opt.text}</span>`;
    btn.addEventListener('click', () => handleAnswer(btn, opt.correct, q));
    optionsWrap.appendChild(btn);
  });

  // リセット
  document.getElementById('quiz-feedback').hidden = true;
  document.getElementById('quiz-explanation').hidden = true;
  document.getElementById('btn-next').hidden = true;
}

/* =========================================================
   解答処理：間違えたら正解するまで進めない
   ========================================================= */
function handleAnswer(btn, isCorrect, q) {
  if (btn.disabled) return;
  const feedback = document.getElementById('quiz-feedback');

  if (!isCorrect) {
    // 不正解：そのボタンを赤くして無効化。先には進めない。
    btn.classList.add('wrong');
    btn.disabled = true;
    feedback.textContent = '✗ ざんねん！ もう一度えらんでみよう';
    feedback.className = 'quiz-feedback ng';
    feedback.hidden = false;

    if (!state.answeredFirstTry) {
      // 最初の解答で間違えた → 復習リストへ
      state.firstTryWrong.push(q);
      state.answeredFirstTry = true;
    }
    return;
  }

  // 正解
  btn.classList.add('correct');
  feedback.textContent = state.answeredFirstTry ? '○ 正解！（次は一発で！）' : '○ 正解！';
  feedback.className = 'quiz-feedback ok';
  feedback.hidden = false;

  // 全ボタンを無効化
  document.querySelectorAll('#quiz-options .option-btn').forEach(b => {
    b.disabled = true;
    if (!b.classList.contains('correct') && !b.classList.contains('wrong')) {
      b.classList.add('dimmed');
    }
  });

  // 解説表示
  const exp = document.getElementById('quiz-explanation');
  exp.innerHTML = `<strong>解説</strong>　${q.explanation}`;
  exp.hidden = false;

  // 次へ
  const nextBtn = document.getElementById('btn-next');
  nextBtn.hidden = false;
  nextBtn.textContent =
    state.current + 1 < state.quiz.length ? '次の問題へ →' : '結果を見る →';
}

document.getElementById('btn-next').addEventListener('click', () => {
  state.current++;
  if (state.current < state.quiz.length) {
    renderQuestion();
  } else {
    showResult();
  }
});

document.getElementById('btn-quit').addEventListener('click', () => {
  if (confirm('スタート画面にもどりますか？（このクイズは終了します）')) {
    showScreen('screen-start');
  }
});

/* =========================================================
   結果画面
   ========================================================= */
function showResult() {
  document.getElementById('progress-fill').style.width = '100%';
  const total = state.quiz.length;
  const wrong = state.firstTryWrong.length;
  const correct = total - wrong;
  const pct = Math.round((correct / total) * 100);

  document.getElementById('result-score').innerHTML =
    `正答率 <span class="pct">${pct}%</span><br><span style="font-size:1.1rem;font-weight:700;color:var(--ink-soft)">${total}問中 ${correct}問 正解</span>`;

  let msg;
  if (pct === 100) msg = 'パーフェクト！ すばらしい！🎉';
  else if (pct >= 80) msg = 'よくできました！ この調子！👏';
  else if (pct >= 60) msg = 'あと少し！ まちがえた問題を見直そう💪';
  else msg = 'まちがえた問題をふりかえって、もう一度チャレンジ！📚';
  document.getElementById('result-message').textContent = msg;

  // 復習
  const reviewSection = document.getElementById('review-section');
  const reviewList = document.getElementById('review-list');
  const retryBtn = document.getElementById('btn-retry-wrong');
  reviewList.innerHTML = '';

  if (wrong > 0) {
    state.firstTryWrong.forEach(q => {
      const item = document.createElement('div');
      item.className = 'review-item';
      item.innerHTML = `
        <p class="rq">Q. ${q.question}</p>
        <p class="ra">答え：${q.options[q.answer]}</p>
        <p class="re">${q.explanation}</p>`;
      reviewList.appendChild(item);
    });
    reviewSection.hidden = false;
    retryBtn.hidden = false;
  } else {
    reviewSection.hidden = true;
    retryBtn.hidden = true;
  }

  showScreen('screen-result');
}

document.getElementById('btn-retry-wrong').addEventListener('click', () => {
  state.quiz = shuffle(state.firstTryWrong);
  state.current = 0;
  state.firstTryWrong = [];
  showScreen('screen-quiz');
  renderQuestion();
});

document.getElementById('btn-home').addEventListener('click', () => {
  showScreen('screen-start');
});

/* ---------- 起動 ---------- */
init();
