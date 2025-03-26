import { useCallback, useEffect, useState } from "react";
import "survey-core/defaultV2.min.css";
import { Model } from "survey-core";
import { Survey } from "survey-react-ui";
import { supabase } from "./db/supabase";
import { saveResponses } from "./saveResponses";
import CircularProgress from "@mui/material/CircularProgress";
import { QuestionType } from "./types/questionTypes";

const NUM_VERSUS_QNS = 3;
const NUM_SATISFACTION_QNS = 6; // Must be even so we can split into small and large llm

function App() {
    const [survey, setSurvey] = useState(null);
    const [questions, setQuestions] = useState(null);
    const [loading, setLoading] = useState(true);
    const [startTime, setStartTime] = useState(null);

    const fetchQuestions = useCallback(async () => {
        try {
            const now = new Date().toISOString();

            // Call the RPC to get question stats (with vote counts)
            const { data, error } = await supabase.rpc("get_question_stats");

            if (error) throw new Error(`Supabase RPC Error: ${error.message}`);
            if (!data || data.length === 0)
                throw new Error("No questions returned");

            // Step 1: Sort by versus votes and pick NUM_VERSUS_QNS vs questions
            const sortedByVs = [...data].sort(
                (a, b) => a.vs_votes_total - b.vs_votes_total
            );
            const vsQuestions = sortedByVs.slice(0, NUM_VERSUS_QNS);
            const usedQids = new Set(vsQuestions.map((q) => q.qid));

            // Step 2: From the remaining, sort by total satisfaction votes and pick NUM_SATISFACTION_QNS candidates
            const remaining = data.filter((q) => !usedQids.has(q.qid));
            const sortedBySat = [...remaining].sort(
                (a, b) => a.sat_votes_total - b.sat_votes_total
            );
            const satCandidates = sortedBySat.slice(0, NUM_SATISFACTION_QNS);

            // Step 3: Balanced assignment for satisfaction questions
            let satSmall = [];
            let satLarge = [];
            const num_per_group = NUM_SATISFACTION_QNS / 2;

            // Iterate over the candidates and assign based on model-specific counts.
            for (const q of satCandidates) {
                // If both groups are not yet full:
                if (
                    satSmall.length < num_per_group &&
                    satLarge.length < num_per_group
                ) {
                    if (q.sat_votes_small < q.sat_votes_large) {
                        satSmall.push(q);
                    } else if (q.sat_votes_large < q.sat_votes_small) {
                        satLarge.push(q);
                    } else {
                        // If equal, assign randomly.
                        if (Math.random() < 0.5) {
                            satSmall.push(q);
                        } else {
                            satLarge.push(q);
                        }
                    }
                } else if (satSmall.length < num_per_group) {
                    satSmall.push(q);
                } else if (satLarge.length < num_per_group) {
                    satLarge.push(q);
                }
                // Stop if both groups have 3 questions.
                if (
                    satSmall.length === num_per_group &&
                    satLarge.length === num_per_group
                )
                    break;
            }

            // Step 4: Tag question type so the frontend knows which response to display.
            vsQuestions.forEach((q) => (q.type = QuestionType.VERSUS));
            satSmall.forEach((q) => (q.type = QuestionType.SATISFACTION_SMALL));
            satLarge.forEach((q) => (q.type = QuestionType.SATISFACTION_LARGE));

            // Step 5: Update assigned_at for all selected questions.
            const allSelectedQids = [
                ...vsQuestions,
                ...satSmall,
                ...satLarge,
            ].map((q) => q.qid);
            await supabase
                .from("question")
                .update({ assigned_at: now })
                .in("qid", allSelectedQids);

            // Step 6: Update state.
            setQuestions({
                vsQuestions,
                mixedSatisfaction: [...satSmall, ...satLarge].sort(
                    () => Math.random() - 0.5
                ),
            });
        } catch (error) {
            console.error("Error fetching questions:", error);
            alert(
                "Error fetching survey questions. Please contact survey admin."
            );
        }
    }, []);

    useEffect(() => {
        fetchQuestions();
    }, [fetchQuestions]);

    const storeSurveyResultsInDb = useCallback(
        async (survey, options, timeTakenInSeconds) => {
            console.log("Time taken to complete survey:", timeTakenInSeconds);
            const results = survey.data;
            options.showSaveInProgress();

            try {
                await saveResponses(questions, results, timeTakenInSeconds);
                options.showSaveSuccess();
            } catch (error) {
                console.error("Error saving survey responses:", error);
                options.showSaveError();
                alert(
                    "An error occurred in submission. Please contact the form administrator."
                );
            }
        },
        [questions]
    );

    useEffect(() => {
        if (!questions) return;

        const newSurvey = new Model();
        const surveyPage = newSurvey.addNewPage("SurveyPage");

        // Versus section
        const vsInstructions = surveyPage.addNewQuestion(
            "html",
            "vsInstructions"
        );
        vsInstructions.html =
            "<h3>Section 1</h3><h6>For each question below, you will see two AI-generated responses. Pick the response you prefer.</h6>";
        questions.vsQuestions.forEach((q) => {
            const newQuestion = surveyPage.addNewQuestion(
                "radiogroup",
                q.question_text
            );
            newQuestion.choices = [
                { value: "big_llm", text: q.big_resp },
                {
                    value: "small_llm",
                    text: q.small_resp,
                },
            ].sort(() => Math.random() - 0.5);
            newQuestion.choices = [
                ...newQuestion.choices,
                {
                    value: "draw",
                    text: "I prefer both responses equally",
                },
            ];
            newQuestion.isRequired = true;
        });

        // Satisfaction section
        const satisfactionInstructions = surveyPage.addNewQuestion(
            "html",
            "satisfactionInstructions"
        );
        satisfactionInstructions.html =
            "<h3>Section 2</h3><h6>For each question below, you will see an AI-generated response. If you received this response after asking the question from an LLM, would you rate it as satisfactory or not satisfactory?</h6>";
        questions.mixedSatisfaction.forEach((q) => {
            const toggle = surveyPage.addNewQuestion(
                "boolean",
                q.question_text
            );
            toggle.description =
                q.type === QuestionType.SATISFACTION_SMALL
                    ? q.small_resp
                    : q.big_resp;
            toggle.labelTrue = "👍";
            toggle.labelFalse = "👎";
            toggle.valueTrue = "satisfactory";
            toggle.valueFalse = "not_satisfactory";
            toggle.isRequired = true;
        });

        newSurvey.onComplete.add(async (survey, options) => {
            const endTime = Date.now();
            const timeTakenInSeconds = Math.floor((endTime - startTime) / 1000);

            await storeSurveyResultsInDb(survey, options, timeTakenInSeconds);
        });
        setSurvey(newSurvey);
        setLoading(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [questions, storeSurveyResultsInDb]);

    useEffect(() => {
        setStartTime(Date.now());
    }, []);

    return (
        <div>
            {loading ? (
                <div
                    style={{
                        display: "flex",
                        justifyContent: "center",
                        width: "100vw",
                        height: "100vh",
                        alignItems: "center",
                    }}
                >
                    <CircularProgress size={"5rem"} />
                </div>
            ) : (
                survey && <Survey model={survey} />
            )}
        </div>
    );
}

export default App;
