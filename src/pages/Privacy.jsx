import { LegalShell, Section } from "../components/LegalShell";
import { colors } from "../theme";

const LAST_UPDATED = "June 17, 2026";
const CONTACT = "qaissuwan1@gmail.com";

export default function Privacy() {
  return (
    <LegalShell title="Privacy Policy" updated={LAST_UPDATED}>
      <p style={p}>
        JUstep (&quot;we&quot;, &quot;us&quot;) is a free study platform for medical students at the University of Jordan.
        This Privacy Policy explains what information we collect, how we use it, and the choices you have.
        By using JUstep, you agree to this policy.
      </p>

      <Section title="Information we collect">
        <ul style={ul}>
          <li style={li}><b>Name</b> — the display name you provide so we can personalise your account and leaderboard.</li>
          <li style={li}><b>Email address</b> — used to create and secure your account and to sign you in.</li>
          <li style={li}><b>Study progress</b> — your activity on the platform, such as questions answered, results, and flashcard reviews, so we can track your personal progress.</li>
          <li style={li}><b>Google account basic profile</b> — if you choose to sign in with Google, we receive your basic profile (name and email) from Google. We do not access anything else in your Google account.</li>
        </ul>
      </Section>

      <Section title="How we use your information">
        <ul style={ul}>
          <li style={li}>To provide and operate the study platform.</li>
          <li style={li}>To track your personal progress and show your statistics back to you.</li>
          <li style={li}>To show leaderboard rankings. Only your <b>display name</b> is shown to other users — your email is never shown publicly.</li>
        </ul>
      </Section>

      <Section title="Sign-in providers">
        <p style={p}>
          We use <b>Supabase</b> to handle authentication. You can sign in with <b>email and password</b> or with <b>Google (OAuth)</b>.
          When you use Google sign-in, Google shares only your basic profile (name and email) with us.
        </p>
      </Section>

      <Section title="How your data is stored">
        <p style={p}>
          Your data is stored securely using <b>Supabase</b>, and the app is hosted on <b>Vercel</b>.
          We take reasonable measures to protect your information. We do <b>not sell</b> your personal data, and we do <b>not share</b> it
          with third parties for marketing.
        </p>
      </Section>

      <Section title="Your rights">
        <p style={p}>
          You can request deletion of your account and associated data at any time by contacting us at{" "}
          <b>{CONTACT}</b>. You may also ask what personal data we hold about you.
        </p>
      </Section>

      <Section title="Changes to this policy">
        <p style={p}>
          We may update this Privacy Policy from time to time. When we do, we will revise the &quot;Last updated&quot; date above.
          Continued use of JUstep after changes means you accept the updated policy.
        </p>
      </Section>

      <Section title="Contact">
        <p style={p}>Questions about your privacy? Email us at <b>{CONTACT}</b>.</p>
      </Section>
    </LegalShell>
  );
}

const p = { fontSize: 15, lineHeight: 1.7, color: colors.textSoft, margin: "0 0 12px" };
const ul = { margin: "0 0 12px", paddingLeft: 22 };
const li = { fontSize: 15, lineHeight: 1.7, color: colors.textSoft, marginBottom: 8 };
