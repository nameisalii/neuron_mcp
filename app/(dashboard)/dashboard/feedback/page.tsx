import { Mail, ArrowRight } from 'lucide-react'

const LINKEDIN_URL = 'https://www.linkedin.com/in/ali-dinov-702a11232/'
const EMAIL_ADDRESS = 'msirozhdinov@gmail.com'
const EMAIL_HREF = `mailto:${EMAIL_ADDRESS}?subject=Neuron%20Feedback`

function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  )
}

export default function FeedbackPage() {
  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <header className="text-center mb-10">
        <h1 className="text-3xl font-display font-semibold text-navy">
          We&apos;d love to hear from you
        </h1>
        <p className="mt-3 text-muted max-w-xl mx-auto">
          Neuron is built with our users, not just for them. Found a bug, have an idea, or want a
          feature? Reach out directly — we read everything and reply fast.
        </p>
      </header>

      {/* Contact cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {/* LinkedIn */}
        <a
          href={LINKEDIN_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Connect with Ali on LinkedIn"
          className="group flex flex-col bg-white rounded-[14px] p-7 shadow-soft transition-all duration-200 hover:-translate-y-1 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
        >
          <span className="flex items-center justify-center w-12 h-12 rounded-full bg-[#0A66C2]/10">
            <LinkedInIcon className="w-6 h-6 text-[#0A66C2]" />
          </span>
          <h2 className="mt-5 text-lg font-display font-semibold text-ink">Connect on LinkedIn</h2>
          <p className="mt-1.5 text-sm text-muted">
            Message Ali directly — fastest way to reach us.
          </p>
          <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-accent">
            Open LinkedIn
            <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </span>
        </a>

        {/* Email */}
        <a
          href={EMAIL_HREF}
          aria-label="Email the Neuron team"
          className="group flex flex-col bg-white rounded-[14px] p-7 shadow-soft transition-all duration-200 hover:-translate-y-1 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
        >
          <span className="flex items-center justify-center w-12 h-12 rounded-full bg-navy/10">
            <Mail className="w-6 h-6 text-navy" />
          </span>
          <h2 className="mt-5 text-lg font-display font-semibold text-ink">Email us</h2>
          <p className="mt-1.5 text-sm text-muted">Prefer email? Drop us a note anytime.</p>
          <p className="mt-2 text-sm font-medium text-ink">{EMAIL_ADDRESS}</p>
          <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-accent">
            Send an email
            <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </span>
        </a>
      </div>

      {/* Closing line */}
      <p className="mt-10 text-center text-sm text-muted">
        Every message goes straight to the founders. Thank you for helping make Neuron better.
      </p>
    </div>
  )
}
