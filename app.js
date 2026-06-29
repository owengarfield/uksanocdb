// ---- State ----
let currentUser = null;
let entries = JSON.parse(JSON.stringify(MOCK_ENTRIES)); // working copy
let editingId = null;
let filterState = { search: '', area: '', severity: '', status: '' };

// ---- Auth ----
function login(username, password) {
  const user = MOCK_USERS.find(u => u.username === username && u.password === password);
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
  view:   () => !!currentUser,
  add:    () => currentUser && (currentUser.role === 'admin' || currentUser.role === 'moderator'),
  edit:   () => currentUser && (currentUser.role === 'admin' || currentUser.role === 'moderator'),
  delete: () => currentUser && currentUser.role === 'admin',
  manageUsers: () => currentUser && currentUser.role === 'admin',
};

// ---- Helpers ----
function getUserById(id) {
  return MOCK_USERS.find(u => u.id === id);
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
  const dt = new Date(d);
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ---- Filtering ----
function filteredEntries() {
  const { search, area, severity, status } = filterState;
  return entries.filter(e => {
    if (search) {
      const q = search.toLowerCase();
      const inHandle = e.handle.toLowerCase().includes(q);
      const inAliases = e.aliases.some(a => a.toLowerCase().includes(q));
      const inDesc = e.description.toLowerCase().includes(q);
      if (!inHandle && !inAliases && !inDesc) return false;
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
          <p class="demo-title">Demo credentials</p>
          <div class="cred-grid">
            <div class="cred-row"><span class="role-badge role-admin">admin</span><code>SafetyAdmin</code> / <code>admin123</code></div>
            <div class="cred-row"><span class="role-badge role-mod">mod</span><code>ModeratorJane</code> / <code>mod123</code></div>
            <div class="cred-row"><span class="role-badge role-user">user</span><code>MemberAlex</code> / <code>user123</code></div>
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
          <span class="topbar-user">
            <span class="role-badge role-${currentUser.role}">${currentUser.role}</span>
            ${escHtml(currentUser.username)}
          </span>
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
        <option value="">All areas</option>
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

  document.getElementById('searchInput').addEventListener('input', e => {
    filterState.search = e.target.value;
    renderEntriesTable();
  });
  document.getElementById('filterArea').addEventListener('change', e => {
    filterState.area = e.target.value;
    renderEntriesTable();
  });
  document.getElementById('filterSeverity').addEventListener('change', e => {
    filterState.severity = e.target.value;
    renderEntriesTable();
  });
  document.getElementById('filterStatus').addEventListener('change', e => {
    filterState.status = e.target.value;
    renderEntriesTable();
  });
  document.getElementById('clearFiltersBtn').addEventListener('click', () => {
    filterState = { search: '', area: '', severity: '', status: '' };
    renderDatabase();
  });

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
            <th>Areas Active</th>
            <th>Severity</th>
            <th>Status</th>
            <th>Listed By</th>
            <th>Date Added</th>
            ${can.edit() || can.delete() ? '<th class="col-actions">Actions</th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${data.map(e => renderEntryRow(e)).join('')}
        </tbody>
      </table>
    </div>
  `;

  container.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => renderEntryDetail(btn.dataset.id));
  });
  container.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      editingId = btn.dataset.id;
      renderEntryModal(editingId);
    });
  });
  container.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => confirmDelete(btn.dataset.id));
  });
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
          ${e.areas.slice(0,3).map(a => `<span class="area-tag">${escHtml(a)}</span>`).join('')}
          ${e.areas.length > 3 ? `<span class="area-tag area-more">+${e.areas.length - 3}</span>` : ''}
        </div>
      </td>
      <td><span class="sev-badge ${severityClass(e.severity)}">${severityLabel(e.severity)}</span></td>
      <td><span class="status-badge ${statusClass(e.status)}">${statusLabel(e.status)}</span></td>
      <td><span class="lister-name">${lister ? escHtml(lister.username) : '—'}</span></td>
      <td class="date-cell">${formatDate(e.dateAdded)}</td>
      ${can.edit() || can.delete() ? `
      <td class="actions-cell">
        <button class="btn btn-ghost btn-xs view-btn" data-id="${e.id}">View</button>
        ${can.edit() ? `<button class="btn btn-ghost btn-xs edit-btn" data-id="${e.id}">Edit</button>` : ''}
        ${can.delete() ? `<button class="btn btn-danger btn-xs delete-btn" data-id="${e.id}">Del</button>` : ''}
      </td>` : `<td class="actions-cell"><button class="btn btn-ghost btn-xs view-btn" data-id="${e.id}">View</button></td>`}
    </tr>
  `;
}

// ---- Entry Detail Modal ----
function renderEntryDetail(id) {
  const e = entries.find(x => x.id === id);
  if (!e) return;
  const lister = getUserById(e.listedBy);

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal modal-detail">
      <div class="modal-header">
        <div>
          <h3>${escHtml(e.handle)}</h3>
          <div class="modal-badges">
            <span class="sev-badge ${severityClass(e.severity)}">${severityLabel(e.severity)}</span>
            <span class="status-badge ${statusClass(e.status)}">${statusLabel(e.status)}</span>
          </div>
        </div>
        <button class="modal-close" data-close>✕</button>
      </div>
      <div class="modal-body">
        ${e.aliases.length > 0 ? `
        <div class="detail-row">
          <span class="detail-label">Known aliases</span>
          <span class="detail-value">${e.aliases.map(escHtml).join(', ')}</span>
        </div>` : ''}
        <div class="detail-row">
          <span class="detail-label">Areas active</span>
          <div class="detail-value areas-cell">
            ${e.areas.map(a => `<span class="area-tag">${escHtml(a)}</span>`).join('')}
          </div>
        </div>
        <div class="detail-row">
          <span class="detail-label">Description</span>
          <span class="detail-value">${escHtml(e.description)}</span>
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
        <div class="lister-card">
          <div class="lister-card-name">
            <span class="role-badge role-${lister.role}">${lister.role}</span>
            ${escHtml(lister.username)}
          </div>
          <div class="lister-contacts">
            ${lister.email ? `<div class="contact-row">✉ <a href="mailto:${escHtml(lister.email)}">${escHtml(lister.email)}</a></div>` : ''}
            ${lister.discord ? `<div class="contact-row">💬 ${escHtml(lister.discord)}</div>` : ''}
            ${lister.fetlife ? `<div class="contact-row">🔗 <a href="${escHtml(lister.fetlife)}" target="_blank" rel="noopener">FetLife profile</a></div>` : ''}
          </div>
        </div>` : ''}
      </div>
      <div class="modal-footer">
        ${can.edit() ? `<button class="btn btn-secondary" id="editFromDetailBtn">Edit Entry</button>` : ''}
        <button class="btn btn-ghost" data-close>Close</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', () => modal.remove()));
  modal.addEventListener('click', ev => { if (ev.target === modal) modal.remove(); });
  const editBtn = modal.querySelector('#editFromDetailBtn');
  if (editBtn) editBtn.addEventListener('click', () => { modal.remove(); editingId = id; renderEntryModal(id); });
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
            <label>Areas Active <span class="required">*</span></label>
            <div class="checkbox-grid" id="fAreas">
              ${AREAS.map(a => `
                <label class="checkbox-label">
                  <input type="checkbox" value="${escHtml(a)}" ${existing && existing.areas.includes(a) ? 'checked' : ''} />
                  ${escHtml(a)}
                </label>
              `).join('')}
            </div>
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

  document.getElementById('saveEntryBtn').addEventListener('click', () => {
    const handle = document.getElementById('fHandle').value.trim();
    const aliasRaw = document.getElementById('fAliases').value.trim();
    const aliases = aliasRaw ? aliasRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
    const areas = [...document.querySelectorAll('#fAreas input:checked')].map(el => el.value);
    const description = document.getElementById('fDesc').value.trim();
    const severity = document.getElementById('fSeverity').value;
    const status = document.getElementById('fStatus').value;
    const errEl = document.getElementById('formError');

    if (!handle || !description || !severity || !status || areas.length === 0) {
      errEl.textContent = 'Please fill in all required fields and select at least one area.';
      errEl.style.display = 'block';
      return;
    }

    const now = new Date().toISOString().slice(0, 10);
    if (existing) {
      const idx = entries.findIndex(e => e.id === id);
      entries[idx] = { ...entries[idx], handle, aliases, areas, description, severity, status, dateUpdated: now };
    } else {
      const newId = 'e' + (Date.now());
      entries.unshift({ id: newId, handle, aliases, areas, description, severity, status, listedBy: currentUser.id, dateAdded: now, dateUpdated: now });
    }
    modal.remove();
    renderDatabase();
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
        <p class="view-sub">${MOCK_USERS.length} accounts</p>
      </div>
    </div>
    <div class="entry-table-wrap">
      <table class="entry-table">
        <thead>
          <tr>
            <th>Username</th>
            <th>Role</th>
            <th>Email</th>
            <th>Discord</th>
            <th>FetLife</th>
          </tr>
        </thead>
        <tbody>
          ${MOCK_USERS.map(u => `
            <tr>
              <td><strong>${escHtml(u.username)}</strong></td>
              <td><span class="role-badge role-${u.role}">${u.role}</span></td>
              <td>${u.email ? `<a href="mailto:${escHtml(u.email)}">${escHtml(u.email)}</a>` : '—'}</td>
              <td>${u.discord ? escHtml(u.discord) : '—'}</td>
              <td>${u.fetlife ? `<a href="${escHtml(u.fetlife)}" target="_blank" rel="noopener">View profile</a>` : '—'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <p class="demo-note">⚠ User management (add/edit/remove accounts) will be implemented with Firebase Auth in the live version.</p>
  `;
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
        <h4>Data Fields</h4>
        <ul>
          <li><strong>Handle / Username</strong> — Primary online identity used by the person of concern</li>
          <li><strong>Known Aliases</strong> — Any other names or handles they are known by</li>
          <li><strong>Areas Active</strong> — Platforms and events where they are known to be active</li>
          <li><strong>Description</strong> — Nature of the concern</li>
          <li><strong>Severity</strong> — High / Medium / Low risk assessment</li>
          <li><strong>Status</strong> — Active / Under Review / Resolved</li>
          <li><strong>Listed By</strong> — UKSA member who added the entry, with contact details</li>
        </ul>
      </div>
      <div class="about-card about-note">
        <h4>⚠ This is a local mockup</h4>
        <p>No real data is stored. All entries and accounts are fictional. The live version will use Firebase for authentication and data storage, deployed via Netlify.</p>
      </div>
    </div>
  `;
}

// ---- Boot ----
document.addEventListener('DOMContentLoaded', () => renderApp());
