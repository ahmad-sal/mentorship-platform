const express = require('express');
require('dotenv').config();
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const {
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
  getCourseCompletionCounts,
  getStudentDashboardData,
  enrollStudentInCourse,
  isStudentEnrolled,
  upsertAssignmentSubmission,
  getStudentSubmissions,
  getAdminSubmissions,
  getAssignmentSubmission,
  reviewAssignmentSubmission,
  getStudentQuestionsForCourse,
  getOrCreateAssignmentTimer,
  startAssignmentTimer,
  startQuestionVideoTimer,
  setQuestionComplete,
  getRecentActivity,
  getStudentProfileData,
  getStudentProgressSummary
} = require('./database.cjs');

const app = express();
const PORT = 3000;
const uploadDir = process.env.UPLOAD_PATH || path.join(__dirname, 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const assignmentUpload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, callback) => {
      callback(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname)}`);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 }
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'ahmad-saleem-mentorship-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 12
  }
}));

// Initialize database asynchronously
initDatabase().then(() => {
  console.log('Database initialized with optimized indexing, transactions, and WAL mode.');
}).catch((err) => {
  console.error('Database initialization error:', err);
});

function requireStudent(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'student') {
    return res.status(401).json({ error: 'Please log in as a student.' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(401).json({ error: 'Please log in as an admin.' });
  }
  next();
}

function protectStudentPage(pathname) {
  return (req, res, next) => {
    if (!req.session.user || req.session.user.role !== 'student') {
      const target = pathname || req.originalUrl || '/student/dashboard';
      return res.redirect(`/login?next=${encodeURIComponent(target)}`);
    }
    next();
  };
}

function protectAdminPage(pathname) {
  return (req, res, next) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
      return res.redirect('/admin/login');
    }
    next();
  };
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function isValidCnic(value) {
  return /^\d{5}-\d{7}-\d{1}$/.test(String(value || '').trim());
}

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

// Direct project files zip download endpoint
app.get(['/download', '/api/download', '/download-zip', '/project-files.zip'], (req, res) => {
  const zipFile = path.join(__dirname, 'public', 'ahmad-saleem-platform.zip');
  res.download(zipFile, 'ahmad-saleem-mentorship-platform.zip', (err) => {
    if (err && !res.headersSent) {
      res.status(500).json({ error: 'Could not send zip archive' });
    }
  });
});

// Practical classes page is now accessible publicly before login
// app.use('/practical-classes.html', protectStudentPage('/student/practical-classes'));
app.use('/submit-assignment.html', protectStudentPage('/student/submit-assignment'));

app.use(express.static(path.join(__dirname, 'public'), { index: false }));
app.use(express.static(path.join(__dirname), { index: false }));
app.use('/public', express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'Mentorship API is running smoothly.' });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get(['/login', '/login.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get(['/register', '/register.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.get(['/admin/login', '/admin-login', '/admin-login.html', '/adminlogin', '/adminlogin.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
});

app.get(['/admin/dashboard', '/admin-dashboard', '/admin-dashboard.html', '/admindashboard', '/admindashboard.html'], protectAdminPage('/admin/dashboard'), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-dashboard.html'));
});

app.get(['/admin/progress', '/admin-progress', '/admin-progress.html', '/adminprogress', '/adminprogress.html'], protectAdminPage('/admin/progress'), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-progress.html'));
});

app.get(['/admin/students/:studentId', '/admin-student-detail.html'], protectAdminPage('/admin/dashboard'), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-student-detail.html'));
});

app.get(['/student/dashboard', '/student-dashboard', '/student-dashboard.html'], protectStudentPage('/student/dashboard'), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'student-dashboard.html'));
});

app.get(['/student/profile', '/student-profile', '/student-profile.html'], protectStudentPage('/student/profile'), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'student-profile.html'));
});

app.get('/student/practical-classes', protectStudentPage('/student/practical-classes'), (req, res) => {
  res.sendFile(path.join(__dirname, 'practical-classes.html'));
});

app.get('/student/submit-assignment', protectStudentPage('/student/dashboard'), (req, res) => {
  res.redirect('/student/dashboard');
});

// Auth API Endpoints
app.post('/api/register', async (req, res) => {
  const { fullName, cnic, whatsappNumber, email, password, confirmPassword } = req.body || {};

  if (!fullName || !cnic || !whatsappNumber || !email || !password || !confirmPassword) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  if (!isValidCnic(cnic)) {
    return res.status(400).json({ error: 'Please enter a valid CNIC in the format 12345-6789012-3.' });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({ error: 'Passwords do not match.' });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  try {
    const user = await createUser({
      fullName,
      cnic,
      whatsappNumber,
      email,
      password
    });

    req.session.user = { id: user.id, role: user.role, fullName: user.full_name, email: user.email };
    return res.status(201).json({ message: 'Registration successful.', user: req.session.user });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Registration failed.' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const user = await findUserByEmail(email);
    if (!user || user.role !== 'student') {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    req.session.user = { id: user.id, role: user.role, fullName: user.full_name, email: user.email };
    return res.json({ message: 'Login successful.', user: req.session.user });
  } catch (err) {
    return res.status(500).json({ error: 'Login service encountered an error.' });
  }
});

app.post('/api/admin/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const user = await findUserByEmail(email);
    if (!user || user.role !== 'admin') {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    req.session.user = { id: user.id, role: user.role, fullName: user.full_name, email: user.email };
    return res.json({ message: 'Admin login successful.', user: req.session.user });
  } catch (err) {
    return res.status(500).json({ error: 'Authentication error.' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ message: 'Logged out successfully.' });
  });
});

app.get('/api/session', (req, res) => {
  if (!req.session.user) {
    return res.json({ user: null });
  }
  return res.json({ user: req.session.user });
});

app.get('/api/capacity', async (req, res) => {
  try {
    const capacity = await getPlatformCapacity();
    res.json(capacity);
  } catch (err) {
    res.status(500).json({ error: 'Error fetching capacity information.' });
  }
});

// Admin APIs
app.get('/api/admin/dashboard', requireAdmin, async (req, res) => {
  try {
    const [students, courses, courseStats, recentActivity, capacity] = await Promise.all([
      getStudentRecords(),
      getAllCourses(),
      getCourseCompletionCounts(),
      getRecentActivity(5),
      getPlatformCapacity()
    ]);

    const totalStudents = students.length;
    const totalCourses = courses.length;
    const totalCompletions = courseStats.reduce((sum, c) => sum + Number(c.students_completed || 0), 0);

    const questionsList = await Promise.all(courses.map(c => getQuestionsByCourse(c.id)));
    const totalAssignments = questionsList.reduce((sum, q) => sum + q.length, 0);

    res.json({
      totalStudents,
      totalCourses,
      totalAssignments,
      totalCompletions,
      capacity,
      recentActivity,
      students,
      courses,
      courseStats
    });
  } catch (err) {
    res.status(500).json({ error: 'Error loading admin dashboard.' });
  }
});

app.get('/api/admin/students', requireAdmin, async (req, res) => {
  try {
    const students = await getStudentRecords();
    res.json({ students });
  } catch (err) {
    res.status(500).json({ error: 'Error fetching students.' });
  }
});

app.delete('/api/admin/students/:studentId', requireAdmin, async (req, res) => {
  try {
    await deleteStudent(Number(req.params.studentId));
    res.json({ message: 'Student removed successfully.' });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Unable to remove student.' });
  }
});

app.get('/api/admin/students/:studentId', requireAdmin, async (req, res) => {
  try {
    const studentId = Number(req.params.studentId);
    const [student, progress] = await Promise.all([
      getStudentProfileData(studentId),
      getStudentProgressSummary(studentId)
    ]);
    if (!student) return res.status(404).json({ error: 'Student not found.' });
    res.json({ student, progress });
  } catch (err) {
    res.status(500).json({ error: 'Error fetching student detail.' });
  }
});

app.get('/api/admin/progress', requireAdmin, async (req, res) => {
  try {
    const [students, courses] = await Promise.all([
      getStudentRecords(),
      getAllCourses()
    ]);
    res.json({ students, courses });
  } catch (err) {
    res.status(500).json({ error: 'Error loading progress.' });
  }
});

app.get('/api/admin/courses', requireAdmin, async (req, res) => {
  try {
    const [courses, courseStats] = await Promise.all([
      getAllCourses(),
      getCourseCompletionCounts()
    ]);

    const questionsList = await Promise.all(courses.map(c => getQuestionsByCourse(c.id)));
    const payload = courses.map((course, idx) => ({
      ...course,
      assignmentCount: questionsList[idx].length,
      completionCount: Number((courseStats.find(item => item.id === course.id)?.students_completed) || 0)
    }));
    res.json({ courses: payload });
  } catch (err) {
    res.status(500).json({ error: 'Error fetching courses.' });
  }
});

app.post('/api/admin/courses', requireAdmin, async (req, res) => {
  try {
    const course = await addCourse({
      title: req.body.title,
      description: req.body.description,
      status: req.body.status || 'published'
    });
    res.status(201).json({ message: 'Course created successfully.', course });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Unable to create course.' });
  }
});

app.put('/api/admin/courses/:courseId', requireAdmin, async (req, res) => {
  try {
    const course = await updateCourse(Number(req.params.courseId), {
      title: req.body.title,
      description: req.body.description,
      status: req.body.status
    });
    res.json({ message: 'Course updated successfully.', course });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Unable to update course.' });
  }
});

app.delete('/api/admin/courses/:courseId', requireAdmin, async (req, res) => {
  try {
    await deleteCourse(Number(req.params.courseId));
    res.json({ message: 'Course deleted successfully.' });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Unable to delete course.' });
  }
});

app.get('/api/admin/courses/:courseId/questions', requireAdmin, async (req, res) => {
  try {
    const courseId = Number(req.params.courseId);
    const [course, questions] = await Promise.all([
      getCourseById(courseId),
      getQuestionsByCourse(courseId)
    ]);
    if (!course) return res.status(404).json({ error: 'Course not found.' });
    res.json({ course, questions });
  } catch (err) {
    res.status(500).json({ error: 'Error fetching course questions.' });
  }
});

app.post('/api/admin/courses/:courseId/questions', requireAdmin, async (req, res) => {
  try {
    const question = await addQuestionToCourse(Number(req.params.courseId), {
      questionText: req.body.questionText,
      description: req.body.description,
      youtubeUrl: req.body.youtubeUrl,
      responseType: req.body.responseType || 'short_answer'
    });
    res.status(201).json({ message: 'Question created successfully.', question });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Unable to create question.' });
  }
});

app.put('/api/admin/questions/:questionId', requireAdmin, async (req, res) => {
  try {
    const question = await updateQuestion(Number(req.params.questionId), {
      questionText: req.body.questionText,
      description: req.body.description,
      youtubeUrl: req.body.youtubeUrl,
      responseType: req.body.responseType
    });
    res.json({ message: 'Question updated successfully.', question });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Unable to update question.' });
  }
});

app.delete('/api/admin/questions/:questionId', requireAdmin, async (req, res) => {
  try {
    await deleteQuestion(Number(req.params.questionId));
    res.json({ message: 'Question deleted successfully.' });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Unable to delete question.' });
  }
});

// Student APIs
app.get('/api/student/profile', requireStudent, async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const [student, progress] = await Promise.all([
      getStudentProfileData(studentId),
      getStudentProgressSummary(studentId)
    ]);
    if (!student) return res.status(404).json({ error: 'Student not found.' });
    res.json({ student, progress });
  } catch (err) {
    res.status(500).json({ error: 'Error fetching student profile.' });
  }
});

app.get('/api/student/dashboard', requireStudent, async (req, res) => {
  try {
    const data = await getStudentDashboardData(req.session.user.id);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error fetching student dashboard.' });
  }
});

app.get('/api/student/submissions', requireStudent, async (req, res) => {
  try {
    const submissions = await getStudentSubmissions(req.session.user.id);
    res.json({ submissions });
  } catch (err) {
    res.status(500).json({ error: 'Error fetching assignment submissions.' });
  }
});

app.post('/api/student/courses/:courseId/enroll', requireStudent, async (req, res) => {
  try {
    await enrollStudentInCourse(req.session.user.id, Number(req.params.courseId));
    res.json({ message: 'Enrollment saved successfully.' });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Unable to enroll in this course.' });
  }
});

app.get('/api/student/courses/:courseId/questions', requireStudent, async (req, res) => {
  try {
    const courseId = Number(req.params.courseId);
    const course = await getCourseById(courseId);
    if (!course) return res.status(404).json({ error: 'Course not found.' });

    const enrolled = await isStudentEnrolled(req.session.user.id, courseId);
    if (!enrolled) {
      return res.status(403).json({ error: 'Please enroll in this course first.' });
    }

    const questions = await getStudentQuestionsForCourse(req.session.user.id, courseId);
    const assignmentTimer = await getOrCreateAssignmentTimer(req.session.user.id, courseId);
    res.json({ course, questions, assignment_timer: assignmentTimer });
  } catch (err) {
    res.status(500).json({ error: 'Error fetching course questions.' });
  }
});

app.post('/api/student/courses/:courseId/start-timer', requireStudent, async (req, res) => {
  try {
    const courseId = Number(req.params.courseId);
    const assignmentTimer = await startAssignmentTimer(req.session.user.id, courseId);
    res.json({ message: '5-minute assessment timer started.', timer: assignmentTimer, ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error starting assessment timer.' });
  }
});

app.post('/api/student/questions/:questionId/start-video', requireStudent, async (req, res) => {
  try {
    const questionId = Number(req.params.questionId);
    const timerStatus = await startQuestionVideoTimer(req.session.user.id, questionId);
    res.json({ message: '5-minute video lecture timer started.', timer: timerStatus, ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error starting video timer.' });
  }
});

app.post('/api/student/questions/:questionId/watch', requireStudent, async (req, res) => {
  try {
    const questionId = Number(req.params.questionId);
    const timerStatus = await startQuestionVideoTimer(req.session.user.id, questionId);
    res.json({ message: 'Video requirement status updated.', timer: timerStatus, ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error saving video watch progress.' });
  }
});

app.post('/api/student/questions/:questionId/complete', requireStudent, async (req, res) => {
  try {
    const questionId = Number(req.params.questionId);
    await setQuestionComplete(req.session.user.id, questionId);
    res.json({ message: 'Question marked complete.', ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error saving question progress.' });
  }
});

app.post('/api/student/courses/:courseId/submit', requireStudent, assignmentUpload.any(), async (req, res) => {
  try {
    const courseId = Number(req.params.courseId);
    const course = await getCourseById(courseId);
    if (!course) return res.status(404).json({ error: 'Course not found.' });

    const enrolled = await isStudentEnrolled(req.session.user.id, courseId);
    if (!enrolled) {
      return res.status(403).json({ error: 'Please enroll in this course first.' });
    }

    const questions = await getStudentQuestionsForCourse(req.session.user.id, courseId);
    if (!questions.length) {
      return res.status(400).json({ error: 'No assignment questions have been assigned for this course yet.' });
    }

    const assignmentFile = (req.files || []).find(file => file.fieldname === 'assignmentFile');
    const hasFileUpload = questions.some(q => q.response_type === 'file_upload');
    if (hasFileUpload && !assignmentFile) {
      return res.status(400).json({ error: 'Please attach your assignment file before submitting.' });
    }

    let answers;
    try {
      answers = typeof req.body.answers === 'string' ? JSON.parse(req.body.answers) : (req.body.answers || {});
    } catch (error) {
      return res.status(400).json({ error: 'Assignment answers could not be parsed.' });
    }

    const storedAnswers = Object.fromEntries(Object.entries(answers).map(([questionId, answer]) => {
      const value = String(answer ?? '');
      const normalizedValue = value.trimStart().startsWith('data:')
        ? '[Uploaded response]'
        : value.slice(0, 10000);
      return [questionId, normalizedValue];
    }));

    // 2. Strict validation: Students MUST answer ALL questions
    for (const q of questions) {
      const ans = answers[q.id] !== undefined ? String(answers[q.id]).trim() : '';
      if (!ans) {
        return res.status(400).json({
          error: `Please answer all quiz/curriculum questions before submitting. Question #${q.question_number} is still unanswered.`
        });
      }

      // Check 5-minute video timer rule if admin attached a video
      if (q.has_video && !q.can_answer) {
        const remaining = Math.max(1, Math.ceil(q.video_timer_remaining_seconds || 300));
        return res.status(400).json({
          error: `Question #${q.question_number} has a mandatory 5-minute video lesson. You must complete the 5-minute video before submitting (Remaining: ${Math.floor(remaining / 60)}m ${remaining % 60}s).`
        });
      }
    }

    const submission = await upsertAssignmentSubmission({
      studentId: req.session.user.id,
      courseId,
      answers: storedAnswers,
      fileName: (req.files || []).find(file => file.fieldname === 'assignmentFile')?.originalname || '',
      fileType: (req.files || []).find(file => file.fieldname === 'assignmentFile')?.mimetype || '',
      filePath: (req.files || []).find(file => file.fieldname === 'assignmentFile')?.path || '',
      responseFiles: Object.fromEntries((req.files || [])
        .filter(file => file.fieldname.startsWith('responseFile_'))
        .map(file => [file.fieldname.replace('responseFile_', ''), { path: file.path, type: file.mimetype }]))
    });

    res.json({ message: 'Assignment submitted successfully for mentor review!', submission });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Submission error.' });
  }
});

