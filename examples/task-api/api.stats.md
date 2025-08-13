# api.stats

Statistics and analytics endpoints.

Dependencies: fastapi, @models.task, @models.category, @services.analytics, datetime, typing

Requirements:
- GET /api/stats/overview
  - Return comprehensive statistics:
    - Total tasks by status (pending, in_progress, completed, cancelled)
    - Tasks by priority distribution
    - Overdue tasks count
    - Tasks completed today, this week, this month
    - Average time to completion (in hours)
    - Completion rate (completed vs total)
  - Cache results for 5 minutes

- GET /api/stats/categories
  - Task distribution across categories
  - For each category:
    - Total tasks
    - Tasks by status
    - Completion rate
    - Most common priority
  - Order by total tasks descending

- GET /api/stats/trends
  - Task creation trend (last 30 days)
  - Completion trend (last 30 days)
  - Return daily aggregates
  - Include moving averages

- GET /api/stats/productivity
  - Tasks completed by day of week
  - Tasks completed by hour of day
  - Peak productivity times
  - Average tasks per day

Response Format:
- All stats endpoints return JSON with:
  - data: the statistics
  - generated_at: timestamp
  - cache_expires_at: cache expiration time