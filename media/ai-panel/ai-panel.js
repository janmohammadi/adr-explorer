// @ts-ignore
const vscode = acquireVsCodeApi();

// ===== Helpers =====
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderMarkdown(content) {
  let html = escapeHtml(content);
  html = html.replace(/ADR-(\d{4})/g, '<span class="adr-link" data-adr-id="ADR-$1">ADR-$1</span>');
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/^### (.*?)$/gm, '<h3>$1</h3>')
    .replace(/^## (.*?)$/gm, '<h2>$1</h2>')
    .replace(/^# (.*?)$/gm, '<h1>$1</h1>')
    .replace(/^\d+\. (.*?)$/gm, '<li class="li-num">$1</li>')
    .replace(/^- (.*?)$/gm, '<li>$1</li>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
  return `<p>${html}</p>`;
}

// ===== State =====
let allAdrs = [];
let mode = 'tools'; // 'tools' | 'draft'
let draftPhase = 'describe';
let draftActive = false;
let questionAnswers = {};

// ===== Mode Switching =====
function setMode(m) {
  mode = m;
  document.getElementById('ai-mode-tools')?.classList.toggle('active', m === 'tools');
  document.getElementById('ai-mode-draft')?.classList.toggle('active', m === 'draft');
  document.getElementById('ai-tools-view').style.display = m === 'tools' ? '' : 'none';
  document.getElementById('ai-draft-view').style.display = m === 'draft' ? '' : 'none';
}

// ===== Tools =====
function showToolsLoading() {
  const el = document.getElementById('ai-result');
  if (el) el.innerHTML = '<div class="loading">Thinking...</div>';
}

function showToolsResult(content) {
  const el = document.getElementById('ai-result');
  if (el) el.innerHTML = `<div class="result-content">${renderMarkdown(content)}</div>`;
}

// ===== Draft: Phase Bar =====
const PHASES = ['describe', 'context', 'options', 'decide', 'review'];

function updatePhaseBar(phase) {
  draftPhase = phase;
  const idx = PHASES.indexOf(phase);
  document.querySelectorAll('.draft-phase-step').forEach((el, i) => {
    el.classList.toggle('active', i === idx);
    el.classList.toggle('completed', i < idx);
  });
}

// ===== Draft: Chat Rendering =====
function clearLoading() {
  const log = document.getElementById('draft-chat-log');
  if (log) { const l = log.querySelector('.msg-loading'); if (l) l.remove(); }
}

function showLoading(text) {
  clearLoading();
  const log = document.getElementById('draft-chat-log');
  if (!log) return;
  const el = document.createElement('div');
  el.className = 'msg msg-ai msg-loading';
  el.innerHTML = `<div class="msg-role">AI</div><div class="msg-body"><div class="loading">${escapeHtml(text)}</div></div>`;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
}

function addArchitectMessage(content) {
  const log = document.getElementById('draft-chat-log');
  if (!log) return;
  const el = document.createElement('div');
  el.className = 'msg msg-architect';
  el.innerHTML = `<div class="msg-role">You</div><div class="msg-body">${escapeHtml(content)}</div>`;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
}

function addChoicePill(label) {
  const log = document.getElementById('draft-chat-log');
  if (!log) return;
  const el = document.createElement('div');
  el.className = 'choice-pill-row';
  el.innerHTML = `<div class="choice-pill">${escapeHtml(label)}</div>`;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
}

// ===== Structured Message Rendering =====
function renderStructuredMessages(messages) {
  clearLoading();
  for (const msg of messages) {
    switch (msg.kind) {
      case 'text': renderTextMsg(msg.content); break;
      case 'questions': renderQuestions(msg.intro, msg.questions); break;
      case 'options': renderOptionCards(msg.intro, msg.options, msg.recommendation); break;
      case 'impact': renderImpactTable(msg.summary, msg.impacts, msg.sideEffects); break;
      case 'confirm': renderConfirmActions(msg.summary, msg.actions); break;
      case 'draft': renderDraft(msg.content); break;
    }
  }
}

function renderTextMsg(content) {
  const log = document.getElementById('draft-chat-log');
  if (!log) return;
  const el = document.createElement('div');
  el.className = 'msg msg-ai';
  el.innerHTML = `<div class="msg-role">AI</div><div class="msg-body">${renderMarkdown(content)}</div>`;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
}

function renderQuestions(intro, questions) {
  const log = document.getElementById('draft-chat-log');
  if (!log) return;

  const container = document.createElement('div');
  container.className = 'questions-block';
  if (intro) container.innerHTML = `<div class="questions-intro">${escapeHtml(intro)}</div>`;

  questionAnswers = {};
  const total = questions.length;

  questions.forEach((q) => {
    const card = document.createElement('div');
    card.className = 'question-card';
    card.setAttribute('data-q-id', q.id);

    const optsHtml = q.options.map((opt) =>
      `<button class="q-option" data-q-id="${escapeHtml(q.id)}" data-label="${escapeHtml(opt.label)}">
        <span class="q-option-label">${escapeHtml(opt.label)}</span>
        ${opt.description ? `<span class="q-option-desc">${escapeHtml(opt.description)}</span>` : ''}
      </button>`
    ).join('');

    card.innerHTML = `
      <div class="q-text">${escapeHtml(q.question)}</div>
      <div class="q-options">${optsHtml}</div>
      <div class="q-other-row" style="display:none">
        <input type="text" class="q-other-input" placeholder="Type your answer..." />
        <button class="q-other-submit">OK</button>
      </div>
      <button class="q-other-toggle">Other...</button>
    `;

    // Option click
    card.querySelectorAll('.q-option').forEach(btn => {
      btn.addEventListener('click', () => {
        selectAnswer(q.id, btn.getAttribute('data-label'), card, total);
      });
    });

    // Other toggle
    const otherToggle = card.querySelector('.q-other-toggle');
    const otherRow = card.querySelector('.q-other-row');
    if (otherToggle && otherRow) {
      otherToggle.addEventListener('click', () => {
        otherRow.style.display = 'flex';
        otherToggle.style.display = 'none';
        otherRow.querySelector('input')?.focus();
      });
    }

    // Other submit
    const otherSubmit = card.querySelector('.q-other-submit');
    const otherInput = card.querySelector('.q-other-input');
    if (otherSubmit && otherInput) {
      const submit = () => { const v = otherInput.value.trim(); if (v) selectAnswer(q.id, v, card, total); };
      otherSubmit.addEventListener('click', submit);
      otherInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    }

    container.appendChild(card);
  });

  log.appendChild(container);
  log.scrollTop = log.scrollHeight;
}

function selectAnswer(qId, label, card, total) {
  questionAnswers[qId] = label;
  card.className = 'question-card answered';
  const qText = card.querySelector('.q-text')?.textContent || '';
  card.innerHTML = `<div class="q-answered"><span class="q-answered-text">${escapeHtml(qText)}</span><span class="choice-pill">${escapeHtml(label)}</span></div>`;

  if (Object.keys(questionAnswers).length >= total) {
    const answersText = Object.entries(questionAnswers).map(([id, ans]) => `${id}: ${ans}`).join('; ');
    setTimeout(() => {
      vscode.postMessage({ type: 'aiDraftAdvance', message: 'context', answers: answersText });
    }, 300);
  }
}

function renderOptionCards(intro, options, recommendation) {
  const log = document.getElementById('draft-chat-log');
  if (!log) return;

  const container = document.createElement('div');
  container.className = 'options-block';
  if (intro) container.innerHTML = `<div class="options-intro">${renderMarkdown(intro)}</div>`;
  if (recommendation) container.innerHTML += `<div class="options-rec">${renderMarkdown(recommendation)}</div>`;

  options.forEach((opt) => {
    const card = document.createElement('div');
    card.className = 'option-card';
    const effortClass = opt.effort === 'low' ? 'effort-low' : opt.effort === 'high' ? 'effort-high' : 'effort-medium';
    const prosHtml = (opt.pros || []).map(p => `<li class="pro">${escapeHtml(p)}</li>`).join('');
    const consHtml = (opt.cons || []).map(c => `<li class="con">${escapeHtml(c)}</li>`).join('');

    card.innerHTML = `
      <div class="opt-header"><span class="opt-title">${escapeHtml(opt.title)}</span><span class="opt-effort ${effortClass}">${escapeHtml(opt.effort || 'medium')}</span></div>
      <div class="opt-desc">${escapeHtml(opt.description)}</div>
      ${prosHtml || consHtml ? `<div class="opt-tradeoffs">${prosHtml ? `<ul class="opt-pros">${prosHtml}</ul>` : ''}${consHtml ? `<ul class="opt-cons">${consHtml}</ul>` : ''}</div>` : ''}
      ${opt.risk ? `<div class="opt-risk">Risk: ${escapeHtml(opt.risk)}</div>` : ''}
      <button class="opt-choose-btn">Choose this option</button>
    `;

    card.querySelector('.opt-choose-btn')?.addEventListener('click', () => {
      addChoicePill(`Decision: ${opt.title}`);
      vscode.postMessage({ type: 'aiDraftDecide', decision: `${opt.title} — ${opt.description}` });
    });

    container.appendChild(card);
  });

  // Own approach
  const ownBtn = document.createElement('button');
  ownBtn.className = 'own-approach-btn';
  ownBtn.textContent = 'Describe my own approach...';
  ownBtn.addEventListener('click', () => {
    ownBtn.style.display = 'none';
    const row = document.createElement('div');
    row.className = 'own-approach-row';
    row.innerHTML = `<input type="text" class="draft-input" placeholder="Describe your approach..." /><button class="draft-send-btn">Go</button>`;
    container.appendChild(row);
    const inp = row.querySelector('input');
    const btn = row.querySelector('button');
    inp?.focus();
    const submit = () => { const v = inp?.value?.trim(); if (v) { addChoicePill(`Decision: ${v}`); vscode.postMessage({ type: 'aiDraftDecide', decision: v }); } };
    btn?.addEventListener('click', submit);
    inp?.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  });
  container.appendChild(ownBtn);

  log.appendChild(container);
  log.scrollTop = log.scrollHeight;
}

function renderImpactTable(summary, impacts, sideEffects) {
  const log = document.getElementById('draft-chat-log');
  if (!log) return;

  const container = document.createElement('div');
  container.className = 'impact-block';
  let html = '';
  if (summary) html += `<div class="impact-summary">${escapeHtml(summary)}</div>`;

  if (impacts?.length) {
    html += '<div class="impact-table"><div class="impact-table-header">Impact on Existing ADRs</div>';
    impacts.forEach(imp => {
      const cls = imp.relationship === 'tension' ? 'rel-tension' : imp.relationship === 'supersedes' ? 'rel-supersedes' : 'rel-default';
      html += `<div class="impact-row"><span class="adr-link" data-adr-id="${escapeHtml(imp.adrId)}">${escapeHtml(imp.adrId)}</span><span class="impact-rel ${cls}">${escapeHtml(imp.relationship)}</span><span class="impact-reason">${escapeHtml(imp.reason)}</span></div>`;
    });
    html += '</div>';
  }

  if (sideEffects?.length) {
    html += '<div class="side-effects"><div class="side-effects-header">Side Effects</div>';
    sideEffects.forEach(se => { html += `<div class="side-effect">${escapeHtml(se)}</div>`; });
    html += '</div>';
  }

  container.innerHTML = html;
  log.appendChild(container);
  log.scrollTop = log.scrollHeight;
}

function renderConfirmActions(summary, actions) {
  const log = document.getElementById('draft-chat-log');
  if (!log) return;

  const container = document.createElement('div');
  container.className = 'confirm-block';
  let html = `<div class="confirm-text">${escapeHtml(summary)}</div><div class="confirm-actions">`;
  actions.forEach((a, i) => {
    html += `<button class="confirm-btn ${i === 0 ? 'primary' : ''}" data-action="${escapeHtml(a.action)}">${escapeHtml(a.label)}</button>`;
  });
  html += '</div>';
  container.innerHTML = html;

  container.querySelectorAll('.confirm-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.getAttribute('data-action');
      addChoicePill(btn.textContent);
      if (action === 'chat') {
        document.getElementById('draft-chat-row').style.display = 'flex';
        document.getElementById('draft-chat-input')?.focus();
      } else {
        vscode.postMessage({ type: 'aiDraftAction', action });
      }
    });
  });

  log.appendChild(container);
  log.scrollTop = log.scrollHeight;
}

