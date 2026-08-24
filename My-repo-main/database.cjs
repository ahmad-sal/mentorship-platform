const supabase = require('./supabase.cjs');

// --------------------------------------------------------------
// 1. AUTHENTICATION FUNCTIONS
// --------------------------------------------------------------

async function findUserByEmail(email) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle();

  if (error) {
    console.error('Error finding user:', error);
    return null;
  }
  return data;
}

// This is a placeholder – we are using Supabase Auth directly in server.cjs
async function verifyPassword(plainPassword, hashedPassword) {
  throw new Error('verifyPassword should be replaced by supabase.auth.signInWithPassword');
}

async function createUser({ fullName, cnic, whatsappNumber, email, password }) {
  const trimmedEmail = String(email).trim().toLowerCase();

  // Check if user already exists
  const { data: existing, error: checkError } = await supabase
    .from('users')
    .select('id')
    .eq('email', trimmedEmail)
    .maybeSingle();

  if (existing) {
    throw new Error('An account with this email already exists.');
  }

  // Check capacity (max 800 students)
  const capacity = await getPlatformCapacity();
  if (capacity.isFull) {
    throw new Error('Enrollment is currently closed: Maximum capacity of 800 students has been reached.');
  }

  // Sign up with Supabase Auth
  const { data: authData, error: signUpError } = await supabase.auth.signUp({
    email: trimmedEmail,
    password: password,
    options: {
      data: {
        full_name: fullName.trim(),
        role: 'student'
      }
    }
  });

  if (signUpError) {
    throw new Error(signUpError.message);
  }

  if (!authData.user) {
    throw new Error('Registration failed – no user returned.');
  }

  const userId = authData.user.id;

  // Insert user profile into public.users
  const { data: profileData, error: profileError } = await supabase
    .from('users')
    .insert([
      {
        id: userId,
        full_name: fullName.trim(),
        cnic: cnic.trim(),
        whatsapp_number: whatsappNumber.trim(),
        email: trimmedEmail,
        role: 'student'
      }
    ])
    .select()
    .single();

  if (profileError) {
    console.error('Profile insertion failed:', profileError);
    throw new Error('Registration failed – unable to create profile.');
  }

  return profileData;
}

// --------------------------------------------------------------
// 2. PLATFORM CAPACITY
// --------------------------------------------------------------

const MAX_STUDENT_CAPACITY = 800;

async function getPlatformCapacity() {
  const { count, error } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true })
    .eq('role', 'student');

  if (error) {
    console.error('Error counting students:', error);
    return { currentStudents: 0, maxCapacity: MAX_STUDENT_CAPACITY, remainingSeats: 0, isFull: true };
  }

  const currentStudents = count || 0;
  return {
    currentStudents,
    maxCapacity: MAX_STUDENT_CAPACITY,
    remainingSeats: Math.max(0, MAX_STUDENT_CAPACITY - currentStudents),
    isFull: currentStudents >= MAX_STUDENT_CAPACITY
  };
}

// --------------------------------------------------------------
// 3. COURSE FUNCTIONS
// --------------------------------------------------------------

async function getAllCourses() {
  const { data, error } = await supabase
    .from('courses')
    .select('*')
    .order('display_order', { ascending: true })
    .order('id', { ascending: true });

  if (error) throw error;
  return data || [];
}

async function getPublishedCourses() {
  const { data, error } = await supabase
    .from('courses')
    .select('*')
    .eq('status', 'published')
    .order('display_order', { ascending: true })
    .order('id', { ascending: true });

  if (error) throw error;
  return data || [];
}

