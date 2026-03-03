const Student = require('../models/Student');
const SGPA = require('../models/SGPA');
const Score = require('../models/Score');
const OpenAI = require('openai');

const GRADE_ORDER = ['O', 'A+', 'A', 'B+', 'B', 'C', 'D', 'F', 'AB'];
const TOP_PERCENTILE_THRESHOLD = 90;
const BOTTOM_PERCENTILE_THRESHOLD = 30;

/* ── Nebius LLM client (lazy-init to avoid crash when env is missing) ── */
let _client = null;
const getClient = () => {
  if (!_client) {
    _client = new OpenAI({
      baseURL: 'https://api.tokenfactory.nebius.com/v1/',
      apiKey: process.env.NEBIUS_API_KEY,
    });
  }
  return _client;
};

const SYSTEM_PROMPT = `You are ResultHub Wrapped — a witty, Gen-Z-friendly AI narrator that turns a student's semester performance data into a short, fun, Spotify-Wrapped-style story.

Rules:
1. Keep the narrative between 80-150 words.
2. Use 2-3 relevant emojis naturally (don't overdo it).
3. Reference specific subjects, grades, and percentile numbers from the data.
4. Match the tone to the student's academic personality type provided.
5. Include one motivational or humorous closing line.
6. Do NOT hallucinate data — only reference what is provided.
7. Write in second person ("you").
8. Return ONLY the narrative text, no headings or markdown.`;

/**
 * Build the user message that feeds academic data to the LLM.
 */
const buildUserMessage = (data) => {
  const subjectLines = data.subject_rankings
    .map(
      (s) =>
        `  - ${s.subject_code}: grade ${s.grade}, marks ${s.marks}, percentile ${s.percentile ?? 'N/A'}`,
    )
    .join('\n');

  const sgpaTrendLine =
    data.sgpa_trend && data.sgpa_change !== null
      ? `SGPA trend: ${data.sgpa_trend} (${data.sgpa_change > 0 ? '+' : ''}${data.sgpa_change})`
      : 'SGPA trend: N/A';

  return `Student: ${data.name} (${data.rollNo})
Branch: ${data.branch_code} | Year: ${data.year_of_study} | Semester: ${data.semester}
SGPA: ${data.sgpa ?? 'N/A'}
${sgpaTrendLine}
Batch percentile: ${data.batch_percentile ?? 'N/A'}%
Academic personality: ${data.personality_emoji} ${data.academic_personality}

Best grade: ${data.best_grade.subject_code} — ${data.best_grade.grade} (${data.best_grade.marks} marks)
Toughest subject: ${data.toughest_subject.subject_code} — ${data.toughest_subject.grade} (${data.toughest_subject.marks} marks)

Subject-wise breakdown:
${subjectLines}

Generate a personalized Wrapped narrative for this semester.`;
};

/**
 * Call the Nebius LLM and return the generated narrative.
 * Returns null on failure so the API still responds with data.
 */
const generateWrappedNarrative = async (wrappedData) => {
  try {
    const response = await getClient().chat.completions.create({
      model: 'meta-llama/Llama-3.3-70B-Instruct-fast',
      max_tokens: 512,
      temperature: 0.8,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: buildUserMessage(wrappedData),
            },
          ],
        },
      ],
    });

    return response.choices?.[0]?.message?.content?.trim() || null;
  } catch (error) {
    console.error('LLM narrative generation failed:', error.message);
    return null;
  }
};

const gradeRank = (grade) => {
  const idx = GRADE_ORDER.indexOf(grade);
  return idx === -1 ? GRADE_ORDER.length : idx;
};

/**
 * Determine an academic personality label based on SGPA history and grade spread.
 */
const determinePersonality = (allSgpa, currentSemester, currentSgpa, subjectRankings) => {
  if (currentSgpa == null) return { type: 'The Mystery', emoji: '🔮' };

  if (currentSgpa >= 9.5) return { type: 'The Topper', emoji: '👑' };
  if (currentSgpa >= 9.0) return { type: 'The Perfectionist', emoji: '🎯' };

  const sgpas = allSgpa
    .filter((s) => Number(s.semester) <= currentSemester)
    .map((s) => s.sgpa);

  if (sgpas.length >= 2) {
    const isRising = sgpas.every((val, i) => i === 0 || val > sgpas[i - 1]);
    const isFalling = sgpas.every((val, i) => i === 0 || val < sgpas[i - 1]);

    if (sgpas.length >= 3 && !isRising && !isFalling) {
      const prevMin = Math.min(...sgpas.slice(0, -1));
      if (currentSgpa > prevMin) return { type: 'The Comeback Kid', emoji: '🔥' };
    }

    if (isRising) return { type: 'The Steady Climber', emoji: '🦊' };
    if (isFalling) return { type: 'The Chill One', emoji: '😎' };

    const range = Math.max(...sgpas) - Math.min(...sgpas);
    if (range <= 0.5) return { type: 'The Consistent Performer', emoji: '🧠' };
  }

  const uniqueGrades = [...new Set(subjectRankings.map((s) => s.grade))];
  if (uniqueGrades.length >= 4) return { type: 'The Explorer', emoji: '🗺️' };

  if (currentSgpa >= 8.0) return { type: 'The Balanced Achiever', emoji: '⚖️' };
  if (currentSgpa >= 7.0) return { type: 'The Steady Player', emoji: '🎮' };
  return { type: 'The Underdog', emoji: '💪' };
};

/**
 * GET /api/wrapped/:rollNo/:semester
 * Returns a "Spotify Wrapped"-style academic summary for a student's semester.
 */
