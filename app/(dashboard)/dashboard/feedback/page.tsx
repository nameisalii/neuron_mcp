import FeedbackForm from './FeedbackForm'

export default function FeedbackPage() {
  return (
    <div className="w-full">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Feedback</h1>
        <p className="mt-2 text-sm text-gray-500">Tell us what is working, what is confusing, or what you want Neuron to do next.</p>
      </header>
      <section className="mt-7 w-full max-w-4xl rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <FeedbackForm />
      </section>
    </div>
  )
}
