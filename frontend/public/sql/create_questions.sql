CREATE TABLE questions (
    id SERIAL PRIMARY KEY,               -- Unique identifier for each question
    question TEXT NOT NULL,              -- The question text
    llama70b_response TEXT NOT NULL,     -- Response from Llama70B model
    llama1b_tailored_response TEXT NOT NULL, -- Response from Llama1B tailored model
    votes_for_llama70b INTEGER DEFAULT 0,   -- Number of votes for Llama70B response
    votes_for_llama1b INTEGER DEFAULT 0,    -- Number of votes for Llama1B response
    total_votes INTEGER DEFAULT 0          -- Total number of votes for this question
);

ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read questions"
ON public.questions
FOR SELECT
TO anon
USING (true);

CREATE POLICY "Allow updates for everyone"
ON public.questions
FOR UPDATE
To anon
USING (true);


