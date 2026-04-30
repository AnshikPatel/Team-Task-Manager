const state = {
  token: localStorage.getItem("ttm_token") || "",
  user: JSON.parse(localStorage.getItem("ttm_user") || "null"),
  tab: "dashboard",
  users: [],
  projects: [],
  tasks: [],
  dashboard: null,
  taskFilter: "all",
  taskSearch: "",
  message: "",
  error: ""
};

const app = document.querySelector("#app");

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

function saveSession(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem("ttm_token", token);
  localStorage.setItem("ttm_user", JSON.stringify(user));
}

function clearSession() {
  state.token = "";
  state.user = null;
  localStorage.removeItem("ttm_token");
  localStorage.removeItem("ttm_user");
}

function setNotice(message, isError = false) {
  state.message = isError ? "" : message;
  state.error = isError ? message : "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function statusLabel(status) {
  return {
    todo: "To do",
    "in-progress": "In progress",
    done: "Done"
  }[status] || status;
}

function isOverdue(task) {
  return task.status !== "done" && task.dueDate && new Date(`${task.dueDate}T23:59:59`) < new Date();
}

function dueText(task) {
  if (!task.dueDate) return "No due date";
  const todayDate = new Date();
  const dueDate = new Date(`${task.dueDate}T23:59:59`);
  const days = Math.ceil((dueDate - todayDate) / 86400000);
  if (task.status === "done") return `Completed by ${task.dueDate}`;
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`;
  if (days === 0) return "Due today";
  return `${days} day${days === 1 ? "" : "s"} left`;
}

function projectProgress(project) {
  const tasks = state.tasks.filter(task => task.projectId === project.id);
  if (!tasks.length) return 0;
  return Math.round((tasks.filter(task => task.status === "done").length / tasks.length) * 100);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function loadAppData() {
  const [users, projects, tasks, dashboard] = await Promise.all([
    api("/api/users"),
    api("/api/projects"),
    api("/api/tasks"),
    api("/api/dashboard")
  ]);
  state.users = users.users;
  state.projects = projects.projects;
  state.tasks = tasks.tasks;
  state.dashboard = dashboard;
}

async function boot() {
  if (!state.token) return renderAuth();
  try {
    const me = await api("/api/me");
    state.user = me.user;
    localStorage.setItem("ttm_user", JSON.stringify(me.user));
    await loadAppData();
    renderApp();
  } catch {
    clearSession();
    renderAuth();
  }
}

function renderAuth(mode = "login") {
  app.innerHTML = `
    <section class="auth-shell">
      <div class="auth-card">
        <div class="auth-intro">
          <h1>Team Task Manager</h1>
          <p>Create projects, add teammates, assign tasks, and watch progress from one clean dashboard.</p>
          <p class="hint">The first registered user becomes Admin. Every next user starts as Member.</p>
          <div class="preview-board" aria-hidden="true">
            <div class="preview-card one">
              <span></span>
              <strong>Design UI</strong>
              <small>In progress</small>
            </div>
            <div class="preview-card two">
              <span></span>
              <strong>API routes</strong>
              <small>Done</small>
            </div>
            <div class="preview-card three">
              <span></span>
              <strong>Dashboard</strong>
              <small>To do</small>
            </div>
          </div>
        </div>
        <div class="auth-form">
          <div class="tabs">
            <button class="tab ${mode === "login" ? "active" : ""}" data-auth-tab="login">Login</button>
            <button class="tab ${mode === "signup" ? "active" : ""}" data-auth-tab="signup">Signup</button>
          </div>
          ${state.error ? `<div class="notice error">${escapeHtml(state.error)}</div>` : ""}
          ${state.message ? `<div class="notice">${escapeHtml(state.message)}</div>` : ""}
          <form id="authForm">
            ${mode === "signup" ? `
              <div class="field">
                <label for="name">Name</label>
                <input id="name" name="name" autocomplete="name" required minlength="2" />
              </div>
            ` : ""}
            <div class="field">
              <label for="email">Email</label>
              <input id="email" name="email" type="email" autocomplete="email" required />
            </div>
            <div class="field">
              <label for="password">Password</label>
              <input id="password" name="password" type="password" autocomplete="${mode === "signup" ? "new-password" : "current-password"}" required minlength="6" />
            </div>
            <button class="btn full" type="submit">${mode === "signup" ? "Create account" : "Login"}</button>
            ${mode === "login" ? `
              <p class="login-help">
                Admin: <strong>admin@taskmanager.com</strong> / <strong>admin123</strong><br />
                Member: <strong>riya@taskmanager.com</strong> / <strong>member123</strong>
              </p>
            ` : ""}
          </form>
        </div>
      </div>
    </section>
  `;

  document.querySelectorAll("[data-auth-tab]").forEach(button => {
    button.addEventListener("click", () => {
      setNotice("");
      renderAuth(button.dataset.authTab);
    });
  });

  document.querySelector("#authForm").addEventListener("submit", async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const payload = {
        email: form.get("email"),
        password: form.get("password")
      };
      if (mode === "signup") payload.name = form.get("name");
      const data = await api(`/api/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      saveSession(data.token, data.user);
      setNotice("");
      await loadAppData();
      renderApp();
    } catch (error) {
      setNotice(error.message, true);
      renderAuth(mode);
    }
  });
}

