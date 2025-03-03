questions.vsQuestions.forEach((q, index) => {
    // Randomize the order of Llama 70B and 1B responses
    const options =
        Math.random() > 0.5
            ? [
                  {
                      label: "Option 1",
                      value: "vs_votes_for_llama70b",
                      text: q.llama70b_response,
                  },
                  {
                      label: "Option 2",
                      value: "vs_votes_for_llama1b",
                      text: q.llama1b_tailored_response,
                  },
              ]
            : [
                  {
                      label: "Option 1",
                      value: "vs_votes_for_llama1b",
                      text: q.llama1b_tailored_response,
                  },
                  {
                      label: "Option 2",
                      value: "vs_votes_for_llama70b",
                      text: q.llama70b_response,
                  },
              ];

    // Create the HTML question
    surveyPage.addNewQuestion("html", `vs_question_html_${index}`).html = `
          <p style="font-size: 1.2rem"><strong>Q${index + 1}: ${
        q.question
    }</strong></p>
          ${options
              .map(
                  (opt) =>
                      `<p style="white-space: pre-line;"><strong>${opt.label}:</strong><br>${opt.text}</p>`
              )
              .join("")}
      `;

    // Create the radio group question
    const newQuestion = surveyPage.addNewQuestion(
        "radiogroup",
        `Which response do you prefer for Q${index + 1}?`
    );
    newQuestion.choices = options.map(({ value, label }) => ({
        value,
        text: label,
    }));
    newQuestion.isRequired = true;
});
