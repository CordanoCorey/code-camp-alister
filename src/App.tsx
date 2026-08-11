import { useState } from 'react'
import './App.css'

const campTopics = [
  {
    title: 'Components',
    description: 'Reusable pieces of a page, such as a button, card, or navigation bar.',
  },
  {
    title: 'Props',
    description: 'Information that one component passes to another component.',
  },
  {
    title: 'State',
    description: 'Information a component remembers while someone uses the app.',
  },
] as const

type TopicCardProps = {
  title: string
  description: string
}

function TopicCard({ title, description }: TopicCardProps) {
  return (
    <article className="topic-card">
      <h3>{title}</h3>
      <p>{description}</p>
    </article>
  )
}

function App() {
  const [name, setName] = useState('')
  const [count, setCount] = useState(0)

  const displayName = name.trim() || 'coder'

  return (
    <main className="app-shell">
      <section className="hero" aria-labelledby="page-title">
        <p className="eyebrow">React Code Camp Starter</p>
        <h1 id="page-title">Welcome, {displayName}!</h1>
        <p className="hero-copy">
          This small app demonstrates components, events, arrays, and state without
          hiding the ideas behind a large framework.
        </p>
        <div className="technology-list" aria-label="Technologies used">
          <span>React 19</span>
          <span>TypeScript</span>
          <span>Vite 8</span>
        </div>
      </section>

      <section className="practice-grid" aria-label="Interactive React examples">
        <article className="panel">
          <p className="step-number">Example 1</p>
          <h2>Handle an input change</h2>
          <label htmlFor="student-name">Enter your name</label>
          <input
            id="student-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ada Lovelace"
          />
          <p className="result" aria-live="polite">
            Hello, <strong>{displayName}</strong>!
          </p>
        </article>

        <article className="panel">
          <p className="step-number">Example 2</p>
          <h2>Update state with buttons</h2>
          <p>Each click changes the value React is remembering.</p>
          <div className="counter" aria-label="Counter controls">
            <button
              type="button"
              onClick={() => setCount((currentCount) => currentCount - 1)}
              disabled={count === 0}
              aria-label="Decrease count"
            >
              −
            </button>
            <output aria-live="polite" aria-label="Current count">
              {count}
            </output>
            <button
              type="button"
              onClick={() => setCount((currentCount) => currentCount + 1)}
              aria-label="Increase count"
            >
              +
            </button>
          </div>
          <button className="reset-button" type="button" onClick={() => setCount(0)}>
            Reset counter
          </button>
        </article>
      </section>

      <section className="topics-section" aria-labelledby="topics-heading">
        <div className="section-heading">
          <p className="eyebrow">React vocabulary</p>
          <h2 id="topics-heading">Three ideas to notice in the code</h2>
        </div>
        <div className="topic-grid">
          {campTopics.map((topic) => (
            <TopicCard
              key={topic.title}
              title={topic.title}
              description={topic.description}
            />
          ))}
        </div>
      </section>

      <section className="challenge" aria-labelledby="challenge-heading">
        <div>
          <p className="eyebrow">Your first challenge</p>
          <h2 id="challenge-heading">Make this app your own</h2>
        </div>
        <ol>
          <li>Open <code>src/App.tsx</code>.</li>
          <li>Change the main heading or one of the topic descriptions.</li>
          <li>Save the file and watch the browser update immediately.</li>
        </ol>
      </section>

      <footer>
        Start in <code>src/App.tsx</code>. Styles are in <code>src/App.css</code>.
      </footer>
    </main>
  )
}

export default App
