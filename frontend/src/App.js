import { useCallback, useEffect, useState } from "react";
import "survey-core/defaultV2.min.css";
import { Model } from "survey-core";
import { Survey } from "survey-react-ui";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function App() {
    const [survey, setSurvey] = useState(null);
    const [questions, setQuestions] = useState(null);
    const [loading, setLoading] = useState(true);
    const [assignedQids, setAssignedQids] = useState([]);

    const fetchQuestions = useCallback(async () => {
        try {
            setLoading(true);
            const now = new Date().toISOString();
            const selectedQids = new Set();
            let vsQuestions = [];
            let satisfaction1B = [];
            let satisfaction70B = [];

            // ✅ Reset Stale Assignments (Older than 5 Minutes)
            await supabase
                .from("responses")
                .update({ assigned: false, assigned_at: null })
                .lt(
                    "assigned_at",
                    new Date(Date.now() - 5 * 60 * 1000).toISOString()
                )
                .eq("assigned", true);

            // ✅ Fetch Available Questions
            let { data: allQuestions } = await supabase
                .from("responses")
                .select("*")
                .eq("assigned", false)
                .order("total_vs_votes", { ascending: true })
                .order("total_satisfactory_votes_1b", { ascending: true })
                .order("total_satisfactory_votes_70b", { ascending: true })
                .limit(50);

            // ✅ Unlock More If Not Enough
            while (allQuestions.length < 9) {
                let { data: oldQuestions } = await supabase
                    .from("responses")
                    .select("*")
                    .eq("assigned", true)
                    .order("assigned_at", { ascending: true })
                    .limit(10);

                if (!oldQuestions || oldQuestions.length === 0) {
                    alert("❌ No more questions available to reset.");
                    setLoading(false);
                    return;
                }

                await supabase
                    .from("responses")
                    .update({ assigned: false, assigned_at: null })
                    .in(
                        "qid",
                        oldQuestions.map((q) => q.qid)
                    );

                let { data: updatedQuestions } = await supabase
                    .from("responses")
                    .select("*")
                    .eq("assigned", false)
                    .order("total_vs_votes", { ascending: true })
                    .order("total_satisfactory_votes_1b", { ascending: true })
                    .order("total_satisfactory_votes_70b", { ascending: true })
                    .limit(50);

                allQuestions = updatedQuestions;
            }

            // ✅ Select Questions (Ensuring No Overlap)
            vsQuestions = allQuestions
                .filter(
                    (q) =>
                        !selectedQids.has(q.qid) &&
                        q.total_vs_votes !== undefined
                )
                .slice(0, 3);
            vsQuestions.forEach((q) => selectedQids.add(q.qid));

            satisfaction1B = allQuestions
                .filter(
                    (q) =>
                        !selectedQids.has(q.qid) &&
                        q.total_satisfactory_votes_1b !== undefined
                )
                .slice(0, 3);
            satisfaction1B.forEach((q) => selectedQids.add(q.qid));

            satisfaction70B = allQuestions
                .filter(
                    (q) =>
                        !selectedQids.has(q.qid) &&
                        q.total_satisfactory_votes_70b !== undefined
                )
                .slice(0, 3);
            satisfaction70B.forEach((q) => selectedQids.add(q.qid));

            // ✅ Assign Selected Questions in Database
            await supabase
                .from("responses")
                .update({ assigned: true, assigned_at: now })
                .in("qid", [...selectedQids]);

            setQuestions({
                vsQuestions,
                mixedSatisfaction: [...satisfaction1B, ...satisfaction70B].sort(
                    () => Math.random() - 0.5
                ),
            });
            setAssignedQids([...selectedQids]);
        } catch (error) {
            console.error("❌ Error fetching questions:", error);
            alert("Error fetching survey questions.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchQuestions();
    }, [fetchQuestions]);

    // ✅ Save survey responses and reset assigned flags
    const storeSurveyResults = useCallback(
        async (sender) => {
            const results = sender.data;

            try {
                for (const [qn, selectedValue] of Object.entries(results)) {
                    // Check if it's a VS question
                    const matchingVs = questions.vsQuestions.find(
                        (q) => q.question === qn
                    );
                    if (matchingVs) {
                        console.log(
                            `🔹 Updating VS Question QID: ${matchingVs.qid}`
                        );
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

                    // Check if it's a satisfaction question
                    const matchingSat = questions.mixedSatisfaction.find(
                        (q) => q.question === qn
                    );
                    if (matchingSat) {
                        // Check whether it's a 1B or 70B satisfaction question based on available fields
                        if (
                            matchingSat.total_satisfactory_votes_1b !==
                            undefined
                        ) {
                            // For 1B satisfaction question
                            const fieldToUpdate = selectedValue
                                ? "satisfactory_votes_1b_yes"
                                : "satisfactory_votes_1b_no";
                            console.log(
                                `🔹 Updating 1B Satisfaction Question QID: ${matchingSat.qid}`
                            );
                            await supabase
                                .from("responses")
                                .update({
                                    [fieldToUpdate]:
                                        (matchingSat[fieldToUpdate] ?? 0) + 1,
                                    total_satisfactory_votes_1b:
                                        (matchingSat.total_satisfactory_votes_1b ??
                                            0) + 1,
                                })
                                .eq("qid", matchingSat.qid);
                        } else if (
                            matchingSat.total_satisfactory_votes_70b !==
                            undefined
                        ) {
                            // For 70B satisfaction question
                            const fieldToUpdate = selectedValue
                                ? "satisfactory_votes_70b_yes"
                                : "satisfactory_votes_70b_no";
                            console.log(
                                `🔹 Updating 70B Satisfaction Question QID: ${matchingSat.qid}`
                            );
                            await supabase
                                .from("responses")
                                .update({
                                    [fieldToUpdate]:
                                        (matchingSat[fieldToUpdate] ?? 0) + 1,
                                    total_satisfactory_votes_70b:
                                        (matchingSat.total_satisfactory_votes_70b ??
                                            0) + 1,
                                })
                                .eq("qid", matchingSat.qid);
                        }
                    }
                }

                // ✅ Reset the assigned flag for all questions used in this survey
                await supabase
                    .from("responses")
                    .update({ assigned: false, assigned_at: null })
                    .in("qid", assignedQids);

                console.log("✅ Survey Responses Successfully Updated in DB");
                alert("✅ Thank you! Your responses have been submitted.");
            } catch (error) {
                console.error("❌ Error saving survey responses:", error);
                alert("An error occurred. Please try again.");
            }
        },
        [questions, assignedQids]
    );

    useEffect(() => {
        if (loading || !questions) return;

        const newSurvey = new Model();
        const surveyPage = newSurvey.addNewPage("SurveyPage");

        // ✅ Add VS Section Instructions
        const vsInstructions = surveyPage.addNewQuestion(
            "html",
            "vsInstructions"
        );
        vsInstructions.html =
            "<h4>Section 1: For each question below, you will see two AI-generated responses. Pick the response you prefer.</h4>";

        // ✅ Add "VS" questions (randomized choices)
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

        // ✅ Add VS Section Instructions
        const SatisfactionInstructions = surveyPage.addNewQuestion(
            "html",
            "SatisfactionInstructions"
        );
        SatisfactionInstructions.html =
            "<h4>Section 2: For each question below, you will see an AI-generated response. If you received this response after asking the question from an LLM, would you rate it as satisfactory or not satisfactory?</h4>";

        // ✅ Add Satisfaction Questions (randomized order)
        questions.mixedSatisfaction.forEach((q) => {
            const toggle = surveyPage.addNewQuestion("boolean", q.question);
            toggle.description =
                q.llama1b_tailored_response || q.llama70b_response;
            toggle.labelTrue = "Yes";
            toggle.labelFalse = "No";
            toggle.isRequired = true;
        });

        newSurvey.onComplete.add(storeSurveyResults);
        setSurvey(newSurvey);
    }, [questions, loading, storeSurveyResults]);

    return (
        <div>
            {loading ? (
                <p>Loading survey...</p>
            ) : (
                survey && <Survey model={survey} />
            )}
        </div>
    );
}

export default App;
