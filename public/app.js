const els = {};
for (const id of ["signed-out", "signed-out-note", "app", "account", "avatar", "login-name", "logout", "repo-owner", "repo-select", "repo-hint", "current-repo", "current-owner", "current-name", "repo-link", "empty", "chat", "composer", "question", "send"]) {
    els[id.replace(/-./g, (m) => m[1].toUpperCase())] = document.getElementById(id);
}

const PATH_PATTERN = /^[\w.\-/]+\.(ts|tsx|js|jsx|mjs|cjs|json|md|py|go|rs|java|kt|rb|php|cs|c|h|cpp|dart|swift|css|scss|html|ya?ml|toml|sql|sh|txt|xml)$/i;
const STORAGE_KEY = "repopilot:last-repo";
const DEFAULT_HINT = "Showing your public repositories.";
const MARK = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 4.5l3.2 7.5-3.2 7.5-3.2-7.5z" fill="currentColor"/></svg>';
const IDEAS = [
    { title: "Explain the code", question: "What does this project do?" },
    { title: "Check recent activity", question: "What changed in the last week?" },
    { title: "Draft onboarding docs", question: "Write onboarding docs for this repo" },
];

const state = { owner: null, repo: null, hasRepos: false, busy: false, awaitingApproval: false };

/* ---------- helpers ---------- */

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

if (window.DOMPurify) {
    DOMPurify.addHook("afterSanitizeAttributes", (node) => {
        if (node.tagName === "A") {
            node.setAttribute("target", "_blank");
            node.setAttribute("rel", "noopener noreferrer");
        }
    });
}

// Styles inline code that looks like a file path as a chip.
function decorate(root) {
    root.querySelectorAll("code").forEach((code) => {
        if (!code.closest("pre") && PATH_PATTERN.test(code.textContent.trim())) code.classList.add("path");
    });
}

function renderMarkdown(target, text) {
    if (window.marked && window.DOMPurify) target.innerHTML = DOMPurify.sanitize(marked.parse(text));
    else target.textContent = text;
    decorate(target);
}

function scrollToBottom() {
    els.chat.scrollTop = els.chat.scrollHeight;
}

function setHint(text, isError = false) {
    els.repoHint.textContent = text;
    els.repoHint.classList.toggle("is-error", isError);
}

function updateComposer() {
    const enabled = Boolean(state.repo) && !state.busy && !state.awaitingApproval;
    els.question.disabled = !enabled;
    els.send.disabled = !enabled;
    els.repoSelect.disabled = state.busy || !state.hasRepos;
    if (!state.repo) els.question.placeholder = "Connect a repository first";
    else if (state.awaitingApproval) els.question.placeholder = "Approve or reject the request above to continue";
    else els.question.placeholder = "Ask about the code, recent activity, or docs";
}

function resizeComposer() {
    els.question.style.height = "auto";
    els.question.style.height = `${Math.min(els.question.scrollHeight, 160)}px`;
}

/* ---------- empty state ---------- */

function renderEmpty() {
    els.empty.replaceChildren();
    if (!state.repo) {
        els.empty.append(el("h2", "", "Connect a repository"), el("p", "", "Choose one of your repositories from the list to begin."));
        return;
    }
    const { owner, repo } = state.repo;
    els.empty.append(
        el("h2", "", `Ask about ${owner}/${repo}`),
        el("p", "", "RepoPilot can explain how the code works, report on recent GitHub activity, and draft onboarding docs.")
    );
    const list = el("div", "ideas");
    for (const idea of IDEAS) {
        const button = el("button", "idea");
        button.type = "button";
        button.append(el("strong", "", idea.title), el("span", "", idea.question));
        button.addEventListener("click", () => ask(idea.question));
        list.append(button);
    }
    els.empty.append(list);
}

function syncEmpty() {
    const hasMessages = els.chat.childElementCount > 0;
    els.chat.hidden = !hasMessages;
    els.empty.hidden = hasMessages;
    if (!hasMessages) renderEmpty();
}

function push(node) {
    els.chat.append(node);
    syncEmpty();
    scrollToBottom();
}

