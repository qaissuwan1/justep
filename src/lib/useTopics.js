// Shared hook: fetch the topics belonging to a subject, ordered by order_index
// (then name as a tiebreaker). Returns [] when no subject is selected, and
// re-fetches whenever subjectId changes. Mirrors useLectures so every topic
// dropdown (Question editor, list filter) filters by the selected subject the
// same way. (System → Subject → Topic → Lecture → Questions/Flashcards.)
import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export function useTopics(subjectId) {
  const [topics, setTopics] = useState([]);
  useEffect(() => {
    if (!subjectId) return;
    let active = true;
    supabase
      .from("topics")
      .select("id, name, order_index")
      .eq("subject_id", subjectId)
      .is("deleted_at", null)
      .order("order_index", { ascending: true })
      .order("name", { ascending: true })
      .then(({ data }) => active && setTopics(data || []));
    return () => {
      active = false;
    };
  }, [subjectId]);
  // Return [] (rather than clearing state in the effect) when no subject is
  // selected — avoids a synchronous setState in the effect body.
  return subjectId ? topics : [];
}