function shell(content) {
  return `
    <section class="app-shell">
      <header class="topbar">
        <div class="brand">
          <span class="brand-mark">TT</span>
          <span>Team Task Manager</span>
        </div>
        <nav class="nav">
          ${navButton("dashboard", "Dashboard")}
          ${navButton("projects", "Projects")}
          ${navButton("tasks", "Tasks")}
        </nav>
        <div class="user-box">
          <div>
            <strong>${escapeHtml(state.user.name)}</strong>
            <span class="role-pill ${state.user.role === "member" ? "member" : ""}">${escapeHtml(state.user.role)}</span>
          </div>
          <button class="btn secondary" id="logoutBtn">Logout</button>
        </div>
      </header>
      <div class="content">
        ${state.error ? `<div class="notice error">${escapeHtml(state.error)}</div>` : ""}
        ${state.message ? `<div class="notice">${escapeHtml(state.message)}</div>` : ""}
        ${content}
      </div>
    </section>
  `;
}

function navButton(tab, label) {
  return `<button class="${state.tab === tab ? "active" : ""}" data-tab="${tab}">${label}</button>`;
}

function renderApp() {
  const views = {
    dashboard: renderDashboard,
    projects: renderProjects,
    tasks: renderTasks
  };
  app.innerHTML = shell(views[state.tab]());
  bindShell();
  if (state.tab === "projects") bindProjects();
  if (state.tab === "tasks") bindTasks();
}

function bindShell() {
  document.querySelectorAll("[data-tab]").forEach(button => {
    button.addEventListener("click", () => {
      state.tab = button.dataset.tab;
      setNotice("");
      renderApp();
    });
  });
  document.querySelector("#logoutBtn").addEventListener("click", async () => {
    try {
      await api("/api/auth/logout", { method: "POST", body: "{}" });
    } catch {}
    clearSession();
    renderAuth();
  });
}

function renderDashboard() {
  const d = state.dashboard || { byStatus: {} };
  const completed = d.byStatus?.done || 0;
  const total = d.tasks || 0;
  const completion = total ? Math.round((completed / total) * 100) : 0;
  return `
    <div class="page-title">
      <div>
        <h1>Dashboard</h1>
        <p class="muted">A quick view of project work, assigned tasks, and overdue items.</p>
      </div>
    </div>
    <section class="hero-panel">
      <div>
        <span class="eyebrow">Workspace pulse</span>
        <h2>${completion}% work completed</h2>
        <p>Keep moving tasks across the board and the dashboard will update in real time.</p>
      </div>
      <div class="progress-orbit" style="--progress: ${completion * 3.6}deg">
        <span>${completion}%</span>
      </div>
    </section>
    <div class="grid stats">
      ${stat("Projects", d.projects)}
      ${stat("All visible tasks", d.tasks)}
      ${stat("My tasks", d.myTasks)}
      ${stat("Overdue", d.overdue)}
    </div>
    <div class="grid two-col" style="margin-top: 16px;">
      <section class="panel">
        <h2>Status summary</h2>
        <div class="cards">
          ${["todo", "in-progress", "done"].map(status => `
            <div class="task-card status-row">
              <div class="card-head">
                <strong>${statusLabel(status)}</strong>
                <span class="status-pill ${status}">${d.byStatus?.[status] || 0}</span>
              </div>
              <div class="meter"><span style="width: ${total ? Math.round(((d.byStatus?.[status] || 0) / total) * 100) : 0}%"></span></div>
            </div>
          `).join("")}
        </div>
      </section>
      <section class="panel">
        <h2>Overdue tasks</h2>
        ${taskMiniList(d.overdueTasks || [])}
      </section>
    </div>
    <section class="panel" style="margin-top: 16px;">
      <h2>Recent tasks</h2>
      ${taskMiniList(d.recentTasks || [])}
    </section>
  `;
}

