# ResultHub NSUT — Backend API

A Node.js/Express REST API for the NSUT university result portal, backed by MongoDB via Mongoose.

---

## Table of Contents

- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Data Models](#data-models)
- [API Reference](#api-reference)
  - [Health Check](#health-check)
  - [GET /api/students](#get-apistudents)
  - [GET /api/students/:rollNo](#get-apistudentsrollno)
  - [GET /api/students/:rollNo/twins](#get-apistudentsrollnotwins)
  - [GET /api/stats](#get-apistats)
  - [GET /api/filter](#get-apifilter)
  - [GET /api/subjects/difficulty](#get-apisubjectsdifficulty)
  - [GET /api/wrapped/:rollNo/:semester](#get-apiwrappedrollnosemester)
- [Rate Limiting](#rate-limiting)
- [Response Format](#response-format)
- [Error Handling](#error-handling)

---

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB 6+ (local or Atlas)

### Installation

```bash
# Clone the repository
git clone https://github.com/sujallchaudhary/resulthubnsut.git
cd resulthubnsut

# Install dependencies
npm install

# Copy and edit environment variables
cp .env.example .env
# Edit .env and set MONGODB_URI and NEBIUS_API_KEY

# Start the server
npm start

# Development (auto-restart on change)
npm run dev
```

### Environment Variables

| Variable          | Default      | Description                                      |
|-------------------|--------------|--------------------------------------------------|
| `MONGODB_URI`     | *(required)* | MongoDB connection string                        |
| `PORT`            | `3000`       | HTTP port the server listens on                  |
| `NEBIUS_API_KEY`  | *(optional)* | Nebius API key for AI narrative in `/api/wrapped`|

---

## Project Structure

```
/
├── src/
│   ├── models/
│   │   ├── Department.js      # Department/branch-level statistics
│   │   ├── Student.js         # Individual student records
│   │   ├── SGPA.js            # Semester-wise GPA records
│   │   └── Score.js           # Subject-wise score records
│   ├── routes/
│   │   ├── students.js        # /api/students routes
│   │   ├── stats.js           # /api/stats routes
│   │   ├── filter.js          # /api/filter routes
│   │   ├── subjects.js        # /api/subjects routes
│   │   └── wrapped.js         # /api/wrapped routes
│   ├── controllers/
│   │   ├── studentController.js
│   │   ├── statsController.js
│   │   ├── filterController.js
│   │   ├── subjectController.js
│   │   ├── twinsController.js
│   │   └── wrappedController.js
│   ├── cache/
│   │   └── twinsDataStore.js  # In-memory store for twins computation
│   ├── middleware/
│   │   └── rateLimits.js      # Per-endpoint rate limiters
│   └── db.js                  # MongoDB connection helper
├── server.js                  # Express app entry point
├── package.json
├── Dockerfile
└── .env.example
```

---

## Data Models

### Department

```json
{
  "year": "2017",
  "departmentCode": "UEC",
  "Name": "UEC",
  "AverageCGPA": 3.8,
  "highestCGPA": 3.8,
  "lowestCGPA": 3.8,
  "medianCGPA": 3.8,
  "modeCGPA": 3.8,
  "branchSize": 1
}
```

### Student

```json
{
  "rollNo": "2022UBT1001",
  "name": "RAHUL SHARMA",
  "branch_code": "UBT",
  "cgpa": 9.45,
  "rank": 1,
  "credits_completed": 172,
  "percentile": 99.8,
  "year_of_study": "2022",
  "branch_rank": 1
}
```

### SGPA

```json
{
  "roll_no": "2022UBT1001",
  "semester": 2,
  "sgpa": 9.1,
  "credits_registered": 24,
  "credits_secured": 24
}
```

### Score

```json
{
  "roll_no": "2022UBT1001",
  "subject_code": "BTCHC02",
  "branch_code": "UBT",
  "grade": "C",
  "marks": 5,
  "semester": 2
}
```

---

## API Reference

### Health Check

**`GET /health`**

```bash
curl http://localhost:3000/health
```

**Response:**

```json
{
  "success": true,
  "message": "Server is running"
}
```

---

### GET /api/students

Returns a paginated list of all students with semester-wise SGPA data, sorted by overall rank ascending.

**Query Parameters:**

| Parameter | Type    | Default | Description         |
|-----------|---------|---------|---------------------|
| `page`    | integer | `1`     | Page number (min 1) |

Page size is fixed at **20** per page.

**Example Request:**

```bash
curl "http://localhost:3000/api/students?page=1"
```

**Example Response:**

```json
{
  "success": true,
  "data": [
    {
      "rollNo": "2022UBT1001",
      "name": "RAHUL SHARMA",
      "branch_code": "UBT",
      "year_of_study": "2022",
      "cgpa": 9.45,
      "rank": 1,
      "branch_rank": 1,
      "percentile": 99.8,
      "credits_completed": 172,
      "semesters": [
        { "semester": 1, "sgpa": 9.8, "credits_registered": 24, "credits_secured": 24 },
        { "semester": 2, "sgpa": 9.1, "credits_registered": 24, "credits_secured": 24 }
      ]
    }
  ],
  "message": "Students retrieved successfully",
  "pagination": { "total": 1240, "page": 1, "limit": 20, "totalPages": 62 }
}
```

---

### GET /api/students/:rollNo

Returns the full profile of a single student including semester-wise SGPA and subject-wise scores grouped by semester, plus aggregate grade stats.

**Path Parameters:**

| Parameter | Type   | Description         |
|-----------|--------|---------------------|
| `rollNo`  | string | Student roll number |

**Example Request:**

```bash
curl "http://localhost:3000/api/students/2022UBT1001"
```

**Example Response:**

```json
{
  "success": true,
  "data": {
    "rollNo": "2022UBT1001",
    "name": "RAHUL SHARMA",
    "branch_code": "UBT",
    "year_of_study": "2022",
    "cgpa": 9.45,
    "rank": 1,
    "branch_rank": 1,
    "percentile": 99.8,
    "credits_completed": 172,
    "semesters": [
      {
        "semester": 1,
        "sgpa": 9.8,
        "credits_registered": 24,
        "credits_secured": 24,
        "subjects": [
          { "subject_code": "BTCHC01", "grade": "O", "marks": 10 },
          { "subject_code": "BTMAC01", "grade": "A+", "marks": 9 }
        ]
      }
    ],
    "stats": {
      "total_subjects": 48,
      "grade_distribution": { "O": 10, "A+": 18, "A": 14, "B+": 6 },
      "highest_grade_subjects": [
        { "subject_code": "BTCHC01", "grade": "O", "semester": 1 }
      ],
      "total_credits_registered": 172,
      "total_credits_secured": 172
    }
  },
  "message": "Student retrieved successfully"
}
```

**404 Response:**

```json
{
  "success": false,
  "data": null,
  "message": "Student with roll number '2022UBT9999' not found"
}
```

---

### GET /api/students/:rollNo/twins

Finds **Academic Twins** — students whose academic performance most closely mirrors the given student's. Uses a weighted multi-dimensional similarity algorithm comparing SGPA trends, subject marks, CGPA, subject overlap, and grade distribution.

Results include up to 30% from different batch years for diversity.

**Path Parameters:**

| Parameter | Type   | Description         |
|-----------|--------|---------------------|
| `rollNo`  | string | Student roll number |

**Query Parameters:**

| Parameter | Type    | Default | Description                          |
|-----------|---------|---------|--------------------------------------|
| `limit`   | integer | `10`    | Number of twins to return (max `20`) |

**Example Request:**

```bash
curl "http://localhost:3000/api/students/2022UBT1001/twins?limit=5"
```

**Example Response:**

```json
{
  "success": true,
  "data": {
    "student": {
      "rollNo": "2022UBT1001",
      "name": "RAHUL SHARMA",
      "branch_code": "UBT",
      "year_of_study": "2022",
      "cgpa": 9.45
    },
    "twins": [
      {
        "rollNo": "2021UBT1045",
        "name": "PRIYA VERMA",
        "branch_code": "UBT",
        "year_of_study": "2021",
        "cgpa": 9.31,
        "matchPercentage": 91.4,
        "sameDepartment": true,
        "sameYear": false,
        "commonSubjectsCount": 18,
        "commonSemestersCount": 4,
        "similarity": {
          "sgpa": 88.2,
          "subjects": 93.1,
          "cgpa": 95.0,
          "subjectOverlap": 75.0,
          "gradeDistribution": 89.5
        },
        "sharedStrongSubjects": ["BTCHC01", "BTMAC01"],
        "sharedWeakSubjects": ["BTECC03"],
        "sgpaTrend": [9.8, 9.1, 9.4, 9.2]
      }
    ],
    "poolStats": {
      "totalCompared": 312,
      "sameDepartment": 198,
      "otherDepartment": 114,
      "sameYear": 59,
      "differentYear": 253
    }
  },
  "message": "Academic twins found successfully"
}
```

---

### GET /api/stats

Returns aggregate statistics: overall figures, department-wise breakdowns, year/batch-wise breakdowns, CGPA distribution buckets, top 10 students, semester-wise average SGPA, and global grade distribution.

**Example Request:**

```bash
curl "http://localhost:3000/api/stats"
```

**Example Response:**

```json
{
  "success": true,
  "data": {
    "overall": {
      "totalStudents": 1240,
      "averageCGPA": 7.2341,
      "highestCGPA": 10.0,
      "lowestCGPA": 2.1
    },
    "departmentStats": [
      {
        "year": "2022",
        "departmentCode": "UBT",
        "Name": "UBT",
        "AverageCGPA": 7.8,
        "highestCGPA": 10.0,
        "lowestCGPA": 4.2,
        "medianCGPA": 7.9,
        "modeCGPA": 8.0,
        "branchSize": 60
      }
    ],
    "yearStats": [
      { "year": "2022", "totalStudents": 320, "averageCGPA": 7.5612, "highestCGPA": 10.0, "lowestCGPA": 3.2 }
    ],
    "cgpaDistribution": [
      { "range": "0-4", "count": 12 },
      { "range": "4-5", "count": 45 },
      { "range": "5-6", "count": 98 },
      { "range": "6-7", "count": 210 },
      { "range": "7-8", "count": 390 },
      { "range": "8-9", "count": 380 },
      { "range": "9-10", "count": 105 }
    ],
    "top10Students": [
      { "rollNo": "2022UBT1001", "name": "RAHUL SHARMA", "branch_code": "UBT", "year_of_study": "2022", "cgpa": 9.45, "rank": 1, "percentile": 99.8 }
    ],
    "semesterAverages": [
      { "semester": 1, "averageSGPA": 8.1234, "studentCount": 1240 },
      { "semester": 2, "averageSGPA": 7.9876, "studentCount": 1185 }
    ],
    "gradeDistribution": { "O": 5600, "A+": 3210, "A": 4820, "B+": 1980, "B": 2100, "C": 870, "D": 340, "F": 120 }
  },
  "message": "Statistics retrieved successfully"
}
```

---

### GET /api/filter

Filters students by year, branch, or name/roll-number search, with dynamic rank recalculation within the filtered set (highest CGPA in the filtered set gets `filtered_rank: 1`).

**Query Parameters:**

| Parameter | Type    | Description                                                               |
|-----------|---------|---------------------------------------------------------------------------|
| `year`    | string  | Batch/enrollment year (e.g. `2022`)                                       |
| `branch`  | string  | Comma-separated branch codes (e.g. `UBT,UEC`)                            |
| `query`   | string  | Search by roll number or name (case-insensitive, partial match)           |
| `page`    | integer | Page number (default `1`)                                                 |

Page size is fixed at **20** per page. All parameters are optional and combinable.

**Example Requests:**

```bash
# Filter by year
curl "http://localhost:3000/api/filter?year=2022"

# Filter by branch
curl "http://localhost:3000/api/filter?branch=UBT"

# Filter by year + multiple branches
curl "http://localhost:3000/api/filter?year=2022&branch=UBT,UEC"

# Search by name
curl "http://localhost:3000/api/filter?query=RAHUL"
```

**Example Response:**

```json
{
  "success": true,
  "data": [
    {
      "rollNo": "2022UBT1001",
      "name": "RAHUL SHARMA",
      "branch_code": "UBT",
      "year_of_study": "2022",
      "cgpa": 9.45,
      "overall_rank": 3,
      "branch_rank": 1,
      "filtered_rank": 1,
      "percentile": 99.8,
      "credits_completed": 172,
      "semesters": [
        { "semester": 1, "sgpa": 9.8, "credits_registered": 24, "credits_secured": 24 }
      ]
    }
  ],
  "message": "Filtered students retrieved successfully",
  "pagination": { "total": 320, "page": 1, "limit": 20, "totalPages": 16 },
  "appliedFilters": { "year": "2022", "branch": "UBT,UEC", "query": null }
}
```

---

### GET /api/subjects/difficulty

Returns a Subject Difficulty Map built from score records. Each subject entry includes average marks, total students enrolled, grade distribution, a difficulty classification, and a **killer** flag when more than 30% of students received grade C, D, or F.

Results are sorted by **total students descending** (most popular subjects first). The summary block always reflects the hardest and easiest subjects by average marks regardless of page.

**Query Parameters:**

| Parameter  | Type    | Description                                                     |
|------------|---------|-----------------------------------------------------------------|
| `rollNo`   | string  | Auto-resolves the student's branch and filters to that department only |
| `semester` | integer | Filter by semester number                                       |
| `branch`   | string  | Comma-separated branch codes (e.g. `UBT,UEC`). Ignored if `rollNo` is provided |
| `page`     | integer | Page number (default `1`)                                       |

Page size is fixed at **20** per page. All parameters are optional.

> **Tip:** Use `rollNo` to see only the subjects relevant to a specific student's department.

**Example Requests:**

```bash
# All subjects for a student's branch + semester
curl "http://localhost:3000/api/subjects/difficulty?rollNo=2024UCA1953&semester=3"

# Explicit branch filter
curl "http://localhost:3000/api/subjects/difficulty?branch=UBT&semester=2"

# All subjects, all branches
curl "http://localhost:3000/api/subjects/difficulty"
```

**Example Response:**

```json
{
  "success": true,
  "data": {
    "subjects": [
      {
        "subject_code": "CACSC301",
        "avg_marks": 7.4,
        "total_students": 320,
        "difficulty": "Medium",
        "is_killer": false,
        "low_grade_percentage": 18.75,
        "grade_distribution": { "O": 20, "A+": 60, "A": 80, "B+": 70, "B": 50, "C": 30, "D": 10 }
      },
      {
        "subject_code": "CAECC203",
        "avg_marks": 5.1,
        "total_students": 280,
        "difficulty": "Hard",
        "is_killer": true,
        "low_grade_percentage": 38.2,
        "grade_distribution": { "A": 40, "B+": 50, "B": 60, "C": 70, "D": 30, "F": 7 }
      }
    ],
    "summary": {
      "total_subjects": 12,
      "hardest_subject": { "subject_code": "CAECC203", "avg_marks": 5.1, "difficulty": "Hard" },
      "easiest_subject": { "subject_code": "VANH0301", "avg_marks": 8.9, "difficulty": "Easy" },
      "killer_count": 3
    }
  },
  "message": "Subject difficulty map retrieved successfully",
  "pagination": { "total": 12, "page": 1, "limit": 20, "totalPages": 1 },
  "appliedFilters": { "semester": "3", "branch": "UCA", "rollNo": "2024UCA1953" }
}
```

**Difficulty Classification:**

| Average Marks | Label    |
|---------------|----------|
| ≥ 8           | Easy     |
| ≥ 6           | Medium   |
| < 6           | Hard     |

---

### GET /api/wrapped/:rollNo/:semester

Returns a **Spotify Wrapped**-style academic summary for a student's semester. Includes best/toughest subject, SGPA trend, batch percentile, per-subject percentiles, an academic personality label, and an AI-generated narrative (powered by Nebius LLM — requires `NEBIUS_API_KEY`).

**Path Parameters:**

| Parameter  | Type    | Description                  |
|------------|---------|------------------------------|
| `rollNo`   | string  | Student roll number          |
| `semester` | integer | Semester number (min `1`)    |

**Example Request:**

```bash
curl "http://localhost:3000/api/wrapped/2024UCA1953/3"
```

**Example Response:**

```json
{
  "success": true,
  "data": {
    "rollNo": "2024UCA1953",
    "name": "SUJAL CHAUDHARY",
    "branch_code": "UCA",
    "year_of_study": "2024",
    "semester": 3,
    "subjects_count": 7,
    "best_grade": { "subject_code": "VANH0301", "grade": "A+", "marks": 9 },
    "toughest_subject": { "subject_code": "CACSC303", "grade": "B", "marks": 6 },
    "sgpa": 7.09,
    "sgpa_change": 0.09,
    "sgpa_trend": "UP",
    "batch_percentile": 52,
    "academic_personality": "The Steady Player",
    "personality_emoji": "🎮",
    "top_subjects": [
      { "subject_code": "VANH0301", "grade": "A+", "marks": 9, "percentile": 91, "total_students": 320 }
    ],
    "bottom_subjects": [],
    "subject_rankings": [
      { "subject_code": "CACSC301", "grade": "A", "marks": 8, "percentile": 68, "total_students": 318 },
      { "subject_code": "VANH0301", "grade": "A+", "marks": 9, "percentile": 91, "total_students": 320 }
    ],
    "ai_narrative": "Semester 3 was your comeback arc 🎮 You pushed your SGPA up to 7.09, placing you in the 52nd percentile of your batch. VANH0301 was your crown jewel — top 9% of students. Keep that momentum going!"
  },
  "message": "Semester wrapped generated successfully"
}
```

**Academic Personality Types:**

| Personality            | Condition                                      |
|------------------------|------------------------------------------------|
| 👑 The Topper          | SGPA ≥ 9.5                                     |
| 🎯 The Perfectionist   | SGPA ≥ 9.0                                     |
| 🔥 The Comeback Kid    | SGPA above all previous lows (3+ semesters)   |
| 🦊 The Steady Climber  | Consistently rising SGPA                       |
| 😎 The Chill One       | Consistently falling SGPA                      |
| 🧠 The Consistent Performer | SGPA range ≤ 0.5 across semesters        |
| 🗺️ The Explorer        | 4+ different grade types                       |
| ⚖️ The Balanced Achiever | SGPA ≥ 8.0                                  |
| 🎮 The Steady Player   | SGPA ≥ 7.0                                     |
| 💪 The Underdog        | Everything else                                |

> `ai_narrative` is `null` when `NEBIUS_API_KEY` is not set or the LLM call fails. All other fields are always present.

**404 Response:**

```json
{
  "success": false,
  "data": null,
  "message": "No records found for semester 3"
}
```

---

## Rate Limiting

All API routes are protected per IP address over a rolling **15-minute window**. Exceeding a limit returns HTTP **429 Too Many Requests** with `RateLimit-*` headers.

| Endpoint                          | Limit / 15 min | Notes                                         |
|-----------------------------------|---------------|-----------------------------------------------|
| `GET /api/students`               | **30**        | Paginated — primary scraping vector           |
| `GET /api/filter`                 | **30**        | Paginated — primary scraping vector           |
| `GET /api/stats`                  | **20**        | Single aggregated payload                     |
| `GET /api/subjects/difficulty`    | **20**        | Aggregated payload                            |
| `GET /api/students/:rollNo`       | **60**        | Roll-number enumeration prevention            |
| `GET /api/wrapped/:rollNo/:semester` | **60**     | Per-profile lookup                            |
| `GET /api/students/:rollNo/twins` | **15**        | Computationally heavy                         |
| All other `/api/` routes          | **100**       | Global catch-all                              |

**429 Response:**

```json
{
  "success": false,
  "data": null,
  "message": "Too many list requests from this IP. Please wait 15 minutes before trying again."
}
```

---

## Response Format

All endpoints return a consistent JSON envelope:

```json
{
  "success": true,
  "data": {},
  "message": "Human-readable status message"
}
```

List endpoints additionally include:

```json
{
  "pagination": { "total": 1240, "page": 1, "limit": 20, "totalPages": 62 }
}
```

Filter-capable endpoints include:

```json
{
  "appliedFilters": { "semester": "3", "branch": "UCA", "rollNo": null }
}
```

`data` is `null` on all error responses.

---

## Error Handling

| HTTP Status | Description                             |
|-------------|-----------------------------------------|
| `200`       | Success                                 |
| `400`       | Validation error (invalid query params) |
| `404`       | Resource or route not found             |
| `429`       | Rate limit exceeded                     |
| `500`       | Internal server error                   |

**Validation Error Example:**

```json
{
  "success": false,
  "data": null,
  "message": "Validation error",
  "errors": [
    {
      "type": "field",
      "msg": "semester must be a positive integer",
      "path": "semester",
      "location": "query"
    }
  ]
}
```


---

## Table of Contents

- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Data Models](#data-models)
- [API Reference](#api-reference)
  - [Health Check](#health-check)
  - [GET /api/students](#get-apistudents)
  - [GET /api/students/:rollNo](#get-apistudentsrollno)
  - [GET /api/stats](#get-apistats)
  - [GET /api/filter](#get-apifilter)
  - [GET /api/subjects/difficulty](#get-apisubjectsdifficulty)
- [Rate Limiting](#rate-limiting)
- [Response Format](#response-format)
- [Error Handling](#error-handling)

---

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB 6+ (local or Atlas)

### Installation

```bash
# Clone the repository
git clone https://github.com/sujallchaudhary/resulthubnsut.git
cd resulthubnsut

# Install dependencies
npm install

# Copy and edit environment variables
cp .env.example .env
# Edit .env and set MONGODB_URI

# Start the server
npm start

# Development (auto-restart on change)
npm run dev
```

### Environment Variables

| Variable      | Default      | Description                     |
|---------------|--------------|---------------------------------|
| `MONGODB_URI` | *(required)* | MongoDB connection string       |
| `PORT`        | `3000`       | HTTP port the server listens on |

---

## Project Structure

```
/
├── src/
│   ├── models/
│   │   ├── Department.js     # Department/branch-level statistics
│   │   ├── Student.js        # Individual student records
│   │   ├── SGPA.js           # Semester-wise GPA records
│   │   └── Score.js          # Subject-wise score records
│   ├── routes/
│   │   ├── students.js       # /api/students routes
│   │   ├── stats.js          # /api/stats routes
│   │   ├── filter.js         # /api/filter routes
│   │   └── subjects.js       # /api/subjects routes
│   ├── controllers/
│   │   ├── studentController.js
│   │   ├── statsController.js
│   │   ├── filterController.js
│   │   └── subjectController.js
│   └── db.js                 # MongoDB connection helper
├── server.js                 # Express app entry point
├── package.json
├── .env.example
└── .gitignore
```

---

## Data Models

### Department

```json
{
  "year": "2017",
  "departmentCode": "UEC",
  "Name": "UEC",
  "AverageCGPA": 3.8,
  "highestCGPA": 3.8,
  "lowestCGPA": 3.8,
  "medianCGPA": 3.8,
  "modeCGPA": 3.8,
  "branchSize": 1
}
```

### Student

```json
{
  "rollNo": "2017UEC2038",
  "name": "SARAANSH",
  "branch_code": "UEC",
  "cgpa": 3.8,
  "rank": 1,
  "credits_completed": 20.0,
  "percentile": 100.0,
  "year_of_study": "2017",
  "branch_rank": 1
}
```

### SGPA

```json
{
  "roll_no": "2022UBT1001",
  "semester": 2,
  "sgpa": 5.67,
  "credits_registered": 24,
  "credits_secured": 24
}
```

### Score

```json
{
  "roll_no": "2022UBT1001",
  "subject_code": "BTCHC02",
  "branch_code": "UBT",
  "grade": "C",
  "marks": 5,
  "semester": 2
}
```

---

## API Reference

### Health Check

**`GET /health`**

```bash
curl http://localhost:3000/health
```

**Response:**

```json
{
  "success": true,
  "message": "Server is running"
}
```

---

### GET /api/students

Returns a paginated list of all students with semester-wise SGPA data.

**Query Parameters:**

| Parameter | Type    | Default | Description         |
|-----------|---------|---------|---------------------|
| `page`    | integer | `1`     | Page number (min 1) |

Page size is fixed at **20** per page.

**Example Request:**

```bash
curl "http://localhost:3000/api/students?page=1"
```

**Example Response:**

```json
{
  "success": true,
  "data": [
    {
      "rollNo": "2022UBT1001",
      "name": "RAHUL SHARMA",
      "branch_code": "UBT",
      "year_of_study": "2022",
      "cgpa": 9.45,
      "rank": 1,
      "branch_rank": 1,
      "percentile": 99.8,
      "credits_completed": 172,
      "semesters": [
        {
          "semester": 1,
          "sgpa": 9.8,
          "credits_registered": 24,
          "credits_secured": 24
        },
        {
          "semester": 2,
          "sgpa": 9.1,
          "credits_registered": 24,
          "credits_secured": 24
        }
      ]
    }
  ],
  "message": "Students retrieved successfully",
  "pagination": {
    "total": 1240,
    "page": 1,
    "limit": 20,
    "totalPages": 62
  }
}
```

---

### GET /api/students/:rollNo

Returns the full profile of a single student including semester-wise SGPA and subject-wise scores grouped by semester.

**Path Parameters:**

| Parameter | Type   | Description         |
|-----------|--------|---------------------|
| `rollNo`  | string | Student roll number |

**Example Request:**

```bash
curl "http://localhost:3000/api/students/2022UBT1001"
```

**Example Response:**

```json
{
  "success": true,
  "data": {
    "rollNo": "2022UBT1001",
    "name": "RAHUL SHARMA",
    "branch_code": "UBT",
    "year_of_study": "2022",
    "cgpa": 9.45,
    "rank": 1,
    "branch_rank": 1,
    "percentile": 99.8,
    "credits_completed": 172,
    "semesters": [
      {
        "semester": 1,
        "sgpa": 9.8,
        "credits_registered": 24,
        "credits_secured": 24,
        "subjects": [
          { "subject_code": "BTCHC01", "grade": "O", "marks": 10 },
          { "subject_code": "BTMAC01", "grade": "A+", "marks": 9 }
        ]
      },
      {
        "semester": 2,
        "sgpa": 9.1,
        "credits_registered": 24,
        "credits_secured": 24,
        "subjects": [
          { "subject_code": "BTCHC02", "grade": "A", "marks": 8 }
        ]
      }
    ],
    "stats": {
      "total_subjects": 48,
      "grade_distribution": {
        "O": 10,
        "A+": 18,
        "A": 14,
        "B+": 6
      },
      "highest_grade_subjects": [
        { "subject_code": "BTCHC01", "grade": "O", "semester": 1 }
      ],
      "total_credits_registered": 172,
      "total_credits_secured": 172
    }
  },
  "message": "Student retrieved successfully"
}
```

**404 Response:**

```json
{
  "success": false,
  "data": null,
  "message": "Student with roll number '2022UBT9999' not found"
}
```

---

### GET /api/stats

Returns aggregate statistics: overall figures, department-wise breakdowns, year/batch-wise breakdowns, CGPA distribution, top 10 students, semester-wise average SGPA, and grade distribution.

**Example Request:**

```bash
curl "http://localhost:3000/api/stats"
```

**Example Response:**

```json
{
  "success": true,
  "data": {
    "overall": {
      "totalStudents": 1240,
      "averageCGPA": 7.2341,
      "highestCGPA": 10.0,
      "lowestCGPA": 2.1
    },
    "departmentStats": [
      {
        "year": "2022",
        "departmentCode": "UBT",
        "Name": "UBT",
        "AverageCGPA": 7.8,
        "highestCGPA": 10.0,
        "lowestCGPA": 4.2,
        "medianCGPA": 7.9,
        "modeCGPA": 8.0,
        "branchSize": 60
      }
    ],
    "yearStats": [
      {
        "year": "2022",
        "totalStudents": 320,
        "averageCGPA": 7.5612,
        "highestCGPA": 10.0,
        "lowestCGPA": 3.2
      }
    ],
    "cgpaDistribution": [
      { "range": "0-4",  "count": 12 },
      { "range": "4-5",  "count": 45 },
      { "range": "5-6",  "count": 98 },
      { "range": "6-7",  "count": 210 },
      { "range": "7-8",  "count": 390 },
      { "range": "8-9",  "count": 380 },
      { "range": "9-10", "count": 105 }
    ],
    "top10Students": [
      {
        "rollNo": "2022UBT1001",
        "name": "RAHUL SHARMA",
        "branch_code": "UBT",
        "year_of_study": "2022",
        "cgpa": 9.45,
        "rank": 1,
        "percentile": 99.8
      }
    ],
    "semesterAverages": [
      { "semester": 1, "averageSGPA": 8.1234, "studentCount": 1240 },
      { "semester": 2, "averageSGPA": 7.9876, "studentCount": 1185 }
    ],
    "gradeDistribution": {
      "A": 4820,
      "A+": 3210,
      "B": 2100,
      "B+": 1980,
      "C": 870,
      "F": 120,
      "O": 5600
    }
  },
  "message": "Statistics retrieved successfully"
}
```

---

### GET /api/filter

Filters students by year and/or branch with dynamic rank recalculation within the filtered set. The student with the highest CGPA in the filtered set receives `filtered_rank: 1`.

**Query Parameters:**

| Parameter | Type    | Description                                                |
|-----------|---------|-------------------------------------------------------------|
| `year`    | string  | Batch/enrollment year (e.g. `2022`)                        |
| `branch`  | string  | Comma-separated branch codes (e.g. `UBT,UEC`)             |
| `query`   | string  | Search by roll number or name — matches if either contains the string (case-insensitive)  |
| `page`    | integer | Page number (default `1`)                                  |

Page size is fixed at **20** per page.

**Example Requests:**

```bash
# Filter by year
curl "http://localhost:3000/api/filter?year=2022&page=1"

# Filter by branch
curl "http://localhost:3000/api/filter?branch=UBT&page=1"

# Filter by both year and multiple branches
curl "http://localhost:3000/api/filter?year=2022&branch=UBT,UEC&page=1"

# Search by roll number or name
curl "http://localhost:3000/api/filter?query=RAHUL&page=1"
```

**Example Response:**

```json
{
  "success": true,
  "data": [
    {
      "rollNo": "2022UBT1001",
      "name": "RAHUL SHARMA",
      "branch_code": "UBT",
      "year_of_study": "2022",
      "cgpa": 9.45,
      "overall_rank": 3,
      "branch_rank": 1,
      "filtered_rank": 1,
      "percentile": 99.8,
      "credits_completed": 172,
      "semesters": [
        {
          "semester": 1,
          "sgpa": 9.8,
          "credits_registered": 24,
          "credits_secured": 24
        }
      ]
    }
  ],
  "message": "Filtered students retrieved successfully",
  "pagination": {
    "total": 320,
    "page": 1,
    "limit": 20,
    "totalPages": 16
  },
  "appliedFilters": {
    "year": "2022",
    "branch": "UBT,UEC",
    "query": null
  }
}
```

---

### GET /api/subjects/difficulty

Returns a Subject Difficulty Map built from score records. Each subject includes average marks, total students, grade distribution, a difficulty classification, and a killer flag indicating >30% of students received grade C or below.

**Query Parameters:**

| Parameter  | Type    | Description                                    |
|------------|---------|------------------------------------------------|
| `semester` | integer | Filter by semester number                      |
| `branch`   | string  | Comma-separated branch codes (e.g. `UBT,UEC`) |
| `page`     | integer | Page number (default `1`)                      |

Page size is fixed at **20** per page. Results are sorted by average marks ascending (hardest subjects first).

**Example Requests:**

```bash
# All subjects
curl "http://localhost:3000/api/subjects/difficulty"

# Filter by semester
curl "http://localhost:3000/api/subjects/difficulty?semester=2"

# Filter by branch
curl "http://localhost:3000/api/subjects/difficulty?branch=UBT,UEC&page=1"
```

**Example Response:**

```json
{
  "success": true,
  "data": {
    "subjects": [
      {
        "subject_code": "CAECC203",
        "avg_marks": 4.9,
        "total_students": 320,
        "difficulty": "Hard",
        "is_killer": true,
        "low_grade_percentage": 42.5,
        "grade_distribution": {
          "O": 10,
          "A+": 20,
          "A": 40,
          "B+": 50,
          "B": 64,
          "C": 80,
          "D": 36,
          "F": 20
        }
      }
    ],
    "summary": {
      "total_subjects": 85,
      "hardest_subject": {
        "subject_code": "CAECC203",
        "avg_marks": 4.9,
        "difficulty": "Hard"
      },
      "easiest_subject": {
        "subject_code": "FCMT0201",
        "avg_marks": 8.2,
        "difficulty": "Easy"
      },
      "killer_count": 12
    }
  },
  "message": "Subject difficulty map retrieved successfully",
  "pagination": {
    "total": 85,
    "page": 1,
    "limit": 20,
    "totalPages": 5
  },
  "appliedFilters": {
    "semester": null,
    "branch": null
  }
}
```

---

## Rate Limiting

All API routes are protected against abuse and bulk data scraping. Limits are enforced **per IP address** over a rolling 15-minute window. When a limit is exceeded the API responds with HTTP **429 Too Many Requests**. Standard `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` headers are included in every response.

| Endpoint                      | Limit (per IP / 15 min) | Reason                                      |
|-------------------------------|------------------------|---------------------------------------------|
| `GET /api/students`           | **30**                 | Paginated list — primary scraping vector    |
| `GET /api/filter`             | **30**                 | Paginated list — primary scraping vector    |
| `GET /api/subjects/difficulty`| **20**                 | Aggregated payload, rarely changes          |
| `GET /api/students/:rollNo`   | **60**                 | Roll-number enumeration prevention          |
| `GET /api/stats`              | **20**                 | Single aggregated payload, rarely changes   |
| All other `/api/` routes      | **100**                | Global catch-all                            |

**429 response example:**

```json
{
  "success": false,
  "data": null,
  "message": "Too many list requests from this IP. Please wait 15 minutes before trying again."
}
```

---

## Response Format

All endpoints return a consistent JSON envelope:

```json
{
  "success": true,
  "data": {},
  "message": "Human-readable status message",
  "pagination": {
    "total": 1240,
    "page": 1,
    "limit": 20,
    "totalPages": 62
  }
}
```

`pagination` is only present on list endpoints. `data` is `null` on error responses. Page size is always fixed at **20**.

---

## Error Handling

| HTTP Status | Description                             |
|-------------|-----------------------------------------|
| `200`       | Success                                 |
| `400`       | Validation error (invalid query params) |
| `404`       | Resource or route not found             |
| `500`       | Internal server error                   |

**Validation Error Example:**

```json
{
  "success": false,
  "data": null,
  "message": "Validation error",
  "errors": [
    {
      "type": "field",
      "msg": "page must be a positive integer",
      "path": "page",
      "location": "query"
    }
  ]
}
```
