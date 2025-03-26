import { supabase } from "./db/supabase";
import { QuestionType } from "./types/questionTypes";

const getVoteValue = (selectedValue) => {
    const voteMap = {
        // VS values
        big_llm: 1,
        small_llm: -1,
        draw: 0,
        // Satisfaction values
        satisfactory: 1,
        not_satisfactory: -1,
    };
    return voteMap[selectedValue] ?? null; // fallback just in case
};

const saveResponses = async (questions, results, timeTakenInSeconds) => {
    // Step 1: Insert into response table
    const { data: responseInsert, error: responseInsertError } = await supabase
        .from("response")
        .insert({
            time_taken: timeTakenInSeconds,
        })
        .select()
        .single();

    if (responseInsertError) throw responseInsertError;

    const respId = responseInsert.id;

    // Step 2: Iterate over responses
    for (const [qnText, selectedValue] of Object.entries(results)) {
        let voteValue = getVoteValue(selectedValue);

        // Try to find the question in versus or satisfaction lists
        const matchingVersusQn = questions.vsQuestions.find(
            (q) => q.question_text === qnText
        );
        if (matchingVersusQn) {
            await supabase.from("votes_versus").insert({
                resp_id: respId,
                qid: matchingVersusQn.qid,
                vote: voteValue,
            });
            continue;
        }

        const matchingSatQn = questions.mixedSatisfaction.find(
            (q) => q.question_text === qnText
        );
        if (matchingSatQn) {
            const modelShown =
                matchingSatQn.type === QuestionType.SATISFACTION_SMALL
                    ? "small"
                    : "large";

            await supabase.from("votes_satisfaction").insert({
                resp_id: respId,
                qid: matchingSatQn.qid,
                vote: voteValue,
                model_shown: modelShown,
            });
        }
    }

    console.log("All responses saved successfully.");
};

export { saveResponses };
