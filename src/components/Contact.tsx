import { motion } from 'framer-motion';
import { useState, type FormEvent } from 'react';
import './Contact.css';

const CONTACT_EMAIL = 'aarushkandukoori@gmail.com';

export function Contact() {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = e.currentTarget;
    const data = new FormData(form);

    try {
      const response = await fetch(`https://formsubmit.co/ajax/${CONTACT_EMAIL}`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
        },
        body: data,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Unable to send message. Please try again.');
      }

      setSubmitted(true);
      form.reset();
    } catch {
      setError('Something went wrong. Please try again or email us directly.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="contact" id="contact">
      <div className="contact__inner">
        <motion.div
          className="contact__graphic"
          initial={{ opacity: 0, x: -40 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          <div className="contact__fibers">
            {Array.from({ length: 24 }).map((_, i) => (
              <motion.div
                key={i}
                className="contact__fiber"
                style={{ left: `${(i / 24) * 100}%` }}
                animate={{ height: ['20%', '80%', '30%', '60%', '20%'] }}
                transition={{
                  duration: 3 + (i % 5) * 0.5,
                  repeat: Infinity,
                  delay: i * 0.1,
                }}
              />
            ))}
          </div>
          <div className="contact__mesh" />
        </motion.div>

        <motion.div
          className="contact__form-area"
          initial={{ opacity: 0, x: 40 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.15 }}
        >
          <span className="section__label">Contact</span>
          <h2 className="contact__title">Get in touch</h2>

          {submitted ? (
            <div className="contact__success">
              <p>Thank you! Your submission has been received.</p>
            </div>
          ) : (
            <form className="contact__form" onSubmit={handleSubmit}>
              <input type="hidden" name="_subject" value="New BUMP website inquiry" />
              <input type="hidden" name="_template" value="table" />
              <input type="text" name="_honey" className="contact__honey" tabIndex={-1} autoComplete="off" />
              <div className="contact__row">
                <div className="contact__field">
                  <label htmlFor="firstName">First Name</label>
                  <input id="firstName" name="firstName" type="text" required />
                </div>
                <div className="contact__field">
                  <label htmlFor="lastName">Last Name</label>
                  <input id="lastName" name="lastName" type="text" required />
                </div>
              </div>
              <div className="contact__row">
                <div className="contact__field">
                  <label htmlFor="email">Email Address</label>
                  <input id="email" name="email" type="email" required />
                </div>
                <div className="contact__field">
                  <label htmlFor="phone">Phone Number (Optional)</label>
                  <input id="phone" name="phone" type="tel" />
                </div>
              </div>
              <div className="contact__field contact__field--full">
                <label htmlFor="message">Message (Optional)</label>
                <textarea
                  id="message"
                  name="message"
                  rows={4}
                  placeholder="Describe what you're interested in..."
                />
              </div>
              {error && (
                <p className="contact__error" role="alert">
                  {error}
                </p>
              )}
              <button type="submit" className="contact__submit" disabled={submitting}>
                {submitting ? 'Sending…' : 'Submit'}
              </button>
            </form>
          )}
        </motion.div>
      </div>
    </section>
  );
}