app.get('/api/admin/submissions', requireAdmin, async (req, res) => {
  try {
    const submissions = await getAdminSubmissions();
    res.json({ submissions });
  } catch (err) {
    res.status(500).json({ error: 'Error fetching submissions.' });
  }
});

app.get('/api/admin/submissions/:submissionId', requireAdmin, async (req, res) => {
  try {
    const submission = await getAssignmentSubmission(Number(req.params.submissionId));
    if (!submission) return res.status(404).json({ error: 'Submission not found.' });
    res.json({ submission });
  } catch (err) {
    res.status(500).json({ error: 'Error fetching submission details.' });
  }
});

app.get('/api/admin/submissions/:submissionId/file', requireAdmin, async (req, res) => {
  try {
    const submission = await getAssignmentSubmission(Number(req.params.submissionId));
    if (!submission) return res.status(404).json({ error: 'Submission not found.' });
    res.type(submission.file_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${submission.file_name.replace(/"/g, '')}"`);
    if (submission.file_path && fs.existsSync(submission.file_path)) {
      return res.sendFile(path.resolve(submission.file_path));
    }
    res.send(submission.file_data);
  } catch (err) {
    res.status(500).json({ error: 'Error downloading file.' });
  }
});

app.get('/api/admin/submissions/:submissionId/response/:questionId', requireAdmin, async (req, res) => {
  try {
    const submission = await getAssignmentSubmission(Number(req.params.submissionId));
    const responseFile = submission?.response_files?.[String(req.params.questionId)];
    if (!responseFile || !fs.existsSync(responseFile.path)) {
      return res.status(404).json({ error: 'Response file not found.' });
    }
    res.type(responseFile.type || 'application/octet-stream');
    return res.sendFile(path.resolve(responseFile.path));
  } catch (err) {
    res.status(500).json({ error: 'Error loading response file.' });
  }
});

app.patch('/api/admin/submissions/:submissionId/review', requireAdmin, async (req, res) => {
  try {
    const submission = await reviewAssignmentSubmission(Number(req.params.submissionId), req.body.status, req.body.reviewNote);
    res.json({ message: `Submission ${submission.status}.`, submission });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Unable to review submission.' });
  }
});

app.use((err, req, res, next) => {
  if (!req.path.startsWith('/api/')) return next(err);

  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'The assignment file must be 10 MB or smaller.' });
  }

  console.error('API request error:', err);
  return res.status(500).json({ error: err.message || 'Unexpected API error.' });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Ahmad Saleem Mentorship is running at http://localhost:${PORT}`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.log(`Ahmad Saleem Mentorship is already running at http://localhost:${PORT}`);
    return;
  }

  console.log('Ahmad Saleem Mentorship could not start.');
  process.exitCode = 1;
});

