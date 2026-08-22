const path = require('path');
const fs = require('fs');
const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'kiddoo.db');
const submissionDataDir = path.join(__dirname, 'uploads');
fs.mkdirSync(submissionDataDir, { recursive: true });
const client = createClient({
  url: `file:${dbPath}`
});

const DEFAULT_COURSES = [
  'Advanced Artificial Intelligence',
  'Graphic Designing',
  'YouTube Automation',
  'Web Development'
];

/**
 * Helper to prevent event loop blocking during iterative heavy calculations
 */
function yieldToEventLoop() {
  return new Promise((resolve) => setImmediate(resolve));
}

/**
 * Initialize Database tables, composite indexes, and baseline seeds
 */
async function initDatabase() {
  // 1. Pragmas for high concurrency WAL mode & foreign keys
  await client.execute('PRAGMA journal_mode = WAL;');
  await client.execute('PRAGMA foreign_keys = ON;');
  await client.execute('PRAGMA synchronous = NORMAL;');
  await client.execute('PRAGMA busy_timeout = 5000;');

  // 2. Base Table Schemas
  await client.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL CHECK(role IN ('admin','student')) DEFAULT 'student',
      full_name TEXT,
      cnic TEXT,
      whatsapp_number TEXT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      thumbnail_url TEXT DEFAULT '',
      status TEXT NOT NULL CHECK(status IN ('published','draft')) DEFAULT 'published',
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL,
      question_number INTEGER NOT NULL,
      question_text TEXT NOT NULL,
      description TEXT DEFAULT '',
      youtube_url TEXT DEFAULT '',
      response_type TEXT NOT NULL DEFAULT 'short_answer',
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS course_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      course_id INTEGER NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT,
      UNIQUE(student_id, course_id),
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS student_enrollments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      course_id INTEGER NOT NULL,
      enrolled_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(student_id, course_id),
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS question_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      question_id INTEGER NOT NULL,
      video_started_at TEXT,
      video_requirement_completed INTEGER NOT NULL DEFAULT 0,
      completed INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT,
      UNIQUE(student_id, question_id),
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
    );
  `);

  try {
    await client.execute('ALTER TABLE question_progress ADD COLUMN video_started_at TEXT;');
  } catch (ignored) {
    // Column already exists
  }

  try {
    await client.execute('ALTER TABLE student_enrollments ADD COLUMN assignment_started_at TEXT;');
  } catch (ignored) {
    // Column already exists
  }

  await client.execute(`
    CREATE TABLE IF NOT EXISTS assignment_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      course_id INTEGER NOT NULL,
      answers_json TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_type TEXT DEFAULT '',
      file_data BLOB NOT NULL,
      file_path TEXT DEFAULT '',
      answers_path TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
      review_note TEXT DEFAULT '',
      submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
      reviewed_at TEXT,
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    );
  `);

  try {
    await client.execute('ALTER TABLE assignment_submissions ADD COLUMN file_path TEXT DEFAULT \'\';');
  } catch (ignored) {
    // Column already exists
  }

  try {
    await client.execute('ALTER TABLE assignment_submissions ADD COLUMN answers_path TEXT DEFAULT \'\';');
  } catch (ignored) {
    // Column already exists
  }

  // 3. Strategic Performance Indexes for Instant Query Resolution & Filter Speed
  await client.batch([
    `CREATE INDEX IF NOT EXISTS idx_users_email_role ON users(email, role);`,
    `CREATE INDEX IF NOT EXISTS idx_courses_status_order ON courses(status, display_order ASC, id ASC);`,
    `CREATE INDEX IF NOT EXISTS idx_questions_course_order ON questions(course_id, display_order ASC, question_number ASC);`,
    `CREATE INDEX IF NOT EXISTS idx_course_progress_lookup ON course_progress(student_id, course_id, completed);`,
    `CREATE INDEX IF NOT EXISTS idx_student_enrollments_lookup ON student_enrollments(student_id, course_id);`,
    `CREATE INDEX IF NOT EXISTS idx_question_progress_lookup ON question_progress(student_id, question_id, completed);`,
    `CREATE INDEX IF NOT EXISTS idx_assignment_submissions_admin ON assignment_submissions(status, submitted_at DESC);`,
    `CREATE INDEX IF NOT EXISTS idx_assignment_submissions_student ON assignment_submissions(student_id, course_id, submitted_at DESC);`
  ], 'write');

  await seedDefaultCourses();
  await seedAdmin();
}

async function ensureCourse(title) {
  const existing = await client.execute({
    sql: 'SELECT id FROM courses WHERE title = ?',
    args: [title]
  });
  if (existing.rows.length === 0) {
    await client.execute({
      sql: `INSERT INTO courses (title, description, status, display_order)
            VALUES (?, ?, 'published', ?)`,
      args: [title, `Comprehensive mentorship and curriculum for ${title}.`, Date.now()]
    });
  }
}

async function seedDefaultCourses() {
  for (const title of DEFAULT_COURSES) {
    await ensureCourse(title);
  }
}

async function seedAdmin() {
  const email = 'ahmadsaleem298gb@gmail.com';
  const password = 'Ahm@d444';
  const row = await client.execute({
    sql: 'SELECT id FROM users WHERE email = ?',
    args: [email]
  });
  if (row.rows.length === 0) {
    const hash = await bcrypt.hash(password, 10);
    await client.execute({
      sql: `INSERT INTO users (role, full_name, email, password_hash)
            VALUES ('admin', 'Ahmad Saleem', ?, ?)`,
      args: [email, hash]
    });
  }
}

const MAX_STUDENT_CAPACITY = 800;

async function getPlatformCapacity() {
  const countRes = await client.execute("SELECT COUNT(*) AS student_count FROM users WHERE role = 'student'");
  const currentStudents = Number(countRes.rows[0]?.student_count || 0);
  return {
    currentStudents,
    maxCapacity: MAX_STUDENT_CAPACITY,
    remainingSeats: Math.max(0, MAX_STUDENT_CAPACITY - currentStudents),
    isFull: currentStudents >= MAX_STUDENT_CAPACITY
  };
}

async function createUser({ fullName, cnic, whatsappNumber, email, password }) {
  const trimmedEmail = String(email).trim().toLowerCase();
  const existing = await client.execute({
    sql: 'SELECT id FROM users WHERE email = ?',
    args: [trimmedEmail]
  });
  if (existing.rows.length > 0) {
    throw new Error('An account with this email already exists.');
  }

  const capacity = await getPlatformCapacity();
  if (capacity.isFull) {
    throw new Error('Enrollment is currently closed: Maximum capacity of 800 students has been reached.');
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const result = await client.execute({
    sql: `INSERT INTO users (role, full_name, cnic, whatsapp_number, email, password_hash)
          VALUES ('student', ?, ?, ?, ?, ?)`,
    args: [fullName.trim(), cnic.trim(), whatsappNumber.trim(), trimmedEmail, passwordHash]
  });

  const newUser = await client.execute({
    sql: 'SELECT id, role, full_name, cnic, whatsapp_number, email, created_at FROM users WHERE id = ?',
    args: [Number(result.lastInsertRowid)]
  });
  return newUser.rows[0];
}

async function findUserByEmail(email) {
  const res = await client.execute({
    sql: 'SELECT * FROM users WHERE email = ?',
    args: [String(email).trim().toLowerCase()]
  });
  return res.rows[0] || null;
}

async function verifyPassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

async function getAllCourses() {
  const res = await client.execute('SELECT * FROM courses ORDER BY display_order ASC, id ASC');
  return res.rows;
}

async function getCourseById(courseId) {
  const res = await client.execute({
    sql: 'SELECT * FROM courses WHERE id = ?',
    args: [courseId]
  });
  return res.rows[0] || null;
}

async function getPublishedCourses() {
  const res = await client.execute(`
    SELECT * FROM courses
    WHERE status = 'published'
    ORDER BY display_order ASC, id ASC
  `);
  return res.rows;
}

async function addCourse({ title, description, status = 'published' }) {
  const trimmedTitle = String(title || '').trim();
  const trimmedDescription = String(description || '').trim();
  if (!trimmedTitle || !trimmedDescription) {
    throw new Error('Course title and description are required.');
  }

  const maxOrderRes = await client.execute('SELECT COALESCE(MAX(display_order), 0) + 1 AS next_order FROM courses');
  const nextOrder = maxOrderRes.rows[0]?.next_order || 1;

  const result = await client.execute({
    sql: `INSERT INTO courses (title, description, status, display_order, updated_at)
          VALUES (?, ?, ?, ?, datetime('now'))`,
    args: [trimmedTitle, trimmedDescription, status, nextOrder]
  });

  return await getCourseById(Number(result.lastInsertRowid));
}

async function updateCourse(courseId, payload) {
  const course = await getCourseById(courseId);
  if (!course) throw new Error('Course not found.');

  const title = payload.title ? String(payload.title).trim() : course.title;
  const description = payload.description ? String(payload.description).trim() : course.description;
  const status = payload.status || course.status;

  await client.execute({
    sql: `UPDATE courses
          SET title = ?, description = ?, status = ?, updated_at = datetime('now')
          WHERE id = ?`,
    args: [title, description, status, courseId]
  });

  return await getCourseById(courseId);
}

async function deleteCourse(courseId) {
  const cid = Number(courseId);
  try {
    await client.execute({ sql: 'DELETE FROM assignment_submissions WHERE course_id = ?', args: [cid] });
    await client.execute({ sql: 'DELETE FROM question_progress WHERE question_id IN (SELECT id FROM questions WHERE course_id = ?)', args: [cid] });
    await client.execute({ sql: 'DELETE FROM questions WHERE course_id = ?', args: [cid] });
    await client.execute({ sql: 'DELETE FROM course_progress WHERE course_id = ?', args: [cid] });
    await client.execute({ sql: 'DELETE FROM student_enrollments WHERE course_id = ?', args: [cid] });
    await client.execute({ sql: 'DELETE FROM courses WHERE id = ?', args: [cid] });
  } catch (err) {
    console.error('Error deleting course:', err);
    throw err;
  }
}

async function deleteStudent(studentId) {
  const student = await client.execute({
    sql: "SELECT id FROM users WHERE id = ? AND role = 'student'",
    args: [studentId]
  });
  if (student.rows.length === 0) {
    throw new Error('Student not found.');
  }

  const tx = await client.transaction('write');
  try {
    await tx.execute({ sql: 'DELETE FROM question_progress WHERE student_id = ?', args: [studentId] });
    await tx.execute({ sql: 'DELETE FROM course_progress WHERE student_id = ?', args: [studentId] });
    await tx.execute({ sql: 'DELETE FROM student_enrollments WHERE student_id = ?', args: [studentId] });
    await tx.execute({ sql: 'DELETE FROM assignment_submissions WHERE student_id = ?', args: [studentId] });
    await tx.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [studentId] });
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

async function getQuestionsByCourse(courseId) {
  const res = await client.execute({
    sql: `SELECT * FROM questions
          WHERE course_id = ?
          ORDER BY display_order ASC, question_number ASC`,
    args: [courseId]
  });
  return res.rows;
}

async function addQuestionToCourse(courseId, payload) {
  const course = await getCourseById(courseId);
  if (!course) throw new Error('Course not found.');

  const questionText = String(payload.questionText || '').trim();
  if (!questionText) throw new Error('Question text is required.');

  const nextNumberRes = await client.execute({
    sql: `SELECT COALESCE(MAX(question_number), 0) + 1 AS next_number FROM questions WHERE course_id = ?`,
    args: [courseId]
  });
  const nextNumber = nextNumberRes.rows[0]?.next_number || 1;

  const result = await client.execute({
    sql: `INSERT INTO questions (course_id, question_number, question_text, description, youtube_url, response_type, display_order, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    args: [
      courseId,
      nextNumber,
      questionText,
      payload.description || '',
      payload.youtubeUrl || '',
      payload.responseType || 'short_answer',
      nextNumber
    ]
  });

  const created = await client.execute({
    sql: 'SELECT * FROM questions WHERE id = ?',
    args: [Number(result.lastInsertRowid)]
  });
  return created.rows[0];
}