function stat(label, value) {
  return `<section class="panel stat"><span>${label}</span><strong>${value || 0}</strong></section>`;
}

function taskMiniList(tasks) {
  if (!tasks.length) return `<div class="empty">No tasks to show.</div>`;
  return `
    <div class="cards">
      ${tasks.map(task => `
        <article class="task-card">
          <div class="card-head">
            <div>
              <h3>${escapeHtml(task.title)}</h3>
              <p class="muted">${escapeHtml(task.projectName)} - ${escapeHtml(task.assigneeName)} - ${escapeHtml(dueText(task))}</p>
            </div>
            <span class="status-pill ${task.status}">${statusLabel(task.status)}</span>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function renderProjects() {
  const canAdmin = state.user.role === "admin";
  return `
    <div class="page-title">
      <div>
        <h1>Projects</h1>
        <p class="muted">${canAdmin ? "Create projects and choose team members." : "Projects where you are part of the team."}</p>
      </div>
    </div>
    <div class="grid ${canAdmin ? "two-col" : ""}">
      ${canAdmin ? projectForm() : ""}
      <section class="panel">
        <h2>Project list</h2>
        ${state.projects.length ? `
          <div class="cards">
            ${state.projects.map(projectCard).join("")}
          </div>
        ` : `<div class="empty">No projects yet.</div>`}
      </section>
    </div>
  `;
}

function projectForm() {
  return `
    <section class="panel">
      <h2>Create project</h2>
      <form id="projectForm">
        <div class="field">
          <label for="projectName">Project name</label>
          <input id="projectName" name="name" required minlength="3" />
        </div>
        <div class="field">
          <label for="projectDescription">Description</label>
          <textarea id="projectDescription" name="description"></textarea>
        </div>
        <div class="field">
          <label>Team members</label>
          <div class="multi-list">
            ${state.users.map(user => `
              <label class="check-row">
                <input type="checkbox" name="memberIds" value="${user.id}" ${user.id === state.user.id ? "checked disabled" : ""} />
                <span>${escapeHtml(user.name)} (${escapeHtml(user.role)})</span>
              </label>
            `).join("")}
          </div>
        </div>
        <button class="btn" type="submit">Create project</button>
      </form>
    </section>
  `;
}

function projectCard(project) {
  const progress = projectProgress(project);
  return `
    <article class="project-card">
      <div class="card-head">
        <div>
          <h3>${escapeHtml(project.name)}</h3>
          <p class="muted">${escapeHtml(project.description || "No description")}</p>
        </div>
        <span class="chip">${project.taskCount} tasks</span>
      </div>
      <div class="project-progress">
        <div class="progress-label"><span>Progress</span><strong>${progress}%</strong></div>
        <div class="meter"><span style="width: ${progress}%"></span></div>
      </div>
      <div class="meta">
        <span class="chip">Owner: ${escapeHtml(project.owner.name)}</span>
        ${project.members.map(member => `<span class="chip">${escapeHtml(member.name)}</span>`).join("")}
      </div>
      ${state.user.role === "admin" ? `
        <div class="task-actions">
          <button class="btn danger" data-delete-project="${project.id}">Delete</button>
        </div>
      ` : ""}
    </article>
  `;
}

function bindProjects() {
  const form = document.querySelector("#projectForm");
  if (form) {
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const formData = new FormData(form);
      const memberIds = formData.getAll("memberIds");
      if (!memberIds.includes(state.user.id)) memberIds.push(state.user.id);
      try {
        await api("/api/projects", {
          method: "POST",
          body: JSON.stringify({
            name: formData.get("name"),
            description: formData.get("description"),
            memberIds
          })
        });
        setNotice("Project created.");
        await loadAppData();
        renderApp();
      } catch (error) {
        setNotice(error.message, true);
        renderApp();
      }
    });
  }
  document.querySelectorAll("[data-delete-project]").forEach(button => {
    button.addEventListener("click", async () => {
      if (!confirm("Delete this project and its tasks?")) return;
      try {
        await api(`/api/projects/${button.dataset.deleteProject}`, { method: "DELETE" });
        setNotice("Project deleted.");
        await loadAppData();
        renderApp();
      } catch (error) {
        setNotice(error.message, true);
        renderApp();
      }
    });
  });
}

