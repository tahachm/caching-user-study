import { useCallback, useEffect, useState } from "react";

import "survey-core/defaultV2.min.css";
import { Model } from "survey-core";
import { Survey } from "survey-react-ui";

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://cwoyrciwfxgermsjlhih.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN3b3lyY2l3ZnhnZXJtc2psaGloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA4MTI4MzUsImV4cCI6MjA1NjM4ODgzNX0.rRQxLWWqS7yHAH-r6xeZQ7vQBKBplYWpGyvWDWD0vX8";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function App() {
    const survey = new Model();
    const rankingPage = survey.addNewPage("RankingQuestions");

    // ✅ New Title
    rankingPage.title = "Rank the responses and evaluate their satisfaction";

    rankingPage.addNewQuestion("text", "Name").title = "Name:";

    const [questions, setQuestions] = useState([]);
    const [toggleQuestions, setToggleQuestions] = useState([]); // Store all toggle questions

    const fetchQuestions = useCallback(async () => {
        // Fetch 3 radiogroup questions based on total_votes (least voted)
        const { data: radioData, error: radioError } = await supabase
            .from("questions")
            .select(
                "id, question, llama70b_response, llama1b_tailored_response, total_votes, votes_for_llama70b, votes_for_llama1b"
            )
            .order("total_votes", { ascending: true })
            .limit(3);

        if (radioError) {
            console.log("Error fetching radiogroup questions:", radioError);
            alert("Error fetching radiogroup questions:", radioError);
            return;
        }

        // Fetch 3 satisfactory toggle questions based on votes_for_satisfactory (least voted)
        const { data: toggleData, error: toggleError } = await supabase
            .from("questions")
            .select(
                "id, question, llama1b_tailored_response, satis_total_votes"
            )
            .order("satis_total_votes", { ascending: true })
            .limit(3);

        if (toggleError) {
            console.log("Error fetching toggle questions:", toggleError);
            alert("Error fetching toggle questions:", toggleError);
            return;
        }

        setQuestions(radioData); // Store radiogroup questions
        setToggleQuestions(toggleData); // Store all toggle questions

        console.log("Radiogroup Questions fetched:", radioData);
        console.log("Satisfactory Toggle Questions fetched:", toggleData);
    }, []);

    useEffect(() => {
        fetchQuestions();
    }, []);

    useEffect(() => {
        if (questions.length > 0 && toggleQuestions.length === 3) {
            // ✅ Add the fetched multiple-choice questions on the same page
            questions.forEach((q) => {
                let newQuestion = rankingPage.addNewQuestion("radiogroup", q.question);
                newQuestion.choices = [
                    { value: "votes_for_llama70b", text: q.llama70b_response },
                    { value: "votes_for_llama1b", text: q.llama1b_tailored_response }
                ].sort(() => Math.random() - 0.5);
            });

            // ✅ Section Title for Satisfaction Questions
            rankingPage.addNewQuestion("html", "satisfaction_header").html = 
                "<h4>Are the following responses satisfactory for the given questions?</h4>";

            // ✅ Add all 3 toggle questions below the ranking section
            toggleQuestions.forEach((q) => {
                let toggle = rankingPage.addNewQuestion("boolean", q.question);
                toggle.description = q.llama1b_tailored_response; // Only show the response
                toggle.labelTrue = "Yes";
                toggle.labelFalse = "No";
            });
        }
    }, [questions, toggleQuestions]);

    const storeSurveyResults = useCallback(
        async (sender) => {
            const results = sender.data;
            console.log("Survey results:", results);

            for (const qn in results) {
                const selectedValue = results[qn];

                // ✅ Handle Satisfactory Toggle Questions
                const matchingToggle = toggleQuestions.find((q) => q.question === qn);
                if (matchingToggle) {
                    console.log("User response to Satisfactory Toggle:", selectedValue ? "Yes" : "No");

                    // ✅ Save Satisfactory vote in Supabase
                    const { data, error } = await supabase
                        .from("questions")
                        .update({
                            total_votes: matchingToggle.total_votes + 1,
                        })
                        .eq("id", matchingToggle.id);

                    if (error) {
                        console.error("Error saving Satisfactory vote:", error);
                        alert("Error saving vote:", error);
                    } else {
                        console.log("Satisfactory Vote saved:", data);
                    }
                    continue;
                }

                // ✅ Handle Regular Questions
                const currQuestion = questions.find((q) => q.question === qn);
                if (!currQuestion) continue;

                const voteColumn = selectedValue;
                console.log("voteColumn:", voteColumn, "for", qn);

                // ✅ Insert vote into Supabase
                const { data, error } = await supabase
                    .from("questions")
                    .update({
                        [voteColumn]: currQuestion[voteColumn] + 1,
                    })
                    .eq("id", currQuestion.id);

                if (error) {
                    console.error("Error saving vote:", error);
                    alert("Error saving vote:", error);
                } else {
                    console.log("Vote saved:", data);
                }
            }
        },
        [questions, toggleQuestions]
    );

    survey.onComplete.add(storeSurveyResults);

    return (
        <>
            <Survey model={survey} />
        </>
    );
}

export default App;