async function updateQuestion(questionId, payload) {
  const qRes = await client.execute({
    sql: 'SELECT * FROM questions WHERE id = ?',
    args: [questionId]
  });
  const question = qRes.rows[0];
  if (!question) throw new Error('Question not found.');

  await client.execute({
    sql: `UPDATE questions
          SET question_text = ?, description = ?, youtube_url = ?, response_type = ?, updated_at = datetime('now')
          WHERE id = ?`,
    args: [
      String(payload.questionText || question.question_text).trim(),
      String(payload.description ?? question.description),
      String(payload.youtubeUrl ?? question.youtube_url),
      payload.responseType || question.response_type,
      questionId
    ]
  });

  const updated = await client.execute({
    sql: 'SELECT * FROM questions WHERE id = ?',
    args: [questionId]
  });
  return updated.rows[0];
}

async function deleteQuestion(questionId) {
  await client.execute({
    sql: 'DELETE FROM questions WHERE id = ?',
    args: [questionId]
  });
}

async function getStudentRecords() {
  const res = await client.execute(`
    SELECT u.id, u.full_name, u.cnic, u.whatsapp_number, u.email, u.created_at,
      COALESCE((
        SELECT json_group_array(cp.course_id)
        FROM course_progress cp
        WHERE cp.student_id = u.id AND cp.completed = 1
      ), '[]') AS completed_course_ids
    FROM users u
    WHERE u.role = 'student'
    ORDER BY u.created_at DESC
  `);
  return res.rows;
}

