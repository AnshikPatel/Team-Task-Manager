const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const DB_PATH = process.env.VERCEL
  ? path.join("/tmp", "team-task-manager-db.json")
  : path.join(DATA_DIR, "db.json");

const TASK_STATUSES = ["todo", "in-progress", "done"];
const SESSION_HOURS = 24;
const DEFAULT_ADMIN_EMAIL = "admin@taskmanager.com";
const DEFAULT_ADMIN_PASSWORD = "admin123";
const TOKEN_SECRET = process.env.SESSION_SECRET || "team-task-manager-demo-secret";
const VERCEL_DEMO_USERS = [
  {
    id: "usr_demo_member_riya",
    name: "Riya Member",
    email: "riya@taskmanager.com",
    password: "member123",
    role: "member"
  },
  {
    id: "usr_demo_member_aman",
    name: "Aman Member",
    email: "aman@taskmanager.com",
    password: "member123",
    role: "member"
  }
];

function ensureDb() {
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    writeDb({
      users: [],
      projects: [],
      tasks: [],
      sessions: []
    });
  }
}

function addSeedUser(db, user) {
  if (db.users.some(item => item.email === user.email)) return false;
  db.users.push({
    id: user.id,
    name: user.name,
    email: user.email,
    passwordHash: hashPassword(user.password),
    role: user.role,
    createdAt: new Date().toISOString()
  });
  return true;
}

function seedDefaultData(db) {
  let changed = false;
  const hasDefaultAdmin = db.users.some(user => user.email === DEFAULT_ADMIN_EMAIL);
  if (!hasDefaultAdmin) {
    changed = addSeedUser(db, {
      id: "usr_default_admin",
      name: "Default Admin",
      email: DEFAULT_ADMIN_EMAIL,
      password: DEFAULT_ADMIN_PASSWORD,
      role: "admin"
    }) || changed;
  }

  if (process.env.VERCEL) {
    VERCEL_DEMO_USERS.forEach(user => {
      changed = addSeedUser(db, user) || changed;
    });

    const hasDemoProject = db.projects.some(project => project.id === "prj_vercel_demo");
    if (!hasDemoProject) {
      db.projects.push({
        id: "prj_vercel_demo",
        name: "Vercel Demo Project",
        description: "Sample project for checking teams, members, tasks, and dashboard on Vercel.",
        ownerId: "usr_default_admin",
        memberIds: ["usr_default_admin", "usr_demo_member_riya", "usr_demo_member_aman"],
        createdAt: new Date().toISOString()
      });
      changed = true;
    }

    const hasDemoTask = db.tasks.some(task => task.id === "tsk_vercel_demo");
    if (!hasDemoTask) {
      db.tasks.push({
        id: "tsk_vercel_demo",
        title: "Review team dashboard",
        description: "Confirm that project members and task assignment are visible on Vercel.",
        projectId: "prj_vercel_demo",
        assigneeId: "usr_demo_member_riya",
        status: "in-progress",
        dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      changed = true;
    }
  }

  return changed;
}

function readDb() {
  ensureDb();
  const db = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  if (seedDefaultData(db)) writeDb(db);
  return db;
}

function writeDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function send(res, status, data, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    ...headers
  });
  res.end(JSON.stringify(data));
}

function sendError(res, status, message) {
  send(res, status, { error: message });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
  });
}

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function sign(value) {
  return crypto.createHmac("sha256", TOKEN_SECRET).update(value).digest("base64url");
}