/* ---------- messages ---------- */

function addUser(text) {
    const wrap = el("div", "msg msg-user");
    wrap.append(el("div", "bubble", text));
    push(wrap);
}

function addAssistant(text) {
    const wrap = el("div", "msg msg-assistant");
    const mark = el("span", "avatar-mark");
    mark.innerHTML = MARK;
    const main = el("div", "msg-main");
    const body = el("div", "body");
    renderMarkdown(body, text);

    const copy = el("button", "link-btn copy-btn", "Copy");
    copy.type = "button";
    copy.addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(text);
            copy.textContent = "Copied";
            setTimeout(() => (copy.textContent = "Copy"), 1500);
        } catch {
            copy.textContent = "Copy failed";
        }
    });

    main.append(body, copy);
    wrap.append(mark, main);
    push(wrap);
}

function addError(text) {
    push(el("div", "msg msg-error", text));
}

function addPending() {
    const node = el("div", "msg msg-pending");
    const label = el("span", "");
    const note = el("span", "pending-note");
    node.append(el("span", "pulse"), label, note);
    push(node);

    const started = Date.now();
    const tick = () => {
        const seconds = Math.floor((Date.now() - started) / 1000);
        label.textContent = `Working ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
        if (seconds >= 8) note.textContent = "The first question about a repository takes longer while it is cloned and indexed.";
    };
    tick();
    const timer = setInterval(tick, 1000);
    return { stop: () => { clearInterval(timer); node.remove(); } };
}

function addApproval(payload) {
    const isDoc = Boolean(payload.preview);
    const card = el("section", "approval");
    card.setAttribute("aria-label", "Approval request");
    card.append(
        el("h2", "", isDoc ? "Review the document" : "Approval needed"),
        el("p", "approval-sub", "RepoPilot paused and is waiting for your decision.")
    );
    if (!isDoc && payload.action) card.append(el("p", "approval-action", payload.action));

    const body = el("div", isDoc ? "approval-body body is-markdown" : "approval-body");
    if (isDoc) renderMarkdown(body, payload.preview);
    else body.textContent = payload.details || "No further details were provided.";
    card.append(body);

    const actions = el("div", "approval-actions");
    const approve = el("button", "btn btn-primary", "Approve");
    const reject = el("button", "btn btn-quiet", "Reject");
    const status = el("span", "approval-status");
    approve.type = "button";
    reject.type = "button";
    approve.addEventListener("click", () => decide(card, true, status));
    reject.addEventListener("click", () => decide(card, false, status));
    actions.append(approve, reject, status);
    card.append(actions);
    push(card);
}

/* ---------- API ---------- */

async function post(path, body) {
    const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    let data = {};
    try { data = await res.json(); } catch { /* non-JSON error body */ }

    if (res.status === 401) {
        showSignedOut("Your session ended. Sign in again to continue.");
        throw new Error("unauthenticated");
    }
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
}

function handleResult(data) {
    if (data.status === "interrupt") {
        state.awaitingApproval = true;
        addApproval(data.interrupt || {});
    } else {
        addAssistant(data.answer || "RepoPilot returned an empty answer.");
    }
}

async function run(path, body) {
    state.busy = true;
    updateComposer();
    const pending = addPending();
    try {
        handleResult(await post(path, body));
    } catch (err) {
        if (err.message !== "unauthenticated") addError(err.message);
    } finally {
        pending.stop();
        state.busy = false;
        updateComposer();
        if (!els.question.disabled) els.question.focus();
    }
}

async function ask(question) {
    if (state.busy || state.awaitingApproval || !state.repo) return;
    addUser(question);
    await run("/api/chat", { ...state.repo, question });
}

async function decide(card, approved, statusEl) {
    card.querySelectorAll("button").forEach((b) => (b.disabled = true));
    card.classList.add("is-resolved");
    statusEl.textContent = approved ? "You approved this." : "You rejected this.";
    state.awaitingApproval = false;
    await run("/api/chat/resume", { ...state.repo, approved });
}

/* ---------- repo connection ---------- */

function connect(repo) {
    state.repo = repo;
    state.awaitingApproval = false;
    els.repoSelect.value = repo.repo;
    try { localStorage.setItem(STORAGE_KEY, repo.repo); } catch { /* storage unavailable */ }

    els.currentOwner.textContent = `${repo.owner}/`;
    els.currentName.textContent = repo.repo;
    els.repoLink.href = `https://github.com/${repo.owner}/${repo.repo}`;
    els.currentRepo.hidden = false;

    els.chat.replaceChildren();
    setHint(DEFAULT_HINT);
    syncEmpty();
    updateComposer();
    if (!els.question.disabled) els.question.focus();
}

// Choosing "Select a repository" again turns everything off until a repo is picked.
function disconnect() {
    state.repo = null;
    state.awaitingApproval = false;
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ }
    els.repoSelect.value = "";
    els.currentRepo.hidden = true;
    els.chat.replaceChildren();
    els.question.value = "";
    resizeComposer();
    setHint(DEFAULT_HINT);
    syncEmpty();
    updateComposer();
}

