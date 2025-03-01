# Filter the dataset to include only relevant columns where 'llama1b_tailored_response' is not null
filtered_df = df[df['llama1b_tailored_response'].notna()][['question', 'llama70b_response', 'llama1b_tailored_response', 'cosine_similarity']]

# Generate SQL INSERT statements for Supabase
insert_statements = []
for _, row in filtered_df.iterrows():
    question = row['question'].replace("'", "''")  # Escape single quotes
    llama70b_response = row['llama70b_response'].replace("'", "''")
    llama1b_response = row['llama1b_tailored_response'].replace("'", "''")
    cosine_similarity = row['cosine_similarity']

    insert_statements.append(f"INSERT INTO questions (question, llama70b_response, llama1b_tailored_response, cosine_similarity) "
                             f"VALUES ('{question}', '{llama70b_response}', '{llama1b_response}', {cosine_similarity});")

# Save to a SQL file for easy import
sql_file_path = "/mnt/data/insert_questions_with_similarity.sql"
with open(sql_file_path, "w") as f:
    f.write("\n".join(insert_statements))

# Provide the SQL file for user to download
sql_file_path