async function getStudentProfileData(studentId) {
  const userRes = await client.execute({
    sql: `SELECT id, role, full_name, cnic, whatsapp_number, email, created_at FROM users WHERE id = ?`,
    args: [studentId]
  });
  const user = userRes.rows[0];
  if (!user) return null;

  const completedRes = await client.execute({
    sql: `SELECT c.id, c.title, cp.completed_at
          FROM course_progress cp
          JOIN courses c ON c.id = cp.course_id
          WHERE cp.student_id = ? AND cp.completed = 1
          ORDER BY cp.completed_at DESC`,
    args: [studentId]
  });

  return {
    ...user,
    completedCourses: completedRes.rows
  };
}

async function getStudentProgressSummary(studentId) {
  const res = await client.execute({
    sql: `
      SELECT 
        c.id AS courseId,
        c.title,
        c.status,
        (SELECT COUNT(*) FROM questions q WHERE q.course_id = c.id) AS questionCount,
        (SELECT COUNT(*) FROM question_progress qp 
         JOIN questions q ON q.id = qp.question_id 
         WHERE qp.student_id = ? AND q.course_id = c.id AND qp.completed = 1) AS completedQuestionCount,
        COALESCE((SELECT cp.completed FROM course_progress cp WHERE cp.student_id = ? AND cp.course_id = c.id), 0) AS isCompleted
      FROM courses c
      WHERE c.status = 'published'
      ORDER BY c.display_order ASC, c.id ASC
    `,
    args: [studentId, studentId]
  });

  return res.rows.map((row) => {
    const qCount = Number(row.questionCount || 0);
    const compCount = Number(row.completedQuestionCount || 0);
    return {
      courseId: row.courseId,
      title: row.title,
      status: row.status,
      questionCount: qCount,
      completedQuestionCount: compCount,
      completed: Boolean(row.isCompleted),
      progressPercentage: qCount ? Math.min(100, Math.round((compCount / qCount) * 100)) : 0
    };
  });
}

