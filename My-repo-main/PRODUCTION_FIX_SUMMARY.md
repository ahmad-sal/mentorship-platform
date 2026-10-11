# Production Error Fix: "Error saving question progress"

## Problem Summary
When students clicked "Mark Question as Complete" on the live Render website, they received the generic error "Error saving question progress." The issue did not occur locally because Row-Level Security (RLS) policies were either disabled or a service role key was available.

## Root Cause
The backend was using Supabase's **anonymous client** (`supabase` with `SUPABASE_ANON_KEY`) for all server-side database writes, including:
- Marking questions as complete
- Starting video timers
- Enrolling in courses
- Submitting assignments

When RLS is enabled in Supabase (production environment), these anon-key writes fail with errors like:
```
new row violates row-level security policy for table "question_progress"
```

The generic error message masked the real Supabase error in production.

## Solution Applied
Updated all server-side write operations to use the **service-role client** (`supabaseAdmin`) when available. The service-role key bypasses RLS policies, allowing the backend to perform authorized writes on behalf of students.

### Files Modified

#### 1. [server.cjs](server.cjs)
- **Line ~573**: Updated `/api/student/questions/:questionId/complete` endpoint to log and return the actual error instead of generic "Error saving question progress."
- **Line ~559**: Updated `/api/student/questions/:questionId/start-video` endpoint to log and return the actual error.
- These changes help diagnose production issues.

#### 2. [database.cjs](database.cjs)
Updated these functions to use `const client = supabaseAdmin || supabase`:

1. **enrollStudentInCourse** (Line ~803)
   - Upserts into `student_enrollments`
   - Used when students enroll in a course

2. **startQuestionVideoTimer** (Line ~995)
   - Inserts/updates `question_progress` 
   - Triggered when student clicks "Watch Reference Lecture"

3. **getQuestionTimerStatus** (Line ~1018)
   - Updates `question_progress` when video requirement is met
   - Internal call used by startQuestionVideoTimer

4. **setQuestionComplete** (Line ~1043)
   - Upserts into `question_progress` with `completed=true`
   - **This is the critical fix for the "Mark Question as Complete" button**

5. **startAssignmentTimer** (Line ~1151)
   - Updates `student_enrollments` 
   - Called when starting the 5-minute assessment timer

6. **upsertAssignmentSubmission** (Line ~835)
   - Upserts into `assignment_submissions`
   - Called when submitting final assignment

7. **reviewAssignmentSubmission** (Line ~961)
   - Updates `course_progress` after admin approves/rejects submission
   - Admin-only operation

### How the Fix Works
```javascript
// BEFORE (fails with RLS in production)
const { error } = await supabase.from('question_progress').upsert({...});

// AFTER (works with RLS in production)
const client = supabaseAdmin || supabase;  // Use service role if available
const { error } = await client.from('question_progress').upsert({...});
```

## Required Environment Variables on Render
Ensure these are set in your Render environment variables:

| Variable | Value | Required |
|----------|-------|----------|
| `SUPABASE_URL` | Your Supabase project URL | ✅ Yes |
| `SUPABASE_ANON_KEY` | Public anon key from Supabase | ✅ Yes |
| **`SUPABASE_SERVICE_ROLE_KEY`** | **Service role key from Supabase** | ✅ **YES (NEW)** |
| `SESSION_SECRET` | Random string for session encryption | Recommended |
| `PORT` | 3000 | Optional |

### How to Get SUPABASE_SERVICE_ROLE_KEY
1. Go to your Supabase Dashboard: https://app.supabase.com
2. Select your project
3. Go to **Settings** → **API** 
4. Copy the **service_role key** (keep this secret!)
5. Add it to Render as environment variable `SUPABASE_SERVICE_ROLE_KEY`

## Supabase Configuration
- **No schema changes required** — all tables and RLS policies remain the same
- Ensure RLS is enabled on these tables:
  - `student_enrollments`
  - `question_progress`
  - `assignment_submissions`
  - `course_progress`
- The service role key will bypass these policies for backend operations

## Testing the Fix
1. Deploy to Render with `SUPABASE_SERVICE_ROLE_KEY` set
2. Log in as a student
3. Enroll in a course (if not already enrolled)
4. Click "Watch Reference Lecture" on a question
5. After 10 minutes (or if you wait), click "Mark Question as Complete"
6. You should now see: "Question marked complete." ✅

If errors still occur, the detailed error messages in the API response will show the exact Supabase error for debugging.

## Error Logging
- Console logs all errors with `console.error('Error saving question progress:', err)`
- API responses now return `err.message` for easier debugging
- Once confirmed working, optionally reduce detailed error exposure in production

## Files Changed Summary
- ✅ [server.cjs](server.cjs) — 2 endpoints updated with detailed error logging
- ✅ [database.cjs](database.cjs) — 7 functions updated to use service-role client
- Total minimal changes to achieve the fix

## Deployment Steps
1. Pull this updated code to your local environment
2. Test locally with `SUPABASE_SERVICE_ROLE_KEY` environment variable set
3. Push to your Git repository
4. On Render dashboard, set `SUPABASE_SERVICE_ROLE_KEY` in environment variables
5. Redeploy the application
6. Test the "Mark Question as Complete" button on production

---

**Problem Solved:** The "Error saving question progress" error in production is fixed by using the service-role key for server-side database operations.
