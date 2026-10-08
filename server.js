const express = require("express");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const db = new Database("naijalife.db");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  money INTEGER DEFAULT 5000,
  level INTEGER DEFAULT 1,
  xp INTEGER DEFAULT 0,
  energy INTEGER DEFAULT 100,
  home TEXT DEFAULT 'Room',
  sales_skill INTEGER DEFAULT 1,
  customer_skill INTEGER DEFAULT 1,
  writing_skill INTEGER DEFAULT 1,
  social_skill INTEGER DEFAULT 1,
  tech_skill INTEGER DEFAULT 1,
  fashion_skill INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`);

const jobs = [
  {
    name: "Sales Representative",
    pay: 1800,
    skill: "sales_skill"
  },
  {
    name: "Customer Service",
    pay: 1500,
    skill: "customer_skill"
  },
  {
    name: "Content Writer",
    pay: 1700,
    skill: "writing_skill"
  },
  {
    name: "Social Media Manager",
    pay: 2200,
    skill: "social_skill"
  },
  {
    name: "Junior Tech Assistant",
    pay: 2500,
    skill: "tech_skill"
  },
  {
    name: "Fashion Assistant",
    pay: 1900,
    skill: "fashion_skill"
  }
];

function getUserFromToken(req) {
  const auth = req.headers.authorization || "";

  if (!auth.startsWith("Bearer ")) return null;

  const token = auth.substring(7);

  const session = db
    .prepare("SELECT user_id FROM sessions WHERE token = ?")
    .get(token);

  if (!session) return null;

  return db
    .prepare("SELECT * FROM users WHERE id = ?")
    .get(session.user_id);
}

function publicUser(user) {
  if (!user) return null;

  const {
    password,
    ...safeUser
  } = user;

  return safeUser;
}

// Register
app.post("/api/register", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        error: "Username and password are required"
      });
    }

    if (password.length < 4) {
      return res.status(400).json({
        error: "Password must be at least 4 characters"
      });
    }

    const existing = db
      .prepare("SELECT id FROM users WHERE username = ?")
      .get(username);

    if (existing) {
      return res.status(400).json({
        error: "Username already exists"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = db.prepare(`
      INSERT INTO users (username, password)
      VALUES (?, ?)
    `).run(username, hashedPassword);

    const token = crypto.randomBytes(32).toString("hex");

    db.prepare(`
      INSERT INTO sessions (token, user_id)
      VALUES (?, ?)
    `).run(token, result.lastInsertRowid);

    const user = db
      .prepare("SELECT * FROM users WHERE id = ?")
      .get(result.lastInsertRowid);

    res.json({
      message: "Account created",
      token,
      user: publicUser(user)
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Registration failed"
    });
  }
});

// Login
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = db
      .prepare("SELECT * FROM users WHERE username = ?")
      .get(username);

    if (!user) {
      return res.status(401).json({
        error: "Invalid username or password"
      });
    }

    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      return res.status(401).json({
        error: "Invalid username or password"
      });
    }

    const token = crypto.randomBytes(32).toString("hex");

    db.prepare(`
      INSERT INTO sessions (token, user_id)
      VALUES (?, ?)
    `).run(token, user.id);

    res.json({
      message: "Login successful",
      token,
      user: publicUser(user)
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Login failed"
    });
  }
});

// Get profile
app.get("/api/me", (req, res) => {
  const user = getUserFromToken(req);

  if (!user) {
    return res.status(401).json({
      error: "Not logged in"
    });
  }

  res.json({
    user: publicUser(user)
  });
});

// Get jobs
app.get("/api/jobs", (req, res) => {
  res.json({ jobs });
});

// Work a job
app.post("/api/work", (req, res) => {
  const user = getUserFromToken(req);

  if (!user) {
    return res.status(401).json({
      error: "Not logged in"
    });
  }

  const { job } = req.body;

  const selectedJob = jobs.find(
    item => item.name === job
  );

  if (!selectedJob) {
    return res.status(400).json({
      error: "Job not found"
    });
  }

  if (user.energy < 15) {
    return res.status(400).json({
      error: "Not enough energy. Rest first."
    });
  }

  let newXP = user.xp + 20;
  let newLevel = user.level;

  const xpNeeded = user.level * 100;

  if (newXP >= xpNeeded) {
    newXP -= xpNeeded;
    newLevel++;
  }

  db.prepare(`
    UPDATE users
    SET money = money + ?,
        energy = energy - 15,
        xp = ?,
        level = ?,
        ${selectedJob.skill} = ${selectedJob.skill} + 1
    WHERE id = ?
  `).run(
    selectedJob.pay,
    newXP,
    newLevel,
    user.id
  );

  const updatedUser = db
    .prepare("SELECT * FROM users WHERE id = ?")
    .get(user.id);

  res.json({
    message: `You worked as a ${selectedJob.name}`,
    earned: selectedJob.pay,
    user: publicUser(updatedUser)
  });
});

// Rest
app.post("/api/rest", (req, res) => {
  const user = getUserFromToken(req);

  if (!user) {
    return res.status(401).json({
      error: "Not logged in"
    });
  }

  db.prepare(`
    UPDATE users
    SET energy = 100
    WHERE id = ?
  `).run(user.id);

  const updatedUser = db
    .prepare("SELECT * FROM users WHERE id = ?")
    .get(user.id);

  res.json({
    message: "You rested and restored your energy",
    user: publicUser(updatedUser)
  });
});

// Create social post
app.post("/api/posts", (req, res) => {
  const user = getUserFromToken(req);

  if (!user) {
    return res.status(401).json({
      error: "Not logged in"
    });
  }

  const content = String(req.body.content || "").trim();

  if (!content) {
    return res.status(400).json({
      error: "Post cannot be empty"
    });
  }

  if (content.length > 280) {
    return res.status(400).json({
      error: "Post must be 280 characters or less"
    });
  }

  db.prepare(`
    INSERT INTO posts (user_id, content)
    VALUES (?, ?)
  `).run(user.id, content);

  db.prepare(`
    UPDATE users
    SET xp = xp + 10
    WHERE id = ?
  `).run(user.id);

  res.json({
    message: "Post published",
    earnedXP: 10
  });
});

// Get social feed
app.get("/api/posts", (req, res) => {
  const posts = db.prepare(`
    SELECT
      posts.id,
      posts.content,
      posts.created_at,
      users.username
    FROM posts
    JOIN users ON users.id = posts.user_id
    ORDER BY posts.id DESC
    LIMIT 30
  `).all();

  res.json({ posts });
});

// Logout
app.post("/api/logout", (req, res) => {
  const auth = req.headers.authorization || "";

  if (auth.startsWith("Bearer ")) {
    const token = auth.substring(7);

    db.prepare(`
      DELETE FROM sessions
      WHERE token = ?
    `).run(token);
  }

  res.json({
    message: "Logged out"
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`NaijaLife is running on port ${PORT}`);
});
