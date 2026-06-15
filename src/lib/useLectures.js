// Shared hook: fetch the lectures belonging to a subject, ordered by
// order_index (then title as a tiebreaker). Returns [] when no subject is
// selected, and re-fetches whenever subjectId changes. Used by every lecture
// dropdown (Add Question, Import JSON, Lecture Pipeline) so they all filter by
// the currently selected subject the same way.
import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export function useLectures(subjectId) {
  const [lectures, setLectures] = useState([]);
  useEffect(() => {
    if (!subjectId) return;
    let active = true;
    supabase
      .from("lectures")
      .select("id, title, order_index")
      .eq("subject_id", subjectId)
      .order("order_index", { ascending: true })
      .order("title", { ascending: true })
      .then(({ data }) => active && setLectures(data || []));
    return () => {
      active = false;
    };
  }, [subjectId]);
  // Return [] (rather than clearing state in the effect) when no subject is
  // selected — avoids a synchronous setState in the effect body.
  return subjectId ? lectures : [];
}