function createToken(user) {
  const payload = JSON.stringify({
    user: publicUser(user),
    expiresAt: Date.now() + SESSION_HOURS * 60 * 60 * 1000
  });
  const encodedPayload = base64url(payload);
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

function readToken(token) {
  const [encodedPayload, signature] = String(token || "").split(".");
  if (!encodedPayload || !signature) return null;
  const expectedSignature = sign(encodedPayload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (signatureBuffer.length !== expectedBuffer.length) return null;
  if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    if (!payload.user?.id || payload.expiresAt < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, saved) {
  const [salt, originalHash] = saved.split(":");
  const testHash = hashPassword(password, salt).split(":")[1];
  return crypto.timingSafeEqual(Buffer.from(originalHash, "hex"), Buffer.from(testHash, "hex"));
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role
  };
}

function cleanupSessions(db) {
  const now = Date.now();
  db.sessions = db.sessions.filter(session => session.expiresAt > now);
}

function getAuth(req, db) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  const tokenPayload = readToken(token);
  if (!tokenPayload) return null;
  const user = db.users.find(item => item.id === tokenPayload.user.id) || tokenPayload.user;
  return user ? { user, token } : null;
}

function requireAuth(req, res, db) {
  const auth = getAuth(req, db);
  if (!auth) {
    sendError(res, 401, "Please login first.");
    return null;
  }
  return auth.user;
}

function requireAdmin(user, res) {
  if (user.role !== "admin") {
    sendError(res, 403, "Admin access required.");
    return false;
  }
  return true;
}

function isProjectMember(project, userId) {
  return project.ownerId === userId || project.memberIds.includes(userId);
}

function visibleProjects(db, user) {
  if (user.role === "admin") return db.projects;
  return db.projects.filter(project => isProjectMember(project, user.id));
}

function visibleTasks(db, user) {
  const projects = visibleProjects(db, user);
  const projectIds = new Set(projects.map(project => project.id));
  return db.tasks.filter(task => projectIds.has(task.projectId));
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function attachTaskDetails(db, task) {
  const project = db.projects.find(item => item.id === task.projectId);
  const assignee = db.users.find(item => item.id === task.assigneeId);
  return {
    ...task,
    projectName: project ? project.name : "Unknown project",
    assigneeName: assignee ? assignee.name : "Unassigned"
  };
}

function dashboardFor(db, user) {
  const tasks = visibleTasks(db, user);
  const now = new Date();
  const myTasks = tasks.filter(task => task.assigneeId === user.id);
  const overdue = tasks.filter(task => task.status !== "done" && task.dueDate && new Date(task.dueDate) < now);
  const byStatus = TASK_STATUSES.reduce((acc, status) => {
    acc[status] = tasks.filter(task => task.status === status).length;
    return acc;
  }, {});

  return {
    projects: visibleProjects(db, user).length,
    tasks: tasks.length,
    myTasks: myTasks.length,
    overdue: overdue.length,
    byStatus,
    overdueTasks: overdue.map(task => attachTaskDetails(db, task)).slice(0, 8),
    recentTasks: tasks
      .slice()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 8)
      .map(task => attachTaskDetails(db, task))
  };
}

async function handleApi(req, res, pathname) {
  const db = readDb();
  const body = ["POST", "PUT", "PATCH"].includes(req.method) ? await parseBody(req) : {};

  if (req.method === "POST" && pathname === "/api/auth/signup") {
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (name.length < 2) return sendError(res, 400, "Name must be at least 2 characters.");
    if (!validateEmail(email)) return sendError(res, 400, "Enter a valid email address.");
    if (password.length < 6) return sendError(res, 400, "Password must be at least 6 characters.");
    if (db.users.some(user => user.email === email)) return sendError(res, 409, "Email is already registered.");

    const user = {
      id: id("usr"),
      name,
      email,
      passwordHash: hashPassword(password),
      role: db.users.length === 0 ? "admin" : "member",
      createdAt: new Date().toISOString()
    };
    db.users.push(user);
    const token = createToken(user);
    writeDb(db);
    return send(res, 201, { token, user: publicUser(user) });
  }

  if (req.method === "POST" && pathname === "/api/auth/login") {
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const user = db.users.find(item => item.email === email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return sendError(res, 401, "Invalid email or password.");
    }
    const token = createToken(user);
    writeDb(db);
    return send(res, 200, { token, user: publicUser(user) });
  }

  const currentUser = requireAuth(req, res, db);
  if (!currentUser) return;

  if (req.method === "POST" && pathname === "/api/auth/logout") {
    return send(res, 200, { ok: true });
  }

  if (req.method === "GET" && pathname === "/api/me") {
    return send(res, 200, { user: publicUser(currentUser) });
  }

  if (req.method === "GET" && pathname === "/api/users") {
    const users = db.users.map(publicUser);
    if (!users.some(user => user.id === currentUser.id)) {
      users.push(publicUser(currentUser));
    }
    return send(res, 200, { users });
  }

  if (req.method === "GET" && pathname === "/api/dashboard") {
    return send(res, 200, dashboardFor(db, currentUser));
  }

  if (req.method === "GET" && pathname === "/api/projects") {
    const projects = visibleProjects(db, currentUser).map(project => ({
      ...project,
      owner: publicUser(db.users.find(user => user.id === project.ownerId) || currentUser),
      members: db.users.filter(user => project.memberIds.includes(user.id)).map(publicUser),
      taskCount: db.tasks.filter(task => task.projectId === project.id).length
    }));
    return send(res, 200, { projects });
  }

  if (req.method === "POST" && pathname === "/api/projects") {
    if (!requireAdmin(currentUser, res)) return;
    const name = String(body.name || "").trim();
    const description = String(body.description || "").trim();
    const memberIds = Array.isArray(body.memberIds) ? body.memberIds : [];
    if (name.length < 3) return sendError(res, 400, "Project name must be at least 3 characters.");
    const validMemberIds = [...new Set(memberIds)].filter(userId => db.users.some(user => user.id === userId));
    const project = {
      id: id("prj"),
      name,
      description,
      ownerId: currentUser.id,
      memberIds: validMemberIds,
      createdAt: new Date().toISOString()
    };
    db.projects.push(project);
    writeDb(db);
    return send(res, 201, { project });
  }

  const projectMatch = pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (projectMatch && req.method === "PUT") {
    if (!requireAdmin(currentUser, res)) return;
    const project = db.projects.find(item => item.id === projectMatch[1]);
    if (!project) return sendError(res, 404, "Project not found.");
    const name = String(body.name || "").trim();
    const description = String(body.description || "").trim();
    const memberIds = Array.isArray(body.memberIds) ? body.memberIds : [];
    if (name.length < 3) return sendError(res, 400, "Project name must be at least 3 characters.");
    project.name = name;
    project.description = description;
    project.memberIds = [...new Set(memberIds)].filter(userId => db.users.some(user => user.id === userId));
    writeDb(db);
    return send(res, 200, { project });
  }

  if (projectMatch && req.method === "DELETE") {
    if (!requireAdmin(currentUser, res)) return;
    const projectId = projectMatch[1];
    const before = db.projects.length;
    db.projects = db.projects.filter(project => project.id !== projectId);
    db.tasks = db.tasks.filter(task => task.projectId !== projectId);
    if (before === db.projects.length) return sendError(res, 404, "Project not found.");
    writeDb(db);
    return send(res, 200, { ok: true });
  }

  if (req.method === "GET" && pathname === "/api/tasks") {
    return send(res, 200, { tasks: visibleTasks(db, currentUser).map(task => attachTaskDetails(db, task)) });
  }

  if (req.method === "POST" && pathname === "/api/tasks") {
    if (!requireAdmin(currentUser, res)) return;
    const title = String(body.title || "").trim();
    const description = String(body.description || "").trim();
    const projectId = String(body.projectId || "").trim();
    const assigneeId = String(body.assigneeId || "").trim();
    const dueDate = String(body.dueDate || "").trim();
    const status = TASK_STATUSES.includes(body.status) ? body.status : "todo";
    const project = db.projects.find(item => item.id === projectId);
    const assignee = db.users.find(item => item.id === assigneeId);
    if (title.length < 3) return sendError(res, 400, "Task title must be at least 3 characters.");
    if (!project) return sendError(res, 400, "Choose a valid project.");
    if (!assignee) return sendError(res, 400, "Choose a valid assignee.");
    if (!isProjectMember(project, assignee.id)) return sendError(res, 400, "Assignee must be part of the project team.");
    if (!dueDate) return sendError(res, 400, "Due date is required.");
    const task = {
      id: id("tsk"),
      title,
      description,
      projectId,
      assigneeId,
      status,
      dueDate,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.tasks.push(task);
    writeDb(db);
    return send(res, 201, { task: attachTaskDetails(db, task) });
  }

  const taskMatch = pathname.match(/^\/api\/tasks\/([^/]+)$/);
  if (taskMatch && req.method === "PUT") {
    const task = db.tasks.find(item => item.id === taskMatch[1]);
    if (!task) return sendError(res, 404, "Task not found.");
    const project = db.projects.find(item => item.id === task.projectId);
    const canEditAll = currentUser.role === "admin";
    const canUpdateOwnStatus = task.assigneeId === currentUser.id && Object.keys(body).every(key => key === "status");
    if (!canEditAll && !canUpdateOwnStatus) return sendError(res, 403, "You can only update your assigned task status.");

    if (canEditAll) {
      const title = String(body.title || "").trim();
      const projectId = String(body.projectId || "").trim();
      const assigneeId = String(body.assigneeId || "").trim();
      const nextProject = db.projects.find(item => item.id === projectId);
      const nextAssignee = db.users.find(item => item.id === assigneeId);
      if (title.length < 3) return sendError(res, 400, "Task title must be at least 3 characters.");
      if (!nextProject) return sendError(res, 400, "Choose a valid project.");
      if (!nextAssignee) return sendError(res, 400, "Choose a valid assignee.");
      if (!isProjectMember(nextProject, nextAssignee.id)) return sendError(res, 400, "Assignee must be part of the project team.");
      task.title = title;
      task.description = String(body.description || "").trim();
      task.projectId = projectId;
      task.assigneeId = assigneeId;
      task.dueDate = String(body.dueDate || "").trim();
    } else if (!isProjectMember(project, currentUser.id)) {
      return sendError(res, 403, "Project access required.");
    }

    if (!TASK_STATUSES.includes(body.status)) return sendError(res, 400, "Choose a valid task status.");
    task.status = body.status;
    task.updatedAt = new Date().toISOString();
    writeDb(db);
    return send(res, 200, { task: attachTaskDetails(db, task) });
  }

  if (taskMatch && req.method === "DELETE") {
    if (!requireAdmin(currentUser, res)) return;
    const before = db.tasks.length;
    db.tasks = db.tasks.filter(task => task.id !== taskMatch[1]);
    if (before === db.tasks.length) return sendError(res, 404, "Task not found.");
    writeDb(db);
    return send(res, 200, { ok: true });
  }

  sendError(res, 404, "API route not found.");
}

function serveStatic(req, res, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      return res.end("Not found");
    }
    const ext = path.extname(filePath).toLowerCase();
    const types = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".svg": "image/svg+xml"
    };
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
    res.end(content);
  });
}

async function handleRequest(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      return await handleApi(req, res, url.pathname);
    }
    serveStatic(req, res, url.pathname);
  } catch (error) {
    sendError(res, 500, error.message || "Server error.");
  }
}

if (require.main === module) {
  const server = http.createServer(handleRequest);
  ensureDb();
  server.listen(PORT, () => {
    console.log(`Team Task Manager running at http://localhost:${PORT}`);
  });
}

module.exports = handleRequest;
