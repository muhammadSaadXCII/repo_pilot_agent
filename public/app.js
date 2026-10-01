const $ = (selector) => document.querySelector(selector);

const els = {
    signedOut: $("#signed-out"),
    signedOutNote: $("#signed-out-note"),
    app: $("#app"),
    account: $("#account"),
    loginName: $("#login-name"),
    logout: $("#logout"),
    repoForm: $("#repo-form"),
    repoInput: $("#repo-input"),
    repoHint: $("#repo-hint"),
    chat: $("#chat"),
    starters: $("#starters"),
    composer: $("#composer"),
    question: $("#question"),
    send: $("#send"),
};

const NAME_PATTERN = /^[A-Za-z0-9_.-]+$/;
const STORAGE_KEY = "repopilot:last-repo";
const DEFAULT_HINT = "Public repositories only.";
const STARTERS = [
    "What does this project do?",
    "What changed in the last week?",
    "Write onboarding docs for this repo",
];

const state = { repo: null, busy: false, awaitingApproval: false };

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

function renderMarkdown(target, text) {
    if (window.marked && window.DOMPurify) {
        target.innerHTML = DOMPurify.sanitize(marked.parse(text));
    } else {
        target.textContent = text;
    }
}

function scrollToBottom() {
    els.chat.scrollTop = els.chat.scrollHeight;
}

function parseRepo(value) {
    const cleaned = value.trim().replace(/^(https?:\/\/)?(www\.)?github\.com\//i, "").replace(/^\/+/, "");
    const [owner, rawRepo] = cleaned.split("/");
    const repo = rawRepo ? rawRepo.replace(/\.git$/i, "") : "";
    const valid = (s) => Boolean(s) && NAME_PATTERN.test(s) && s !== "." && s !== ".." && s.length <= 100;
    return valid(owner) && valid(repo) ? { owner, repo } : null;
}

function setHint(text, isError = false) {
    els.repoHint.textContent = text;
    els.repoHint.classList.toggle("is-error", isError);
}

function updateComposer() {
    const enabled = Boolean(state.repo) && !state.busy && !state.awaitingApproval;
    els.question.disabled = !enabled;
    els.send.disabled = !enabled;
    if (!state.repo) els.question.placeholder = "Connect a repository first";
    else if (state.awaitingApproval) els.question.placeholder = "Approve or reject the request above to continue";
    else els.question.placeholder = "Ask about the code, recent activity, or docs";
}

function renderStarters() {
    els.starters.replaceChildren();
    const visible = Boolean(state.repo) && els.chat.childElementCount === 0;
    els.starters.hidden = !visible;
    if (!visible) return;
    for (const text of STARTERS) {
        const button = el("button", "btn btn-quiet", text);
        button.type = "button";
        button.addEventListener("click", () => ask(text));
        els.starters.append(button);
    }
}

/* ---------- messages ---------- */

function addUser(text) {
    els.chat.append(el("div", "msg msg-user", text));
    renderStarters();
    scrollToBottom();
}

function addAssistant(text) {
    const wrapper = el("div", "msg msg-assistant");
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
    wrapper.append(body, copy);
    els.chat.append(wrapper);
    scrollToBottom();
}

function addError(text) {
    els.chat.append(el("div", "msg msg-error", text));
    scrollToBottom();
}

function addPending() {
    const node = el("div", "msg msg-pending", "Working on it. The first question about a repo takes longer while it is cloned and indexed.");
    els.chat.append(node);
    scrollToBottom();
    return node;
}

function addApproval(payload) {
    const isDoc = Boolean(payload.preview);
    const card = el("section", "approval");
    card.append(el("h2", "", isDoc ? "Review the document" : "Approval needed"));
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

    els.chat.append(card);
    scrollToBottom();
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
        pending.remove();
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
    statusEl.textContent = approved ? "You approved this." : "You rejected this.";
    state.awaitingApproval = false;
    await run("/api/chat/resume", { ...state.repo, approved });
}

/* ---------- repo connection ---------- */

function connect(repo) {
    state.repo = repo;
    state.awaitingApproval = false;
    els.repoInput.value = `${repo.owner}/${repo.repo}`;
    try { localStorage.setItem(STORAGE_KEY, els.repoInput.value); } catch { /* storage unavailable */ }
    els.chat.replaceChildren();
    setHint(`Connected to ${repo.owner}/${repo.repo}. Public repositories only.`);
    renderStarters();
    updateComposer();
    if (!els.question.disabled) els.question.focus();
}

/* ---------- screens ---------- */

function showSignedOut(note = "") {
    state.repo = null;
    els.app.hidden = true;
    els.account.hidden = true;
    els.signedOut.hidden = false;
    els.signedOutNote.textContent = note;
}

function showApp(me) {
    els.signedOut.hidden = true;
    els.app.hidden = false;
    els.account.hidden = false;
    els.loginName.textContent = `Signed in as ${me.login}`;
    setHint(DEFAULT_HINT);
    updateComposer();

    let saved = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch { /* storage unavailable */ }
    const repo = saved ? parseRepo(saved) : null;
    if (repo) connect(repo);
    else els.repoInput.focus();
}

/* ---------- events ---------- */

els.repoForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const repo = parseRepo(els.repoInput.value);
    if (!repo) {
        setHint("Enter a repository as owner/repo, or paste its GitHub URL.", true);
        return;
    }
    connect(repo);
});

els.composer.addEventListener("submit", (event) => {
    event.preventDefault();
    const question = els.question.value.trim();
    if (!question) return;
    els.question.value = "";
    ask(question);
});

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
    try {
        const res = await fetch("/auth/me");
        if (res.ok) {
            showApp(await res.json());
            return;
        }
    } catch { /* fall through to signed-out screen */ }
    showSignedOut();
})();