/* ---------- screens ---------- */

function showSignedOut(note = "") {
    state.repo = null;
    document.body.classList.remove("in-app");
    els.app.hidden = true;
    els.account.hidden = true;
    els.signedOut.hidden = false;
    els.signedOutNote.textContent = note;
}

function showApp(me) {
    document.body.classList.add("in-app");
    els.signedOut.hidden = true;
    els.app.hidden = false;
    els.account.hidden = false;
    els.loginName.textContent = me.login;
    els.avatar.src = `https://github.com/${encodeURIComponent(me.login)}.png?size=56`;
    state.owner = me.login;
    els.repoOwner.textContent = `${me.login} /`;
    setHint(DEFAULT_HINT);
    syncEmpty();
    updateComposer();
    loadRepos(me.login);
}

async function loadRepos(owner) {
    state.hasRepos = false;
    els.repoSelect.disabled = true;
    els.repoSelect.replaceChildren(new Option("Loading repositories…", ""));
    try {
        const res = await fetch("/api/repos");
        if (res.status === 401) {
            showSignedOut("Your session ended. Sign in again to continue.");
            return;
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not load your repositories.");

        const names = data.repos.map((r) => r.name);
        els.repoSelect.replaceChildren(new Option(names.length ? "Select a repository" : "No public repositories found", ""));
        for (const repo of data.repos) {
            const option = new Option(repo.name, repo.name);
            if (repo.description) option.title = repo.description;
            els.repoSelect.append(option);
        }
        state.hasRepos = names.length > 0;
        els.repoSelect.disabled = !state.hasRepos;

        let saved = null;
        try { saved = localStorage.getItem(STORAGE_KEY); } catch { /* storage unavailable */ }
        const savedName = saved ? saved.split("/").pop() : null;
        if (savedName && names.includes(savedName)) connect({ owner, repo: savedName });
    } catch (err) {
        els.repoSelect.replaceChildren(new Option("Could not load repositories", ""));
        setHint(err.message, true);
    }
}

/* ---------- events ---------- */

els.repoSelect.addEventListener("change", () => {
    if (els.repoSelect.value) connect({ owner: state.owner, repo: els.repoSelect.value });
    else disconnect();
});

els.composer.addEventListener("submit", (event) => {
    event.preventDefault();
    const question = els.question.value.trim();
    if (!question) return;
    els.question.value = "";
    resizeComposer();
    ask(question);
});

els.question.addEventListener("input", resizeComposer);
els.question.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        els.composer.requestSubmit();
    }
});

els.logout.addEventListener("click", async () => {
    try { await fetch("/auth/logout", { method: "POST" }); } catch { /* cookie expires anyway */ }
    showSignedOut();
});

(async function init() {
    document.querySelectorAll(".demo .body").forEach(decorate);
    try {
        const res = await fetch("/auth/me");
        if (res.ok) {
            showApp(await res.json());
            return;
        }
    } catch { /* fall through to signed-out screen */ }
    showSignedOut();
})();