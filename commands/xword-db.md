Query the crossword word database at C:Users	iwescotPersonalAIwords.db.

## Database access

Always use  via node. Never use the sqlite3 CLI. Example pattern:

\
Run queries from any working directory by using the full path to the DB.

## Schema

\
Tags are stored in  as a many-to-many relationship — a word can have any number of tags.

## Scoring

Always use  (not ) when querying for word quality or score breakdowns.  is Xwi's external score;  is the user's own scoring and is what matters.

## Tag breakdowns

When the user asks for a "tag breakdown" or "breakdown of tags", always show the **combination view**: group by word, concatenate all tags per word, then count how many words share each exact combination. Never show flat per-tag counts as the primary result.

\
  SELECT combo, COUNT(*) AS n FROM (
    SELECT word, GROUP_CONCAT(category ORDER BY category) AS combo
    FROM word_categories
    GROUP BY word
  )
  GROUP BY combo
  ORDER BY n DESC
\

## User request

