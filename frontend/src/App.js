import { useCallback, useEffect, useState } from "react";
import "survey-core/defaultV2.min.css";
import { Model } from "survey-core";
import { Survey } from "survey-react-ui";
import { createClient } from "@supabase/supabase-js";
import CircularProgress from "@mui/material/CircularProgress";

const supabase = createClient(
    process.env.REACT_APP_SUPABASE_URL,
    process.env.REACT_APP_SUPABASE_ANON_KEY
);

const QuestionType = {
    VS: "vs",
    SATISFACTION_1B: "satisfaction1b",
    SATISFACTION_70B: "satisfaction70b",
};

const VS_QNS_COUNT = 3;
const SATISFACTION_1B_QNS_COUNT = 3;
const SATISFACTION_70B_QNS_COUNT = 3;

function App() {
    const [survey, setSurvey] = useState(null);
    const [questions, setQuestions] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchQuestions = useCallback(async () => {
        try {
            const now = new Date().toISOString();

            const fetchOldestLeastVotedQnsWithExclusion = async (
                column,
                limit,
                excludeQids
            ) => {
                let query = supabase
                    .from("responses")
                    .select("*") // TODO: restrict fields
                    .order("assigned_at", { ascending: true, nullsFirst: true }) // Fetch oldest
                    .order(column, { ascending: true }); // Fetch least voted

                if (excludeQids.size > 0) {
                    query = query.not(
                        "qid",
                        "in",
                        `(${Array.from(excludeQids).join(",")})` //Exclude already picked questions
                    );
                }

                const { data, error } = await query.limit(limit);

                if (error) throw new Error(`Supabase Error: ${error.message}`);

                return data || [];
            };

            const vsQuestions = await fetchOldestLeastVotedQnsWithExclusion(
                "total_vs_votes",
                VS_QNS_COUNT,
                new Set()
            );
            const excludedQids = new Set(vsQuestions.map((q) => q.qid));
            const satisfaction1B = await fetchOldestLeastVotedQnsWithExclusion(
                "total_satisfactory_votes_1b",
                SATISFACTION_1B_QNS_COUNT,
                excludedQids
            );
            satisfaction1B.forEach((q) => excludedQids.add(q.qid));
            const satisfaction70B = await fetchOldestLeastVotedQnsWithExclusion(
                "total_satisfactory_votes_70b",
                SATISFACTION_70B_QNS_COUNT,
                excludedQids
            );

            vsQuestions.forEach((q) => (q.type = QuestionType.VS));
            satisfaction1B.forEach(
                (q) => (q.type = QuestionType.SATISFACTION_1B)
            );
            satisfaction70B.forEach(
                (q) => (q.type = QuestionType.SATISFACTION_70B)
            );

            const updatedAssignedQnsTimestamps = async () => {
                //
                const qids = [
                    ...vsQuestions,
                    ...satisfaction1B,
                    ...satisfaction70B,
                ].map((q) => q.qid);
                await supabase
                    .from("responses")
                    .update({ assigned_at: now })
                    .in("qid", qids);
            };
            updatedAssignedQnsTimestamps();

            setQuestions({
                vsQuestions,
                mixedSatisfaction: [...satisfaction1B, ...satisfaction70B].sort(
                    () => Math.random() - 0.5
                ),
            });
        } catch (error) {
            console.error("Error fetching questions:", error);
            alert("Error fetching survey questions.");
        }
    }, []);

    useEffect(() => {
        fetchQuestions();
    }, [fetchQuestions]);

    const storeSurveyResultsInDb = useCallback(
        async (survey, options) => {
            // is aysnc okay or not
            const results = survey.data;
            options.showSaveInProgress();

            try {
                for (const [qnText, selectedValue] of Object.entries(results)) {
                    const matchingVs = questions.vsQuestions.find(
                        (q) => q.question === qnText
                    );
                    if (matchingVs) {
                        await supabase
                            .from("responses")
                            .update({
                                [selectedValue]:
                                    (matchingVs[selectedValue] ?? 0) + 1,
                                total_vs_votes:
                                    (matchingVs.total_vs_votes ?? 0) + 1,
                            })
                            .eq("qid", matchingVs.qid);
                        continue;
                    }

                    const matchingSat = questions.mixedSatisfaction.find(
                        (q) => q.question === qnText
                    );
                    if (matchingSat) {
                        console.log(
                            "Matching Satisfaction Question option:",
                            selectedValue
                        );
                        if (matchingSat.type === QuestionType.SATISFACTION_1B) {
                            await supabase
                                .from("responses")
                                .update({
                                    [selectedValue]:
                                        (matchingSat[selectedValue] ?? 0) + 1,
                                    total_satisfactory_votes_1b:
                                        (matchingSat.total_satisfactory_votes_1b ??
                                            0) + 1,
                                })
                                .eq("qid", matchingSat.qid);
                        } else {
                            // For 70B satisfaction question
                            await supabase
                                .from("responses")
                                .update({
                                    [selectedValue]:
                                        (matchingSat[selectedValue] ?? 0) + 1,
                                    total_satisfactory_votes_70b:
                                        (matchingSat.total_satisfactory_votes_70b ??
                                            0) + 1,
                                })
                                .eq("qid", matchingSat.qid);
                        }
                    }
                }

                console.log("Survey Responses Successfully Updated in DB");
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
                q.question
            );
            newQuestion.choices = [
                { value: "vs_votes_for_llama70b", text: q.llama70b_response },
                {
                    value: "vs_votes_for_llama1b",
                    text: q.llama1b_tailored_response,
                },
            ].sort(() => Math.random() - 0.5);
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
            const toggle = surveyPage.addNewQuestion("boolean", q.question);
            toggle.description =
                q.type === QuestionType.SATISFACTION_1B
                    ? q.llama1b_tailored_response
                    : q.llama70b_response;
            toggle.labelTrue = "👍";
            toggle.labelFalse = "👎";
            toggle.valueTrue = `satisfactory_votes_${
                q.type === QuestionType.SATISFACTION_1B ? "1b" : "70b"
            }_yes`;
            toggle.valueFalse = `satisfactory_votes_${
                q.type === QuestionType.SATISFACTION_1B ? "1b" : "70b"
            }_no`;
            toggle.isRequired = true;
        });

        newSurvey.onComplete.add(async (survey, options) => {
            await storeSurveyResultsInDb(survey, options);
        });
        setSurvey(newSurvey);
        setLoading(false);
    }, [questions, storeSurveyResultsInDb]);

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