function renderDraft(content) {
  const preview = document.getElementById('draft-preview');
  const editor = document.getElementById('draft-preview-editor');
  if (preview) preview.style.display = '';
  if (editor) {
    editor.value = content.replace(/^```(?:markdown)?\n?/, '').replace(/\n?```$/, '');
  }
  renderTextMsg('ADR generated! Review and edit in the panel below, then click **Save as ADR**.');
}

// ===== Draft Flow Actions =====
function startDraft() {
  const input = document.getElementById('draft-start-input');
  const desc = input?.value || '';
  if (!desc.trim()) return;
  draftActive = true;
  addArchitectMessage(desc);
  document.getElementById('draft-start-row').style.display = 'none';
  document.getElementById('draft-chat-row').style.display = 'flex';
  if (input) input.value = '';
  updatePhaseBar('describe');
  vscode.postMessage({ type: 'aiDraftStart', description: desc });
}

function sendChat() {
  const input = document.getElementById('draft-chat-input');
  const msg = input?.value || '';
  if (!msg.trim()) return;
  addArchitectMessage(msg);
  if (input) input.value = '';
  vscode.postMessage({ type: 'aiDraftChat', message: msg });
}

function resetDraft() {
  draftActive = false;
  draftPhase = 'describe';
  questionAnswers = {};
  document.getElementById('draft-chat-log').innerHTML = '';
  document.getElementById('draft-preview').style.display = 'none';
  document.getElementById('draft-start-row').style.display = 'flex';
  document.getElementById('draft-chat-row').style.display = 'none';
  document.querySelectorAll('.draft-phase-step').forEach(el => el.classList.remove('active', 'completed'));
  document.querySelector('.draft-phase-step')?.classList.add('active');
}

