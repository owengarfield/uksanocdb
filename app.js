// ---- Multiselect dropdown component ----
function createMultiselect(options, selected = [], placeholder = 'Select…') {
  let current = [...selected];
  let open = false;
  let searchTerm = '';

  const wrap = document.createElement('div');
  wrap.className = 'ms-wrap';

  function renderTags() {
    const tagsEl = wrap.querySelector('.ms-tags');
    if (!tagsEl) return;
    tagsEl.innerHTML = current.length === 0
      ? `<span class="ms-placeholder">${escHtml(placeholder)}</span>`
      : current.map(v => `<span class="ms-tag">${escHtml(v)}<button type="button" class="ms-tag-remove" data-val="${escHtml(v)}">✕</button></span>`).join('');
    tagsEl.querySelectorAll('.ms-tag-remove').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); current = current.filter(v => v !== btn.dataset.val); renderTags(); });
    });
  }

  function openDropdown() {
    if (open) return;
    open = true;
    searchTerm = '';
    wrap.querySelector('.ms-control').classList.add('ms-open');

    const dropdown = document.createElement('div');
    dropdown.className = 'ms-dropdown';
    dropdown.innerHTML = `
      <div class="ms-search-wrap">
        <input class="ms-search" type="text" placeholder="Search counties…" />
      </div>
      <div class="ms-options"></div>
    `;
    wrap.appendChild(dropdown);

    const searchEl = dropdown.querySelector('.ms-search');
    const optionsEl = dropdown.querySelector('.ms-options');

    function renderOptions() {
      const filtered = searchTerm
        ? options.filter(o => o.toLowerCase().includes(searchTerm.toLowerCase()))
        : options;
      optionsEl.innerHTML = filtered.length === 0
        ? '<div class="ms-empty">No matches</div>'
        : filtered.map(o => `
          <label class="ms-option ${current.includes(o) ? 'ms-selected' : ''}">
            <input type="checkbox" ${current.includes(o) ? 'checked' : ''} data-opt="${escHtml(o)}" />
            ${escHtml(o)}
          </label>`).join('');
      optionsEl.querySelectorAll('input[type=checkbox]').forEach(cb => {
        cb.addEventListener('change', () => {
          const val = cb.dataset.opt;
          if (cb.checked) { if (!current.includes(val)) current.push(val); }
          else { current = current.filter(v => v !== val); }
          cb.closest('.ms-option').classList.toggle('ms-selected', cb.checked);
          renderTags();
        });
      });
    }

    renderOptions();
    searchEl.focus();
    searchEl.addEventListener('input', e => { searchTerm = e.target.value; renderOptions(); });
    searchEl.addEventListener('keydown', e => { if (e.key === 'Escape') closeDropdown(); });
  }

  function closeDropdown() {
    if (!open) return;
    open = false;
    wrap.querySelector('.ms-control')?.classList.remove('ms-open');
    wrap.querySelector('.ms-dropdown')?.remove();
  }

  // Initial render
  wrap.innerHTML = `
    <div class="ms-control" tabindex="0">
      <div class="ms-tags"></div>
      <span class="ms-arrow">▼</span>
    </div>
  `;
  renderTags();

  wrap.querySelector('.ms-control').addEventListener('click', e => {
    if (e.target.classList.contains('ms-tag-remove') || e.target.closest('.ms-tag-remove')) return;
    open ? closeDropdown() : openDropdown();
  });
  wrap.querySelector('.ms-control').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open ? closeDropdown() : openDropdown(); }
  });

  // Close on outside click
  function onOutsideClick(e) {
    if (open && !wrap.contains(e.target)) closeDropdown();
  }
  document.addEventListener('click', onOutsideClick, true);

  // Clean up when removed from DOM
  const observer = new MutationObserver(() => {
    if (!document.contains(wrap)) {
      document.removeEventListener('click', onOutsideClick, true);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return { el: wrap, getSelected: () => current };
}

// ---- State ----
let currentUser = null;
let entries = JSON.parse(JSON.stringify(MOCK_ENTRIES));
let users = JSON.parse(JSON.stringify(MOCK_USERS));
let comments = JSON.parse(JSON.stringify(MOCK_COMMENTS));
let editingId = null;
let filterState = { search: '', area: '', severity: '', status: '' };
let detailStack = []; // navigation stack for mobile detail pages

// ---- Auth ----
function login(username, password) {
  const user = users.find(u => u.username === username && u.password === password);
  if (!user) return false;
  currentUser = user;
  return true;
}

function logout() {
  currentUser = null;
  editingId = null;
  renderApp();
}

// ---- Permissions ----
const can = {
  view:        () => !!currentUser,
  add:         () => currentUser && (currentUser.role === 'admin' || currentUser.role === 'moderator'),
  edit:        () => currentUser && (currentUser.role === 'admin' || currentUser.role === 'moderator'),
  delete:      () => currentUser && currentUser.role === 'admin',
  manageUsers: () => currentUser && currentUser.role === 'admin',
};

// ---- Helpers ----
function getUserById(id) {
  return users.find(u => u.id === id);
}

function discordDisplay(discord) {
  if (!discord) return null;
  return discord.username || null;
}

function hasContact(user) {
  return !!(user.email || user.fetlife || (user.discord && user.discord.linked));
}

function severityLabel(s) {
  return { high: 'High', medium: 'Medium', low: 'Low' }[s] || s;
}

function statusLabel(s) {
  return { active: 'Active', under_review: 'Under Review', resolved: 'Resolved' }[s] || s;
}

function severityClass(s) {
  return { high: 'sev-high', medium: 'sev-medium', low: 'sev-low' }[s] || '';
}

function statusClass(s) {
  return { active: 'status-active', under_review: 'status-review', resolved: 'status-resolved' }[s] || '';
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function avatarInitials(user) {
  const name = user.displayName || user.username;
  return name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
}

// ---- Filtering ----
function filteredEntries() {
  const { search, area, severity, status } = filterState;
  return entries.filter(e => {
    if (search) {
      const q = search.toLowerCase();
      if (!e.handle.toLowerCase().includes(q) &&
          !e.aliases.some(a => a.toLowerCase().includes(q)) &&
          !e.description.toLowerCase().includes(q)) return false;
    }
    if (area && !e.areas.includes(area)) return false;
    if (severity && e.severity !== severity) return false;
    if (status && e.status !== status) return false;
    return true;
  });
}

// ---- Render: Login ----
function renderLogin(error = '') {
  document.getElementById('app').innerHTML = `
    <div class="login-wrap">
      <div class="login-box">
        <div class="logo-block">
          <div class="logo-icon">🛡</div>
          <h1>UKSA</h1>
          <p class="logo-sub">UK Safety Alerts</p>
          <p class="logo-sub2">Names of Concern Database</p>
        </div>
        ${error ? `<div class="alert alert-error">${escHtml(error)}</div>` : ''}
        <form id="loginForm" class="login-form">
          <label>Username</label>
          <input type="text" id="loginUser" placeholder="Enter username" autocomplete="username" />
          <label>Password</label>
          <input type="password" id="loginPass" placeholder="Enter password" autocomplete="current-password" />
          <button type="submit" class="btn btn-primary btn-full">Sign In</button>
        </form>
        <div class="demo-creds">
          <p class="demo-title">Quick login</p>
          <div class="quick-login-grid">
            <button class="quick-login-btn" data-user="SafetyAdmin" data-pass="admin123">
              <span class="role-badge role-admin">admin</span>
              <span class="quick-login-name">SafetyAdmin</span>
            </button>
            <button class="quick-login-btn" data-user="ModeratorJane" data-pass="mod123">
              <span class="role-badge role-mod">mod</span>
              <span class="quick-login-name">ModeratorJane</span>
            </button>
            <button class="quick-login-btn" data-user="ModeratorTom" data-pass="mod456">
              <span class="role-badge role-mod">mod</span>
              <span class="quick-login-name">ModeratorTom</span>
            </button>
            <button class="quick-login-btn" data-user="MemberAlex" data-pass="user123">
              <span class="role-badge role-user">user</span>
              <span class="quick-login-name">MemberAlex</span>
            </button>
            <button class="quick-login-btn" data-user="MemberSarah" data-pass="user456">
              <span class="role-badge role-user">user</span>
              <span class="quick-login-name">MemberSarah</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.getElementById('loginForm').addEventListener('submit', e => {
    e.preventDefault();
    const u = document.getElementById('loginUser').value.trim();
    const p = document.getElementById('loginPass').value;
    if (!login(u, p)) {
      renderLogin('Invalid username or password.');
    } else {
      renderApp();
    }
  });

  document.querySelectorAll('.quick-login-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (login(btn.dataset.user, btn.dataset.pass)) renderApp();
    });
  });
}

// ---- Render: Shell ----
function renderApp() {
  if (!currentUser) { renderLogin(); return; }
  document.getElementById('app').innerHTML = `
    <div class="shell">
      <header class="topbar">
        <div class="topbar-left">
          <span class="topbar-logo">🛡 UKSA</span>
          <span class="topbar-title">Names of Concern Database</span>
        </div>
        <div class="topbar-right">
          <button class="btn btn-ghost btn-sm topbar-profile-btn" id="myProfileBtn">
            <span class="avatar-mini">${avatarInitials(currentUser)}</span>
            <span class="role-badge role-${currentUser.role}">${currentUser.role}</span>
            ${escHtml(currentUser.displayName || currentUser.username)}
          </button>
          <button class="btn btn-ghost btn-sm" id="logoutBtn">Sign out</button>
        </div>
      </header>
      <nav class="sidenav">
        <a href="#" class="nav-link active" data-view="database">📋 Database</a>
        ${can.manageUsers() ? '<a href="#" class="nav-link" data-view="users">👥 Users</a>' : ''}
        <a href="#" class="nav-link" data-view="about">ℹ About</a>
      </nav>
      <main class="main-content" id="mainContent"></main>
    </div>
  `;
  document.getElementById('logoutBtn').addEventListener('click', logout);
  document.getElementById('myProfileBtn').addEventListener('click', () => renderProfileModal(currentUser.id, true));
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      const view = link.dataset.view;
      if (view === 'database') renderDatabase();
      else if (view === 'users') renderUsers();
      else if (view === 'about') renderAbout();
    });
  });
  renderDatabase();
}

// ---- Render: Database View ----
function renderDatabase() {
  const mc = document.getElementById('mainContent');
  mc.innerHTML = `
    <div class="view-header">
      <div>
        <h2>Names of Concern</h2>
        <p class="view-sub">${entries.length} total entries</p>
      </div>
      ${can.add() ? '<button class="btn btn-primary" id="addEntryBtn">+ Add Entry</button>' : ''}
    </div>
    <div class="filter-bar">
      <div class="filter-search">
        <span class="filter-icon">🔍</span>
        <input type="text" id="searchInput" placeholder="Search handle, alias, or description…" value="${escHtml(filterState.search)}" />
      </div>
      <select id="filterArea">
        <option value="">All counties</option>
        ${AREAS.map(a => `<option value="${escHtml(a)}" ${filterState.area === a ? 'selected' : ''}>${escHtml(a)}</option>`).join('')}
      </select>
      <select id="filterSeverity">
        <option value="">All severities</option>
        <option value="high" ${filterState.severity === 'high' ? 'selected' : ''}>High</option>
        <option value="medium" ${filterState.severity === 'medium' ? 'selected' : ''}>Medium</option>
        <option value="low" ${filterState.severity === 'low' ? 'selected' : ''}>Low</option>
      </select>
      <select id="filterStatus">
        <option value="">All statuses</option>
        <option value="active" ${filterState.status === 'active' ? 'selected' : ''}>Active</option>
        <option value="under_review" ${filterState.status === 'under_review' ? 'selected' : ''}>Under Review</option>
        <option value="resolved" ${filterState.status === 'resolved' ? 'selected' : ''}>Resolved</option>
      </select>
      <button class="btn btn-ghost btn-sm" id="clearFiltersBtn">Clear</button>
    </div>
    <div id="entriesContainer"></div>
  `;

  if (can.add()) {
    document.getElementById('addEntryBtn').addEventListener('click', () => {
      editingId = null;
      renderEntryModal();
    });
  }
  document.getElementById('searchInput').addEventListener('input', e => { filterState.search = e.target.value; renderEntriesTable(); });
  document.getElementById('filterArea').addEventListener('change', e => { filterState.area = e.target.value; renderEntriesTable(); });
  document.getElementById('filterSeverity').addEventListener('change', e => { filterState.severity = e.target.value; renderEntriesTable(); });
  document.getElementById('filterStatus').addEventListener('change', e => { filterState.status = e.target.value; renderEntriesTable(); });
  document.getElementById('clearFiltersBtn').addEventListener('click', () => { filterState = { search: '', area: '', severity: '', status: '' }; renderDatabase(); });
  renderEntriesTable();
}

function renderEntriesTable() {
  const data = filteredEntries();
  const container = document.getElementById('entriesContainer');

  if (data.length === 0) {
    container.innerHTML = `<div class="empty-state">No entries match your filters.</div>`;
    return;
  }

  container.innerHTML = `
    <div class="results-count">${data.length} result${data.length !== 1 ? 's' : ''}</div>
    <div class="entry-table-wrap">
      <table class="entry-table">
        <thead>
          <tr>
            <th>Handle / Aliases</th>
            <th class="col-counties">Counties</th>
            <th>Severity</th>
            <th>Status</th>
            <th class="col-listed-by">Listed By</th>
            <th class="col-date-added">Date Added</th>
            <th class="col-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${data.map(e => renderEntryRow(e)).join('')}
        </tbody>
      </table>
    </div>
  `;

  container.querySelectorAll('.view-btn').forEach(btn => btn.addEventListener('click', () => renderEntryDetail(btn.dataset.id)));
  container.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', () => { editingId = btn.dataset.id; renderEntryModal(editingId); }));
  container.querySelectorAll('.delete-btn').forEach(btn => btn.addEventListener('click', () => confirmDelete(btn.dataset.id)));
  container.querySelectorAll('.lister-link').forEach(btn => btn.addEventListener('click', () => renderProfileModal(btn.dataset.uid, false)));
}

function renderEntryRow(e) {
  const lister = getUserById(e.listedBy);
  return `
    <tr class="entry-row" data-id="${e.id}">
      <td>
        <div class="handle-cell">
          <span class="handle-name">${escHtml(e.handle)}</span>
          ${e.aliases.length > 0 ? `<span class="aliases">aka: ${e.aliases.map(escHtml).join(', ')}</span>` : ''}
        </div>
      </td>
      <td>
        <div class="areas-cell">
          ${e.areas.slice(0,2).map(a => `<span class="area-tag">${escHtml(a)}</span>`).join('')}
          ${e.areas.length > 2 ? `<span class="area-tag area-more">+${e.areas.length - 2} more</span>` : ''}
        </div>
      </td>
      <td><span class="sev-badge ${severityClass(e.severity)}">${severityLabel(e.severity)}</span></td>
      <td><span class="status-badge ${statusClass(e.status)}">${statusLabel(e.status)}</span></td>
      <td>
        ${lister ? `<button class="btn-link lister-link" data-uid="${lister.id}">${escHtml(lister.displayName || lister.username)}</button>` : '—'}
      </td>
      <td class="date-cell">${formatDate(e.dateAdded)}</td>
      <td class="actions-cell">
        <button class="btn btn-ghost btn-xs view-btn" data-id="${e.id}">View</button>
        ${can.edit() ? `<button class="btn btn-ghost btn-xs edit-btn hide-mobile" data-id="${e.id}">Edit</button>` : ''}
        ${can.delete() ? `<button class="btn btn-danger btn-xs delete-btn hide-mobile" data-id="${e.id}">Del</button>` : ''}
      </td>
    </tr>
  `;
}

// ---- Entry Detail Page (full-page, replaces main content) ----
function renderEntryDetail(id) {
  const e = entries.find(x => x.id === id);
  if (!e) return;
  const lister = getUserById(e.listedBy);
  const mc = document.getElementById('mainContent');
  const entryComments = comments.filter(c => c.entryId === id);

  mc.innerHTML = `
    <div class="detail-page">
      <div class="detail-page-topbar">
        <button class="btn btn-ghost btn-sm" id="backToDbBtn">← Back</button>
        <div class="detail-page-actions">
          ${can.edit() ? `<button class="btn btn-secondary btn-sm" id="editEntryBtn">Edit</button>` : ''}
          ${can.delete() ? `<button class="btn btn-danger btn-sm" id="deleteEntryBtn">Delete</button>` : ''}
        </div>
      </div>

      <div class="detail-page-body">
        <div class="detail-page-main">
          <div class="detail-title-row">
            <h2>${escHtml(e.handle)}</h2>
            <div class="detail-badges">
              <span class="sev-badge ${severityClass(e.severity)}">${severityLabel(e.severity)}</span>
              <span class="status-badge ${statusClass(e.status)}">${statusLabel(e.status)}</span>
            </div>
          </div>

          ${e.aliases.length > 0 ? `
          <div class="detail-row">
            <span class="detail-label">Known aliases</span>
            <span class="detail-value">${e.aliases.map(escHtml).join(', ')}</span>
          </div>` : ''}

          <div class="detail-row">
            <span class="detail-label">Counties</span>
            <div class="detail-value areas-cell">
              ${e.areas.map(a => `<span class="area-tag">${escHtml(a)}</span>`).join('')}
            </div>
          </div>

          <div class="detail-row">
            <span class="detail-label">Description</span>
            <span class="detail-value detail-desc">${escHtml(e.description)}</span>
          </div>

          <div class="detail-row">
            <span class="detail-label">Date added</span>
            <span class="detail-value">${formatDate(e.dateAdded)}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Last updated</span>
            <span class="detail-value">${formatDate(e.dateUpdated)}</span>
          </div>

          ${lister ? `
          <div class="detail-section-title">Listed by</div>
          ${renderListerCard(lister)}
          <button class="btn btn-ghost btn-sm" id="viewListerProfileBtn" style="margin-top:8px">View Profile</button>
          ` : ''}
        </div>

        <div class="detail-page-comments">
          <div class="comments-header">
            <h3>Community Comments</h3>
            <span class="comments-count">${entryComments.length}</span>
          </div>

          <div class="add-comment-box">
            <div class="add-comment-avatar">${avatarInitials(currentUser)}</div>
            <div class="add-comment-form">
              <textarea id="commentText" placeholder="Share your experience with this person, or vouch for them…" rows="3"></textarea>
              <div class="add-comment-footer">
                <span class="add-comment-hint">Posting as ${escHtml(currentUser.displayName || currentUser.username)}</span>
                <button class="btn btn-primary btn-sm" id="submitCommentBtn">Post Comment</button>
              </div>
            </div>
          </div>

          <div class="comments-list" id="commentsList">
            ${renderCommentsList(entryComments)}
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('backToDbBtn').addEventListener('click', () => {
    renderDatabase();
  });

  const editBtn = mc.querySelector('#editEntryBtn');
  if (editBtn) editBtn.addEventListener('click', () => renderEntryModal(id));

  const deleteBtn = mc.querySelector('#deleteEntryBtn');
  if (deleteBtn) deleteBtn.addEventListener('click', () => confirmDelete(id));

  const profileBtn = mc.querySelector('#viewListerProfileBtn');
  if (profileBtn) profileBtn.addEventListener('click', () => renderProfileModal(lister.id, false));

  document.getElementById('submitCommentBtn').addEventListener('click', () => {
    const text = document.getElementById('commentText').value.trim();
    if (!text) return;
    const newComment = {
      id: 'cm' + Date.now(),
      entryId: id,
      authorId: currentUser.id,
      text,
      date: new Date().toISOString().slice(0, 10),
    };
    comments.push(newComment);
    document.getElementById('commentText').value = '';
    const updated = comments.filter(c => c.entryId === id);
    document.getElementById('commentsList').innerHTML = renderCommentsList(updated);
    mc.querySelector('.comments-count').textContent = updated.length;
  });
}

function renderCommentsList(entryComments) {
  if (entryComments.length === 0) {
    return `<div class="comments-empty">No comments yet. Be the first to share your experience.</div>`;
  }
  return entryComments.map(c => {
    const author = getUserById(c.authorId);
    return `
      <div class="comment-card">
        <div class="comment-avatar">${author ? avatarInitials(author) : '?'}</div>
        <div class="comment-body">
          <div class="comment-meta">
            <span class="comment-author">${author ? escHtml(author.displayName || author.username) : 'Unknown'}</span>
            <span class="role-badge role-${author?.role || 'user'}">${author?.role || 'user'}</span>
            <span class="comment-date">${formatDate(c.date)}</span>
          </div>
          <p class="comment-text">${escHtml(c.text)}</p>
        </div>
      </div>
    `;
  }).join('');
}

function renderListerCard(user) {
  const discord = user.discord && user.discord.linked ? user.discord.username : null;
  return `
    <div class="lister-card">
      <div class="lister-card-top">
        <div class="avatar">${avatarInitials(user)}</div>
        <div>
          <div class="lister-card-name">
            <span class="role-badge role-${user.role}">${user.role}</span>
            <strong>${escHtml(user.displayName || user.username)}</strong>
          </div>
          <div class="lister-card-username">@${escHtml(user.username)}</div>
        </div>
      </div>
      <div class="lister-contacts">
        ${user.email ? `<div class="contact-row"><span class="contact-icon">✉</span><a href="mailto:${escHtml(user.email)}">${escHtml(user.email)}</a></div>` : ''}
        ${discord ? `<div class="contact-row"><span class="contact-icon discord-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.033.055a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>
        </span>${escHtml(discord)}</div>` : ''}
        ${user.fetlife ? `<div class="contact-row"><span class="contact-icon">🔗</span><a href="${escHtml(user.fetlife)}" target="_blank" rel="noopener">FetLife profile</a></div>` : ''}
      </div>
    </div>
  `;
}

// ---- Profile Modal ----
function renderProfileModal(userId, editable) {
  const user = getUserById(userId);
  if (!user) return;
  const isOwnProfile = currentUser && currentUser.id === userId;
  const canEdit = editable && isOwnProfile;
  const discord = user.discord && user.discord.linked ? user.discord : null;

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal modal-profile">
      <div class="modal-header">
        <h3>${canEdit ? 'My Profile' : 'Member Profile'}</h3>
        <button class="modal-close" data-close>✕</button>
      </div>
      <div class="modal-body" id="profileModalBody">
        ${renderProfileView(user, canEdit)}
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', () => modal.remove()));
  modal.addEventListener('click', ev => { if (ev.target === modal) modal.remove(); });

  bindProfileEvents(modal, user, canEdit);
}

function renderProfileView(user, canEdit) {
  const discord = user.discord && user.discord.linked ? user.discord : null;
  const entriesListed = entries.filter(e => e.listedBy === user.id).length;
  return `
    <div class="profile-header">
      <div class="avatar avatar-lg">${avatarInitials(user)}</div>
      <div class="profile-header-info">
        <div class="profile-display-name">${escHtml(user.displayName || user.username)}</div>
        <div class="profile-username">@${escHtml(user.username)}</div>
        <div class="profile-meta">
          <span class="role-badge role-${user.role}">${user.role}</span>
          <span class="profile-joined">Member since ${formatDate(user.joinedDate)}</span>
        </div>
      </div>
    </div>

    ${user.bio ? `<p class="profile-bio">${escHtml(user.bio)}</p>` : ''}

    <div class="profile-stats">
      <div class="stat-box">
        <span class="stat-num">${entriesListed}</span>
        <span class="stat-label">entries listed</span>
      </div>
    </div>

    <div class="detail-section-title">Contact</div>
    ${!hasContact(user) ? `<div class="alert alert-error">No contact method set. Please add at least one.</div>` : ''}
    <div class="contact-list">
      ${user.email ? `
        <div class="contact-item">
          <span class="contact-type">Email</span>
          <a href="mailto:${escHtml(user.email)}">${escHtml(user.email)}</a>
        </div>` : ''}
      ${discord ? `
        <div class="contact-item">
          <span class="contact-type">Discord</span>
          <span class="discord-linked">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-2px;margin-right:4px"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.033.055a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>
            ${escHtml(discord.username)}
            <span class="linked-badge">linked</span>
          </span>
        </div>` : ''}
      ${user.fetlife ? `
        <div class="contact-item">
          <span class="contact-type">FetLife</span>
          <a href="${escHtml(user.fetlife)}" target="_blank" rel="noopener">${escHtml(user.fetlife.replace('https://fetlife.com/users/',''))}</a>
        </div>` : ''}
    </div>

    ${canEdit ? `
    <div class="modal-footer" style="padding:20px 0 0;border-top:1px solid var(--border);margin-top:20px">
      <button class="btn btn-secondary" id="editProfileBtn">Edit Profile</button>
      <button class="btn btn-ghost" data-close>Close</button>
    </div>` : `
    <div class="modal-footer" style="padding:20px 0 0;border-top:1px solid var(--border);margin-top:20px">
      <button class="btn btn-ghost" data-close>Close</button>
    </div>`}
  `;
}

function renderProfileEditForm(user) {
  const discord = user.discord && user.discord.linked ? user.discord : null;
  return `
    <div class="profile-header">
      <div class="avatar avatar-lg">${avatarInitials(user)}</div>
      <div class="profile-header-info">
        <div class="profile-display-name">${escHtml(user.displayName || user.username)}</div>
        <div class="profile-username">@${escHtml(user.username)}</div>
        <div class="profile-meta"><span class="role-badge role-${user.role}">${user.role}</span></div>
      </div>
    </div>

    <div class="form-group" style="margin-top:16px">
      <label>Display Name</label>
      <input type="text" id="pfDisplayName" value="${escHtml(user.displayName || '')}" placeholder="How your name appears" />
    </div>
    <div class="form-group">
      <label>Bio</label>
      <textarea id="pfBio" rows="2" placeholder="A short bio (optional)">${escHtml(user.bio || '')}</textarea>
    </div>

    <div class="detail-section-title">Contact <span class="hint" style="text-transform:none;letter-spacing:0">(at least one required)</span></div>

    <div class="form-group">
      <label>Email address</label>
      <input type="email" id="pfEmail" value="${escHtml(user.email || '')}" placeholder="your@email.com" />
    </div>
    <div class="form-group">
      <label>FetLife URL</label>
      <input type="url" id="pfFetlife" value="${escHtml(user.fetlife || '')}" placeholder="https://fetlife.com/users/YourHandle" />
    </div>
    <div class="form-group">
      <label>Discord</label>
      ${discord ? `
        <div class="discord-linked-row">
          <span class="discord-linked">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-2px;margin-right:4px"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.033.055a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>
            ${escHtml(discord.username)} <span class="linked-badge">linked</span>
          </span>
          <button class="btn btn-ghost btn-sm" id="unlinkDiscordBtn">Unlink</button>
        </div>` : `
        <button class="btn btn-discord" id="linkDiscordBtn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.033.055a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>
          Link Discord Account
        </button>
        <p class="field-hint">In the live app this opens Discord OAuth. Here it simulates the link.</p>`}
    </div>

    <div id="profileFormError" class="alert alert-error" style="display:none"></div>

    <div class="modal-footer" style="padding:20px 0 0;border-top:1px solid var(--border);margin-top:4px">
      <button class="btn btn-primary" id="saveProfileBtn">Save Changes</button>
      <button class="btn btn-ghost" id="cancelEditProfileBtn">Cancel</button>
    </div>
  `;
}

function bindProfileEvents(modal, user, canEdit) {
  const body = modal.querySelector('#profileModalBody');

  function switchToEdit() {
    body.innerHTML = renderProfileEditForm(user);
    bindEditFormEvents();
  }

  function switchToView() {
    body.innerHTML = renderProfileView(user, canEdit);
    bindViewEvents();
  }

  function bindViewEvents() {
    const editBtn = body.querySelector('#editProfileBtn');
    if (editBtn) editBtn.addEventListener('click', switchToEdit);
    modal.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', () => modal.remove()));
  }

  function bindEditFormEvents() {
    // Discord link simulation
    const linkBtn = body.querySelector('#linkDiscordBtn');
    if (linkBtn) {
      linkBtn.addEventListener('click', () => {
        simulateDiscordOAuth(user, () => {
          body.querySelector('#pfEmail') && (body.innerHTML = renderProfileEditForm(user));
          bindEditFormEvents();
        });
      });
    }

    const unlinkBtn = body.querySelector('#unlinkDiscordBtn');
    if (unlinkBtn) {
      unlinkBtn.addEventListener('click', () => {
        user.discord = null;
        body.innerHTML = renderProfileEditForm(user);
        bindEditFormEvents();
      });
    }

    body.querySelector('#cancelEditProfileBtn').addEventListener('click', switchToView);

    body.querySelector('#saveProfileBtn').addEventListener('click', () => {
      const displayName = body.querySelector('#pfDisplayName').value.trim();
      const bio = body.querySelector('#pfBio').value.trim();
      const email = body.querySelector('#pfEmail').value.trim();
      const fetlife = body.querySelector('#pfFetlife').value.trim();
      const errEl = body.querySelector('#profileFormError');

      const hasDiscord = user.discord && user.discord.linked;
      if (!email && !fetlife && !hasDiscord) {
        errEl.textContent = 'At least one contact method is required: email, FetLife, or Discord.';
        errEl.style.display = 'block';
        return;
      }

      // Persist changes into the working users array
      const idx = users.findIndex(u => u.id === user.id);
      users[idx] = { ...users[idx], displayName, bio, email: email || null, fetlife: fetlife || null };
      // Update currentUser reference if editing own profile
      if (currentUser && currentUser.id === user.id) {
        currentUser = users[idx];
        // Refresh topbar name
        const profileBtn = document.querySelector('#myProfileBtn');
        if (profileBtn) {
          profileBtn.innerHTML = `
            <span class="avatar-mini">${avatarInitials(currentUser)}</span>
            <span class="role-badge role-${currentUser.role}">${currentUser.role}</span>
            ${escHtml(currentUser.displayName || currentUser.username)}
          `;
        }
      }
      Object.assign(user, users[idx]);
      switchToView();
    });
  }

  bindViewEvents();
}

// ---- Discord OAuth simulation ----
function simulateDiscordOAuth(user, onComplete) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = '200';
  overlay.innerHTML = `
    <div class="modal modal-confirm">
      <div class="modal-header">
        <h3 style="display:flex;align-items:center;gap:8px">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#5865F2"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.033.055a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>
          Link Discord
        </h3>
        <button class="modal-close" data-close>✕</button>
      </div>
      <div class="modal-body">
        <p style="margin-bottom:12px">In the live app, this would open a Discord OAuth popup to authorise UKSA to read your username and ID.</p>
        <p style="margin-bottom:16px;color:var(--text-muted);font-size:0.85rem">Enter a Discord username to simulate the link:</p>
        <div class="form-group" style="margin:0">
          <input type="text" id="discordSimInput" placeholder="e.g. YourName" value="${escHtml(user.username)}" />
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-discord" id="confirmDiscordLink">Authorise (simulate)</button>
        <button class="btn btn-ghost" data-close>Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', () => overlay.remove()));
  overlay.addEventListener('click', ev => { if (ev.target === overlay) overlay.remove(); });
  overlay.querySelector('#confirmDiscordLink').addEventListener('click', () => {
    const username = overlay.querySelector('#discordSimInput').value.trim();
    if (!username) return;
    const fakeId = String(Math.floor(Math.random() * 9e17) + 1e17);
    user.discord = { username, id: fakeId, linked: true };
    const idx = users.findIndex(u => u.id === user.id);
    if (idx !== -1) users[idx].discord = user.discord;
    overlay.remove();
    onComplete();
  });
}

// ---- Entry Add/Edit Modal ----
function renderEntryModal(id = null) {
  const existing = id ? entries.find(e => e.id === id) : null;
  const title = existing ? 'Edit Entry' : 'Add Entry';

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal modal-form">
      <div class="modal-header">
        <h3>${title}</h3>
        <button class="modal-close" data-close>✕</button>
      </div>
      <div class="modal-body">
        <form id="entryForm">
          <div class="form-group">
            <label>Handle / Username <span class="required">*</span></label>
            <input type="text" id="fHandle" value="${existing ? escHtml(existing.handle) : ''}" placeholder="Primary online handle" required />
          </div>
          <div class="form-group">
            <label>Known Aliases <span class="hint">(comma-separated)</span></label>
            <input type="text" id="fAliases" value="${existing ? escHtml(existing.aliases.join(', ')) : ''}" placeholder="e.g. AltHandle, OldName" />
          </div>
          <div class="form-group">
            <label>Counties Active <span class="required">*</span></label>
            <div id="fAreasMount"></div>
          </div>
          <div class="form-group">
            <label>Description <span class="required">*</span></label>
            <textarea id="fDesc" rows="4" placeholder="Describe the concern…" required>${existing ? escHtml(existing.description) : ''}</textarea>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Severity <span class="required">*</span></label>
              <select id="fSeverity" required>
                <option value="">Select…</option>
                <option value="high" ${existing && existing.severity === 'high' ? 'selected' : ''}>High</option>
                <option value="medium" ${existing && existing.severity === 'medium' ? 'selected' : ''}>Medium</option>
                <option value="low" ${existing && existing.severity === 'low' ? 'selected' : ''}>Low</option>
              </select>
            </div>
            <div class="form-group">
              <label>Status <span class="required">*</span></label>
              <select id="fStatus" required>
                <option value="">Select…</option>
                <option value="active" ${existing && existing.status === 'active' ? 'selected' : ''}>Active</option>
                <option value="under_review" ${existing && existing.status === 'under_review' ? 'selected' : ''}>Under Review</option>
                <option value="resolved" ${existing && existing.status === 'resolved' ? 'selected' : ''}>Resolved</option>
              </select>
            </div>
          </div>
          <div id="formError" class="alert alert-error" style="display:none"></div>
        </form>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" id="saveEntryBtn">Save</button>
        <button class="btn btn-ghost" data-close>Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', () => modal.remove()));
  modal.addEventListener('click', ev => { if (ev.target === modal) modal.remove(); });

  // Mount multiselect into the placeholder
  const ms = createMultiselect(AREAS, existing ? existing.areas : [], 'Select counties…');
  document.getElementById('fAreasMount').appendChild(ms.el);

  document.getElementById('saveEntryBtn').addEventListener('click', () => {
    const handle = document.getElementById('fHandle').value.trim();
    const aliasRaw = document.getElementById('fAliases').value.trim();
    const aliases = aliasRaw ? aliasRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
    const areas = ms.getSelected();
    const description = document.getElementById('fDesc').value.trim();
    const severity = document.getElementById('fSeverity').value;
    const status = document.getElementById('fStatus').value;
    const errEl = document.getElementById('formError');

    if (!handle || !description || !severity || !status || areas.length === 0) {
      errEl.textContent = 'Please fill in all required fields and select at least one county.';
      errEl.style.display = 'block';
      return;
    }

    const now = new Date().toISOString().slice(0, 10);
    if (existing) {
      const idx = entries.findIndex(e => e.id === id);
      entries[idx] = { ...entries[idx], handle, aliases, areas, description, severity, status, dateUpdated: now };
      modal.remove();
      renderEntryDetail(id);
    } else {
      const newId = 'e' + Date.now();
      entries.unshift({ id: newId, handle, aliases, areas, description, severity, status, listedBy: currentUser.id, dateAdded: now, dateUpdated: now });
      modal.remove();
      renderDatabase();
    }
  });
}

// ---- Delete ----
function confirmDelete(id) {
  const e = entries.find(x => x.id === id);
  if (!e) return;
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal modal-confirm">
      <div class="modal-header">
        <h3>Delete Entry</h3>
        <button class="modal-close" data-close>✕</button>
      </div>
      <div class="modal-body">
        <p>Are you sure you want to delete the entry for <strong>${escHtml(e.handle)}</strong>?</p>
        <p class="confirm-warning">This action cannot be undone.</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-danger" id="confirmDelBtn">Delete</button>
        <button class="btn btn-ghost" data-close>Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', () => modal.remove()));
  modal.addEventListener('click', ev => { if (ev.target === modal) modal.remove(); });
  document.getElementById('confirmDelBtn').addEventListener('click', () => {
    entries = entries.filter(x => x.id !== id);
    comments = comments.filter(c => c.entryId !== id);
    modal.remove();
    renderDatabase();
  });
}

// ---- Render: Users View ----
function renderUsers() {
  const mc = document.getElementById('mainContent');
  mc.innerHTML = `
    <div class="view-header">
      <div>
        <h2>User Management</h2>
        <p class="view-sub">${users.length} accounts</p>
      </div>
    </div>
    <div class="entry-table-wrap">
      <table class="entry-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Role</th>
            <th>Email</th>
            <th>Discord</th>
            <th>FetLife</th>
            <th class="col-actions">Profile</th>
          </tr>
        </thead>
        <tbody>
          ${users.map(u => {
            const discord = u.discord && u.discord.linked ? u.discord.username : null;
            return `
            <tr>
              <td>
                <div style="display:flex;align-items:center;gap:8px">
                  <div class="avatar avatar-sm">${avatarInitials(u)}</div>
                  <div>
                    <div style="font-weight:600">${escHtml(u.displayName || u.username)}</div>
                    <div style="font-size:0.75rem;color:var(--text-muted)">@${escHtml(u.username)}</div>
                  </div>
                </div>
              </td>
              <td><span class="role-badge role-${u.role}">${u.role}</span></td>
              <td>${u.email ? `<a href="mailto:${escHtml(u.email)}">${escHtml(u.email)}</a>` : '<span style="color:var(--text-dim)">—</span>'}</td>
              <td>${discord ? `<span style="font-size:0.85rem">${escHtml(discord)}</span>` : '<span style="color:var(--text-dim)">—</span>'}</td>
              <td>${u.fetlife ? `<a href="${escHtml(u.fetlife)}" target="_blank" rel="noopener">View</a>` : '<span style="color:var(--text-dim)">—</span>'}</td>
              <td class="actions-cell"><button class="btn btn-ghost btn-xs view-user-btn" data-uid="${u.id}">View</button></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <p class="demo-note">⚠ Add/remove accounts will be managed through Firebase Auth in the live version.</p>
  `;
  mc.querySelectorAll('.view-user-btn').forEach(btn => {
    btn.addEventListener('click', () => renderProfileModal(btn.dataset.uid, false));
  });
}

// ---- Render: About View ----
function renderAbout() {
  const mc = document.getElementById('mainContent');
  mc.innerHTML = `
    <div class="view-header"><div><h2>About UKSA NOC Database</h2></div></div>
    <div class="about-content">
      <div class="about-card">
        <h4>Purpose</h4>
        <p>This database allows UKSA members to record, track, and share information about individuals who have been identified as potential safety concerns within UK kink and fetish communities.</p>
      </div>
      <div class="about-card">
        <h4>Access Levels</h4>
        <div class="role-list">
          <div class="role-item"><span class="role-badge role-admin">admin</span> Full access: view, add, edit, delete entries and manage users.</div>
          <div class="role-item"><span class="role-badge role-mod">moderator</span> Can view, add and edit entries. Cannot delete or manage users.</div>
          <div class="role-item"><span class="role-badge role-user">user</span> Read-only access. Can search and filter the database.</div>
        </div>
      </div>
      <div class="about-card">
        <h4>Profile Requirements</h4>
        <p>Every member must have at least one contact method on their profile: email address, FetLife URL, or a linked Discord account. This ensures accountability for listed entries.</p>
      </div>
      <div class="about-card about-note">
        <h4>⚠ This is a local mockup</h4>
        <p>No real data is stored. All entries and accounts are fictional. The live version will use Firebase for authentication (including Discord OAuth) and Firestore for data storage, deployed via Netlify.</p>
      </div>
    </div>
  `;
}

// ---- Boot ----
document.addEventListener('DOMContentLoaded', () => renderApp());
