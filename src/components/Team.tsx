import { motion } from 'framer-motion';
import './Team.css';

const team = [
  {
    name: 'Aarush Kandukoori',
    title: 'Co-Founder & CEO',
    photo: `${import.meta.env.BASE_URL}team/aarush-kandukoori.png`,
    linkedin: 'https://www.linkedin.com/in/aarush-kandukoori/',
    email: 'aarushkandukoori@gmail.com',
    bio: 'Leads BUMP’s vision to bring autonomous cardiac safeguards out of the clinic and onto the body — building products designed for the moments when care cannot wait.',
  },
  {
    name: 'Aditya Kandukoori',
    title: 'Co-Founder & CTO',
    photo: `${import.meta.env.BASE_URL}team/aditya-kandukoori.png`,
    linkedin: 'https://www.linkedin.com/in/aditya-kandukoori-9410563b1/',
    email: 'adirocknbolt@gmail.com',
    bio: 'Architects BUMP’s closed-loop sensing, detection, and response systems — combining embedded hardware and software to deliver reliable, real-time cardiac intervention.',
  },
];

export function Team() {
  return (
    <section className="team" id="team">
      <div className="team__inner">
        <motion.div
          className="team__header"
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.7 }}
        >
          <span className="section__label">The Team</span>
          <h2 className="team__headline">
            Founders building autonomous cardiac care
          </h2>
        </motion.div>

        <div className="team__grid">
          {team.map((member, i) => (
            <motion.article
              key={member.name + member.title}
              className="team-card"
              initial={{ opacity: 0, y: 48 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.7, delay: i * 0.12 }}
            >
              <div className="team-card__photo">
                <img
                  src={member.photo}
                  alt={member.name}
                  className="team-card__image"
                  loading="lazy"
                />
              </div>

              <div className="team-card__info">
                <h3 className="team-card__name">{member.name}</h3>
                <p className="team-card__title">{member.title}</p>

                <div className="team-card__social">
                  <a
                    href={member.linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${member.name} on LinkedIn`}
                    className="team-card__social-link"
                  >
                    <LinkedInIcon />
                  </a>
                  <a
                    href={`mailto:${member.email}`}
                    aria-label={`Email ${member.name}`}
                    className="team-card__social-link"
                  >
                    <EmailIcon />
                  </a>
                </div>

                <div className="team-card__about">
                  <span className="team-card__about-label">About</span>
                  <p className="team-card__bio">{member.bio}</p>
                </div>
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}

function EmailIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 6h16a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M22 8l-10 6L2 8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}
