# Team Task Manager

A simple full-stack web app for managing team projects and tasks with authentication, project teams, task assignment, progress tracking, and role-based access control.

## Features

- User signup and login
- First registered user becomes `Admin`
- Later users become `Member`
- Admin can create and delete projects
- Admin can assign members to projects
- Admin can create and assign tasks
- Members can view their projects and update their assigned task status
- Dashboard with project count, task count, personal tasks, overdue tasks, and status progress
- Animated, user-friendly frontend with a kanban-style task board
- REST API backend
- File-backed JSON database for simple local persistence
- Input validations and project/task/user relationships

## Tech Stack

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js HTTP server
- Database: JSON file database
- Authentication: Token-based sessions
- Password security: PBKDF2 password hashing using Node.js `crypto`

## Project Structure

```text
.
├── data/
│   └── db.example.json
├── public/
│   ├── app.js
│   ├── index.html
│   └── styles.css
├── package.json
├── package-lock.json
├── README.md
└── server.js
```

## How To Run

1. Clone the repository.

```bash
git clone https://github.com/AnshikPatel/Team-Task-Manager.git
cd Team-Task-Manager
```

2. Start the server.

```bash
npm start
```

3. Open the app.

```text
http://localhost:3000
```

The app creates `data/db.json` automatically when it starts. This live database file is ignored by Git so private user data is not pushed.

## Deploying To Vercel

This project includes a Vercel serverless API entry point in `api/[...path].js`, so it can be deployed directly to Vercel.

For assignment/demo use, the app stores data in a JSON file. On local development, that file is `data/db.json`. On Vercel, serverless functions use temporary file storage, so demo data may reset when the deployment is restarted or moved between serverless instances.

Login tokens are signed and valid for 24 hours, so the current signed-in user can still be recognized during a demo even if Vercel resets the temporary file storage.

For production use, replace the JSON file storage with a hosted database such as MongoDB Atlas, Supabase, Neon, or Vercel Postgres.

## Default Role Flow

The app also creates one default admin account automatically:

```text
Email: admin@taskmanager.com
Password: admin123
```

On Vercel, the app also creates demo members so the project/team screens always have visible team data:

```text
Email: riya@taskmanager.com
Password: member123

Email: aman@taskmanager.com
Password: member123
```

1. Sign up with the first account.
2. That account automatically becomes `Admin`.
3. Sign up with another account.
4. That account automatically becomes `Member`.

## Admin Permissions

Admin users can:

- Create projects
- Add team members to projects
- Create tasks
- Assign tasks to project members
- Update any task status
- Delete projects and tasks
- View all project and task dashboard data

## Member Permissions

Member users can:

- View projects where they are part of the team
- View tasks in their assigned projects
- Update status only for tasks assigned to them
- View dashboard data related to accessible projects

## REST API Overview

### Authentication

```text
POST /api/auth/signup
POST /api/auth/login
POST /api/auth/logout
GET  /api/me
```

### Users

```text
GET /api/users
```

### Dashboard

```text
GET /api/dashboard
```

### Projects

```text
GET    /api/projects
POST   /api/projects
PUT    /api/projects/:id
DELETE /api/projects/:id
```

### Tasks

```text
GET    /api/tasks
POST   /api/tasks
PUT    /api/tasks/:id
DELETE /api/tasks/:id
```

## Validation Rules

- Name must be at least 2 characters
- Email must be valid and unique
- Password must be at least 6 characters
- Project name must be at least 3 characters
- Task title must be at least 3 characters
- Task must belong to a valid project
- Assignee must be a valid user and project member
- Task status must be one of:
  - `todo`
  - `in-progress`
  - `done`

## Notes

This project is intentionally simple for assignment/demo use. It avoids external dependencies and uses Node.js built-in modules only.