async function getCourseById(courseId) {
  const { data, error } = await supabase
    .from('courses')
    .select('*')
    .eq('id', courseId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function addCourse({ title, description, status = 'published' }) {
  const trimmedTitle = String(title || '').trim();
  const trimmedDescription = String(description || '').trim();
  if (!trimmedTitle || !trimmedDescription) {
    throw new Error('Course title and description are required.');
  }

  // Get next display order
  const { data: maxOrderData, error: maxOrderError } = await supabase
    .from('courses')
    .select('display_order')
    .order('display_order', { ascending: false })
    .limit(1);

  if (maxOrderError) throw maxOrderError;
  const nextOrder = (maxOrderData && maxOrderData.length > 0) ? maxOrderData[0].display_order + 1 : 1;

  const { data, error } = await supabase
    .from('courses')
    .insert([
      {
        title: trimmedTitle,
        description: trimmedDescription,
        status,
        display_order: nextOrder,
        updated_at: new Date().toISOString()
      }
    ])
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function updateCourse(courseId, payload) {
  const course = await getCourseById(courseId);
  if (!course) throw new Error('Course not found.');

  const updates = {
    title: payload.title || course.title,
    description: payload.description || course.description,
    status: payload.status || course.status,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('courses')
    .update(updates)
    .eq('id', courseId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function deleteCourse(courseId) {
  const { error } = await supabase
    .from('courses')
    .delete()
    .eq('id', courseId);

  if (error) throw error;
}

// --------------------------------------------------------------
// 4. QUESTIONS FUNCTIONS
// --------------------------------------------------------------

async function getQuestionsByCourse(courseId) {
  const { data, error } = await supabase
    .from('questions')
    .select('*')
    .eq('course_id', courseId)
    .order('display_order', { ascending: true })
    .order('question_number', { ascending: true });

  if (error) throw error;
  return data || [];
}

async function addQuestionToCourse(courseId, payload) {
  const course = await getCourseById(courseId);
  if (!course) throw new Error('Course not found.');

  const questionText = String(payload.questionText || '').trim();
  if (!questionText) throw new Error('Question text is required.');

  // Get next question number
  const { data: maxNumData, error: maxNumError } = await supabase
    .from('questions')
    .select('question_number')
    .eq('course_id', courseId)
    .order('question_number', { ascending: false })
    .limit(1);

  if (maxNumError) throw maxNumError;
  const nextNumber = (maxNumData && maxNumData.length > 0) ? maxNumData[0].question_number + 1 : 1;

  const { data, error } = await supabase
    .from('questions')
    .insert([
      {
        course_id: courseId,
        question_number: nextNumber,
        question_text: questionText,
        description: payload.description || '',
        youtube_url: payload.youtubeUrl || '',
        response_type: payload.responseType || 'short_answer',
        display_order: nextNumber,
        updated_at: new Date().toISOString()
      }
    ])
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function updateQuestion(questionId, payload) {
  const { data: existing, error: findError } = await supabase
    .from('questions')
    .select('*')
    .eq('id', questionId)
    .maybeSingle();

  if (findError) throw findError;
  if (!existing) throw new Error('Question not found.');

  const updates = {
    question_text: String(payload.questionText || existing.question_text).trim(),
    description: payload.description ?? existing.description,
    youtube_url: payload.youtubeUrl ?? existing.youtube_url,
    response_type: payload.responseType || existing.response_type,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('questions')
    .update(updates)
    .eq('id', questionId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function deleteQuestion(questionId) {
  const { error } = await supabase
    .from('questions')
    .delete()
    .eq('id', questionId);

  if (error) throw error;
}

// --------------------------------------------------------------
// 5. STUDENT RECORDS & ENROLLMENTS
// --------------------------------------------------------------

async function getStudentRecords() {
  const { data, error } = await supabase
    .from('users')
    .select(`
      id,
      full_name,
      cnic,
      whatsapp_number,
      email,
      created_at,
      role
    `)
    .eq('role', 'student')
    .order('created_at', { ascending: false });

  if (error) throw error;

  // For each student, fetch enrolled and completed courses
  const students = await Promise.all((data || []).map(async (user) => {
    // Enrolled courses (from student_enrollments)
    const { data: enrolled, error: enrolledError } = await supabase
      .from('student_enrollments')
      .select(`
        course_id,
        courses (title)
      `)
      .eq('student_id', user.id);

    if (enrolledError) console.error(enrolledError);

    // Completed courses (from course_progress)
    const { data: completed, error: completedError } = await supabase
      .from('course_progress')
      .select(`
        course_id,
        courses (title)
      `)
      .eq('student_id', user.id)
      .eq('completed', true);

    if (completedError) console.error(completedError);

    const enrolledCourseTitles = (enrolled || []).map(item => item.courses?.title).filter(Boolean);
    const completedCourseTitles = (completed || []).map(item => item.courses?.title).filter(Boolean);

    return {
      ...user,
      enrolled_course_titles: JSON.stringify(enrolledCourseTitles),
      completed_course_titles: JSON.stringify(completedCourseTitles),
      enrolled_course_ids: JSON.stringify((enrolled || []).map(item => item.course_id)),
      completed_course_ids: JSON.stringify((completed || []).map(item => item.course_id))
    };
  }));

  return students;
}

async function deleteStudent(studentId) {
  // Delete all related records (cascading should handle if foreign keys are set, but we'll do manually)
  await supabase.from('question_progress').delete().eq('student_id', studentId);
  await supabase.from('course_progress').delete().eq('student_id', studentId);
  await supabase.from('student_enrollments').delete().eq('student_id', studentId);
  await supabase.from('assignment_submissions').delete().eq('student_id', studentId);
  // Delete from users
  const { error } = await supabase.from('users').delete().eq('id', studentId);
  if (error) throw error;
}

async function getStudentProfileData(studentId) {
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', studentId)
    .maybeSingle();

  if (error) throw error;
  if (!user) return null;

  // Enrolled courses
  const { data: enrolled, error: enrolledError } = await supabase
    .from('student_enrollments')
    .select(`
      course_id,
      courses (id, title)
    `)
    .eq('student_id', studentId)
    .order('courses(display_order)', { ascending: true });

  if (enrolledError) console.error(enrolledError);

  // Completed courses
  const { data: completed, error: completedError } = await supabase
    .from('course_progress')
    .select(`
      course_id,
      courses (id, title),
      completed_at
    `)
    .eq('student_id', studentId)
    .eq('completed', true)
    .order('completed_at', { ascending: false });

  if (completedError) console.error(completedError);

  return {
    ...user,
    enrolledCourses: (enrolled || []).map(item => item.courses),
    completedCourses: (completed || []).map(item => ({ ...item.courses, completed_at: item.completed_at }))
  };
}

async function getStudentProgressSummary(studentId) {
  const { data: courses, error } = await supabase
    .from('courses')
    .select('*')
    .eq('status', 'published')
    .order('display_order', { ascending: true });

  if (error) throw error;

  const result = await Promise.all((courses || []).map(async (course) => {
    // Count total questions for this course
    const { count: questionCount, error: qError } = await supabase
      .from('questions')
      .select('*', { count: 'exact', head: true })
      .eq('course_id', course.id);

    if (qError) console.error(qError);

    // Count completed questions for this student
    const { data: qIds, error: qIdsError } = await supabase
      .from('questions')
      .select('id')
      .eq('course_id', course.id);

    if (qIdsError) console.error(qIdsError);

    let completedCount = 0;
    if (qIds && qIds.length > 0) {
      const { count, error: cError } = await supabase
        .from('question_progress')
        .select('*', { count: 'exact', head: true })
        .eq('student_id', studentId)
        .eq('completed', true)
        .in('question_id', qIds.map(q => q.id));

      if (cError) console.error(cError);
      completedCount = count || 0;
    }

    // Check if course is fully completed
    const { data: progress, error: pError } = await supabase
      .from('course_progress')
      .select('completed')
      .eq('student_id', studentId)
      .eq('course_id', course.id)
      .maybeSingle();

    if (pError) console.error(pError);

    const total = questionCount || 0;
    const comp = completedCount || 0;
    const isCompleted = progress?.completed || false;

    return {
      courseId: course.id,
      title: course.title,
      status: course.status,
      questionCount: total,
      completedQuestionCount: comp,
      completed: isCompleted,
      progressPercentage: total ? Math.min(100, Math.round((comp / total) * 100)) : 0
    };
  }));

  return result;
}

async function getCourseCompletionCounts() {
  const { data: courses, error } = await supabase
    .from('courses')
    .select('id, title');

  if (error) throw error;

  const result = await Promise.all((courses || []).map(async (course) => {
    const { count, error: countError } = await supabase
      .from('course_progress')
      .select('*', { count: 'exact', head: true })
      .eq('course_id', course.id)
      .eq('completed', true);

    if (countError) console.error(countError);
    return {
      id: course.id,
      title: course.title,
      students_completed: count || 0
    };
  }));

  return result;
}

// --------------------------------------------------------------
// 6. STUDENT DASHBOARD
// --------------------------------------------------------------

async function getStudentDashboardData(studentId) {
  const { data: courses, error } = await supabase
    .from('courses')
    .select('*')
    .eq('status', 'published')
    .order('display_order', { ascending: true });

  if (error) throw error;

  const enrolledCourseIds = [];
  const result = await Promise.all((courses || []).map(async (course) => {
    // Check enrollment
    const { data: enrollment, error: enrollError } = await supabase
      .from('student_enrollments')
      .select('student_id')
      .eq('student_id', studentId)
      .eq('course_id', course.id)
      .maybeSingle();

    if (enrollError) console.error(enrollError);

    const isEnrolled = !!enrollment;
    if (isEnrolled) enrolledCourseIds.push(course.id);

    // Count total questions
    const { count: questionCount, error: qError } = await supabase
      .from('questions')
      .select('*', { count: 'exact', head: true })
      .eq('course_id', course.id);

    if (qError) console.error(qError);

    // Count completed questions
    const { data: qIds, error: qIdsError } = await supabase
      .from('questions')
      .select('id')
      .eq('course_id', course.id);

    if (qIdsError) console.error(qIdsError);

    let completedCount = 0;
    if (qIds && qIds.length > 0) {
      const { count, error: cError } = await supabase
        .from('question_progress')
        .select('*', { count: 'exact', head: true })
        .eq('student_id', studentId)
        .eq('completed', true)
        .in('question_id', qIds.map(q => q.id));

      if (cError) console.error(cError);
      completedCount = count || 0;
    }

    // Check course completion
    const { data: progress, error: pError } = await supabase
      .from('course_progress')
      .select('completed')
      .eq('student_id', studentId)
      .eq('course_id', course.id)
      .maybeSingle();

    if (pError) console.error(pError);

    const total = questionCount || 0;
    const comp = completedCount || 0;
    const isCompleted = progress?.completed || false;

    return {
      id: course.id,
      title: course.title,
      description: course.description,
      status: course.status,
      display_order: course.display_order,
      enrolled: isEnrolled,
      question_count: total,
      completed_questions: comp,
      completed: isCompleted,
      progress_percentage: total ? Math.min(100, Math.round((comp / total) * 100)) : 0
    };
  }));

  return { courses: result, enrolledCourseIds };
}

async function enrollStudentInCourse(studentId, courseId) {
  const course = await getCourseById(courseId);
  if (!course) throw new Error('Course is not available for enrollment.');

  const { error } = await supabase
    .from('student_enrollments')
    .upsert({
      student_id: studentId,
      course_id: courseId,
      enrolled_at: new Date().toISOString()
    }, { onConflict: 'student_id, course_id' });

  if (error) throw error;
}

async function isStudentEnrolled(studentId, courseId) {
  const { data, error } = await supabase
    .from('student_enrollments')
    .select('student_id')
    .eq('student_id', studentId)
    .eq('course_id', courseId)
    .maybeSingle();

  if (error) throw error;
  return !!data;
}

// --------------------------------------------------------------
// 7. ASSIGNMENT SUBMISSIONS
// --------------------------------------------------------------

async function upsertAssignmentSubmission({ studentId, courseId, answers, fileName, fileType, filePath, responseFiles }) {
  const answersJson = { answers, responseFiles: responseFiles || {} };

  const { data, error } = await supabase
    .from('assignment_submissions')
    .upsert({
      student_id: studentId,
      course_id: courseId,
      answers_json: answersJson,
      file_name: fileName || '',
      file_type: fileType || '',
      file_url: filePath || '',  // This will be the Cloudinary URL
      answers_file_url: '',
      status: 'pending',
      submitted_at: new Date().toISOString()
    }, { onConflict: 'student_id, course_id' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function getStudentSubmissions(studentId) {
  const { data, error } = await supabase
    .from('assignment_submissions')
    .select(`
      id,
      course_id,
      file_name,
      file_type,
      status,
      review_note,
      submitted_at,
      reviewed_at,
      courses (title)
    `)
    .eq('student_id', studentId)
    .order('submitted_at', { ascending: false });

  if (error) throw error;

  return data.map(item => ({
    id: item.id,
    course_id: item.course_id,
    title: item.courses?.title || '',
    file_name: item.file_name,
    file_type: item.file_type,
    status: item.status,
    review_note: item.review_note,
    submitted_at: item.submitted_at,
    reviewed_at: item.reviewed_at
  }));
}

async function getAdminSubmissions() {
  const { data, error } = await supabase
    .from('assignment_submissions')
    .select(`
      id,
      student_id,
      course_id,
      file_name,
      file_type,
      status,
      review_note,
      submitted_at,
      reviewed_at,
      users (full_name, email),
      courses (title)
    `)
    .order('submitted_at', { ascending: false });

  if (error) throw error;

  return data.map(item => ({
    id: item.id,
    student_id: item.student_id,
    full_name: item.users?.full_name || '',
    email: item.users?.email || '',
    course_id: item.course_id,
    title: item.courses?.title || '',
    file_name: item.file_name,
    file_type: item.file_type,
    status: item.status,
    review_note: item.review_note,
    submitted_at: item.submitted_at,
    reviewed_at: item.reviewed_at
  }));
}

async function getAssignmentSubmission(submissionId) {
  const { data, error } = await supabase
    .from('assignment_submissions')
    .select(`
      *,
      users (full_name, email),
      courses (title)
    `)
    .eq('id', submissionId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  // Parse answers_json
  const answers = data.answers_json || {};

  return {
    ...data,
    answers: answers.answers || {},
    response_files: answers.responseFiles || {}
  };
}

async function reviewAssignmentSubmission(submissionId, status, reviewNote = '') {
  if (!['approved', 'rejected'].includes(status)) {
    throw new Error('Invalid review status.');
  }

  // 1. Update the submission
  const { data: updateData, error: updateError } = await supabase
    .from('assignment_submissions')
    .update({
      status,
      review_note: String(reviewNote || '').trim(),
      reviewed_at: new Date().toISOString()
    })
    .eq('id', submissionId)
    .select();  // Note: no .single()

  if (updateError) throw updateError;
  if (!updateData || updateData.length === 0) {
    throw new Error('Submission not found.');
  }

  const submission = updateData[0];

  // 2. If approved, mark the course as completed
  if (status === 'approved') {
    const { error: progressError } = await supabase
      .from('course_progress')
      .upsert({
        student_id: submission.student_id,
        course_id: submission.course_id,
        completed: true,
        completed_at: new Date().toISOString()
      }, { onConflict: 'student_id, course_id' });

    if (progressError) {
      console.error('Error updating course progress:', progressError);
      // We still return the submission, but log the error
    }
  }

  return submission;
}

// --------------------------------------------------------------
// 8. QUESTION PROGRESS & TIMERS
// --------------------------------------------------------------

async function getStudentQuestionsForCourse(studentId, courseId) {
  // 1. Get all questions for this course
  const { data: questions, error: qError } = await supabase
    .from('questions')
    .select('*')
    .eq('course_id', courseId)
    .order('display_order', { ascending: true })
    .order('question_number', { ascending: true });

  if (qError) throw qError;
  if (!questions || questions.length === 0) return [];

  // 2. Get progress for each question
  const questionIds = questions.map(q => q.id);

  const { data: progressData, error: pError } = await supabase
    .from('question_progress')
    .select('*')
    .eq('student_id', studentId)
    .in('question_id', questionIds);

  if (pError) throw pError;

  const progressMap = {};
  (progressData || []).forEach(p => {
    progressMap[p.question_id] = p;
  });

  // 3. Build the result with computed fields
  return questions.map((q, idx) => {
    const progress = progressMap[q.id] || {};
    const hasVideo = Boolean(q.youtube_url && q.youtube_url.trim().length > 0);
    const videoStarted = Boolean(progress.video_started_at);
    const elapsedSeconds = videoStarted
      ? Math.floor((new Date() - new Date(progress.video_started_at)) / 1000)
      : 0;
    const isRequirementDone = Boolean(progress.video_requirement_completed) || (videoStarted && elapsedSeconds >= 300);
    const remainingSeconds = hasVideo ? (isRequirementDone ? 0 : (videoStarted ? Math.max(0, 300 - elapsedSeconds) : 300)) : 0;
    const isCompleted = Boolean(progress.completed);

    // Sequential unlock: check if previous question is completed
    const prevCompleted = idx === 0 || (progressMap[questions[idx - 1]?.id]?.completed || false);
    const sequentiallyUnlocked = prevCompleted;

    return {
      id: q.id,
      course_id: q.course_id,
      question_number: q.question_number,
      question_text: q.question_text,
      description: q.description,
      youtube_url: q.youtube_url,
      response_type: q.response_type,
      display_order: q.display_order,
      has_video: hasVideo,
      video_started: videoStarted,
      video_started_at: progress.video_started_at,
      video_requirement_completed: isRequirementDone,
      video_timer_remaining_seconds: remainingSeconds,
      _video_can_answer: hasVideo ? isRequirementDone : true,
      completed: isCompleted,
      completed_at: progress.completed_at,
      sequentially_unlocked: sequentiallyUnlocked,
      can_answer: sequentiallyUnlocked ? (hasVideo ? isRequirementDone : true) : false
    };
  });
}

async function startQuestionVideoTimer(studentId, questionId) {
  // Check existing progress
  const { data: existing, error: findError } = await supabase
    .from('question_progress')
    .select('video_started_at, video_requirement_completed')
    .eq('student_id', studentId)
    .eq('question_id', questionId)
    .maybeSingle();

  if (findError) throw findError;

  if (!existing) {
    // Insert new record with video_started_at = now
    const { error: insertError } = await supabase
      .from('question_progress')
      .insert({
        student_id: studentId,
        question_id: questionId,
        video_started_at: new Date().toISOString(),
        video_requirement_completed: false
      });

    if (insertError) throw insertError;
  } else if (!existing.video_started_at) {
    // Update existing record to set video_started_at
    const { error: updateError } = await supabase
      .from('question_progress')
      .update({ video_started_at: new Date().toISOString() })
      .eq('student_id', studentId)
      .eq('question_id', questionId);

    if (updateError) throw updateError;
  }

  // Fetch the updated record to return timer status
  return getQuestionTimerStatus(studentId, questionId);
}

async function getQuestionTimerStatus(studentId, questionId) {
  const { data, error } = await supabase
    .from('question_progress')
    .select('video_started_at, video_requirement_completed')
    .eq('student_id', studentId)
    .eq('question_id', questionId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return {
      videoStartedAt: null,
      elapsedSeconds: 0,
      remainingSeconds: 300,
      unlocked: false
    };
  }

  const videoStartedAt = data.video_started_at;
  if (!videoStartedAt) {
    return {
      videoStartedAt: null,
      elapsedSeconds: 0,
      remainingSeconds: 300,
      unlocked: false
    };
  }

  const elapsed = Math.floor((new Date() - new Date(videoStartedAt)) / 1000);
  const isUnlocked = elapsed >= 300 || Boolean(data.video_requirement_completed);

  if (isUnlocked && !data.video_requirement_completed) {
    // Mark as completed
    await supabase
      .from('question_progress')
      .update({ video_requirement_completed: true })
      .eq('student_id', studentId)
      .eq('question_id', questionId);
  }

  return {
    videoStartedAt,
    elapsedSeconds: elapsed,
    remainingSeconds: isUnlocked ? 0 : Math.max(0, 300 - elapsed),
    unlocked: isUnlocked
  };
}

async function setQuestionComplete(studentId, questionId) {
  const { error } = await supabase
    .from('question_progress')
    .upsert({
      student_id: studentId,
      question_id: questionId,
      video_requirement_completed: true,
      completed: true,
      completed_at: new Date().toISOString()
    }, { onConflict: 'student_id, question_id' });

  if (error) throw error;
}

async function getOrCreateAssignmentTimer(studentId, courseId) {
  const { data, error } = await supabase
    .from('student_enrollments')
    .select('assignment_started_at')
    .eq('student_id', studentId)
    .eq('course_id', courseId)
    .maybeSingle();

  if (error) throw error;

  if (!data || !data.assignment_started_at) {
    return {
      assignmentStartedAt: null,
      elapsedSeconds: 0,
      remainingSeconds: 300,
      unlocked: false
    };
  }

  const elapsed = Math.floor((new Date() - new Date(data.assignment_started_at)) / 1000);
  const isUnlocked = elapsed >= 300;

  return {
    assignmentStartedAt: data.assignment_started_at,
    elapsedSeconds: elapsed,
    remainingSeconds: isUnlocked ? 0 : Math.max(0, 300 - elapsed),
    unlocked: isUnlocked
  };
}

async function startAssignmentTimer(studentId, courseId) {
  const { error } = await supabase
    .from('student_enrollments')
    .update({ assignment_started_at: new Date().toISOString() })
    .eq('student_id', studentId)
    .eq('course_id', courseId);

  if (error) throw error;
  return getOrCreateAssignmentTimer(studentId, courseId);
}

// --------------------------------------------------------------
// 9. RECENT ACTIVITY
// --------------------------------------------------------------

async function getRecentActivity(limit = 5) {
  const { data, error } = await supabase
    .from('course_progress')
    .select(`
      completed_at,
      users (full_name),
      courses (title)
    `)
    .eq('completed', true)
    .order('completed_at', { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data || []).map(item => ({
    completed_at: item.completed_at,
    full_name: item.users?.full_name || '',
    title: item.courses?.title || ''
  }));
}

// --------------------------------------------------------------
// 10. PLACEHOLDER FUNCTIONS (for compatibility)
// --------------------------------------------------------------

async function seedAdmin() {
  // Admin seeding is handled via Supabase SQL or manual insert
  console.log('Admin seeding is handled manually or via SQL.');
}

async function seedDefaultCourses() {
  // Default courses are seeded via SQL or manually
  console.log('Default courses seeding is handled manually or via SQL.');
}

async function yieldToEventLoop() {
  return new Promise(resolve => setImmediate(resolve));
}

// --------------------------------------------------------------
// 11. EXPORTS
// --------------------------------------------------------------

module.exports = {
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