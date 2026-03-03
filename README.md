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
  - [GET /api/stats](#get-apistats)
  - [GET /api/filter](#get-apifilter)
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
│   │   └── filter.js         # /api/filter routes
│   ├── controllers/
│   │   ├── studentController.js
│   │   ├── statsController.js
│   │   └── filterController.js
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

## Rate Limiting

All API routes are protected against abuse and bulk data scraping. Limits are enforced **per IP address** over a rolling 15-minute window. When a limit is exceeded the API responds with HTTP **429 Too Many Requests**. Standard `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` headers are included in every response.

| Endpoint                      | Limit (per IP / 15 min) | Reason                                      |
|-------------------------------|------------------------|---------------------------------------------|
| `GET /api/students`           | **30**                 | Paginated list — primary scraping vector    |
| `GET /api/filter`             | **30**                 | Paginated list — primary scraping vector    |
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