async function getCourseCompletionCounts() {
  const res = await client.execute(`
    SELECT c.id, c.title,
      COUNT(cp.id) AS students_completed
    FROM courses c
    LEFT JOIN course_progress cp ON cp.course_id = c.id AND cp.completed = 1
    GROUP BY c.id, c.title
    ORDER BY c.id ASC
  `);
  return res.rows;
}

async function getStudentDashboardData(studentId) {
  const res = await client.execute({
    sql: `
      SELECT 
        c.*,
        (SELECT COUNT(*) FROM questions q WHERE q.course_id = c.id) AS question_count,
        (SELECT COUNT(*) FROM question_progress qp 
         JOIN questions q ON q.id = qp.question_id 
         WHERE qp.student_id = ? AND q.course_id = c.id AND qp.completed = 1) AS completed_questions,
        EXISTS(SELECT 1 FROM student_enrollments se WHERE se.student_id = ? AND se.course_id = c.id) AS is_enrolled,
        COALESCE((SELECT cp.completed FROM course_progress cp WHERE cp.student_id = ? AND cp.course_id = c.id), 0) AS is_completed
      FROM courses c
      WHERE c.status = 'published'
      ORDER BY c.display_order ASC, c.id ASC
    `,
    args: [studentId, studentId, studentId]
  });

  const enrolledCourseIds = [];
  const courses = res.rows.map((row) => {
    const isEnrolled = Boolean(row.is_enrolled);
    if (isEnrolled) enrolledCourseIds.push(row.id);
    const qCount = Number(row.question_count || 0);
    const compCount = Number(row.completed_questions || 0);
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      status: row.status,
      display_order: row.display_order,
      enrolled: isEnrolled,
      question_count: qCount,
      completed_questions: compCount,
      completed: Boolean(row.is_completed),
      progress_percentage: qCount ? Math.min(100, Math.round((compCount / qCount) * 100)) : 0
    };
  });

  return { courses, enrolledCourseIds };
}

