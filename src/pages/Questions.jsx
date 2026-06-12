import { useMemo, useState } from "react";
import { questionBank, colors, gradients, font } from "../theme";
import { Card, PageHeader, Pill, PrimaryButton, ProgressBar } from "../components/ui";

const subjects = ["All", ...Array.from(new Set(questionBank.map((q) => q.subject)))];
const diffColor = { Easy: colors.green, Medium: colors.amber, Hard: colors.red };

export default function Questions() {
  const [filter, setFilter] = useState("All");
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState({ correct: 0, answered: 0 });

  const questions = useMemo(
    () => (filter === "All" ? questionBank : questionBank.filter((q) => q.subject === filter)),
    [filter]
  );

  const q = questions[index];

  const pick = (i) => {
    if (revealed) return;
    setSelected(i);
    setRevealed(true);
    setScore((s) => ({ correct: s.correct + (i === q.answer ? 1 : 0), answered: s.answered + 1 }));
  };

  const next = () => {
    setSelected(null);
    setRevealed(false);
    setIndex((i) => (i + 1) % questions.length);
  };

  const resetFilter = (s) => {
    setFilter(s);
    setIndex(0);
    setSelected(null);
    setRevealed(false);
  };

  const accuracy = score.answered ? Math.round((score.correct / score.answered) * 100) : 0;

  return (
    <>
      <PageHeader
        title="Question Bank"
        subtitle="Exam-style MCQs with detailed explanations"
        right={
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ background: "#fff", borderRadius: 12, padding: "10px 18px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", fontSize: 13, color: colors.textSoft }}>
              Answered <b style={{ color: colors.navy }}>{score.answered}</b>
            </div>
            <div style={{ background: "#fff", borderRadius: 12, padding: "10px 18px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", fontSize: 13, color: colors.textSoft }}>
              Accuracy <b style={{ color: accuracy >= 70 ? colors.green : colors.amber }}>{accuracy}%</b>
            </div>
          </div>
        }
      />

      {/* Subject filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {subjects.map((s) => (
          <button
            key={s}
            onClick={() => resetFilter(s)}
            style={{
              padding: "8px 16px",
              borderRadius: 999,
              border: "none",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
              fontFamily: font,
              background: filter === s ? gradients.accent : "#fff",
              color: filter === s ? "#fff" : colors.textSoft,
              boxShadow: filter === s ? "0 4px 14px rgba(79,142,247,0.3)" : "0 1px 4px rgba(0,0,0,0.05)",
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Progress */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: colors.textSoft, marginBottom: 6 }}>
          <span>Question {index + 1} of {questions.length}</span>
          <span>{q.subject} · {q.topic}</span>
        </div>
        <ProgressBar value={((index + 1) / questions.length) * 100} color={colors.teal} />
      </div>

      {/* Question card */}
      <Card style={{ padding: "28px 30px" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <Pill color={colors.blue}>{q.topic}</Pill>
          <Pill color={diffColor[q.difficulty]} bg={`${diffColor[q.difficulty]}1a`}>
            {q.difficulty}
          </Pill>
        </div>

        <p style={{ fontSize: 17, lineHeight: 1.6, fontWeight: 500, margin: "0 0 24px", color: colors.text }}>{q.stem}</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {q.options.map((opt, i) => {
            const isCorrect = i === q.answer;
            const isPicked = i === selected;
            let border = colors.line;
            let bg = "#fff";
            let mark = String.fromCharCode(65 + i);
            if (revealed && isCorrect) {
              border = colors.green;
              bg = "#ECFDF5";
            } else if (revealed && isPicked && !isCorrect) {
              border = colors.red;
              bg = "#FEF2F2";
            } else if (isPicked) {
              border = colors.blue;
            }
            return (
              <button
                key={i}
                onClick={() => pick(i)}
                disabled={revealed}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  textAlign: "left",
                  padding: "14px 16px",
                  borderRadius: 12,
                  border: `1.5px solid ${border}`,
                  background: bg,
                  cursor: revealed ? "default" : "pointer",
                  fontFamily: font,
                  fontSize: 15,
                  color: colors.text,
                  transition: "all 0.15s",
                }}
              >
                <span
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                    fontSize: 13,
                    background: revealed && isCorrect ? colors.green : revealed && isPicked ? colors.red : "#EEF2FB",
                    color: revealed && (isCorrect || isPicked) ? "#fff" : colors.textSoft,
                  }}
                >
                  {revealed && isCorrect ? "✓" : revealed && isPicked ? "✕" : mark}
                </span>
                {opt}
              </button>
            );
          })}
        </div>

        {/* Explanation */}
        {revealed && (
          <div
            style={{
              marginTop: 22,
              padding: "18px 20px",
              borderRadius: 12,
              background: "#F8FAFF",
              borderLeft: `4px solid ${selected === q.answer ? colors.green : colors.blue}`,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: selected === q.answer ? colors.green : colors.navy, marginBottom: 6 }}>
              {selected === q.answer ? "✓ Correct!" : "Explanation"}
            </div>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: colors.textSoft }}>{q.explanation}</p>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 22 }}>
          <PrimaryButton onClick={next} style={{ opacity: revealed ? 1 : 0.5, pointerEvents: revealed ? "auto" : "none" }}>
            Next question →
          </PrimaryButton>
        </div>
      </Card>
    </>
  );
}