function renderTasks() {
  const canAdmin = state.user.role === "admin";
  const filteredTasks = state.tasks.filter(task => {
    const matchesFilter = state.taskFilter === "all" || task.status === state.taskFilter || (state.taskFilter === "overdue" && isOverdue(task));
    const haystack = `${task.title} ${task.description} ${task.projectName} ${task.assigneeName}`.toLowerCase();
    return matchesFilter && haystack.includes(state.taskSearch.toLowerCase());
  });
  return `
    <div class="page-title">
      <div>
        <h1>Tasks</h1>
        <p class="muted">${canAdmin ? "Create, assign, and track team tasks." : "Update the status of tasks assigned to you."}</p>
      </div>
    </div>
    <div class="grid ${canAdmin ? "two-col" : ""}">
      ${canAdmin ? taskForm() : ""}
      <section class="panel">
        <div class="task-toolbar">
          <h2>Task board</h2>
          <input id="taskSearch" type="search" placeholder="Search tasks" value="${escapeHtml(state.taskSearch)}" />
        </div>
        <div class="filter-bar">
          ${filterButton("all", "All")}
          ${filterButton("todo", "To do")}
          ${filterButton("in-progress", "In progress")}
          ${filterButton("done", "Done")}
          ${filterButton("overdue", "Overdue")}
        </div>
        ${filteredTasks.length ? renderTaskBoard(filteredTasks) : `<div class="empty">No matching tasks yet.</div>`}
      </section>
    </div>
  `;
}

function filterButton(value, label) {
  return `<button class="filter-chip ${state.taskFilter === value ? "active" : ""}" data-task-filter="${value}">${label}</button>`;
}

function renderTaskBoard(tasks) {
  return `
    <div class="task-board">
      ${["todo", "in-progress", "done"].map(status => {
        const columnTasks = tasks.filter(task => task.status === status);
        return `
          <section class="task-column">
            <div class="column-head">
              <span>${statusLabel(status)}</span>
              <strong>${columnTasks.length}</strong>
            </div>
            <div class="cards">
              ${columnTasks.map(taskCard).join("") || `<div class="empty small">Nothing here.</div>`}
            </div>
          </section>
        `;
      }).join("")}
    </div>
  `;
}