const getWrapped = async (req, res, next) => {
  try {
    const { rollNo } = req.params;
    const semesterNum = parseInt(req.params.semester, 10);

    const student = await Student.findOne({ rollNo }, '-__v -createdAt -updatedAt').lean();
    if (!student) {
      return res.status(404).json({
        success: false,
        data: null,
        message: `Student with roll number '${rollNo}' not found`,
      });
    }

    const semesterQuery = { $in: [semesterNum, String(semesterNum)] };

    const [scores, allSgpa] = await Promise.all([
      Score.collection
        .find({ roll_no: rollNo, semester: semesterQuery }, { projection: { __v: 0, createdAt: 0, updatedAt: 0 } })
        .toArray(),
      SGPA.collection
        .find({ roll_no: rollNo }, { projection: { __v: 0, createdAt: 0, updatedAt: 0 } })
        .sort({ semester: 1 })
        .toArray(),
    ]);

    if (scores.length === 0) {
      return res.status(404).json({
        success: false,
        data: null,
        message: `No records found for semester ${semesterNum}`,
      });
    }

    const semesterSgpa = allSgpa.find((s) => Number(s.semester) === semesterNum);
    const currentSgpa = semesterSgpa ? semesterSgpa.sgpa : null;

    /* ── Best & toughest grade ────────────────────────────────────── */
    const bestScore = scores.reduce(
      (best, s) => (gradeRank(s.grade) < gradeRank(best.grade) ? s : best),
      scores[0],
    );
    const toughestScore = scores.reduce(
      (worst, s) => (gradeRank(s.grade) > gradeRank(worst.grade) ? s : worst),
      scores[0],
    );

    /* ── SGPA trend ──────────────────────────────────────────────── */
    let sgpaChange = null;
    let sgpaTrend = null;
    if (semesterNum > 1 && currentSgpa !== null) {
      const prevSgpa = allSgpa.find((s) => Number(s.semester) === semesterNum - 1);
      if (prevSgpa) {
        sgpaChange = parseFloat((currentSgpa - prevSgpa.sgpa).toFixed(2));
        if (sgpaChange > 0) sgpaTrend = 'UP';
        else if (sgpaChange < 0) sgpaTrend = 'DOWN';
        else sgpaTrend = 'STABLE';
      }
    }

    /* ── Batch percentile for this semester ───────────────────────── */
    let batchPercentile = null;
    if (currentSgpa !== null) {
      const batchRollNos = (
        await Student.find({ year_of_study: student.year_of_study }, 'rollNo').lean()
      ).map((s) => s.rollNo);

      const batchSgpas = await SGPA.collection
        .find(
          { roll_no: { $in: batchRollNos }, semester: semesterQuery },
          { projection: { sgpa: 1 } },
        )
        .toArray();

      if (batchSgpas.length > 0) {
        const below = batchSgpas.filter((s) => s.sgpa < currentSgpa).length;
        batchPercentile = Math.round((below / batchSgpas.length) * 100);
      }
    }

    /* ── Per-subject percentile rankings ─────────────────────────── */
    const subjectCodes = scores.map((s) => s.subject_code);
    const allSubjectScores = await Score.collection
      .find(
        { subject_code: { $in: subjectCodes }, semester: semesterQuery },
        { projection: { subject_code: 1, marks: 1 } },
      )
      .toArray();

    const subjectScoresMap = {};
    for (const s of allSubjectScores) {
      if (!subjectScoresMap[s.subject_code]) subjectScoresMap[s.subject_code] = [];
      subjectScoresMap[s.subject_code].push(s);
    }

    const subjectRankings = [];
    const topSubjects = [];
    const bottomSubjects = [];

    for (const score of scores) {
      const pool = subjectScoresMap[score.subject_code] || [];
      const totalInSubject = pool.length;
      const below = pool.filter((s) => Number(s.marks) < Number(score.marks)).length;
      const percentile = totalInSubject > 0 ? Math.round((below / totalInSubject) * 100) : null;

      const ranking = {
        subject_code: score.subject_code,
        grade: score.grade,
        marks: score.marks,
        percentile,
        total_students: totalInSubject,
      };
      subjectRankings.push(ranking);

      if (percentile !== null && percentile >= TOP_PERCENTILE_THRESHOLD) topSubjects.push(ranking);
      if (percentile !== null && percentile <= BOTTOM_PERCENTILE_THRESHOLD) bottomSubjects.push(ranking);
    }

    /* ── Academic personality ─────────────────────────────────────── */
    const personality = determinePersonality(allSgpa, semesterNum, currentSgpa, subjectRankings);

    /* ── Build response data ──────────────────────────────────────── */
    const wrappedData = {
      rollNo: student.rollNo,
      name: student.name,
      branch_code: student.branch_code,
      year_of_study: student.year_of_study,
      semester: semesterNum,
      subjects_count: scores.length,
      best_grade: {
        subject_code: bestScore.subject_code,
        grade: bestScore.grade,
        marks: bestScore.marks,
      },
      toughest_subject: {
        subject_code: toughestScore.subject_code,
        grade: toughestScore.grade,
        marks: toughestScore.marks,
      },
      sgpa: currentSgpa,
      sgpa_change: sgpaChange,
      sgpa_trend: sgpaTrend,
      batch_percentile: batchPercentile,
      academic_personality: personality.type,
      personality_emoji: personality.emoji,
      top_subjects: topSubjects,
      bottom_subjects: bottomSubjects,
      subject_rankings: subjectRankings,
    };

    /* ── LLM-generated narrative ──────────────────────────────────── */
    const narrative = await generateWrappedNarrative(wrappedData);
    wrappedData.ai_narrative = narrative;

    return res.json({
      success: true,
      data: wrappedData,
      message: 'Semester wrapped generated successfully',
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getWrapped };