async function enrollStudentInCourse(studentId, courseId) {
  const sid = Number(studentId);
  const cid = Number(courseId);
  const courseCheck = await client.execute({
    sql: "SELECT id FROM courses WHERE id = ?",
    args: [cid]
  });
  if (courseCheck.rows.length === 0) {
    throw new Error('Course is not available for enrollment.');
  }

  try {
    await client.execute({
      sql: 'INSERT OR IGNORE INTO student_enrollments (student_id, course_id) VALUES (?, ?)',
      args: [sid, cid]
    });
  } catch (err) {
    console.error('Error enrolling student:', err);
    throw err;
  }
}

async function isStudentEnrolled(studentId, courseId) {
  const res = await client.execute({
    sql: 'SELECT 1 FROM student_enrollments WHERE student_id = ? AND course_id = ? LIMIT 1',
    args: [studentId, courseId]
  });
  return res.rows.length > 0;
}

/**
 * Upsert an assignment submission: if the student already has a submission
 * for this course, UPDATE it (keeping one record per student/course).
 * Otherwise, INSERT a new one.
 */
async function upsertAssignmentSubmission({ studentId, courseId, answers, fileName, fileType, filePath, responseFiles }) {
  const answersPath = path.join(submissionDataDir, `answers-${studentId}-${courseId}.json`);
  fs.writeFileSync(answersPath, JSON.stringify({ answers, responseFiles: responseFiles || {} }), 'utf8');
  const existing = await client.execute({
    sql: 'SELECT id FROM assignment_submissions WHERE student_id = ? AND course_id = ? LIMIT 1',
    args: [studentId, courseId]
  });

  if (existing.rows.length > 0) {
    const existingId = Number(existing.rows[0].id);
    await client.execute({
      sql: `UPDATE assignment_submissions
            SET answers_json = '{}', file_name = ?, file_type = ?, file_data = X'', file_path = ?, answers_path = ?,
                status = 'pending', review_note = '', submitted_at = datetime('now'), reviewed_at = NULL
            WHERE id = ?`,
          args: [fileName, fileType || '', filePath || '', answersPath, existingId]
    });
    const updated = await client.execute({
      sql: 'SELECT id, student_id, course_id, file_name, file_type, status, submitted_at FROM assignment_submissions WHERE id = ?',
      args: [existingId]
    });
    return updated.rows[0];
  }

  // No existing submission — insert fresh
  const result = await client.execute({
    sql: `INSERT INTO assignment_submissions
            (student_id, course_id, answers_json, file_name, file_type, file_data, file_path, answers_path)
              VALUES (?, ?, '{}', ?, ?, X'', ?, ?)`,
            args: [studentId, courseId, fileName, fileType || '', filePath || '', answersPath]
  });
  const created = await client.execute({
    sql: 'SELECT id, student_id, course_id, file_name, file_type, status, submitted_at FROM assignment_submissions WHERE id = ?',
    args: [Number(result.lastInsertRowid)]
  });
  return created.rows[0];
}

