import {
  ArrowRight,
  CalendarDays,
  Check,
  FileText,
  HeartPulse,
  LockKeyhole,
  MessageCircle,
  Search,
  ShieldCheck,
  Stethoscope,
  UserRound,
} from "lucide-react";
import { Link } from "react-router-dom";

const doctorSearchHref = "/login?returnTo=%2Fdoctors";

export default function Home() {
  return (
    <>
      <main className="home-page">
        <section className="home-hero">
          <div className="home-hero-inner">
            <div className="hero-copy">
              <p className="eyebrow">Care, made more connected</p>
              <h1>
                Better care starts with <em>a clearer path.</em>
              </h1>
              <p>
                Find the right clinician, manage appointments, and keep your
                health records close at hand, all in one secure place.
              </p>
              <div className="hero-actions">
                <Link className="button button-primary" to={doctorSearchHref}>
                  Find a doctor <ArrowRight size={16} />
                </Link>
                <Link className="button button-secondary" to="/register">
                  Create your account
                </Link>
              </div>
              <div className="hero-note">
                <ShieldCheck size={16} /> Private access to your appointments
                and medical records
              </div>
            </div>
            <div className="hero-visual" aria-label="A clinician ready to help">
              <img
                className="hero-photo"
                src="https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=1100&q=85"
                alt="Doctor in a white coat in a clinical setting"
              />
              <div className="hero-photo-wash" />
              <div className="hero-caption">
                <span className="care-icon">
                  <HeartPulse size={19} />
                </span>
                <div>
                  <strong>Care, connected</strong>
                  <span>From first search to follow-up</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="home-trust" aria-label="Portal capabilities">
          <div className="home-trust-inner">
            <div className="trust-item">
              <LockKeyhole size={19} /> Secure sign-in and sessions
            </div>
            <div className="trust-item">
              <FileText size={19} /> Private medical records
            </div>
            <div className="trust-item">
              <MessageCircle size={19} /> Care-team messaging
            </div>
            <div className="trust-item">
              <CalendarDays size={19} /> Appointment management
            </div>
          </div>
        </section>

        <section className="home-section" id="care">
          <div className="home-section-inner">
            <div className="home-section-head">
              <span className="section-kicker">One place for your care</span>
              <h2>Less time navigating. More time focused on you.</h2>
              <p>
                Practical tools that help patients and clinicians stay in step
                before and after an appointment.
              </p>
            </div>
            <div className="care-grid">
              <article className="care-item">
                <span className="care-icon">
                  <Search size={20} />
                </span>
                <h3>Find your clinician</h3>
                <p>
                  Search by specialty, location, experience, language, fee, and
                  available day, then review a clinician's profile before
                  booking.
                </p>
              </article>
              <article className="care-item">
                <span className="care-icon">
                  <CalendarDays size={20} />
                </span>
                <h3>Keep appointments in view</h3>
                <p>
                  See available times, request an appointment, and follow its
                  status from your patient workspace.
                </p>
              </article>
              <article className="care-item">
                <span className="care-icon">
                  <MessageCircle size={20} />
                </span>
                <h3>Stay connected securely</h3>
                <p>
                  Continue conversations with members of your care team through
                  authenticated, relationship-based messaging.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="home-section steps-section" id="how-it-works">
          <div className="home-section-inner">
            <div className="home-section-head">
              <span className="section-kicker">A straightforward start</span>
              <h2>Care coordination, step by step.</h2>
              <p>
                Patients and clinicians get focused workspaces shaped around the
                work they need to do.
              </p>
            </div>
            <div className="steps-grid">
              <article className="step-item">
                <span className="step-number">01</span>
                <h3>Create a verified account</h3>
                <p>
                  Register as a patient or clinician, verify your email, and
                  sign in to your private workspace.
                </p>
              </article>
              <article className="step-item">
                <span className="step-number">02</span>
                <h3>Plan the next visit</h3>
                <p>
                  Patients find a clinician and request an available
                  appointment. Clinicians review and manage their schedule.
                </p>
              </article>
              <article className="step-item">
                <span className="step-number">03</span>
                <h3>Keep the conversation going</h3>
                <p>
                  Share records, review document summaries, and message
                  connected care-team members.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="home-section">
          <div className="home-section-inner ai-feature">
            <div className="document-art" aria-hidden="true">
              <div className="document-sheet">
                <div className="document-sheet-head">
                  <FileText size={20} />
                  <div>
                    <strong>Medical record</strong>
                    <span>Private to your care</span>
                  </div>
                </div>
                <div className="document-lines">
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
                <div className="summary-chip">
                  <Check size={14} /> Key details, organized
                </div>
              </div>
            </div>
            <div className="ai-copy">
              <span className="section-kicker">Document support</span>
              <h2>A clearer first look at your records.</h2>
              <p>
                Upload supported medical documents and request an AI-generated
                summary with key information, abnormal values, and follow-up
                notes when available.
              </p>
              <p className="disclaimer">
                Summaries are informational and are not a diagnosis or a
                substitute for advice from a qualified clinician.
              </p>
              <Link className="button button-secondary" to="/register">
                Explore the patient portal <ArrowRight size={15} />
              </Link>
            </div>
          </div>
        </section>

        <section className="home-section workflow-section">
          <div className="home-section-inner">
            <div className="home-section-head">
              <span className="section-kicker">
                Designed for both sides of care
              </span>
              <h2>Useful context for every visit.</h2>
            </div>
            <div className="workflow-grid">
              <article className="workflow-column">
                <h3>
                  <UserRound size={18} /> For patients
                </h3>
                <ul className="workflow-list">
                  <li>
                    <Check size={15} /> Search clinician listings and
                    availability
                  </li>
                  <li>
                    <Check size={15} /> Manage appointments and uploaded records
                  </li>
                  <li>
                    <Check size={15} /> Message clinicians connected to your
                    care
                  </li>
                </ul>
              </article>
              <article className="workflow-column">
                <h3>
                  <Stethoscope size={18} /> For clinicians
                </h3>
                <ul className="workflow-list">
                  <li>
                    <Check size={15} /> Review today's and upcoming appointments
                  </li>
                  <li>
                    <Check size={15} /> Access records for patients in your care
                  </li>
                  <li>
                    <Check size={15} /> Coordinate with patients through secure
                    chat
                  </li>
                </ul>
              </article>
            </div>
          </div>
        </section>

        <section className="closing-cta">
          <span className="section-kicker">Your next step</span>
          <h2>Make care easier to coordinate.</h2>
          <p>
            Start with a verified account and bring your care into one connected
            workspace.
          </p>
          <Link to="/register" className="button button-primary">
            Get started <ArrowRight size={16} />
          </Link>
        </section>
      </main>
      <footer className="site-footer">
        <div className="site-footer-inner">
          <span className="footer-brand">carepath.</span>
          <p>Tools for clearer care coordination. Not for emergency use.</p>
          <div className="site-footer-links">
            <Link to="/login">Sign in</Link>
            <Link to="/register">Create account</Link>
            <a href="#care">Our approach</a>
          </div>
        </div>
      </footer>
    </>
  );
}