function taskForm() {
  const options = projectAssigneePairs();
  return `
    <section class="panel">
      <h2>Create task</h2>
      <form id="taskForm">
        <div class="field">
          <label for="taskTitle">Title</label>
          <input id="taskTitle" name="title" required minlength="3" />
        </div>
        <div class="field">
          <label for="taskDescription">Description</label>
          <textarea id="taskDescription" name="description"></textarea>
        </div>
        <div class="form-row">
          <div class="field">
            <label for="taskProject">Project</label>
            <select id="taskProject" name="projectId" required>
              <option value="">Choose project</option>
              ${state.projects.map(project => `<option value="${project.id}">${escapeHtml(project.name)}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label for="taskAssignee">Assignee</label>
            <select id="taskAssignee" name="assigneeId" required>
              <option value="">Choose assignee</option>
              ${options.map(item => `<option value="${item.userId}" data-project="${item.projectId}">${escapeHtml(item.userName)} - ${escapeHtml(item.projectName)}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="field">
            <label for="taskDueDate">Due date</label>
            <input id="taskDueDate" name="dueDate" type="date" min="${today()}" required />
          </div>
          <div class="field">
            <label for="taskStatus">Status</label>
            <select id="taskStatus" name="status">
              <option value="todo">To do</option>
              <option value="in-progress">In progress</option>
              <option value="done">Done</option>
            </select>
          </div>
        </div>
        <button class="btn" type="submit">Create task</button>
      </form>
    </section>
  `;
}

function projectAssigneePairs() {
  return state.projects.flatMap(project => {
    const memberIds = new Set([project.owner.id, ...project.members.map(member => member.id)]);
    return [...memberIds].map(userId => {
      const user = state.users.find(item => item.id === userId);
      return user ? {
        projectId: project.id,
        projectName: project.name,
        userId: user.id,
        userName: user.name
      } : null;
    }).filter(Boolean);
  });
}

function taskCard(task) {
  const canChange = state.user.role === "admin" || task.assigneeId === state.user.id;
  return `
    <article class="task-card ${isOverdue(task) ? "overdue" : ""}">
      <div class="card-head">
        <div>
          <h3>${escapeHtml(task.title)}</h3>
          <p class="muted">${escapeHtml(task.description || "No description")}</p>
        </div>
        <span class="status-pill ${task.status}">${statusLabel(task.status)}</span>
      </div>
      <div class="meta">
        <span class="chip">${escapeHtml(task.projectName)}</span>
        <span class="chip">Assigned: ${escapeHtml(task.assigneeName)}</span>
        <span class="chip ${isOverdue(task) ? "urgent" : ""}">${escapeHtml(dueText(task))}</span>
      </div>
      ${canChange ? `
        <div class="task-actions">
          <select data-status-task="${task.id}">
            <option value="todo" ${task.status === "todo" ? "selected" : ""}>To do</option>
            <option value="in-progress" ${task.status === "in-progress" ? "selected" : ""}>In progress</option>
            <option value="done" ${task.status === "done" ? "selected" : ""}>Done</option>
          </select>
          ${state.user.role === "admin" ? `<button class="btn danger" data-delete-task="${task.id}">Delete</button>` : ""}
        </div>
      ` : ""}
    </article>
  `;
}

function bindTasks() {
  const form = document.querySelector("#taskForm");
  const projectSelect = document.querySelector("#taskProject");
  const assigneeSelect = document.querySelector("#taskAssignee");

  if (projectSelect && assigneeSelect) {
    projectSelect.addEventListener("change", () => {
      [...assigneeSelect.options].forEach(option => {
        option.hidden = option.value && option.dataset.project !== projectSelect.value;
      });
      assigneeSelect.value = "";
    });
  }

  if (form) {
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const formData = new FormData(form);
      try {
        await api("/api/tasks", {
          method: "POST",
          body: JSON.stringify(Object.fromEntries(formData.entries()))
        });
        setNotice("Task created.");
        await loadAppData();
        renderApp();
      } catch (error) {
        setNotice(error.message, true);
        renderApp();
      }
    });
  }

  document.querySelectorAll("[data-task-filter]").forEach(button => {
    button.addEventListener("click", () => {
      state.taskFilter = button.dataset.taskFilter;
      renderApp();
    });
  });

  const search = document.querySelector("#taskSearch");
  if (search) {
    search.addEventListener("input", () => {
      state.taskSearch = search.value;
      renderApp();
      const nextSearch = document.querySelector("#taskSearch");
      if (nextSearch) {
        nextSearch.focus();
        nextSearch.setSelectionRange(nextSearch.value.length, nextSearch.value.length);
      }
    });
  }

  document.querySelectorAll("[data-status-task]").forEach(select => {
    select.addEventListener("change", async () => {
      const task = state.tasks.find(item => item.id === select.dataset.statusTask);
      const payload = state.user.role === "admin"
        ? { ...task, status: select.value }
        : { status: select.value };
      try {
        await api(`/api/tasks/${task.id}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
        setNotice("Task status updated.");
        await loadAppData();
        renderApp();
      } catch (error) {
        setNotice(error.message, true);
        renderApp();
      }
    });
  });

  document.querySelectorAll("[data-delete-task]").forEach(button => {
    button.addEventListener("click", async () => {
      if (!confirm("Delete this task?")) return;
      try {
        await api(`/api/tasks/${button.dataset.deleteTask}`, { method: "DELETE" });
        setNotice("Task deleted.");
        await loadAppData();
        renderApp();
      } catch (error) {
        setNotice(error.message, true);
        renderApp();
      }
    });
  });
}

boot();