async function getStudentSubmissions(studentId) {
  const res = await client.execute({
    sql: `SELECT s.id, s.course_id, c.title, s.file_name, s.file_type, s.status,
            s.review_note, s.submitted_at, s.reviewed_at
          FROM assignment_submissions s
          JOIN courses c ON c.id = s.course_id
          WHERE s.student_id = ?
          ORDER BY s.submitted_at DESC`,
    args: [studentId]
  });
  return res.rows;
}

async function getAdminSubmissions() {
  const res = await client.execute(`
    SELECT s.id, s.student_id, u.full_name, u.email, s.course_id, c.title,
      s.file_name, s.file_type, s.status, s.review_note, s.submitted_at, s.reviewed_at
    FROM assignment_submissions s
    JOIN users u ON u.id = s.student_id
    JOIN courses c ON c.id = s.course_id
    ORDER BY CASE s.status WHEN 'pending' THEN 0 ELSE 1 END, s.submitted_at DESC
  `);
  return res.rows;
}

async function getAssignmentSubmission(submissionId) {
  const res = await client.execute({
    sql: `SELECT s.*, u.full_name, u.email, c.title
          FROM assignment_submissions s
          JOIN users u ON u.id = s.student_id
          JOIN courses c ON c.id = s.course_id
          WHERE s.id = ?`,
    args: [submissionId]
  });
  const submission = res.rows[0];
  if (!submission) return null;
  let storedData = JSON.parse(submission.answers_json || '{}');
  let answers = storedData;
  let responseFiles = {};
  if (submission.answers_path && fs.existsSync(submission.answers_path)) {
    storedData = JSON.parse(fs.readFileSync(submission.answers_path, 'utf8'));
    answers = storedData.answers || storedData;
    responseFiles = storedData.responseFiles || {};
  }
  return { ...submission, answers, response_files: responseFiles };
}

