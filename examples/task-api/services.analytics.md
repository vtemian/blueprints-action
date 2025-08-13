# services.analytics

Analytics and statistics calculation service.

Dependencies: sqlalchemy, @models.task, @models.category, datetime, typing, functools

Requirements:
- Calculate overview statistics:
  - get_task_counts_by_status(): Group tasks by status
  - get_task_counts_by_priority(): Group tasks by priority  
  - get_overdue_count(): Count tasks past due date
  - get_completion_stats(period): Tasks completed in time period
  - calculate_average_completion_time(): Average hours to complete

- Calculate category statistics:
  - get_category_distribution(): Tasks per category with percentages
  - get_category_completion_rates(): Completion rate by category
  - get_category_priority_distribution(): Priority breakdown per category

- Calculate trends:
  - get_daily_task_creation(days=30): Daily new tasks
  - get_daily_completions(days=30): Daily completed tasks
  - calculate_moving_average(data, window=7): Rolling averages
  - get_productivity_by_hour(): Completions by hour of day
  - get_productivity_by_weekday(): Completions by day of week

- Caching:
  - Use functools.lru_cache for expensive calculations
  - Cache timeout of 5 minutes for most stats
  - Invalidate cache on task/category changes

- Performance optimizations:
  - Use database aggregations (COUNT, AVG, GROUP BY)
  - Minimize N+1 queries with eager loading
  - Use indexed columns for filtering