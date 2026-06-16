import { LegalShell, Section } from "../components/LegalShell";
import { colors } from "../theme";

const LAST_UPDATED = "June 17, 2026";
const CONTACT = "qaissuwan1@gmail.com";

export default function Terms() {
  return (
    <LegalShell title="Terms of Service" updated={LAST_UPDATED}>
      <p style={p}>
        These Terms of Service (&quot;Terms&quot;) govern your use of JUstep, a free study platform for medical students
        at the University of Jordan. By creating an account or using JUstep, you agree to these Terms.
      </p>

      <Section title="Educational purpose">
        <p style={p}>
          JUstep is provided as a <b>study aid for educational purposes</b>. Its content — questions, flashcards, and
          explanations — is meant to support your learning alongside your university curriculum and exam preparation.
        </p>
      </Section>

      <Section title="Your account">
        <ul style={ul}>
          <li style={li}>You are responsible for your account and for keeping your login details secure.</li>
          <li style={li}>Accounts are personal — please do <b>not share your account</b> or let others sign in as you.</li>
          <li style={li}>Use JUstep fairly. Do not abuse, disrupt, or attempt to break the service, and do not try to access other users&apos; data.</li>
        </ul>
      </Section>

      <Section title="Content &amp; exam outcomes">
        <p style={p}>
          We work to keep content accurate and high-yield, but JUstep is a study aid and we make <b>no guarantee of any exam
          result or outcome</b>. Always rely on your official course materials and instructors as your primary source.
        </p>
      </Section>

      <Section title="Service provided “as is”">
        <p style={p}>
          JUstep is provided <b>free of charge</b> and <b>&quot;as is&quot;</b>, without warranties of any kind. We do our best
          to keep the platform available and working, but we cannot guarantee it will always be uninterrupted or error-free.
        </p>
      </Section>

      <Section title="Changes to these Terms">
        <p style={p}>
          We may update these Terms from time to time. When we do, we will revise the &quot;Last updated&quot; date above.
          Your continued use of JUstep after changes means you accept the updated Terms.
        </p>
      </Section>

      <Section title="Contact">
        <p style={p}>Questions about these Terms? Email us at <b>{CONTACT}</b>.</p>
      </Section>
    </LegalShell>
  );
}

const p = { fontSize: 15, lineHeight: 1.7, color: colors.textSoft, margin: "0 0 12px" };
const ul = { margin: "0 0 12px", paddingLeft: 22 };
const li = { fontSize: 15, lineHeight: 1.7, color: colors.textSoft, marginBottom: 8 };