async function reviewAssignmentSubmission(submissionId, status, reviewNote = '') {
  if (!['approved', 'rejected'].includes(status)) {
    throw new Error('Invalid review status.');
  }

  const tx = await client.transaction('write');
  try {
    const updateRes = await tx.execute({
      sql: `UPDATE assignment_submissions
            SET status = ?, review_note = ?, reviewed_at = datetime('now')
            WHERE id = ?`,
      args: [status, String(reviewNote || '').trim(), submissionId]
    });
    if (updateRes.rowsAffected === 0) {
      throw new Error('Submission not found.');
    }

    if (status === 'approved') {
      const subRes = await tx.execute({
        sql: 'SELECT student_id, course_id FROM assignment_submissions WHERE id = ?',
        args: [submissionId]
      });
      const sub = subRes.rows[0];
      if (sub) {
        await tx.execute({
          sql: `INSERT INTO course_progress (student_id, course_id, completed, completed_at)
                VALUES (?, ?, 1, datetime('now'))
                ON CONFLICT(student_id, course_id) DO UPDATE SET completed = 1, completed_at = datetime('now')`,
          args: [sub.student_id, sub.course_id]
        });
      }
    }

    await tx.commit();

    const finalSub = await client.execute({
      sql: 'SELECT * FROM assignment_submissions WHERE id = ?',
      args: [submissionId]
    });
    return finalSub.rows[0];
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

async function getStudentQuestionsForCourse(studentId, courseId) {
  const res = await client.execute({
    sql: `
      SELECT 
        q.id, q.course_id, q.question_number, q.question_text, q.description,
        q.youtube_url, q.response_type, q.display_order,
        qp.video_started_at,
        (strftime('%s', 'now') - strftime('%s', qp.video_started_at)) AS elapsed_video_seconds,
        COALESCE(qp.video_requirement_completed, 0) AS video_req_done,
        COALESCE(qp.completed, 0) AS is_completed,
        qp.completed_at
      FROM questions q
      LEFT JOIN question_progress qp ON qp.question_id = q.id AND qp.student_id = ?
      WHERE q.course_id = ?
      ORDER BY q.display_order ASC, q.question_number ASC
    `,
    args: [studentId, courseId]
  });

  const rawQuestions = res.rows.map((row) => {
    const hasVideo = Boolean(row.youtube_url && String(row.youtube_url).trim().length > 0);
    const videoStarted = Boolean(row.video_started_at);
    const elapsedSeconds = row.elapsed_video_seconds != null ? Math.max(0, Number(row.elapsed_video_seconds)) : 0;
    const isRequirementDone = Boolean(row.video_req_done) || (videoStarted && elapsedSeconds >= 300);
    const remainingSeconds = hasVideo ? (isRequirementDone ? 0 : (videoStarted ? Math.max(0, 300 - elapsedSeconds) : 300)) : 0;
    const isCompleted = Boolean(row.is_completed);

    return {
      id: row.id,
      course_id: row.course_id,
      question_number: row.question_number,
      question_text: row.question_text,
      description: row.description,
      youtube_url: row.youtube_url,
      response_type: row.response_type,
      display_order: row.display_order,
      has_video: hasVideo,
      video_started: videoStarted,
      video_started_at: row.video_started_at,
      video_requirement_completed: hasVideo ? isRequirementDone : true,
      video_timer_remaining_seconds: remainingSeconds,
      // can_answer is resolved after sequential check below
      _video_can_answer: hasVideo ? isRequirementDone : true,
      completed: isCompleted,
      completed_at: row.completed_at
    };
  });

  // Apply sequential unlock: each question is only accessible if ALL
  // previous questions (by order) are fully completed.
  return rawQuestions.map((q, idx) => {
    const previousCompleted = idx === 0 || rawQuestions[idx - 1].completed;
    const sequentiallyUnlocked = previousCompleted;
    return {
      ...q,
      sequentially_unlocked: sequentiallyUnlocked,
      // can_answer requires both sequential unlock AND video requirement
      can_answer: sequentiallyUnlocked ? q._video_can_answer : false
    };
  });
}

async function startQuestionVideoTimer(studentId, questionId) {
  const existing = await client.execute({
    sql: 'SELECT video_started_at, video_requirement_completed FROM question_progress WHERE student_id = ? AND question_id = ?',
    args: [studentId, questionId]
  });

  if (existing.rows.length === 0) {
    await client.execute({
      sql: `INSERT INTO question_progress (student_id, question_id, video_started_at, video_requirement_completed)
            VALUES (?, ?, datetime('now'), 0)`,
      args: [studentId, questionId]
    });
  } else if (!existing.rows[0].video_started_at) {
    await client.execute({
      sql: `UPDATE question_progress SET video_started_at = datetime('now') WHERE student_id = ? AND question_id = ?`,
      args: [studentId, questionId]
    });
  }

  const check = await client.execute({
    sql: `SELECT video_started_at, (strftime('%s', 'now') - strftime('%s', video_started_at)) AS elapsed_seconds, video_requirement_completed
          FROM question_progress WHERE student_id = ? AND question_id = ?`,
    args: [studentId, questionId]
  });
  const row = check.rows[0];
  const elapsed = Number(row?.elapsed_seconds || 0);
  const isUnlocked = elapsed >= 300 || Boolean(row?.video_requirement_completed);
  if (isUnlocked && !row?.video_requirement_completed) {
    await client.execute({
      sql: `UPDATE question_progress SET video_requirement_completed = 1 WHERE student_id = ? AND question_id = ?`,
      args: [studentId, questionId]
    });
  }

  return {
    videoStartedAt: row?.video_started_at,
    elapsedSeconds: elapsed,
    remainingSeconds: isUnlocked ? 0 : Math.max(0, 300 - elapsed),
    unlocked: isUnlocked
  };
}

async function setQuestionComplete(studentId, questionId) {
  await client.execute({
    sql: `INSERT INTO question_progress (student_id, question_id, video_requirement_completed, completed, completed_at)
          VALUES (?, ?, 1, 1, datetime('now'))
          ON CONFLICT(student_id, question_id) DO UPDATE SET completed = 1, completed_at = datetime('now')`,
    args: [studentId, questionId]
  });
}

async function getOrCreateAssignmentTimer(studentId, courseId) {
  const enrollment = await client.execute({
    sql: `SELECT assignment_started_at, (strftime('%s', 'now') - strftime('%s', assignment_started_at)) AS elapsed_seconds
          FROM student_enrollments
          WHERE student_id = ? AND course_id = ?`,
    args: [studentId, courseId]
  });

  let startedAt = enrollment.rows[0]?.assignment_started_at;
  let elapsed = enrollment.rows[0]?.elapsed_seconds != null ? Number(enrollment.rows[0].elapsed_seconds) : null;

  if (!startedAt) {
    return {
      assignmentStartedAt: null,
      elapsedSeconds: 0,
      remainingSeconds: 300,
      unlocked: false
    };
  }

  const remaining = Math.max(0, 300 - (elapsed || 0));
  const isUnlocked = (elapsed || 0) >= 300;

  return {
    assignmentStartedAt: startedAt,
    elapsedSeconds: elapsed || 0,
    remainingSeconds: remaining,
    unlocked: isUnlocked
  };
}

async function startAssignmentTimer(studentId, courseId) {
  await client.execute({
    sql: `UPDATE student_enrollments SET assignment_started_at = datetime('now') WHERE student_id = ? AND course_id = ?`,
    args: [studentId, courseId]
  });
  return getOrCreateAssignmentTimer(studentId, courseId);
}

async function getRecentActivity(limit = 5) {
  const res = await client.execute({
    sql: `SELECT cp.completed_at, u.full_name, c.title
          FROM course_progress cp
          JOIN users u ON u.id = cp.student_id
          JOIN courses c ON c.id = cp.course_id
          WHERE cp.completed = 1
          ORDER BY cp.completed_at DESC
          LIMIT ?`,
    args: [limit]
  });
  return res.rows;
}

module.exports = {
  client,
  initDatabase,
  findUserByEmail,
  verifyPassword,
  createUser,
  getPlatformCapacity,
  getAllCourses,
  getPublishedCourses,
  getCourseById,
  getQuestionsByCourse,
  addCourse,
  updateCourse,
  deleteCourse,
  deleteStudent,
  addQuestionToCourse,
  updateQuestion,
  deleteQuestion,
  getStudentRecords,
  getStudentProfileData,
  getStudentProgressSummary,
  getCourseCompletionCounts,
  getStudentDashboardData,
  enrollStudentInCourse,
  isStudentEnrolled,
  getStudentSubmissions,
  upsertAssignmentSubmission,
  getAdminSubmissions,
  getAssignmentSubmission,
  reviewAssignmentSubmission,
  getStudentQuestionsForCourse,
  getOrCreateAssignmentTimer,
  startAssignmentTimer,
  startQuestionVideoTimer,
  setQuestionComplete,
  getRecentActivity,
  seedAdmin,
  seedDefaultCourses,
  yieldToEventLoop
};