function saveDraft() {
  const editor = document.getElementById('draft-preview-editor');
  if (!editor) return;
  let content = editor.value.replace(/^```(?:markdown)?\n?/, '').replace(/\n?```$/, '');
  vscode.postMessage({ type: 'aiDraftSave', content });
}

// ===== Message Handling =====
window.addEventListener('message', (event) => {
  const msg = event.data;
  switch (msg.type) {
    case 'aiResult':
      showToolsResult(msg.content || '');
      break;
    case 'draftMessages':
      renderStructuredMessages(msg.messages || []);
      break;
    case 'draftLoading':
      showLoading(msg.content || '');
      break;
    case 'draftPhase':
      updatePhaseBar(msg.phase);
      break;
    case 'draftState':
      break;
    case 'adrContext':
      allAdrs = msg.adrs || [];
      break;
  }
});

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('ai-mode-tools')?.addEventListener('click', () => setMode('tools'));
  document.getElementById('ai-mode-draft')?.addEventListener('click', () => setMode('draft'));

  // Tools
  document.getElementById('ai-gap-analysis')?.addEventListener('click', () => { vscode.postMessage({ type: 'aiGapAnalysis' }); showToolsLoading(); });
  document.getElementById('ai-cluster-summary')?.addEventListener('click', () => { vscode.postMessage({ type: 'aiClusterSummary', adrIds: allAdrs.map(a => a.id) }); showToolsLoading(); });
  document.getElementById('ai-stakeholder-brief')?.addEventListener('click', () => { vscode.postMessage({ type: 'aiStakeholderBrief', adrIds: allAdrs.length > 0 ? [allAdrs[0].id] : [] }); showToolsLoading(); });

  // Draft
  document.getElementById('draft-start-btn')?.addEventListener('click', startDraft);
  document.getElementById('draft-start-input')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') startDraft(); });
  document.getElementById('draft-send-btn')?.addEventListener('click', sendChat);
  document.getElementById('draft-chat-input')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });
  document.getElementById('draft-save-btn')?.addEventListener('click', saveDraft);

  vscode.postMessage({ type: 'ready' });
});
